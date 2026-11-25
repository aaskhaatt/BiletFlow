import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'

const api = (process.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')
const storageKey = 'biletflow.refresh-token'
const destination = '/my/tickets'

function refreshToken(page: Page) {
  return page.evaluate((key) => localStorage.getItem(key), storageKey)
}

function authResponse(page: Page, operation: 'login' | 'refresh' | 'logout') {
  return page.waitForResponse(
    (response) =>
      response.url() === `${api}/auth/${operation}` && response.request().method() === 'POST',
  )
}

test.use({ locale: 'en-US', trace: 'off' })

test('registers, signs in, restores on reload, and revokes the session on sign-out', async ({
  browser,
  page,
}) => {
  test.skip(process.env.BILETFLOW_E2E_LIVE_AUTH !== '1', 'Requires a disposable backend database')
  const email = `session-e2e-${randomUUID()}@example.com`
  const password = randomUUID()
  const tickets = page.locator('[data-route-id="my-tickets"]')

  await page.goto('/register?' + new URLSearchParams({ returnTo: destination }))
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  const signedIn = authResponse(page, 'login')
  await page.getByRole('button', { name: 'Create account' }).click()
  expect((await signedIn).status()).toBe(200)
  await expect(tickets).toBeVisible()
  const beforeReload = await refreshToken(page)
  expect(Boolean(beforeReload)).toBe(true)

  const refreshed = authResponse(page, 'refresh')
  await page.reload()
  expect((await refreshed).status()).toBe(200)
  await expect(tickets).toBeVisible()
  const beforeSignOut = await refreshToken(page)
  expect(Boolean(beforeSignOut) && beforeSignOut !== beforeReload).toBe(true)

  const signedOut = authResponse(page, 'logout')
  await page.getByRole('button', { name: 'Sign out' }).click()
  const logout = await signedOut
  expect(logout.status()).toBe(200)
  expect(logout.request().postDataJSON().refresh_token === beforeSignOut).toBe(true)
  await expect(page).toHaveURL((url) => {
    return url.pathname === '/login' && url.searchParams.get('returnTo') === destination
  })
  await expect(tickets).toHaveCount(0)
  expect(await refreshToken(page)).toBeNull()

  // The API must reject the revoked token and the route must stay private on reload.
  const signedOutContext = await browser.newContext({ baseURL: new URL(page.url()).origin })
  try {
    await signedOutContext.addInitScript(
      ({ key, token }) => localStorage.setItem(key, token ?? ''),
      { key: storageKey, token: beforeSignOut },
    )
    const signedOutPage = await signedOutContext.newPage()
    const rejected = authResponse(signedOutPage, 'refresh')
    await signedOutPage.goto(destination)
    const response = await rejected
    expect(response.status()).toBe(401)
    expect((await response.json()).error).toBe('InvalidRefreshTokenError')
    await expect(signedOutPage).toHaveURL(/\/login\?returnTo=%2Fmy%2Ftickets$/)
    expect(await refreshToken(signedOutPage)).toBeNull()
  } finally {
    await signedOutContext.close()
  }

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(tickets).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})
