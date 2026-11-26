import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import {
  api,
  astanaTime,
  bearer,
  caption,
  createPaidEvent,
  demoOrganizer,
  demoStaff,
  installCaptions,
  json,
  seedPassword,
  shot,
  signIn,
  signOut,
  tokenFor,
  type Order,
} from './journey-helpers.ts'

/*
 * The core journey of SRS 13.4 on the real backend, and its failure cases.
 *
 * Needs the disposable database filled by backend/scripts/seed_demo.py and the API on VITE_API_URL
 * (BILETFLOW_E2E_LIVE_JOURNEY=1, BILETFLOW_E2E_SEED_PASSWORD=<DEMO_PASSWORD>). The Event Admin's
 * mobile scanner is not part of the web, so the scan goes through the same API the app calls.
 */

const live = process.env.BILETFLOW_E2E_LIVE_JOURNEY === '1'

test.use({ locale: 'en-US', trace: 'off' })

type ScanResult = {
  result: string
  ticket: {
    id: number
    status: string
    checked_in_at: string | null
    checked_in_by: string | null
  } | null
}

test('an organizer sells a ticket through a campaign QR, the attendee asks support, and the ticket enters once', async ({
  page,
  request,
}) => {
  test.skip(!live, 'Requires the disposable seeded database and the API')
  test.setTimeout(300_000)
  const password = seedPassword()
  const run = randomUUID().slice(0, 8)
  const title = `Core journey concert ${run}`
  const promo = `JOURNEY${run}`.toUpperCase()
  const organizer = { email: demoOrganizer, password }
  const staff = { email: demoStaff, password }
  const attendee = { email: `journey-${run}@example.com`, password: randomUUID() }
  const buyerName = `Journey attendee ${run}`
  const supportSubject = `Receipt for the journey order ${run}`
  const supportQuestion = 'Please confirm that my discount was applied to this order.'
  const supportAnswer = 'Confirmed: the campaign discount is on your order.'

  // Every step names itself on the screen while the demo is recorded (and does nothing otherwise).
  await installCaptions(page)
  let stepNumber = 0
  const step = (title: string, body: () => Promise<void>) =>
    test.step(title, async () => {
      await caption(page, `Step ${++stepNumber}: ${title.replace(/^FAILURE: /, 'FAILURE CASE: ')}`)
      await body()
    })

  const now = Date.now()
  const start = now + 3 * 86_400_000
  const salesFrom = astanaTime(now - 2 * 3_600_000)
  const salesUntil = astanaTime(start - 3_600_000)

  let eventId = 0
  let campaignLink = ''
  let campaignId = 0
  let orderId = 0
  let supportCaseId = 0

  await step('the organizer creates a draft event', async () => {
    await signIn(page, organizer, '/organizer/events/new')
    await expect(page.getByRole('heading', { level: 1, name: 'New event' })).toBeVisible()
    await page.getByLabel('Event name').fill(title)
    await page.getByLabel('Capacity').fill('60')
    await page.getByLabel('Start', { exact: true }).fill(astanaTime(start))
    await page.getByLabel('End', { exact: true }).fill(astanaTime(start + 3 * 3_600_000))
    await page.getByLabel('Venue').fill('Astana Hall')
    await page.getByLabel('Address').fill('Abay 1, Astana')
    await shot(page, '01-organizer-new-event')
    await page.getByRole('button', { name: 'Save draft' }).click()
    await expect(page).toHaveURL(/\/organizer\/events\/\d+$/)
    eventId = Number(new URL(page.url()).pathname.split('/').pop())
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await expect(page.locator('[data-slot="status-badge"]').first()).toHaveText('Draft')
  })

  await step('a free and a paid ticket type are added', async () => {
    for (const [name, price, quantity] of [
      ['Free entry', '0', '20'],
      ['Standard', '5000', '30'],
    ]) {
      await page.getByRole('button', { name: '+ Add ticket type' }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByLabel('Name', { exact: true }).fill(name)
      await dialog.getByLabel('Price, ₸').fill(price)
      await dialog.getByLabel('Quantity').fill(quantity)
      await dialog.getByLabel('Sales from').fill(salesFrom)
      await dialog.getByLabel('Sales until').fill(salesUntil)
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(dialog).toBeHidden()
    }
    await expect(page.locator('[data-slot="ticket-type-row"]')).toHaveCount(2)
  })

  await step('paid sales are activated: terms, demo fee, activation', async () => {
    // The seeded organizer already has the identity check and the payout account (demo).
    await page.getByRole('button', { name: 'Read the terms' }).click()
    await page
      .getByRole('alertdialog', { name: 'Paid-event terms' })
      .getByRole('button', { name: 'Accept the terms' })
      .click()
    await page.getByRole('button', { name: /^Activation fee · / }).click()
    await expect(page.getByText('Demo mode: no real money is charged')).toBeVisible()
    await page.getByRole('radio', { name: 'Successful payment' }).check()
    await page.getByRole('button', { name: /^Pay activation fee / }).click()
    await expect(page.getByText(/Steps done: 5 of 5/)).toBeVisible()
    await page.getByRole('button', { name: 'Activate paid sales' }).click()
    await expect(page.getByText('Paid sales are active.', { exact: true })).toBeVisible()
    await shot(page, '02-organizer-paid-sales-active')
  })

  await step('the organizer publishes the event', async () => {
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(page.locator('[data-slot="status-badge"]').first()).toHaveText('Upcoming')
    await expect(page.locator('[data-slot="ticket-type-row"]').nth(1)).toContainText('On sale')
    const publicEvent = await json<{ title: string; status: string }>(
      await request.get(`${api}/events/${eventId}`),
    )
    expect(publicEvent).toMatchObject({ title, status: 'published' })
  })

  await step('a campaign with a promo code and a QR link is created', async () => {
    await page.goto('/organizer/campaigns/new')
    await page.getByRole('combobox', { name: 'Event' }).click()
    await page.getByRole('option', { name: title }).click()
    await page.getByLabel('Campaign name').fill(`Journey promo ${run}`)
    await page.getByLabel('Discount amount').fill('20')
    await page.getByLabel('Promo code', { exact: true }).fill(promo)
    await page.getByRole('checkbox', { name: /Standard · 5,000/ }).check()
    await page.getByRole('button', { name: 'Activate campaign' }).click()
    await expect(page).toHaveURL(/\/organizer\/campaigns\/\d+$/)
    await expect(
      page.getByRole('img', { name: `QR code of the campaign "Journey promo ${run}"` }),
    ).toHaveAttribute('src', /^blob:/)
    campaignId = Number(new URL(page.url()).pathname.split('/').pop())
    const shown = await page.getByText(/\/events\/\d+\?campaign=C-/).textContent()
    const url = new URL(shown!.trim())
    expect(url.pathname).toBe(`/events/${eventId}`)
    campaignLink = url.pathname + url.search
    await shot(page, '03-organizer-campaign-qr')
  })

  await step('the Event Admin is assigned to the event', async () => {
    await page.goto(`/organizer/events/${eventId}/staff`)
    await page.getByRole('button', { name: 'Assign Event Admin' }).click()
    const dialog = page.getByRole('dialog', { name: 'Assign Event Admin' })
    await dialog.getByLabel('Email address').fill(staff.email)
    await dialog.getByRole('button', { name: 'Assign Event Admin' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('row').filter({ hasText: staff.email })).toBeVisible()
  })

  await step(
    'an attendee registers and opens the campaign link: the promo code is applied',
    async () => {
      await signOut(page)
      await page.goto('/register?' + new URLSearchParams({ returnTo: '/' }))
      await page.getByLabel('Email', { exact: true }).fill(attendee.email)
      await page.getByLabel('Password', { exact: true }).fill(attendee.password)
      await page.getByRole('button', { name: 'Create account', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Account navigation' })).toBeVisible()

      await page.goto(campaignLink)
      await expect(page.getByRole('heading', { name: title })).toBeVisible()
      await expect(page.getByText(`${promo} applied`)).toBeVisible()
      await page.getByRole('button', { name: 'Add one Standard ticket' }).click()
      await expect(page.getByText(/5,000\s₸.*before discount/)).toBeVisible()
      await shot(page, '04-attendee-event-promo')
    },
  )

  await step('checkout shows the discounted total and reserves the ticket', async () => {
    await page.getByRole('button', { name: 'Continue to checkout' }).click()
    await expect(page).toHaveURL(new RegExp(`/events/${eventId}/checkout$`))
    await expect(page.getByText(`${promo} applied`)).toBeVisible()
    await expect(page.getByText(/4,000\s₸/).first()).toBeVisible()
    await page.getByRole('textbox', { name: 'Full name' }).fill(buyerName)
    await page.getByRole('checkbox', { name: /organizer’s terms/ }).check()
    // Scroll so that the total and the demo notice above the button are in the picture
    await page
      .getByRole('button', { name: 'Reserve and continue to payment' })
      .evaluate((element) => element.scrollIntoView({ block: 'center' }))
    await shot(page, '05-attendee-checkout')
    await page.getByRole('button', { name: 'Reserve and continue to payment' }).click()
    await expect(page).toHaveURL(/\/orders\/\d+$/)
    orderId = Number(new URL(page.url()).pathname.split('/').pop())
    await expect(page.getByRole('timer')).toBeVisible()
    await expect(page.getByText('Demo mode: no real money is charged')).toBeVisible()
  })

  const buyerToken = await tokenFor(request, attendee)
  const readOrder = async () =>
    json<Order>(await request.get(`${api}/orders/${orderId}`, { headers: bearer(buyerToken) }))

  await step(
    'FAILURE: a declined demo payment keeps the order unpaid, and a retry succeeds',
    async () => {
      await page.getByRole('radio', { name: 'Declined payment' }).check()
      await page.getByRole('button', { name: /^Pay 4,000/ }).click()
      await expect(page.getByRole('alert')).toContainText("The payment didn't go through.")
      await shot(page, '06-attendee-payment-declined')
      // The server, not the page, is the witness: still pending, and no ticket exists.
      const declined = await readOrder()
      expect(declined.status).toBe('pending')
      expect(declined.tickets).toEqual([])
      await page.reload()
      await expect(page.getByRole('timer')).toBeVisible()

      await page.getByRole('radio', { name: 'Successful payment' }).check()
      await page.getByRole('button', { name: /^Pay 4,000/ }).click()
      await expect(page.getByText('Your order is confirmed. Your tickets are below.')).toBeVisible()
    },
  )

  let ticket: { id: number; code: string }
  await step(
    'the confirmed order survives a reload and holds one valid ticket with a QR',
    async () => {
      await page.reload()
      await expect(page.getByText('Your order is confirmed. Your tickets are below.')).toBeVisible()
      await expect(page.getByRole('img', { name: 'Ticket QR code' })).toHaveAttribute(
        'src',
        /^blob:/,
      )
      const order = await readOrder()
      expect(order).toMatchObject({
        status: 'confirmed',
        total_amount: 4000,
        discount_amount: 1000,
        promo_code: promo,
      })
      expect(order.tickets).toHaveLength(1)
      expect(order.tickets[0].status).toBe('valid')
      ticket = order.tickets[0]
      await expect(page.getByText(ticket.code)).toBeVisible()
      await shot(page, '07-attendee-ticket')

      // The order is in the attendee's history too, not only on its own page.
      await page.goto('/my/orders')
      await expect(page.getByRole('link', { name: 'View order' })).toHaveAttribute(
        'href',
        `/orders/${orderId}`,
      )
      await expect(page.getByText(title)).toBeVisible()
      await page.goBack()

      const pdf = page.waitForResponse((response) => /\/orders\/\d+\/pdf$/.test(response.url()))
      await page.getByRole('button', { name: 'PDF of all tickets in this order' }).click()
      const response = await pdf
      expect(response.ok()).toBe(true)
      expect(response.headers()['content-type']).toContain('application/pdf')
    },
  )

  await step('the attendee opens a support case about the order', async () => {
    await page.getByRole('link', { name: 'Contact support' }).click()
    await expect(page).toHaveURL(new RegExp(`/support/new\\?order_id=${orderId}$`))
    await page.getByRole('combobox', { name: 'Category' }).click()
    await page.getByRole('option', { name: 'Payment', exact: true }).click()
    await page.getByLabel('Subject').fill(supportSubject)
    await page.getByLabel('Message', { exact: true }).fill(supportQuestion)
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page).toHaveURL(/\/support\/\d+$/)
    supportCaseId = Number(new URL(page.url()).pathname.split('/').pop())
    await expect(page.getByRole('log')).toContainText(supportQuestion)
    await shot(page, '08-attendee-support-case')
  })

  await step('the organizer answers in the support inbox', async () => {
    await signOut(page)
    await signIn(page, organizer, '/organizer/support')
    const row = page.getByRole('row').filter({ hasText: supportSubject })
    await expect(row).toBeVisible()
    await row.getByRole('link').click()
    await expect(page).toHaveURL(new RegExp(`/support/${supportCaseId}$`))
    await expect(page.getByRole('log')).toContainText(supportQuestion)
    await page.getByLabel('Write a message').fill(supportAnswer)
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByRole('log')).toContainText(supportAnswer)
    await shot(page, '09-organizer-support-reply')
  })

  const staffToken = await tokenFor(request, staff)
  const scan = async (code: string) =>
    json<ScanResult>(
      await request.post(`${api}/events/${eventId}/check-in`, {
        headers: bearer(staffToken),
        data: { code },
      }),
    )

  let firstScan: ScanResult
  await step('entrance: a campaign QR is refused, the ticket is accepted once', async () => {
    const campaignToken = new URL(campaignLink, 'http://localhost').searchParams.get('campaign')!
    expect((await scan(campaignToken)).result).toBe('invalid')

    firstScan = await scan(ticket.code)
    expect(firstScan.result).toBe('checked_in')
    expect(firstScan.ticket).toMatchObject({ status: 'checked_in', checked_in_by: staff.email })
  })

  await step(
    'FAILURE: scanning the same ticket again is refused and creates no second entry',
    async () => {
      const again = await scan(ticket.code)
      expect(again.result).toBe('already_checked_in')
      expect(again.ticket).toMatchObject({ checked_in_by: staff.email })
      expect(Date.parse(again.ticket!.checked_in_at!)).toBe(
        Date.parse(firstScan.ticket!.checked_in_at!),
      )
      const stats = await json<{ registered: number; checked_in: number }>(
        await request.get(`${api}/events/${eventId}/check-in/stats`, {
          headers: bearer(staffToken),
        }),
      )
      expect(stats).toMatchObject({ registered: 1, checked_in: 1 })
      await caption(
        page,
        `Entrance scan (API): campaign QR → invalid · ticket → ${firstScan.result} · same ticket again → ${again.result} · checked in: ${stats.checked_in} of ${stats.registered}`,
      )
      await shot(page, '09b-entrance-scan-api')
    },
  )

  await step('the organizer sees who checked the attendee in, and when', async () => {
    await page.goto(`/organizer/events/${eventId}/attendees`)
    const row = page.getByRole('row').filter({ hasText: buyerName })
    await expect(row.locator('[data-slot="status-badge"]')).toHaveText('Checked in')
    const time = row.locator('time')
    await expect(time).toContainText(staff.email)
    const stamp = await time.getAttribute('datetime')
    expect(Date.parse(stamp!)).toBe(Date.parse(firstScan.ticket!.checked_in_at!))
    await expect(
      page
        .locator('dl')
        .getByText('Checked in', { exact: true })
        .locator('xpath=following-sibling::dd'),
    ).toHaveText('1')
    await shot(page, '10-organizer-attendance')
  })

  await step('the campaign counts the sale it brought', async () => {
    const owner = await tokenFor(request, organizer)
    const campaign = await json<{
      link_opens: number
      stats: { orders: number; tickets: number; discount: number }
    }>(await request.get(`${api}/campaigns/${campaignId}`, { headers: bearer(owner) }))
    expect(campaign.stats).toMatchObject({ orders: 1, tickets: 1, discount: 1000 })
    expect(campaign.link_opens).toBeGreaterThanOrEqual(1)

    await page.goto(`/organizer/campaigns/${campaignId}`)
    const results = page.getByRole('region', { name: 'Results' })
    await expect(results.getByText('Tickets sold').locator('xpath=ancestor::div[1]')).toContainText(
      '1',
    )
    await expect(
      results.getByText('Total discounts').locator('xpath=ancestor::div[1]'),
    ).toContainText(/1,000\s₸/)
    await shot(page, '10b-organizer-campaign-results')
  })

  await step('the attendee sees the reply and the checked-in ticket', async () => {
    await signOut(page)
    await signIn(page, attendee, `/support/${supportCaseId}`)
    await expect(page.getByRole('log')).toContainText(supportAnswer)
    await page.goto(`/tickets/${ticket.id}`)
    await expect(page.locator('[data-slot="status-badge"]').first()).toHaveText('Checked in')
    await expect(page.getByRole('img', { name: 'Ticket QR code' })).toHaveCount(0)
    await shot(page, '11-attendee-ticket-checked-in')
  })
})

test('FAILURE: an unpaid hold expires, the page says so, and the ticket goes back on sale', async ({
  page,
  request,
}) => {
  test.skip(!live, 'Requires the disposable seeded database and the API')
  test.setTimeout(240_000)
  const password = seedPassword()
  const run = randomUUID().slice(0, 8)
  const organizerToken = await tokenFor(request, { email: demoOrganizer, password })
  const { eventId, ticketTypeId } = await createPaidEvent(request, organizerToken, {
    title: `Expiring hold ${run}`,
    quantity: 5,
    price: 5000,
  })
  const attendee = { email: `hold-${run}@example.com`, password: randomUUID() }
  await json(await request.post(`${api}/auth/register`, { data: attendee }))
  const token = await tokenFor(request, attendee)
  const available = async () => {
    const types = await json<{ id: number; available: number }[]>(
      await request.get(`${api}/events/${eventId}/ticket-types`),
    )
    return types.find((type) => type.id === ticketTypeId)!.available
  }
  expect(await available()).toBe(5)

  const order = await json<Order>(
    await request.post(`${api}/events/${eventId}/orders`, {
      headers: bearer(token),
      data: {
        buyer_name: 'Hold test attendee',
        items: [{ ticket_type_id: ticketTypeId, quantity: 1 }],
      },
    }),
  )
  const hold = Date.parse(order.expires_at!) - Date.parse(order.created_at)
  if (hold > 150_000) {
    await request.post(`${api}/orders/${order.id}/cancel`, { headers: bearer(token) })
    test.skip(
      true,
      'The hold lasts longer than two minutes: start the API with ORDER_HOLD_MINUTES=1',
    )
  }
  expect(order.status).toBe('pending')
  expect(await available()).toBe(4)

  await installCaptions(page)
  await signIn(page, attendee, `/orders/${order.id}`)
  await caption(
    page,
    'FAILURE CASE: an unpaid hold runs out (the demo API holds tickets for one minute)',
  )
  await expect(page.getByRole('timer')).toBeVisible()
  await shot(page, '12-hold-countdown')
  await expect(page.getByText(/Your reservation expired/)).toBeVisible({ timeout: hold + 30_000 })
  await expect(page.getByRole('button', { name: /^Pay / })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Choose tickets again' })).toHaveAttribute(
    'href',
    `/events/${eventId}`,
  )
  await caption(page, 'The page says the reservation expired; the server released the ticket')
  await shot(page, '13-hold-expired')

  // The server agrees: the sweeper released the hold, so the order is expired and the ticket is back.
  const status = async () =>
    (await json<Order>(await request.get(`${api}/orders/${order.id}`, { headers: bearer(token) })))
      .status
  await expect.poll(status, { timeout: 15_000 }).toBe('expired')
  await expect.poll(available, { timeout: 15_000 }).toBe(5)
  const late = await request.post(`${api}/orders/${order.id}/pay`, {
    headers: bearer(token),
    data: { simulate_outcome: 'success' },
  })
  expect(late.status()).toBe(409)
  const afterLate = await json<Order>(
    await request.get(`${api}/orders/${order.id}`, { headers: bearer(token) }),
  )
  expect(afterLate.tickets).toEqual([])

  await page.reload()
  await expect(page.locator('[data-slot="status-badge"]').first()).toHaveText('Expired')
})
