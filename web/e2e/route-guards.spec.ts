import { expect, test, type Page } from '@playwright/test'

const api = (process.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')
const headers = { 'Access-Control-Allow-Origin': '*' }
const storageKey = 'biletflow.refresh-token'
const tokens = { access_token: 'test-access', refresh_token: 'test-refresh', token_type: 'bearer' }
const attendee = {
  id: 1,
  email: 'attendee@example.test',
  email_verified: true,
  is_platform_admin: false,
  is_event_staff: false,
  organizer: null,
}
const applicant = { id: 10, user_id: attendee.id, status: 'pending' }
const organizer = { ...applicant, status: 'approved' }

async function restoreSession(page: Page) {
  await page.addInitScript((key) => localStorage.setItem(key, 'saved-refresh'), storageKey)
  await page.route(`${api}/auth/refresh`, (route) => route.fulfill({ headers, json: tokens }))
}

function loginFor(destination: string) {
  return (url: URL) => url.pathname === '/login' && url.searchParams.get('returnTo') === destination
}

test.use({ locale: 'en-US' })

test('redirects a protected deep link to login and returns to it after sign-in', async ({
  page,
}) => {
  const target = '/orders/12?from=email&tab=tickets#order'
  await page.route(`${api}/auth/login`, (route) => route.fulfill({ headers, json: tokens }))
  await page.route(`${api}/auth/me`, (route) => route.fulfill({ headers, json: attendee }))

  await page.goto(target)
  await expect(page).toHaveURL(loginFor(target))
  await expect(page.locator('[data-route-id="order"]')).toHaveCount(0)
  await page.getByLabel('Email').fill(attendee.email)
  await page.getByLabel('Password').fill('test-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL((url) => url.pathname + url.search + url.hash === target)
  await expect(page.locator('[data-route-id="order"]')).toBeVisible()
})

test('requires sign-in for both workspaces', async ({ page }) => {
  for (const target of ['/organizer/events/7/edit', '/admin/payments?status=failed']) {
    await page.goto(target)
    await expect(page).toHaveURL(loginFor(target))
    await expect(
      page.locator('[data-slot="organizer-layout"], [data-slot="admin-layout"]'),
    ).toHaveCount(0)
  }
})

test('sends an attendee with no organizer profile to the application screen', async ({ page }) => {
  await restoreSession(page)
  await page.route(`${api}/auth/me`, (route) => route.fulfill({ headers, json: attendee }))

  await page.goto('/organizer/events/7/edit')
  await expect(page).toHaveURL(/\/become-organizer$/)
  await expect(page.getByRole('heading', { name: 'Become an organizer' })).toBeVisible()
  await expect(page.locator('[data-slot="organizer-layout"]')).toHaveCount(0)
})

test('keeps a pending applicant at the requested address until approved', async ({ page }) => {
  await restoreSession(page)
  const target = '/organizer/events/7/edit?source=workspace#details'
  let approved = false
  await page.route(`${api}/auth/me`, (route) =>
    route.fulfill({
      headers,
      json: { ...attendee, organizer: approved ? organizer : applicant },
    }),
  )

  await page.goto(target)
  await expect(page.getByRole('heading', { name: 'Organizer approval pending' })).toBeVisible()
  await expect(page.locator('[data-slot="organizer-layout"]')).toHaveCount(0)
  approved = true
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    window.dispatchEvent(new Event('visibilitychange'))
    Reflect.deleteProperty(document, 'visibilityState')
    window.dispatchEvent(new Event('visibilitychange'))
  })

  await expect(page.locator('[data-route-id="organizer-event-edit"]')).toBeVisible()
  await expect(page).toHaveURL((url) => url.pathname + url.search + url.hash === target)
})

test('denies admin routes to an approved organizer without the admin role', async ({ page }) => {
  await restoreSession(page)
  await page.route(`${api}/auth/me`, (route) =>
    route.fulfill({ headers, json: { ...attendee, organizer } }),
  )

  await page.goto('/admin/payments')
  await expect(page.getByText('Only platform admins can do this.')).toBeVisible()
  await expect(page.locator('[data-slot="admin-layout"]')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/')
})

test('waits for the profile before opening a nested admin route', async ({ page }) => {
  await restoreSession(page)
  let release!: () => void
  const ready = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(`${api}/auth/me`, async (route) => {
    await ready
    await route.fulfill({ headers, json: { ...attendee, is_platform_admin: true } })
  })

  await page.goto('/admin/payments?status=failed')
  try {
    await expect(page.getByRole('status')).toHaveText('Loading…')
    await expect(page.locator('[data-slot="admin-layout"]')).toHaveCount(0)
  } finally {
    release()
  }
  await expect(page.locator('[data-route-id="admin-payments"]')).toBeVisible()
})

test('clears the session when the workspace profile rejects its credentials', async ({ page }) => {
  await restoreSession(page)
  await page.route(`${api}/auth/me`, (route) =>
    route.fulfill({
      headers,
      status: 401,
      json: { error: 'InvalidTokenError', message: 'Unauthorized' },
    }),
  )

  await page.goto('/admin/payments')
  await expect(page).toHaveURL(loginFor('/admin/payments'))
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull()
})

test('keeps the workspace closed on a profile outage and opens it after retry', async ({
  page,
}) => {
  await restoreSession(page)
  let available = false
  await page.route(`${api}/auth/me`, (route) =>
    available
      ? route.fulfill({ headers, json: { ...attendee, is_platform_admin: true } })
      : route.fulfill({
          headers,
          status: 503,
          json: { error: 'DatabaseUnavailableError', message: 'Unavailable' },
        }),
  )

  await page.goto('/admin/payments')
  const retry = page.getByRole('button', { name: 'Try again' })
  await expect(retry).toBeVisible()
  await expect(page.locator('[data-slot="admin-layout"]')).toHaveCount(0)
  available = true
  await retry.click()
  await expect(page.locator('[data-route-id="admin-payments"]')).toBeVisible()
})
