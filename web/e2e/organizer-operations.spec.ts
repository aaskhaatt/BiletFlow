import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test'

const api = (process.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')
const seedOrganizer = 'organizer@demo.example.com'

async function json<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), `${response.status()} from ${new URL(response.url()).pathname}`).toBe(true)
  return response.json() as Promise<T>
}

async function auth(request: APIRequestContext, email: string, password: string) {
  const { access_token } = await json<{ access_token: string }>(
    await request.post(`${api}/auth/login`, { data: { email, password } }),
  )
  return { Authorization: `Bearer ${access_token}` }
}

type Order = { id: number; status: string; tickets: { id: number; code: string; status: string }[] }

async function eventAndType(request: APIRequestContext, title: string, price: 'paid' | 'free') {
  const { items } = await json<{ items: { id: number; title: string }[] }>(
    await request.get(`${api}/events`, { params: { q: title } }),
  )
  const event = items.find((item) => item.title.startsWith(title))
  if (!event) throw new Error(`Missing seeded event: ${title}`)
  const types = await json<{ id: number; on_sale: boolean; price: number }[]>(
    await request.get(`${api}/events/${event.id}/ticket-types`),
  )
  const ticket = types.find(
    (type) => type.on_sale && (price === 'paid' ? type.price > 0 : type.price === 0),
  )
  if (!ticket) throw new Error(`Missing seeded ${price} ticket type: ${title}`)
  return { id: event.id, ticketId: ticket.id }
}

test.use({ locale: 'en-US' })

