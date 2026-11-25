import { expect, test } from '@playwright/test'

const api = (process.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')
const storageKey = 'biletflow.refresh-token'
const headers = { 'Access-Control-Allow-Origin': '*' }

function tokens(attempt: number) {
  return {
    access_token: `access-${attempt}`,
    refresh_token: `refresh-${attempt}`,
    token_type: 'bearer',
  }
}

test.use({ locale: 'en-US' })

test.beforeEach(async ({ page }) => {
  await page.route(`${api}/auth/me`, (route) =>
    route.fulfill({
      headers,
      json: {
        email_verified: true,
        organizer: { id: 10, user_id: 1, status: 'approved' },
      },
    }),
  )
  await page.addInitScript((key) => {
    if (sessionStorage.getItem('test-session-seeded')) return
    sessionStorage.setItem('test-session-seeded', 'true')
    localStorage.setItem(key, 'refresh-0')
  }, storageKey)
})

test('holds a protected route until restoration and uses the rotated token on reload', async ({
  page,
}) => {
  const sent: string[] = []
  let release!: () => void
  const proceed = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(`${api}/auth/refresh`, async (route) => {
    const { refresh_token: token } = route.request().postDataJSON() as { refresh_token: string }
    sent.push(token)
    if (sent.length === 1) await proceed
    await route.fulfill({ headers, json: tokens(sent.length) })
  })

  await page.goto('/my/tickets')
  try {
    await expect(page.getByRole('status')).toHaveText('Loading…')
    await expect(page.locator('[data-route-id="my-tickets"]')).toHaveCount(0)
  } finally {
    release()
  }
  await expect(page.locator('[data-route-id="my-tickets"]')).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe('refresh-1')

  await page.reload()
  await expect(page.locator('[data-route-id="my-tickets"]')).toBeVisible()
  expect(sent).toEqual(['refresh-0', 'refresh-1'])
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe('refresh-2')
})

test('keeps the saved session offline and resumes restoration on retry', async ({ page }) => {
  let offline = true
  await page.route(`${api}/auth/refresh`, (route) =>
    offline ? route.abort('internetdisconnected') : route.fulfill({ headers, json: tokens(1) }),
  )

  await page.goto('/organizer')
  await expect(page.getByRole('alert')).toContainText("Can't reach the server")
  await expect(page.locator('[data-route-id="organizer-events"]')).toHaveCount(0)
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe('refresh-0')

  offline = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('[data-route-id="organizer-events"]')).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe('refresh-1')
})

test('returns to login with the original URL after a refreshed request still gets 401', async ({
  page,
}) => {
  let refreshes = 0
  const eventTokens: Array<string | undefined> = []
  await page.route(`${api}/auth/refresh`, (route) =>
    route.fulfill({ headers, json: tokens(++refreshes) }),
  )
  await page.route(`${api}/health`, (route) =>
    route.fulfill({ headers, json: { status: 'ok', database: 'ok' } }),
  )
  await page.route(`${api}/events?*`, (route) => {
    eventTokens.push(route.request().headers()['authorization'])
    return route.fulfill({
      headers,
      status: 401,
      json: { error: 'InvalidTokenError', message: 'Unauthorized' },
    })
  })

  await page.goto('/dev/ui?source=session#feedback-title')
  await expect(page.locator('[data-route-id="login"]')).toBeVisible()
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe(
    '/dev/ui?source=session#feedback-title',
  )
  expect(refreshes).toBe(2) // One at startup and one for the rejected request.
  // Strict Mode can cancel and restart the initial query. Recovery still replays it once.
  expect(eventTokens[0]).toBe('Bearer access-1')
  expect(eventTokens.filter((token) => token === 'Bearer access-2')).toHaveLength(1)
  expect(eventTokens.at(-1)).toBe('Bearer access-2')
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull()
})
