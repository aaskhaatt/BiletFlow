import { expect, test } from '@playwright/test'

const api = (process.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')
const headers = { 'Access-Control-Allow-Origin': '*' }
const pair = { access_token: 'test-access', refresh_token: 'test-refresh', token_type: 'bearer' }

test.use({ locale: 'en-US' })

test.beforeEach(async ({ page }) => {
  await page.route(`${api}/auth/me`, (route) =>
    route.fulfill({ headers, json: { email_verified: true } }),
  )
  await page.route(`${api}/orders/me`, (route) => route.fulfill({ headers, json: [] }))
})

test('login shows the credential error and returns to the intended page on success', async ({
  page,
}) => {
  const requests: unknown[] = []
  const target = '/my/tickets?source=login#tickets'
  await page.route(`${api}/auth/login`, (route) => {
    const credentials = route.request().postDataJSON() as { email: string; password: string }
    requests.push(credentials)
    if (credentials.password === 'legacy') return route.fulfill({ headers, json: pair })
    return route.fulfill({
      headers,
      status: 401,
      json: { error: 'InvalidCredentialsError', message: 'Unauthorized' },
    })
  })
  await page.goto('/login?' + new URLSearchParams({ returnTo: target }))
  await expect(page.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
    'href',
    /^\/forgot-password/,
  )
  await page.getByRole('textbox', { name: 'Email' }).fill('attendee@example.test')
  await page.getByLabel('Password').fill('wrong')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Wrong email or password.')

  await page.getByLabel('Password').fill('legacy')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('[data-route-id="my-tickets"]')).toBeVisible()
  expect(new URL(page.url()).pathname + new URL(page.url()).search + new URL(page.url()).hash).toBe(
    target,
  )
  expect(requests).toEqual([
    { email: 'attendee@example.test', password: 'wrong' },
    { email: 'attendee@example.test', password: 'legacy' },
  ])
  expect(await page.evaluate(() => localStorage.getItem('biletflow.refresh-token'))).toBe(
    'test-refresh',
  )
})

test('registration validates eight characters, focuses a duplicate email, and signs in after a successful retry', async ({
  page,
}) => {
  const registration: unknown[] = []
  const logins: unknown[] = []
  await page.route(`${api}/auth/register`, (route) => {
    const credentials = route.request().postDataJSON() as { email: string; password: string }
    registration.push(credentials)
    if (credentials.email === 'used@example.test') {
      return route.fulfill({
        headers,
        status: 409,
        json: { error: 'UserAlreadyExistsError', message: 'Duplicate email' },
      })
    }
    return route.fulfill({
      headers,
      status: 201,
      json: { id: 1, email: credentials.email, email_verified_at: null },
    })
  })
  await page.route(`${api}/auth/login`, (route) => {
    logins.push(route.request().postDataJSON())
    return route.fulfill({ headers, json: pair })
  })

  await page.goto('/register')
  const email = page.getByRole('textbox', { name: 'Email' })
  const password = page.getByLabel('Password')
  await expect(page.locator('main input')).toHaveCount(2)
  await expect(password).toHaveAccessibleDescription('At least 8 characters')
  await email.fill('used@example.test')
  await password.fill('1234567')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(password).toHaveAttribute('aria-invalid', 'true')
  await expect(password).toHaveAccessibleDescription('At least 8 characters')
  expect(registration).toHaveLength(0)

  await password.fill('correct8')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  await expect(email).toHaveAccessibleDescription('An account with this email already exists.')
  await expect(email).toBeFocused()

  await email.fill('new@example.test')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.locator('[data-route-id="catalog"]')).toBeVisible()
  expect(registration).toEqual([
    { email: 'used@example.test', password: 'correct8' },
    { email: 'new@example.test', password: 'correct8' },
  ])
  expect(logins).toEqual([registration[1]])
  expect(await page.evaluate(() => localStorage.getItem('biletflow.refresh-token'))).toBe(
    'test-refresh',
  )
})

test('a failed automatic sign-in opens login and keeps the original destination', async ({
  page,
}) => {
  const target = '/my/orders'
  let registrations = 0
  let logins = 0
  await page.route(`${api}/auth/register`, (route) => {
    registrations++
    return route.fulfill({ headers, status: 201, json: { id: 1, email: 'new@example.test' } })
  })
  await page.route(`${api}/auth/login`, (route) => {
    logins++
    return logins === 1
      ? route.abort('internetdisconnected')
      : route.fulfill({ headers, json: pair })
  })
  await page.goto('/register?' + new URLSearchParams({ returnTo: target }))
  await page.getByRole('textbox', { name: 'Email' }).fill('new@example.test')
  await page.getByLabel('Password').fill('correct8')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByRole('status')).toHaveText(
    'Your account was created. Sign in to continue.',
  )
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe(target)
  await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue('new@example.test')
  await expect(page.getByLabel('Password')).toHaveValue('')
  await page.getByLabel('Password').fill('correct8')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('[data-route-id="my-orders"]')).toBeVisible()
  expect(registrations).toBe(1)
  expect(logins).toBe(2)
})