test('organizer manages check-in, refunds a paid order, and the ticket is rejected at the entrance', async ({
  page,
  request,
  browser,
  baseURL,
}) => {
  test.skip(
    process.env.BILETFLOW_E2E_LIVE_OPERATIONS !== '1',
    'Requires the disposable seeded database',
  )
  test.slow()
  const password = process.env.BILETFLOW_E2E_SEED_PASSWORD
  if (!password) throw new Error('Set the seeded demo password')

  const buyerEmail = `w8-buyer-${randomUUID()}@example.com`
  const buyerPassword = randomUUID()
  const buyerName = 'Operations test attendee'
  const staffEmail = `w8-staff-${randomUUID()}@example.com`
  const staffPassword = randomUUID()
  const register = async (email: string, password: string) => {
    await json(await request.post(`${api}/auth/register`, { data: { email, password } }))
    return auth(request, email, password)
  }
  const [buyer, staff] = await Promise.all([
    register(buyerEmail, buyerPassword),
    register(staffEmail, staffPassword),
  ])
  const owner = await auth(request, seedOrganizer, password)
  const paid = await eventAndType(request, 'Astana Jazz Night', 'paid')
  const free = await eventAndType(request, 'Almaty Tech Meetup', 'free')
  const orderFor = async (event: { id: number; ticketId: number }) =>
    json<Order>(
      await request.post(`${api}/events/${event.id}/orders`, {
        headers: buyer,
        data: { buyer_name: buyerName, items: [{ ticket_type_id: event.ticketId, quantity: 1 }] },
      }),
    )
  const pending = await orderFor(paid)
  const confirmed = await json<Order>(
    await request.post(`${api}/orders/${pending.id}/pay`, {
      headers: buyer,
      data: { simulate_outcome: 'success' },
    }),
  )
  expect(confirmed.status).toBe('confirmed')
  const ticket = confirmed.tickets[0]
  const freeOrder = await orderFor(free)
  const unpaid = await orderFor(paid)

  await page.setViewportSize({ width: 360, height: 800 })
  const operations = `/organizer/events/${paid.id}`
  await page.goto('/login?' + new URLSearchParams({ returnTo: operations + '/staff' }))
  await page.getByLabel('Email', { exact: true }).fill(seedOrganizer)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Event Admin' })).toBeVisible()
  const assign = page.getByRole('button', { name: 'Assign Event Admin' })
  await assign.click()
  const staffDialog = page.getByRole('dialog', { name: 'Assign Event Admin' })
  const staffInput = staffDialog.getByLabel('Email address')
  await staffInput.fill(`unknown-${randomUUID()}@example.com`)
  await staffDialog.getByRole('button', { name: 'Assign Event Admin' }).click()
  await expect(staffInput).toHaveAttribute('aria-invalid', 'true')
  await staffInput.fill(staffEmail)
  await staffDialog.getByRole('button', { name: 'Assign Event Admin' }).click()
  await expect(staffDialog).toBeHidden()
  const staffRow = page.getByRole('row').filter({ hasText: staffEmail })
  await expect(staffRow).toBeVisible()
  await assign.click()
  await staffInput.fill(staffEmail)
  await staffDialog.getByRole('button', { name: 'Assign Event Admin' }).click()
  await expect(staffInput).toHaveAttribute('aria-invalid', 'true')
  await page.keyboard.press('Escape')

  const scan = async (headers: Record<string, string>) =>
    json<{ result: string }>(
      await request.post(`${api}/events/${paid.id}/check-in`, {
        headers,
        data: { code: ticket.code },
      }),
    )
  expect((await scan(staff)).result).toBe('checked_in')
  await page.getByRole('link', { name: 'Attendees and orders' }).click()
  const attendeeSearch = page.getByLabel('Search attendees')
  await attendeeSearch.fill(buyerEmail)
  const attendee = page.getByRole('row').filter({ hasText: buyerName })
  await expect(attendee).toContainText(staffEmail)
  await expect(attendee.locator('[data-slot="status-badge"]')).toHaveText('Checked in')
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download CSV' }).click()
  expect((await downloadEvent).suggestedFilename()).toBe(`event-${paid.id}-attendees.csv`)
  await attendee.getByRole('button', { name: 'Undo check-in' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Undo check-in' }).click()
  await expect(attendee.locator('[data-slot="status-badge"]')).toHaveText('Valid')
  await expect(attendee).not.toContainText(staffEmail)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)

  await attendee.getByRole('link', { name: `#${confirmed.id}` }).click()
  const order = page.getByRole('row').filter({ hasText: `#${confirmed.id}` })
  const pendingOrder = page.getByRole('row').filter({ hasText: `#${unpaid.id}` })
  const orderStatus = page.getByRole('combobox', { name: 'Status' })
  await expect(pendingOrder).toBeVisible()
  await orderStatus.click()
  await page.getByRole('option', { name: 'Confirmed', exact: true }).click()
  await expect(order).toContainText(/SIM-/)
  await expect(pendingOrder).toHaveCount(0)
  await orderStatus.click()
  await page.getByRole('option', { name: 'All', exact: true }).click()
  await expect(pendingOrder).toBeVisible()
  await expect(order).toContainText(/SIM-/)
  await expect(page.getByRole('heading', { name: 'Sales summary' })).toBeVisible()
  await order.getByRole('button', { name: 'Refund order' }).click()
  const refundDialog = page.getByRole('dialog', { name: 'Refund order' })
  await refundDialog.getByRole('button', { name: 'Confirm refund' }).click()
  const reason = refundDialog.getByLabel('Refund reason')
  await expect(reason).toHaveAttribute('aria-invalid', 'true')
  await reason.fill('Refund requested by the attendee')
  await refundDialog.getByRole('button', { name: 'Confirm refund' }).click()
  await expect(refundDialog).toBeHidden()
  await expect(order.locator('[data-slot="status-badge"]')).toHaveText('Refunded')
  await expect(order).toContainText('Refund requested by the attendee')
  expect((await scan(owner)).result).toBe('refunded')

  await page.getByRole('link', { name: 'Refunds', exact: true }).click()
  await expect(page).toHaveURL(/\/refunds(?:\?|$)/)
  const refunds = page.getByRole('table', { name: 'Refunds', exact: true })
  await expect(refunds.getByRole('row').filter({ hasText: `#${confirmed.id}` })).toContainText(
    'Refund requested by the attendee',
  )
  const orderDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download CSV' }).click()
  expect((await orderDownload).suggestedFilename()).toBe(`event-${paid.id}-refunds.csv`)

  const buyerPage = await browser.newPage({ baseURL, locale: 'en-US' })
  try {
    await buyerPage.goto('/login?' + new URLSearchParams({ returnTo: `/tickets/${ticket.id}` }))
    await buyerPage.getByLabel('Email', { exact: true }).fill(buyerEmail)
    await buyerPage.getByLabel('Password', { exact: true }).fill(buyerPassword)
    await buyerPage.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(buyerPage.locator('[data-slot="status-badge"]')).toHaveText('Refunded')
    await expect(buyerPage.getByRole('img', { name: 'Ticket QR code' })).toHaveCount(0)
    await expect(
      buyerPage.getByRole('button', { name: 'Printable PDF', exact: true }),
    ).toBeDisabled()
  } finally {
    await buyerPage.close()
  }

  for (const [eventId, orderId] of [
    [paid.id, unpaid.id],
    [free.id, freeOrder.id],
  ]) {
    await page.goto(`/organizer/events/${eventId}/orders?${new URLSearchParams({ q: buyerEmail })}`)
    const row = page.getByRole('row').filter({ hasText: `#${orderId}` })
    await row.getByRole('button', { name: 'Cancel order', exact: true }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Confirm cancellation' })
      .click()
    await expect(row.locator('[data-slot="status-badge"]')).toHaveText('Cancelled')
    const cancelled = await json<Order>(
      await request.get(`${api}/orders/${orderId}`, { headers: buyer }),
    )
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.tickets.every((ticket) => ticket.status === 'cancelled')).toBe(true)
  }

  await page.goto(operations + '/staff')
  await staffRow.getByRole('button', { name: 'Remove staff member' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove staff member' }).click()
  await expect(staffRow).toHaveCount(0)
  const denied = await request.post(`${api}/events/${paid.id}/check-in`, {
    headers: staff,
    data: { code: ticket.code },
  })
  expect(denied.status()).toBe(403)
})
