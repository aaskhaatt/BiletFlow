import { expect, test, type Page } from '@playwright/test'

const api = (process.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')
const headers = { 'Access-Control-Allow-Origin': '*' }
const storageKey = 'biletflow.refresh-token'
const invalidLink = 'This link is invalid, expired or already used.'
const invalidToken = {
  headers,
  status: 400,
  json: { error: 'InvalidAccountTokenError', message: 'Server token error' },
}

async function seedSession(page: Page) {
  await page.addInitScript((key) => {
    if (sessionStorage.getItem('test-session-seeded')) return
    sessionStorage.setItem('test-session-seeded', 'true')
    localStorage.setItem(key, 'saved-refresh')
  }, storageKey)
}

async function restoreSession(page: Page) {
  await seedSession(page)
  await page.route(`${api}/auth/refresh`, (route) =>
    route.fulfill({
      headers,
      json: {
        access_token: 'test-access',
        refresh_token: 'rotated-refresh',
        token_type: 'bearer',
      },
    }),
  )
}

test.use({ locale: 'en-US' })

test('resends verification, consumes the email link once, and removes the banner', async ({
  page,
}) => {
  await restoreSession(page)
  let emailVerified = false
  const tokens: unknown[] = []
  await page.route(`${api}/auth/me`, (route) => {
    expect(route.request().headers().authorization).toBe('Bearer test-access')
    return route.fulfill({ headers, json: { email_verified: emailVerified } })
  })
  await page.route(`${api}/auth/resend-verification`, (route) => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().headers().authorization).toBe('Bearer test-access')
    return route.fulfill({ headers, json: { message: 'Sent' } })
  })
  await page.route(`${api}/auth/verify-email`, (route) => {
    tokens.push(route.request().postDataJSON())
    emailVerified = true
    return route.fulfill({ headers, json: { message: 'Verified' } })
  })

  await page.goto('/')
  const banner = page.locator('[data-slot="email-verification-banner"]')
  await expect(banner).toContainText('Your email address is unverified.')
  await banner.getByRole('button', { name: 'Resend verification email' }).click()
  await expect(banner.getByRole('status')).toContainText('We sent a new verification link.')

  await page.goto('/verify-email?token=verification-token')
  await expect(page.getByRole('status')).toHaveText('Your email has been verified.')
  const profileRefetched = page.waitForResponse(`${api}/auth/me`)
  await page.getByRole('link', { name: 'Back to events' }).click()
  await expect(page.locator('[data-route-id="catalog"]')).toBeVisible()
  expect(await (await profileRefetched).json()).toEqual({ email_verified: true })
  await expect(banner).toHaveCount(0)
  expect(tokens).toEqual([{ token: 'verification-token' }])
})

test('keeps an email link open after startup session expiry and shows the invalid-link error', async ({
  page,
}) => {
  await seedSession(page)
  const expired = page.waitForResponse(`${api}/auth/refresh`)
  await page.route(`${api}/auth/refresh`, (route) =>
    route.fulfill({
      headers,
      status: 401,
      json: { error: 'InvalidRefreshTokenError', message: 'Unauthorized' },
    }),
  )
  await page.route(`${api}/auth/verify-email`, (route) => route.fulfill(invalidToken))
  await page.goto('/verify-email?token=expired')
  await expired
  await expect(page.getByRole('alert')).toHaveText(invalidLink)
  await expect(page).toHaveURL(/\/verify-email\?token=expired$/)
  await expect(page.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute(
    'href',
    '/login',
  )
})

test('hides the banner when resending reports an already verified address', async ({ page }) => {
  await restoreSession(page)
  let emailVerified = false
  await page.route(`${api}/auth/me`, (route) =>
    route.fulfill({ headers, json: { email_verified: emailVerified } }),
  )
  await page.route(`${api}/auth/resend-verification`, (route) => {
    emailVerified = true
    return route.fulfill({
      headers,
      status: 409,
      json: { error: 'EmailAlreadyVerifiedError', message: 'Already verified' },
    })
  })

  await page.goto('/organizer')
  const banner = page.locator('[data-slot="email-verification-banner"]')
  await banner.getByRole('button', { name: 'Resend verification email' }).click()
  await expect(page.getByText('Your email is already verified.', { exact: true })).toBeVisible()
  await expect(banner).toHaveCount(0)
})

test('forgot password gives the same confirmation for known and unknown email addresses', async ({
  page,
}) => {
  const addresses = ['attendee@example.test', 'unknown@example.test']
  const requests: unknown[] = []
  await page.route(`${api}/auth/forgot-password`, (route) => {
    requests.push(route.request().postDataJSON())
    return route.fulfill({ headers, json: { message: 'Server confirmation' } })
  })

  await page.goto('/login?returnTo=%2Fmy%2Forders')
  for (const address of addresses) {
    await test.step(address, async () => {
      await page.getByRole('link', { name: 'Forgot password?' }).click()
      const form = page.locator('[data-route-id="forgot-password"]')
      const email = form.getByRole('textbox', { name: 'Email' })
      await email.fill(address)
      await expect(email).toHaveValue(address)
      await form.getByRole('button', { name: 'Send reset link' }).click()
      await expect(form.getByRole('status')).toHaveText(
        'If an account exists for this email address, we’ll send a password reset link.',
      )
      await form.getByRole('link', { name: 'Back to sign in' }).click()
      await expect(page).toHaveURL(/\/login\?returnTo=%2Fmy%2Forders$/)
    })
  }
  expect(requests).toEqual(addresses.map((address) => ({ email: address })))
})

test('resets the password, clears the browser session, and requires a new sign-in', async ({
  page,
}) => {
  await restoreSession(page)
  const resets: unknown[] = []
  await page.route(`${api}/auth/reset-password`, (route) => {
    resets.push(route.request().postDataJSON())
    return route.fulfill({ headers, json: { message: 'Password changed' } })
  })

  await page.goto('/reset-password?token=reset-token')
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), storageKey))
    .toBe('rotated-refresh')
  await page.getByLabel('New password').fill('short')
  await page.getByRole('button', { name: 'Set new password' }).click()
  await expect(page.getByLabel('New password')).toHaveAttribute('aria-invalid', 'true')
  expect(resets).toHaveLength(0)

  await page.getByLabel('New password').fill('newpass')
  await page.getByRole('button', { name: 'Set new password' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('status')).toHaveText(
    'Your password was changed. Sign in with your new password.',
  )
  await expect(page.getByLabel('Password')).toHaveValue('')
  expect(resets).toEqual([{ token: 'reset-token', new_password: 'newpass' }])
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull()
})

test('gives a path to request a new reset link when the current one is used or missing', async ({
  page,
}) => {
  await page.route(`${api}/auth/reset-password`, (route) => route.fulfill(invalidToken))
  await page.goto('/reset-password?token=used')
  await page.getByLabel('New password').fill('newpass')
  await page.getByRole('button', { name: 'Set new password' }).click()
  await expect(page.getByRole('alert')).toHaveText(invalidLink)
  await expect(page.getByRole('link', { name: 'Request a new link' })).toHaveAttribute(
    'href',
    '/forgot-password',
  )

  await page.goto('/reset-password')
  await expect(page.getByRole('alert')).toHaveText(invalidLink)
  await expect(page.getByLabel('New password')).toHaveCount(0)
})
