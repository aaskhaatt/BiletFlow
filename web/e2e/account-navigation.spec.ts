import { expect, test, type Page } from '@playwright/test'

const api = (process.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')
const headers = { 'Access-Control-Allow-Origin': '*' }
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

async function saveSession(page: Page) {
  await page.addInitScript(() => localStorage.setItem('biletflow.refresh-token', 'saved-refresh'))
}

test.use({ locale: 'en-US' })

test('offers sign-in to a visitor without fetching an authenticated profile', async ({ page }) => {
  let profileRequests = 0
  await page.route(`${api}/auth/me`, (route) => {
    profileRequests++
    return route.fulfill({ headers, status: 401, json: { error: 'NotAuthenticatedError' } })
  })
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  await expect(page.getByRole('navigation', { name: 'Account navigation' })).toHaveCount(0)
  expect(profileRequests).toBe(0)
})

const roles = [
  { name: 'attendee', profile: attendee, links: ['Become an organizer'] },
  {
    name: 'organizer applicant',
    profile: { ...attendee, organizer: applicant },
    links: [],
  },
  {
    name: 'approved organizer',
    profile: { ...attendee, organizer },
    links: ['Organizer'],
  },
  {
    name: 'admin and approved organizer',
    profile: { ...attendee, organizer, is_platform_admin: true },
    links: ['Organizer', 'Platform administration'],
  },
  {
    name: 'admin without an organizer profile',
    profile: { ...attendee, is_platform_admin: true },
    links: ['Become an organizer', 'Platform administration'],
  },
]

for (const { name, profile, links } of roles) {
  test(`shows the account navigation for the ${name}`, async ({ page }) => {
    const mobile = profile.is_platform_admin && profile.organizer !== null
    if (mobile) await page.setViewportSize({ width: 360, height: 800 })
    await saveSession(page)
    await page.route(`${api}/auth/refresh`, (route) =>
      route.fulfill({
        headers,
        json: { access_token: 'access', refresh_token: 'rotated-refresh', token_type: 'bearer' },
      }),
    )
    await page.route(`${api}/auth/me`, (route) => {
      expect(route.request().headers().authorization).toBe('Bearer access')
      return route.fulfill({ headers, json: profile })
    })

    await page.goto('/')
    const account = page.getByRole('navigation', { name: 'Account navigation' })
    await expect(account).toBeVisible()
    await expect(account.getByRole('link')).toHaveText(links)
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0)
    await expect(
      page.getByRole('navigation', { name: 'Attendee navigation' }).getByRole('link'),
    ).toHaveText(['Events', 'Tickets', 'Orders'])
    if (mobile) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        360,
      )
    }
    if (profile.organizer?.status === 'pending') {
      await expect(account.getByRole('status')).toHaveText('Organizer approval pending')
    }
    if (profile.is_platform_admin) {
      await account.getByRole('link', { name: 'Platform administration' }).click()
      await expect(page).toHaveURL(/\/admin$/)
      await expect(account.getByRole('link', { name: 'Platform administration' })).toHaveAttribute(
        'aria-current',
        'page',
      )
    }
  })
}

test('updates approval when the tab returns to the foreground and renews near-expiry access', async ({
  page,
}) => {
  const now = new Date()
  await page.clock.setFixedTime(now)
  await saveSession(page)
  const expiry = Math.floor(now.getTime() / 1000) + 120
  const initialAccess = `header.${Buffer.from(JSON.stringify({ exp: expiry })).toString('base64url')}.signature`
  const refreshTokens: string[] = []
  const profileTokens = new Set<string | undefined>()
  let approved = false
  await page.route(`${api}/auth/refresh`, (route) => {
    const { refresh_token: refreshToken } = route.request().postDataJSON() as {
      refresh_token: string
    }
    refreshTokens.push(refreshToken)
    return route.fulfill({
      headers,
      json: {
        access_token: refreshToken === 'saved-refresh' ? initialAccess : 'renewed-access',
        refresh_token: refreshToken === 'saved-refresh' ? 'rotated-refresh' : 'latest-refresh',
        token_type: 'bearer',
      },
    })
  })
  await page.route(`${api}/auth/me`, (route) => {
    profileTokens.add(route.request().headers().authorization)
    return route.fulfill({
      headers,
      json: { ...attendee, organizer: approved ? organizer : applicant },
    })
  })

  await page.goto('/')
  const account = page.getByRole('navigation', { name: 'Account navigation' })
  await expect(account.getByRole('status')).toHaveText('Organizer approval pending')
  approved = true
  await page.clock.setFixedTime(new Date(now.getTime() + 90_000))
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    window.dispatchEvent(new Event('visibilitychange'))
    Reflect.deleteProperty(document, 'visibilityState')
    window.dispatchEvent(new Event('visibilitychange'))
  })

  await expect(account.getByRole('link', { name: 'Organizer' })).toHaveAttribute(
    'href',
    '/organizer',
  )
  await expect(account.getByRole('status')).toHaveCount(0)
  expect(refreshTokens).toEqual(['saved-refresh', 'rotated-refresh'])
  expect(profileTokens).toEqual(new Set([`Bearer ${initialAccess}`, 'Bearer renewed-access']))
})
