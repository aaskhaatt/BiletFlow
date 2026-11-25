import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

const api = (process.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')
const timestamp = '2026-11-25T10:15:00Z'
const event = {
  id: 7,
  organizer_id: 10,
  title: 'Jazz Festival',
  status: 'published',
  lifecycle: 'upcoming',
  visibility: 'public',
  start_time: '2026-12-07T14:00:00Z',
  end_time: '2026-12-07T17:00:00Z',
  capacity: 100,
  venue_name: 'Astana Opera',
  venue_address: 'Kunayev Street',
  image_url: null,
  cancelled_at: null,
}
const order = {
  id: 12,
  event_id: event.id,
  event,
  status: 'refunded',
  total_amount: 5000,
  discount_amount: 0,
  promo_code: null,
  buyer_name: 'Ticket buyer',
  buyer_email: 'buyer@example.test',
  created_at: timestamp,
  expires_at: null,
  paid_at: timestamp,
  cancelled_at: null,
  refunded_at: timestamp,
  items: [],
  tickets: [],
}
const accounts = {
  viewer: {
    id: 1,
    email: order.buyer_email,
    email_verified: true,
    is_platform_admin: false,
    is_event_staff: false,
    organizer: null,
  },
  organizer: {
    id: 2,
    email: 'organizer@example.test',
    email_verified: true,
    is_platform_admin: false,
    is_event_staff: false,
    organizer: {
      id: 10,
      user_id: 2,
      status: 'approved',
      display_name: 'Jazz Club',
      rejection_reason: null,
    },
  },
}
type Role = keyof typeof accounts
type Case = {
  id: number
  requester_user_id: number
  assigned_user_id: number | null
  event_id: number
  order_id: number
  ticket_id: null
  kind: string
  status: string
  category: string
  subject: string
  created_at: string
  updated_at: string
  messages: { id: number; body: string; author_user_id: number; created_at: string }[]
  history: (
    | {
        action: 'assigned'
        actor_user_id: number
        assigned_user_id: number | null
        created_at: string
      }
    | {
        action: 'status_changed'
        actor_user_id: number
        from_status: string
        to_status: string
        created_at: string
      }
  )[]
}

function mockSupport() {
  const cases: Case[] = []
  const unexpected: string[] = []
  const requests: { key: string; body: unknown }[] = []
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
  }

  async function respond(route: Route, role: Role) {
    const request = route.request()
    const url = new URL(request.url())
    const key = request.method() + ' ' + url.pathname
    const me = accounts[role]
    const ok = (data: unknown, status = 200) => route.fulfill({ status, headers, json: data })
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const body = request.postDataJSON()
    if (key === 'POST /auth/refresh')
      return ok({
        access_token: role + '-token',
        refresh_token: role + '-refresh',
        token_type: 'bearer',
      })
    if (key === 'GET /auth/me') return ok(me)
    if (key === 'GET /orders/12') return ok(order)
    if (key === 'GET /orders/me') return ok(role === 'viewer' ? [order] : [])
    if (key === 'GET /events/7') return ok(event)
    if (key === 'GET /support/cases/me')
      return ok(cases.filter((item) => item.requester_user_id === me.id))
    if (key === 'GET /support/cases/inbox') {
      const status = url.searchParams.get('status')
      return ok(
        role === 'organizer' ? cases.filter((item) => !status || status === item.status) : [],
      )
    }
    if (key === 'POST /support/cases' && role === 'viewer') {
      requests.push({ key, body })
      const item: Case = {
        id: 42,
        requester_user_id: me.id,
        assigned_user_id: null,
        event_id: event.id,
        order_id: body.order_id,
        ticket_id: null,
        kind: body.kind,
        category: body.category,
        subject: body.subject,
        status: 'open',
        created_at: timestamp,
        updated_at: timestamp,
        history: [],
        messages: [{ id: 1, body: body.message, author_user_id: me.id, created_at: timestamp }],
      }
      cases.push(item)
      return ok(item, 201)
    }
    const item = cases[0]
    if (item && key === 'GET /support/cases/42') return ok(item)
    if (item && role === 'organizer') {
      if (key === 'POST /support/cases/42/messages') {
        requests.push({ key, body })
        const message = {
          id: 2,
          body: body.body,
          author_user_id: me.id,
          created_at: '2026-11-25T10:18:00Z',
        }
        item.messages.push(message)
        return ok(message, 201)
      }
      if (key === 'PATCH /support/cases/42/assignee') {
        requests.push({ key, body })
        item.assigned_user_id = body.user_id
        item.history.push({
          action: 'assigned',
          actor_user_id: me.id,
          assigned_user_id: body.user_id,
          created_at: '2026-11-25T10:19:00Z',
        })
        return ok(item)
      }
      if (key === 'PATCH /support/cases/42/status') {
        requests.push({ key, body })
        item.history.push({
          action: 'status_changed',
          actor_user_id: me.id,
          from_status: item.status,
          to_status: body.status,
          created_at: '2026-11-25T10:20:00Z',
        })
        item.status = body.status
        return ok(item)
      }
    }
    unexpected.push(key)
    return ok({ error: 'UNKNOWN_ERROR' }, 404)
  }
  return { respond, unexpected, requests }
}

