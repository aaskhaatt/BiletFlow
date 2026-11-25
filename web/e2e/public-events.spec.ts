import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const api = (process.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')
const headers = { 'Access-Control-Allow-Origin': '*' }
const hours = (amount: number) => new Date(Date.now() + amount * 3600_000).toISOString()
const event = {
  id: 77,
  title: 'Astana Jazz Night',
  description: 'An evening of live jazz.',
  status: 'published',
  lifecycle: 'upcoming',
  visibility: 'public',
  category: 'Music',
  venue_name: 'Astana Opera',
  venue_address: 'Kunayev St 1',
  start_time: hours(24),
  end_time: hours(26),
}
const ticket = {
  id: 2,
  event_id: event.id,
  name: 'Standard',
  price: 5000,
  quantity: 10,
  sold_count: 8,
  max_per_order: 3,
  is_hidden: false,
  sales_start: hours(-24),
  sales_end: hours(26),
}
const soldOut = { ...ticket, id: 3, name: 'Balcony', sold_count: 10 }
const box = { ...ticket, id: 4, name: 'Box', quantity: 30, sold_count: 0, max_per_order: 1 }
const tokens = {
  access_token: 'event-access',
  refresh_token: 'event-refresh',
  token_type: 'bearer',
}

test.use({ locale: 'en-US' })

async function mockEvent(page: Page, detail = event, types = [ticket]) {
  await page.route(`${api}/events/${event.id}`, (route) => route.fulfill({ headers, json: detail }))
  await page.route(`${api}/events/${event.id}/ticket-types`, (route) =>
    route.fulfill({ headers, json: types }),
  )
}

async function mockSignIn(page: Page) {
  await page.route(`${api}/auth/login`, (route) => route.fulfill({ headers, json: tokens }))
  await page.route(`${api}/auth/refresh`, (route) => route.fulfill({ headers, json: tokens }))
  await page.route(`${api}/auth/me`, (route) =>
    route.fulfill({ headers, json: { id: 1, organizer: null, email_verified: true } }),
  )
}

async function signIn(page: Page) {
  await page.getByLabel('Email').fill('attendee@example.com')
  await page.getByLabel('Password').fill('sample-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('category changes the catalog request and the card shows cached price and stock', async ({
  page,
}) => {
  await mockEvent(page)
  await page.route(`${api}/events/categories`, (route) =>
    route.fulfill({ headers, json: ['Music', 'Sport'] }),
  )
  const categories: Array<string | null> = []
  await page.route(`${api}/events?*`, (route) => {
    categories.push(new URL(route.request().url()).searchParams.get('category'))
    return route.fulfill({ headers, json: { total: 1, items: [event] } })
  })

  await page.goto('/')
  await expect(page.getByText('Few left')).toBeVisible()
  await expect(page.getByText(/From 5,000/)).toBeVisible()
  await page.getByRole('button', { name: 'Music', exact: true }).click()
  await expect(page).toHaveURL((url) => url.searchParams.get('category') === 'Music')
  await expect.poll(() => categories.at(-1)).toBe('Music')
  await expect(page.getByRole('button', { name: 'Music', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('preserves the bounded ticket selection and campaign through sign-in and reload at 360px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await mockEvent(page, event, [ticket, soldOut, box])
  await mockSignIn(page)
  await page.route(`${api}/campaign-links/C-ABC`, (route) =>
    route.fulfill({ headers, json: { event_id: event.id, promo_code: 'STUDENT20' } }),
  )

  await page.goto(`/events/${event.id}?campaign=C-ABC`)
  await expect(page.getByRole('heading', { name: event.title })).toBeVisible()
  await expect(page.getByText('STUDENT20 applied')).toBeVisible()
  await expect(page.getByText('Sold out')).toBeVisible()
  await expect(page.getByRole('link', { name: /Contact support/ })).toHaveAttribute(
    'href',
    `/support/new?event_id=${event.id}`,
  )
  const add = page.getByRole('button', { name: 'Add one Standard ticket' })
  await add.click()
  await add.click()
  await expect(add).toBeDisabled()
  const addBox = page.getByRole('button', { name: 'Add one Box ticket' })
  await addBox.click()
  await expect(addBox).toBeDisabled()
  await expect(page.getByText('Tickets selected · 3')).toBeVisible()
  await expect(page.getByText(/15,000.*before discount/)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)

  await page.getByRole('button', { name: 'Continue to checkout' }).click()
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/login' &&
      url.searchParams.get('returnTo') === `/events/${event.id}/checkout`,
  )
  await signIn(page)
  await expect(page.getByText('Standard × 2')).toBeVisible()
  await expect(page.getByText('Box × 1')).toBeVisible()
  await expect(page.getByText('STUDENT20 applied')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Standard × 2')).toBeVisible()
  await expect(page.getByText('STUDENT20 applied')).toBeVisible()
})

test('closed registration disables checkout inside the desktop tickets panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockEvent(page, { ...event, registration_closes_at: hours(-1) } as typeof event)
  await page.route(`${api}/campaign-links/C-UNKNOWN`, (route) =>
    route.fulfill({ headers, status: 404, json: { error: 'CampaignLinkNotFoundError' } }),
  )
  await page.goto(`/events/${event.id}?campaign=C-UNKNOWN`)
  await expect(page.getByRole('heading', { name: event.title })).toBeVisible()
  await expect(page.getByText('Registration is closed', { exact: true })).toBeVisible()
  await expect(page.getByText(/Existing tickets are still valid/)).toBeVisible()
  await expect(page.getByText('Unavailable', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue to checkout' })).toBeDisabled()
  await expect(page.getByRole('button', { name: /Add one/ })).toHaveCount(0)
  const panel = page.locator('[data-slot="event-tickets"]')
  expect(await panel.boundingBox()).toMatchObject({ x: 920, width: 400 })
  await expect(panel).toHaveCSS('position', 'sticky')
  await expect(panel).toHaveCSS('top', '24px')
  await expect(panel.locator('[data-slot="event-checkout-bar"]')).toHaveCSS('position', 'static')
  await expect(page.getByRole('link', { name: 'Report this event' })).toBeVisible()
})

test('desktop catalog switches from one column to three and filters whole Astana days', async ({
  page,
}) => {
  const cards = Array.from({ length: 6 }, (_, index) => ({
    ...event,
    id: index + 1,
    title: `Event ${index + 1}`,
  }))
  await page.route(`${api}/events/categories`, (route) =>
    route.fulfill({ headers, json: ['Music'] }),
  )
  await page.route(`${api}/events/*/ticket-types`, (route) =>
    route.fulfill({ headers, json: [ticket] }),
  )
  let params = new URLSearchParams()
  await page.route(`${api}/events?*`, (route) => {
    params = new URL(route.request().url()).searchParams
    return route.fulfill({ headers, json: { total: 24, items: cards } })
  })
  await page.setViewportSize({ width: 1023, height: 900 })
  await page.goto('/')
  const catalog = page.locator('[data-route-id=catalog]')
  const list = page.locator('[data-slot=event-card]')
  await expect(list).toHaveCount(6)
  expect((await catalog.boundingBox())?.width).toBe(720)
  expect((await list.nth(1).boundingBox())?.x).toBe((await list.first().boundingBox())?.x)
  await page.setViewportSize({ width: 1024, height: 900 })
  expect(await catalog.boundingBox()).toMatchObject({ x: 40, width: 944 })
  expect((await list.nth(3).boundingBox())?.x).toBe(40)
  expect((await list.nth(2).boundingBox())?.y).toBe((await list.first().boundingBox())?.y)
  await page.setViewportSize({ width: 1440, height: 900 })
  expect(await catalog.boundingBox()).toMatchObject({ x: 120, width: 1200 })
  await page.getByRole('link', { name: '2', exact: true }).click()
  await expect.poll(() => params.get('offset')).toBe('6')
  await page.getByRole('button', { name: 'Any date' }).click()
  await page.getByLabel('From date').fill('2026-12-01')
  await page.getByLabel('To date').fill('2026-12-03')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect
    .poll(() => Object.fromEntries(params))
    .toMatchObject({
      limit: '6',
      offset: '0',
      date_from: '2026-12-01T00:00:00+05:00',
      date_to: '2026-12-04T00:00:00+05:00',
    })
})

test('desktop report resumes after sign-in and returns focus when closed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockEvent(page)
  await mockSignIn(page)
  await page.goto(`/events/${event.id}`)
  const action = page.getByRole('link', { name: 'Report this event' })
  await action.click()
  await expect(page.getByText('Sign in to report this event')).toBeVisible()
  await signIn(page)
  const dialog = page.getByRole('dialog', { name: 'Report an event' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveCSS('max-width', '560px')
  await expect(dialog.getByRole('button', { name: 'Submit report' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(action).toBeFocused()
  await action.click()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(action).toBeFocused()
  await action.click()
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(action).toBeFocused()
})

test('a registration closed response disables checkout even with an open schedule', async ({
  page,
}) => {
  await page.route(`${api}/events/${event.id}`, (route) => route.fulfill({ headers, json: event }))
  await page.route(`${api}/events/${event.id}/ticket-types`, (route) =>
    route.fulfill({ headers, status: 409, json: { error: 'RegistrationClosedError' } }),
  )
  await page.goto(`/events/${event.id}`)
  await expect(page.getByText('Registration is closed', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue to checkout' })).toBeDisabled()
})

test('registration that has not opened shows the start time and no quantity controls', async ({
  page,
}) => {
  await mockEvent(page, { ...event, registration_opens_at: hours(1) } as typeof event)
  await page.goto(`/events/${event.id}`)
  await expect(page.getByText('Registration has not opened yet')).toBeVisible()
  await expect(page.getByText(/Registration opens .*UTC\+5/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue to checkout' })).toBeDisabled()
  await expect(page.getByRole('button', { name: /Add one/ })).toHaveCount(0)
})

test('a report resumes after sign-in, preserves inputs on retry, and handles a duplicate', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 844 })
  await mockEvent(page)
  await mockSignIn(page)
  const submissions: unknown[] = []
  let finishSend!: () => void
  const waitingToSend = new Promise<void>((resolve) => {
    finishSend = resolve
  })
  await page.route(`${api}/events/${event.id}/reports`, async (route) => {
    submissions.push(route.request().postDataJSON())
    if (submissions.length === 1) return route.abort('internetdisconnected')
    if (submissions.length === 2) {
      await waitingToSend
      return route.fulfill({ headers, status: 201, json: { id: 1 } })
    }
    return route.fulfill({ headers, status: 409, json: { error: 'EventAlreadyReportedError' } })
  })

  await page.goto(`/events/${event.id}`)
  await page.getByRole('link', { name: 'Report this event' }).click()
  await expect(page.getByText('Sign in to report this event')).toBeVisible()
  await expect(page.getByText(/return to the report form for “Astana Jazz Night”/)).toBeVisible()
  await expect(page).toHaveURL(
    (url) => url.searchParams.get('returnTo') === `/events/${event.id}/report`,
  )
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Report an event' })).toBeVisible()
  const submit = page.getByRole('button', { name: 'Submit report' })
  await expect(submit).toBeDisabled()
  const reason = page.getByRole('radio', { name: 'Misleading information' })
  await reason.focus()
  await page.keyboard.press('Space')
  await expect(reason).toBeChecked()
  const details = page.getByRole('textbox', { name: /Details/ })
  await details.fill('🎟'.repeat(2001))
  await expect(details).toHaveValue('🎟'.repeat(2000))
  await expect(page.getByText('2000 / 2000')).toBeVisible()
  await details.fill('The lineup differs from the event listing.')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
  const a11y = await new AxeBuilder({ page }).analyze()
  expect(
    a11y.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical'),
  ).toEqual([])

  await submit.click()
  await expect(page.getByRole('alert')).toContainText('Your answers are still here')
  await expect(details).toHaveValue('The lineup differs from the event listing.')
  await expect(reason).toBeChecked()
  const retry = page.getByRole('button', { name: 'Try sending again' })
  await retry.click()
  await expect(page.getByRole('button', { name: 'Sending…' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Cancel and go back to the event' })).toBeDisabled()
  await expect(details).toHaveAttribute('readonly', '')
  await expect
    .poll(() => submissions)
    .toEqual(
      Array.from({ length: 2 }, () => ({
        reason: 'misleading',
        details: 'The lineup differs from the event listing.',
      })),
    )
  finishSend()
  await expect(page.getByRole('heading', { name: 'Report submitted' })).toBeFocused()
  await page.getByRole('link', { name: 'Back to the event' }).click()
  await page.getByRole('link', { name: 'Report this event' }).click()
  await page.getByRole('radio', { name: 'Spam' }).focus()
  await page.keyboard.press('Space')
  await submit.click()
  await expect(
    page.getByRole('heading', { name: 'You’ve already reported this event' }),
  ).toBeFocused()
  expect(submissions.at(-1)).toEqual({ reason: 'spam', details: null })
})

test('an unlisted event opens by its link and is absent from the real catalog', async ({
  page,
  request,
}) => {
  const email = process.env.BILETFLOW_E2E_ORGANIZER_EMAIL
  const password = process.env.BILETFLOW_E2E_ORGANIZER_PASSWORD
  test.skip(!email || !password, 'Requires an organizer in a disposable backend database')
  const login = await request.post(`${api}/auth/login`, { data: { email, password } })
  expect(login.ok()).toBe(true)
  const { access_token: accessToken } = (await login.json()) as { access_token: string }
  const organizer = { Authorization: `Bearer ${accessToken}` }
  const title = `Unlisted ${randomUUID()}`
  const created = await request.post(`${api}/events`, {
    headers: organizer,
    data: {
      title,
      visibility: 'unlisted',
      start_time: hours(24),
      end_time: hours(26),
      venue_name: 'Test venue',
      venue_address: 'Test address',
    },
  })
  expect(created.ok()).toBe(true)
  const { id } = (await created.json()) as { id: number }
  await page.goto(`/events/${id}`)
  await expect(page.getByRole('heading', { name: 'Event not found' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Browse events' })).toHaveAttribute('href', '/')
  const published = await request.patch(`${api}/events/${id}/publish`, { headers: organizer })
  expect(published.ok()).toBe(true)
  await page.goto(`/events/${id}`)
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await page.goto('/?' + new URLSearchParams({ q: title }))
  await expect(page.locator('[data-slot="empty-state"]')).toContainText('Nothing found')
  await expect(page.getByRole('link', { name: title, exact: true })).toHaveCount(0)
  const madePrivate = await request.patch(`${api}/events/${id}`, {
    headers: organizer,
    data: { visibility: 'private' },
  })
  expect(madePrivate.ok()).toBe(true)
  await page.goto(`/events/${id}`)
  await expect(page.locator('[data-route-id="not-found"]')).toBeVisible()
})
