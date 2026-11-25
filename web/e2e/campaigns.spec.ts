import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

// An organizer makes a campaign, takes its QR link, and a viewer who opens that link
// gets the discount. The whole API is played by stubs below (nothing reaches a database)
// and both browsers talk to the same stub, so the viewer's open is counted on the
// organizer's campaign page.

const api = (process.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')
const headers = { 'Access-Control-Allow-Origin': '*' }
const hours = (amount: number) => new Date(Date.now() + amount * 3600_000).toISOString()
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6UkAAAAASUVORK5CYII=',
  'base64',
)

const eventId = 7
const price = 5000
const token = 'C-stubbed1'
const event = {
  id: eventId,
  organizer_id: 10,
  title: 'Spring jazz night',
  description: 'Live jazz in the hall.',
  status: 'published',
  lifecycle: 'upcoming',
  visibility: 'public',
  category: 'Music',
  venue_name: 'Astana Hall',
  venue_address: 'Abay 1',
  capacity: 200,
  start_time: hours(48),
  end_time: hours(51),
  organizer_name: 'Jazz Club',
  published_at: hours(-48),
  cancelled_at: null,
  image_url: null,
  suspended_at: null,
  suspension_reason: null,
}
const standard = {
  id: 100,
  event_id: eventId,
  name: 'Standard',
  description: null,
  price,
  quantity: 100,
  sold_count: 0,
  max_per_order: 10,
  is_hidden: false,
  sales_start: hours(-24),
  sales_end: hours(40),
  available: 100,
  max_now: 10,
  on_sale: true,
  unavailable_reason: null,
}
const organizerMe = {
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
const viewerMe = {
  id: 2,
  email: 'viewer@example.test',
  email_verified: true,
  is_platform_admin: false,
  is_event_staff: false,
  organizer: null,
}

type Json = Record<string, unknown>

/** The backend's state, as far as this test needs it. */
function createServer(origin: string) {
  const created: Json[] = []
  let campaign: Json | undefined
  let linkOpens = 0
  const shown = () => (campaign ? { ...campaign, link_opens: linkOpens } : undefined)

  async function handle(route: Route) {
    const request = route.request()
    const { pathname } = new URL(request.url())
    const method = request.method()
    const json = (data: unknown, status = 200) => route.fulfill({ headers, status, json: data })
    const error = (code: string, status: number) =>
      json({ error: code, message: code, fields: null }, status)

    if (method === 'OPTIONS')
      return route.fulfill({
        headers: {
          ...headers,
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': '*',
        },
        status: 204,
      })

    if (pathname === '/auth/refresh') {
      const { refresh_token: refresh } = request.postDataJSON() as { refresh_token: string }
      const organizer = refresh === 'organizer-refresh'
      return json({
        access_token: organizer ? 'organizer-access' : 'viewer-access',
        refresh_token: refresh,
        token_type: 'bearer',
      })
    }
    if (pathname === '/auth/me')
      return json(
        request.headers().authorization === 'Bearer organizer-access' ? organizerMe : viewerMe,
      )

    // the organizer's side
    if (pathname === '/events/me') return json([event])
    if (pathname === '/events/me/summary')
      return json([
        {
          event_id: eventId,
          title: event.title,
          status: event.status,
          lifecycle: event.lifecycle,
          start_time: event.start_time,
          end_time: event.end_time,
          image_url: null,
          capacity: event.capacity,
          tickets_sold: 0,
          revenue: 0,
          paid_sales_status: 'active',
        },
      ])
    if (pathname === '/support/cases/inbox') return json([])
    if (pathname === `/events/${eventId}/ticket-types/manage`) return json([standard])
    if (pathname === `/events/${eventId}/campaigns` && method === 'GET')
      return json(shown() ? [shown()] : [])
    if (pathname === `/events/${eventId}/campaigns` && method === 'POST') {
      const data = request.postDataJSON() as Json
      created.push(data)
      campaign = {
        id: 4,
        event_id: eventId,
        name: data.name,
        code: data.code ?? 'RANDOM12',
        discount_type: data.discount_type,
        discount_value: data.discount_value,
        starts_at: data.starts_at ?? null,
        ends_at: data.ends_at ?? null,
        max_redemptions: data.max_redemptions ?? null,
        redemptions_count: 0,
        is_active: true,
        link: `${origin}/events/${eventId}?campaign=${token}`,
        link_opens: 0,
        ticket_type_ids: data.ticket_type_ids ?? [],
        created_at: new Date().toISOString(),
        stats: { orders: 0, tickets: 0, gross: 0, discount: 0, net: 0 },
      }
      return json(shown(), 201)
    }
    if (pathname === '/campaigns/4' && method === 'GET')
      return campaign ? json(shown()) : error('CampaignNotFoundError', 404)
    if (pathname === '/campaigns/4/qr')
      return route.fulfill({ headers, body: png, contentType: 'image/png' })

    // the viewer's side
    if (pathname === `/campaign-links/${token}`) {
      if (!campaign) return error('CampaignLinkNotFoundError', 404)
      linkOpens += 1
      return json({
        event_id: eventId,
        promo_code: campaign.code,
        discount_type: campaign.discount_type,
        discount_value: campaign.discount_value,
      })
    }
    if (pathname === `/events/${eventId}`) return json(event)
    if (pathname === `/events/${eventId}/ticket-types`) return json([standard])
    if (pathname === `/events/${eventId}/orders/preview`) {
      const data = request.postDataJSON() as {
        items: { quantity: number }[]
        promo_code: string | null
      }
      const subtotal = price * data.items.reduce((sum, item) => sum + item.quantity, 0)
      const discount =
        campaign && data.promo_code === campaign.code
          ? Math.floor((subtotal * (campaign.discount_value as number)) / 100)
          : 0
      return json({ subtotal, discount, total: subtotal - discount, promo_code: data.promo_code })
    }
    return error('NOT_FOUND', 404)
  }

  return { handle, created }
}

/** No serious or critical accessibility problem on the page (colors, names, labels). */
async function expectAccessible(page: Page) {
  // A color that is still fading (a button that just became enabled) would be measured half way
  await page.addStyleTag({ content: '*, ::before, ::after { transition: none !important; }' })
  const result = await new AxeBuilder({ page }).analyze()
  expect(
    result.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical'),
  ).toEqual([])
}

async function signInAs(page: Page, refreshToken: string) {
  await page.addInitScript(
    (value) => localStorage.setItem('biletflow.refresh-token', value),
    refreshToken,
  )
}

test.use({ locale: 'en-US' })

test('an organizer makes a campaign, and a viewer who opens its QR link gets the discount', async ({
  page,
  browser,
  baseURL,
}) => {
  const server = createServer(baseURL!)
  await signInAs(page, 'organizer-refresh')
  await page.route(`${api}/**`, server.handle)
  await page.setViewportSize({ width: 1440, height: 900 })

  // 1. the list is empty
  await page.goto('/organizer/campaigns')
  await expect(page.getByRole('heading', { level: 1, name: 'Campaigns' })).toBeVisible()
  await expect(page.getByText('No campaigns yet')).toBeVisible()

  // 2. a new campaign: 20 % off the Standard ticket, at most 100 uses
  await page.getByRole('link', { name: '+ New campaign' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'New campaign' })).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('combobox', { name: 'Event' }).click()
  await page.getByRole('option', { name: event.title }).click()
  await page.getByLabel('Campaign name').fill('Student discount')
  await page.getByLabel('Discount amount').fill('20')
  await page.getByLabel('Maximum uses').fill('100')
  await page.getByLabel('Promo code', { exact: true }).fill('student20')
  await expect(page.getByLabel('Promo code', { exact: true })).toHaveValue('STUDENT20')
  await page.getByRole('checkbox', { name: /Standard · 5,000/ }).check()
  await page.getByRole('button', { name: 'Activate campaign' }).click()

  // 3. its page: the QR as the server draws it, and the link inside it
  await expect(page).toHaveURL(/\/organizer\/campaigns\/4$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Student discount' })).toBeVisible()
  await expect(page.getByText(/The campaign is created/)).toBeVisible()
  await expect(
    page.getByRole('img', { name: 'QR code of the campaign "Student discount"' }),
  ).toHaveAttribute('src', /^blob:/)
  const link = `${baseURL}/events/${eventId}?campaign=${token}`
  await expect(page.getByText(link, { exact: true })).toBeVisible()
  const results = page.getByRole('region', { name: 'Results' })
  await expect(results.getByText('Link opens').locator('xpath=ancestor::div[1]')).toContainText('0')
  expect(server.created).toEqual([
    {
      name: 'Student discount',
      discount_type: 'percent',
      discount_value: 20,
      code: 'STUDENT20',
      max_redemptions: 100,
      ticket_type_ids: [100],
    },
  ])

  await expectAccessible(page)

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PNG' }).click()
  expect((await download).suggestedFilename()).toBe('campaign-STUDENT20-qr.png')

  // 4. a viewer, who is not the organizer, opens the link
  const viewerContext = await browser.newContext({ locale: 'en-US', baseURL })
  try {
    const viewer = await viewerContext.newPage()
    await signInAs(viewer, 'viewer-refresh')
    await viewer.route(`${api}/**`, server.handle)
    await viewer.goto(link)

    await expect(viewer.getByRole('heading', { name: event.title })).toBeVisible()
    await expect(viewer.getByText('STUDENT20 applied')).toBeVisible()
    await viewer.getByRole('button', { name: 'Add one Standard ticket' }).click()
    await expect(viewer.getByText(/5,000\s₸.*before discount/)).toBeVisible()

    // the checkout prices the order with the code the link brought: 5,000 less 20 %
    await viewer.getByRole('button', { name: 'Continue to checkout' }).click()
    await expect(viewer).toHaveURL(new RegExp(`/events/${eventId}/checkout$`))
    await expect(viewer.getByText('STUDENT20 applied')).toBeVisible()
    await expect(viewer.getByText(/4,000\s₸/).first()).toBeVisible()
  } finally {
    await viewerContext.close()
  }

  // 5. the open was counted, and the list shows the campaign
  await page.reload()
  await expect(
    page
      .getByRole('region', { name: 'Results' })
      .getByText('Link opens')
      .locator('xpath=ancestor::div[1]'),
  ).toContainText('1')
  await page
    .getByRole('navigation', { name: 'Organizer' })
    .getByRole('link', { name: 'Campaigns' })
    .click()
  const row = page.getByRole('row', { name: /Student discount/ })
  await expect(row).toContainText('STUDENT20')
  await expect(row).toContainText('20 %')
  await expect(row).toContainText('Active')
  await expectAccessible(page)
})
