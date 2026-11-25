import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'

const api = (process.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')
const headers = { 'Access-Control-Allow-Origin': '*' }
const email = 'buyer@example.test'
const eventId = 741
const checkout = `/events/${eventId}/checkout`
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6UkAAAAASUVORK5CYII=',
  'base64',
)
const at = (offset: number) => new Date(Date.now() + offset).toISOString()

function mockEvent() {
  return {
    id: eventId,
    title: 'Astana Demo Concert',
    status: 'published',
    lifecycle: 'upcoming',
    visibility: 'public',
    start_time: at(3_600_000),
    end_time: at(7_200_000),
    venue_name: 'Astana Opera',
    venue_address: 'Kunayev St 1',
    refund_policy: 'Refunds are available under the event policy.',
    image_url: null,
    cancelled_at: null,
  }
}

function issuedTicket(orderId: number, status = 'valid', offset = 0) {
  return {
    id: orderId * 10 + offset,
    event_id: eventId,
    ticket_type_id: 1,
    code: `DEMO-${orderId}-${offset}`,
    attendee_name: 'Aida Tester',
    created_at: at(0),
    checked_in_at: status === 'checked_in' ? at(0) : null,
    status,
  }
}

function orderFixture(id: number, status: string) {
  return {
    id,
    event_id: eventId,
    status,
    total_amount: 5000,
    discount_amount: 0,
    promo_code: null as string | null,
    buyer_name: 'Aida Tester',
    buyer_email: email,
    created_at: at(0),
    expires_at: status === 'pending' ? at(600_000) : null,
    paid_at: null as string | null,
    cancelled_at: null as string | null,
    refunded_at: null as string | null,
    items: [{ id, ticket_type_id: 1, quantity: 1, unit_price: 5000 }],
    tickets: status === 'pending' ? [] : [issuedTicket(id)],
    event: mockEvent(),
  }
}

type TestOrder = ReturnType<typeof orderFixture>
type OrderInput = {
  buyer_name: string
  items: { ticket_type_id: number; quantity: number }[]
  promo_code?: string | null
}

function makeOrder(id: number, status: string, overrides: Partial<TestOrder> = {}): TestOrder {
  return { ...orderFixture(id, status), ...overrides }
}