async function connect(page: Page, role: Role, server: ReturnType<typeof mockSupport>) {
  await page.addInitScript(
    (token) => localStorage.setItem('biletflow.refresh-token', token),
    role + '-refresh',
  )
  await page.route(`${api}/**`, (route) => server.respond(route, role))
}

async function expectAccessible(page: Page) {
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    scan.violations
      .filter(({ impact }) => impact === 'serious' || impact === 'critical')
      .map(({ id, nodes }) => ({
        id,
        targets: nodes.map(({ target }) => target),
      })),
  ).toEqual([])
}

test.use({ locale: 'en-US' })

test('attendee and organizer exchange support messages about an order', async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  test.slow()
  const server = mockSupport()
  await connect(page, 'viewer', server)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/orders/12')
  await page.getByRole('link', { name: 'Contact support' }).click()
  await expect(page).toHaveURL(/\/support\/new\?order_id=12$/)
  await expect(page.getByRole('heading', { name: 'New support case' })).toBeVisible()
  await expect(page.getByText('Order #12', { exact: true })).toBeVisible()
  await expectAccessible(page)
  await page.screenshot({ path: testInfo.outputPath('viewer-new-case.png'), fullPage: true })
  await page.getByRole('combobox', { name: 'Category' }).click()
  await page.getByRole('option', { name: 'Payment', exact: true }).click()
  await page.getByLabel('Subject').fill('Why was my order refunded?')
  await page
    .getByLabel('Message', { exact: true })
    .fill('Please tell me why the payment was refunded.')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page).toHaveURL(/\/support\/42$/)
  await expect(page.getByRole('log')).toContainText('Please tell me why the payment was refunded.')
  await expectAccessible(page)
  await page.screenshot({ path: testInfo.outputPath('viewer-chat.png'), fullPage: true })

  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  })
  try {
    const organizer = await context.newPage()
    await connect(organizer, 'organizer', server)
    await organizer.goto('/organizer/support')
    const row = organizer.getByRole('row').filter({ hasText: 'Why was my order refunded?' })
    await expect(row).toBeVisible()
    await expectAccessible(organizer)
    await organizer.screenshot({ path: testInfo.outputPath('organizer-inbox.png'), fullPage: true })
    await row.getByRole('link').click()
    await expect(organizer).toHaveURL(/\/support\/42$/)
    await expect(organizer.locator('[data-slot="organizer-layout"]')).toBeVisible()
    await expectAccessible(organizer)
    await organizer.screenshot({ path: testInfo.outputPath('organizer-chat.png'), fullPage: true })
    await organizer.getByLabel('Write a message').fill('We refunded the duplicate charge.')
    await organizer.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(organizer.getByRole('log')).toContainText('We refunded the duplicate charge.')
    await organizer.getByRole('button', { name: 'Assign to me' }).click()
    await expect(organizer.getByRole('button', { name: 'Unassign me' })).toBeEnabled()
    await organizer.getByRole('radio', { name: 'Resolved' }).click()
    await expect(organizer.getByRole('radio', { name: 'Resolved' })).toBeChecked()
  } finally {
    await context.close()
  }

  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('We refunded the duplicate charge.')
  await expect(page.getByRole('log')).toContainText('Status changed: Open → Resolved')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  expect(server.requests).toEqual([
    {
      key: 'POST /support/cases',
      body: {
        kind: 'attendee',
        category: 'payment',
        subject: 'Why was my order refunded?',
        message: 'Please tell me why the payment was refunded.',
        order_id: 12,
      },
    },
    { key: 'POST /support/cases/42/messages', body: { body: 'We refunded the duplicate charge.' } },
    { key: 'PATCH /support/cases/42/assignee', body: { user_id: 2 } },
    { key: 'PATCH /support/cases/42/status', body: { status: 'resolved' } },
  ])
  expect(server.unexpected).toEqual([])
})
