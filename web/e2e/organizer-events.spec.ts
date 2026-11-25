import { expect, test, type Page, type Route } from '@playwright/test'

// The organizer creates an event with a free and a paid ticket type and publishes it.
// The whole API is played by stubs below (nothing reaches a database), in the order the
// backend would answer: the event is a draft until the publish call.

const api = (process.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')
const headers = { 'Access-Control-Allow-Origin': '*' }
const tokens = { access_token: 'test-access', refresh_token: 'test-refresh', token_type: 'bearer' }
const me = {
  id: 1,
  email: 'organizer@example.test',
  email_verified: true,
  is_platform_admin: false,
  is_event_staff: false,
  organizer: {
    id: 10,
    user_id: 1,
    status: 'approved',
    display_name: 'Jazz Club',
    rejection_reason: null,
  },
}

type Json = Record<string, unknown>

/** The backend's state, as far as this test needs it. */
function createServer() {
  let event: Json | undefined
  const types: Json[] = []
  const summary = () => ({
    event_id: event!.id,
    title: event!.title,
    status: event!.status,
    lifecycle: event!.lifecycle,
    start_time: event!.start_time,
    end_time: event!.end_time,
    image_url: null,
    capacity: event!.capacity ?? null,
    tickets_sold: 0,
    revenue: 0,
    paid_sales_status: 'not_started',
  })
  const published = () => event?.status === 'published'
  const availability = (type: Json) => ({
    ...type,
    available: type.quantity,
    max_now: published() && type.price === 0 ? 10 : 0,
    on_sale: published() && type.price === 0,
    unavailable_reason: !published()
      ? 'registration_closed'
      : type.price === 0
        ? null
        : 'paid_sales_inactive',
  })
  const checklist = () => ({
    event_id: 7,
    status: 'not_started',
    fee_amount: 5000,
    currency: 'KZT',
    is_simulated: true,
    checklist: {
      has_paid_ticket_type: types.some((type) => (type.price as number) > 0),
      identity_verified: false,
      payout_account_connected: false,
      terms_accepted: false,
      fee_paid: false,
    },
    can_activate: false,
    activated_at: null,
    suspended_at: null,
    suspension_reason: null,
  })

  const calls: string[] = []

  async function handle(route: Route) {
    const request = route.fulfill.bind(route)
    const { pathname } = new URL(route.request().url())
    const method = route.request().method()
    const body = () => route.request().postDataJSON() as Json
    const json = (data: unknown, status = 200) => request({ headers, status, json: data })
    calls.push(`${method} ${pathname}`)

    if (method === 'OPTIONS')
      return request({
        headers: {
          ...headers,
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': '*',
        },
        status: 204,
      })
    if (pathname === '/auth/refresh') return json(tokens)
    if (pathname === '/auth/me') return json(me)
    if (pathname === '/support/cases/inbox') return json([])
    if (pathname === '/events/me' && method === 'GET') return json(event ? [event] : [])
    if (pathname === '/events/me/summary') return json(event ? [summary()] : [])
    if (pathname === '/events' && method === 'POST') {
      event = {
        id: 7,
        organizer_id: 10,
        description: null,
        status: 'draft',
        lifecycle: 'draft',
        image_url: null,
        organizer_name: 'Jazz Club',
        visibility: 'public',
        ...body(),
      }
      return json(event)
    }
    if (pathname === '/events/7/manage')
      return event
        ? json(event)
        : json({ error: 'EventNotFoundError', message: 'x', fields: null }, 404)
    if (pathname === '/events/7/ticket-types/manage') return json(types.map(availability))
    if (pathname === '/events/7/ticket-type' && method === 'POST') {
      const created = {
        id: 100 + types.length,
        event_id: 7,
        description: null,
        is_hidden: false,
        sold_count: 0,
        ...body(),
      }
      types.push(created)
      return json(availability(created), 201)
    }
    if (pathname === '/events/7/paid-sales') return json(checklist())
    if (pathname === '/events/7/check-in/stats')
      return json({ registered: 0, checked_in: 0, not_checked_in: 0, cancelled: 0, refunded: 0 })
    if (pathname === '/events/7/publish' && method === 'PATCH') {
      event = { ...event, status: 'published', lifecycle: 'upcoming' }
      return json(event)
    }
    return json({ error: 'NOT_FOUND', message: pathname, fields: null }, 404)
  }

  return { handle, calls }
}

async function useStubbedApi(page: Page) {
  await page.addInitScript(() => localStorage.setItem('biletflow.refresh-token', 'saved-refresh'))
  const server = createServer()
  await page.route(`${api}/**`, server.handle)
  return server
}

test.use({ locale: 'en-US' })

test('an organizer creates an event with a free and a paid ticket type and publishes it', async ({
  page,
}) => {
  const server = await useStubbedApi(page)

  await page.goto('/organizer')
  await expect(page.getByRole('heading', { level: 1, name: 'Events' })).toBeVisible()
  await expect(page.getByText('No events yet')).toBeVisible()
  // the menu of the workspace, as in the design
  await expect(page.getByRole('navigation', { name: 'Organizer' }).getByRole('link')).toHaveText([
    'Events',
    'Campaigns',
    'Analytics',
    'Support',
    'Profile and payouts',
  ])

  // 1. a draft
  await page.getByRole('link', { name: '+ Create event' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'New event' })).toBeVisible()
  await page.getByLabel('Event name').fill('Spring jazz night')
  await page.getByLabel('Start', { exact: true }).fill('2026-12-01T19:00')
  await page.getByLabel('End', { exact: true }).fill('2026-12-01T22:00')
  await page.getByLabel('Venue').fill('Astana Hall')
  await page.getByLabel('Address').fill('Abay 1, Astana')
  await page.getByRole('button', { name: 'Save draft' }).click()

  await expect(page).toHaveURL(/\/organizer\/events\/7$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Spring jazz night' })).toBeVisible()
  await expect(page.locator('[data-slot="status-badge"]').first()).toHaveText('Draft')

  // 2. a free and a paid ticket type
  for (const [name, price, quantity] of [
    ['Free entry', '0', '50'],
    ['Standard', '5000', '100'],
  ]) {
    await page.getByRole('button', { name: '+ Add ticket type' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name', { exact: true }).fill(name)
    await dialog.getByLabel('Price, ₸').fill(price)
    await dialog.getByLabel('Quantity').fill(quantity)
    await dialog.getByLabel('Sales from').fill('2026-10-01T10:00')
    await dialog.getByLabel('Sales until').fill('2026-12-01T18:00')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()
  }
  const rows = page.locator('[data-slot="ticket-type-row"]')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Free entry')
  await expect(rows.nth(0)).toContainText('Free')
  await expect(rows.nth(1)).toContainText('Standard')
  await expect(rows.nth(1)).toContainText('Event not published')
  // the paid type makes the first step of the paid-sales checklist done
  await expect(page.getByText('Steps done: 1 of 5')).toBeVisible()

  // 3. publish
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(page.locator('[data-slot="status-badge"]').first()).toHaveText('Upcoming')
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0)
  await expect(rows.nth(0)).toContainText('On sale')
  await expect(rows.nth(1)).toContainText('Waiting for activation')

  // the stubs saw the calls in this order
  expect(server.calls.filter((call) => /^(POST|PATCH) \/events/.test(call))).toEqual([
    'POST /events',
    'POST /events/7/ticket-type',
    'POST /events/7/ticket-type',
    'PATCH /events/7/publish',
  ])
})