async function mockServer(
  page: Page,
  { price = 5000, initialOrders = [] }: { price?: number; initialOrders?: TestOrder[] } = {},
) {
  const orders = new Map(initialOrders.map((order) => [order.id, order]))
  const calls = {
    create: [] as OrderInput[],
    payments: [] as { id: number; simulate_outcome: string }[],
    pdf: [] as string[],
    qr: [] as string[],
    cancel: [] as number[],
  }
  await page.addInitScript(
    ({ eventId }) => {
      if (sessionStorage.getItem('checkout-test-seeded')) return
      sessionStorage.setItem('checkout-test-seeded', '1')
      localStorage.setItem('biletflow.refresh-token', 'refresh')
      sessionStorage.setItem(
        `biletflow.checkout.${eventId}`,
        JSON.stringify({
          items: [{ ticket_type_id: 1, quantity: 1 }],
          campaign: '',
          promo_code: null,
        }),
      )
    },
    { eventId },
  )

  await page.route(`${api}/**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    const json = (data: unknown, status = 200) => route.fulfill({ headers, json: data, status })
    const error = (code: string, status: number) => json({ error: code, fields: null }, status)

    if (method === 'OPTIONS') {
      return route.fulfill({
        headers: {
          ...headers,
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': '*',
        },
        status: 204,
      })
    }
    if (path === '/auth/refresh') {
      return json({
        access_token: 'checkout-access',
        refresh_token: 'refresh',
        token_type: 'bearer',
      })
    }
    if (path === '/auth/me') return json({ id: 1, email, email_verified: true, organizer: null })
    if (path === `/events/${eventId}`) {
      if (initialOrders.some((order) => order.event.status === 'cancelled')) {
        return error('EventNotFoundError', 404)
      }
      return json(mockEvent())
    }
    if (path === `/events/${eventId}/ticket-types`) {
      if (initialOrders.some((order) => order.event.status === 'cancelled'))
        return error('EventNotFoundError', 404)
      return json([
        {
          id: 1,
          event_id: eventId,
          name: 'Standard',
          price,
          available: 20,
          max_now: 2,
          on_sale: true,
          is_hidden: false,
        },
      ])
    }
    if (path === `/events/${eventId}/orders/preview`) {
      const { promo_code: promo } = request.postDataJSON()
      if (promo === 'WRONG') return error('PromoCodeNotFoundError', 404)
      const discount = promo === 'VALID' ? 1200 : 0
      return json({ subtotal: price, discount, total: price - discount, promo_code: promo })
    }
    if (path === `/events/${eventId}/orders`) {
      const data = request.postDataJSON() as OrderInput
      calls.create.push(data)
      const id = 101 + orders.size
      const discount = data.promo_code === 'VALID' ? 1200 : 0
      const total = price - discount
      const order = makeOrder(id, total === 0 ? 'confirmed' : 'pending', {
        total_amount: total,
        discount_amount: discount,
        promo_code: data.promo_code ?? null,
        buyer_name: data.buyer_name,
        items: [{ id, ticket_type_id: 1, quantity: 1, unit_price: price }],
      })
      orders.set(id, order)
      return json(order, 201)
    }
    if (path === '/orders/me') return json([...orders.values()])
    if (path.startsWith('/orders/') || path.startsWith('/tickets/')) {
      const [, kind, idString, action] = path.split('/')
      const id = Number(idString)
      expect(request.headers().authorization).toBe('Bearer checkout-access')
      if (action === 'qr') {
        calls.qr.push(path)
        return route.fulfill({ headers, body: png, contentType: 'image/png' })
      }
      if (action === 'pdf') {
        calls.pdf.push(path)
        return route.fulfill({ headers, body: '%PDF-1.4\n%%EOF\n', contentType: 'application/pdf' })
      }
      const order = orders.get(id)
      if (kind !== 'orders' || !order) return error('OrderNotFoundError', 404)
      if (action === 'pay') {
        const data = request.postDataJSON()
        calls.payments.push({ id, ...data })
        if (data.simulate_outcome === 'failure') return error('PaymentFailedError', 402)
        order.status = 'confirmed'
        order.paid_at = at(0)
        order.tickets = [issuedTicket(order.id)]
      }
      if (action === 'cancel') {
        calls.cancel.push(id)
        order.status = 'cancelled'
        order.cancelled_at = at(0)
        order.tickets = order.tickets.map((ticket) => ({ ...ticket, status: 'cancelled' }))
      }
      return json(order)
    }
    return error('NOT_FOUND', 404)
  })
  return calls
}

test.use({ locale: 'en-US' })

async function fillBuyer(page: Page) {
  await page.getByRole('textbox', { name: 'Full name' }).fill('Aida Tester')
  await page.getByRole('checkbox', { name: /organizer’s terms/ }).check()
}

test('free checkout validates the form, creates one order, opens ticket files and cancels', async ({
  page,
}) => {
  const calls = await mockServer(page, { price: 0 })
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto(checkout)
  await expect(page.getByText(email, { exact: true })).toBeVisible()
  await expect(page.getByText('Refunds are available under the event policy.')).toBeVisible()
  await expect(page.getByText('Processing fee')).toHaveCount(0)
  const placeOrder = page.getByRole('button', { name: 'Register for free' })
  await expect(placeOrder).toBeDisabled()
  await page.getByRole('checkbox', { name: /organizer’s terms/ }).check()
  await placeOrder.click()
  await expect(page.getByRole('textbox', { name: 'Full name' })).toHaveAccessibleDescription(
    'Enter your full name.',
  )
  await expect(page.getByRole('textbox', { name: 'Full name' })).toBeFocused()
  await page.getByRole('textbox', { name: 'Full name' }).fill('  Aida Tester  ')
  await placeOrder.evaluate((button: HTMLButtonElement) => {
    button.form?.requestSubmit()
    button.form?.requestSubmit()
  })
  await expect(page).toHaveURL(/\/orders\/101$/)
  await expect(page.getByText('Your order is confirmed. Your tickets are below.')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Ticket QR code' })).toHaveAttribute('src', /^blob:/)
  expect(calls.create).toEqual([
    { buyer_name: 'Aida Tester', items: [{ ticket_type_id: 1, quantity: 1 }], promo_code: null },
  ])
  expect(calls.qr).toContain('/tickets/1010/qr')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  await page.getByRole('button', { name: 'Printable PDF', exact: true }).click()
  await expect.poll(() => calls.pdf).toContain('/tickets/1010/pdf')
  await page.getByRole('button', { name: 'PDF of all tickets in this order' }).click()
  await expect.poll(() => calls.pdf).toContain('/orders/101/pdf')
  await page.getByRole('button', { name: 'Cancel order', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm cancellation' }).click()
  await expect(page.getByText('This order was cancelled.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Printable PDF', exact: true })).toBeDisabled()
  await expect(page.getByRole('img', { name: 'Ticket QR code' })).toHaveCount(0)
  expect(calls.cancel).toEqual([101])
})

test('invalid promo can be removed and a declined demo payment can be retried on the same order', async ({
  page,
}) => {
  const calls = await mockServer(page)
  await page.goto(checkout)
  await fillBuyer(page)
  const promo = page.getByRole('textbox', { name: 'Promo code' })
  await promo.fill('WRONG')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(promo).toHaveAccessibleDescription("This promo code doesn't exist.")
  await page.getByRole('button', { name: 'Continue without the code' }).click()
  const reserve = page.getByRole('button', { name: 'Reserve and continue to payment' })
  await expect(reserve).toBeEnabled()
  await promo.fill('VALID')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByText('VALID applied', { exact: true })).toBeVisible()
  await expect(page.getByText(/3,800\s₸/)).toBeVisible()
  await reserve.click()
  await expect(page).toHaveURL(/\/orders\/101$/)
  await expect(page.getByRole('timer')).toBeVisible()
  await expect(page.getByText('Demo mode: no real money is charged')).toBeVisible()
  await page.getByRole('radio', { name: 'Declined payment' }).check()
  await page.getByRole('button', { name: /Pay 3,800/ }).click()
  await expect(page.getByRole('alert')).toContainText("The payment didn't go through.")
  await expect(page.getByRole('timer')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('timer')).toBeVisible()
  await page.getByRole('radio', { name: 'Successful payment' }).check()
  await page.getByRole('button', { name: /Pay 3,800/ }).click()
  await expect(page.getByRole('img', { name: 'Ticket QR code' })).toHaveAttribute('src', /^blob:/)
  expect(calls.create[0].promo_code).toBe('VALID')
  expect(calls.payments).toEqual([
    { id: 101, simulate_outcome: 'failure' },
    { id: 101, simulate_outcome: 'success' },
  ])
})

test('a restored hold expires and never submits a payment', async ({ page }) => {
  const clock = new Date()
  const order = makeOrder(8, 'pending', {
    expires_at: new Date(clock.getTime() + 55_000).toISOString(),
  })
  const calls = await mockServer(page, { initialOrders: [order, makeOrder(9, 'pending')] })
  await page.clock.install({ time: clock })
  await page.goto('/orders/8')
  await expect(page.getByRole('timer')).toBeVisible()
  await expect(page.getByText('Your reservation expires in under a minute.')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('timer')).toBeVisible()
  await page.clock.fastForward(56_000)
  await expect(page.getByText(/Your reservation expired/)).toBeVisible()
  await expect(page.getByRole('button', { name: /^Pay / })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Choose tickets again' })).toHaveAttribute(
    'href',
    `/events/${eventId}`,
  )
  expect(calls.payments).toEqual([])
  await page.goto('/orders/9')
  await page.getByRole('button', { name: 'Cancel order', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm cancellation' }).click()
  await expect(page.getByText('This order was cancelled.')).toBeVisible()
  expect(calls.cancel).toEqual([9])
})

test('history groups orders and opens tickets even when the public event is unavailable', async ({
  page,
}) => {
  const pending = makeOrder(12, 'pending')
  const upcoming = makeOrder(13, 'confirmed', {
    tickets: [issuedTicket(13, 'valid'), issuedTicket(13, 'checked_in', 1)],
  })
  const cancelled = makeOrder(14, 'cancelled', {
    tickets: [issuedTicket(14, 'cancelled'), issuedTicket(14, 'refunded', 1)],
    event: { ...mockEvent(), status: 'cancelled', title: 'Cancelled concert' },
  })
  await mockServer(page, { initialOrders: [cancelled, upcoming, pending] })
  await page.goto('/my/orders')
  const groups = page.locator('main section')
  await expect(groups.nth(0)).toHaveAccessibleName('Awaiting payment')
  await expect(groups.nth(1)).toHaveAccessibleName('Upcoming and in progress')
  await expect(groups.nth(2)).toHaveAccessibleName('Past and closed')
  await page.goto('/my/tickets')
  await page
    .getByRole('region', { name: 'Past and closed' })
    .getByRole('link', { name: 'View ticket' })
    .first()
    .click()
  await expect(page).toHaveURL(/\/tickets\/140$/)
  await expect(
    page.locator('[data-route-id="ticket"]').getByRole('heading', { name: 'Cancelled concert' }),
  ).toBeVisible()
  await expect(page.getByText('Event cancelled', { exact: true })).toBeVisible()
  await expect(page.getByText('1 of 2', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Next' }).click()
  await expect(page.getByText('2 of 2', { exact: true })).toBeVisible()
  await expect(page.getByText('Refunded', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Printable PDF' })).toBeDisabled()
  await page.goto('/tickets/131')
  await expect(page.getByText('Checked in', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Printable PDF' })).toBeEnabled()
})

test('live API confirms a free order and issues tickets after a declined and retried paid order', async ({
  page,
  request,
}) => {
  test.skip(
    process.env.BILETFLOW_E2E_LIVE_CHECKOUT !== '1',
    'Requires the disposable database with demo events',
  )
  test.slow()
  const catalog = await request.get(`${api}/events?limit=50`)
  expect(catalog.ok()).toBe(true)
  const { items } = (await catalog.json()) as { items: { id: number; title: string }[] }
  const free = items.find((event) => event.title.startsWith('Almaty Tech Meetup'))
  const paid = items.find((event) => event.title === 'Astana Jazz Night')
  expect(free).toBeDefined()
  expect(paid).toBeDefined()

  const account = `checkout-${randomUUID()}@example.com`
  await page.goto('/register')
  await page.getByLabel('Email', { exact: true }).fill(account)
  await page.getByLabel('Password', { exact: true }).fill('checkout-test-password')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)

  await page.goto(`/events/${free!.id}`)
  await page.getByRole('button', { name: 'Add one Free entry ticket' }).click()
  await page.getByRole('button', { name: 'Continue to checkout' }).click()
  await expect(page.getByText(account, { exact: true })).toBeVisible()
  await fillBuyer(page)
  await page.getByRole('button', { name: 'Register for free' }).click()
  await expect(page).toHaveURL(/\/orders\/\d+$/)
  const freeQr = page.getByRole('img', { name: 'Ticket QR code' })
  await expect(freeQr).toHaveJSProperty('complete', true)
  expect(await freeQr.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
  const pdfResponse = page.waitForResponse((response) => /\/orders\/\d+\/pdf$/.test(response.url()))
  await page.getByRole('button', { name: 'PDF of all tickets in this order' }).click()
  const pdf = await pdfResponse
  expect(pdf.ok()).toBe(true)
  expect(pdf.headers()['content-type']).toContain('application/pdf')

  const freeStock = async () => {
    const response = await request.get(`${api}/events/${free!.id}/ticket-types`)
    expect(response.ok()).toBe(true)
    const types = (await response.json()) as { name: string; available: number }[]
    const entry = types.find((type) => type.name === 'Free entry')
    if (!entry) throw new Error('Free entry is missing from the live API')
    return entry.available
  }
  const stockBeforeCancellation = await freeStock()
  await page.getByRole('button', { name: 'Cancel order', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm cancellation' }).click()
  await expect(page.getByText('This order was cancelled.')).toBeVisible()
  expect(await freeStock()).toBe(stockBeforeCancellation + 1)

  await page.goto(`/events/${paid!.id}`)
  await page.getByRole('button', { name: 'Add one Standard ticket' }).click()
  await page.getByRole('button', { name: 'Continue to checkout' }).click()
  await fillBuyer(page)
  await page.getByRole('textbox', { name: 'Promo code' }).fill('JAZZ20')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByText('JAZZ20 applied', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reserve and continue to payment' }).click()
  await expect(page.getByRole('timer')).toBeVisible()
  await page.getByRole('radio', { name: 'Declined payment' }).check()
  await page.getByRole('button', { name: /Pay 6,400/ }).click()
  await expect(page.getByRole('alert')).toContainText("The payment didn't go through.")
  await page.getByRole('radio', { name: 'Successful payment' }).check()
  await page.getByRole('button', { name: /Pay 6,400/ }).click()
  await expect(page.getByText('Your order is confirmed. Your tickets are below.')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Ticket QR code' })).toHaveAttribute('src', /^blob:/)
  await page.goto('/my/tickets')
  await expect(page.getByRole('link', { name: 'View ticket' })).toHaveCount(2)
})
