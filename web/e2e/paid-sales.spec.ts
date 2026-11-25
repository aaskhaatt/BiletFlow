import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext, type APIResponse, type Page } from '@playwright/test'

const api = (process.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')
const demoIban = 'KZ86 125K ZT50 0410 0100'
const astanaTime = (time: number) => new Date(time + 5 * 3_600_000).toISOString().slice(0, 16)

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

async function json<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), `${response.status()} from ${new URL(response.url()).pathname}`).toBe(true)
  return response.json() as Promise<T>
}

async function tokenFor(
  request: APIRequestContext,
  credentials: { email: string; password: string },
) {
  const { access_token } = await json<{ access_token: string }>(
    await request.post(`${api}/auth/login`, { data: credentials }),
  )
  return access_token
}

async function login(
  page: Page,
  credentials: { email: string; password: string },
  destination: string,
) {
  await page.goto('/login?' + new URLSearchParams({ returnTo: destination }))
  await page.getByLabel('Email', { exact: true }).fill(credentials.email)
  await page.getByLabel('Password', { exact: true }).fill(credentials.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL((url) => url.pathname === destination)
}

test.use({ locale: 'en-US' })

test('a new organizer activates paid sales after a declined fee, publishes, sells a ticket, and sees suspension', async ({
  page,
  request,
  browser,
  baseURL,
}) => {
  test.skip(
    process.env.BILETFLOW_E2E_LIVE_PAID_SALES !== '1',
    'Requires the disposable seeded API database',
  )
  test.slow()
  const demoPassword = process.env.BILETFLOW_E2E_ADMIN_PASSWORD
  if (!demoPassword)
    throw new Error('Seeded admin password is required for the live paid-sales test')

  const organizer = { email: `w7-organizer-${randomUUID()}@example.com`, password: randomUUID() }
  const buyer = { email: `w7-buyer-${randomUUID()}@example.com`, password: randomUUID() }
  const registered = await json<{ id: number }>(
    await request.post(`${api}/auth/register`, { data: organizer }),
  )
  await json(await request.post(`${api}/auth/register`, { data: buyer }))
  const organizerToken = await tokenFor(request, organizer)
  const adminToken = await tokenFor(request, {
    email: 'admin@demo.example.com',
    password: demoPassword,
  })

  await json(
    await request.post(`${api}/organizers/apply`, {
      headers: bearer(organizerToken),
      data: { display_name: 'Jazz organizers' },
    }),
  )
  await json(
    await request.patch(`${api}/organizers/${registered.id}/approve`, {
      headers: bearer(adminToken),
    }),
  )

  const now = Date.now()
  const start = now + 2 * 86_400_000
  const title = `Paid sales workshop ${randomUUID().slice(0, 8)}`
  const event = await json<{ id: number }>(
    await request.post(`${api}/events`, {
      headers: bearer(organizerToken),
      data: {
        title,
        start_time: new Date(start).toISOString(),
        end_time: new Date(start + 3_600_000).toISOString(),
        venue_name: 'Astana Hall',
        venue_address: 'Abay 1, Astana',
        capacity: 50,
      },
    }),
  )
  const statusUrl = `${api}/events/${event.id}/paid-sales`
  const organizerPath = `/organizer/events/${event.id}`
  const { fee_amount: fee } = await json<{ fee_amount: number }>(
    await request.get(statusUrl, { headers: bearer(organizerToken) }),
  )
  const feeLabel = fee ? `${new Intl.NumberFormat('en-GB').format(fee)} ₸` : 'Free'
  const steps = (count: number) => page.getByText(new RegExp(`Steps done: ${count} of 5`))

  await login(page, organizer, organizerPath)
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
  await expect(steps(0)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Activate paid sales' })).toBeDisabled()
  await page.getByRole('link', { name: 'Go to ticket types' }).click()
  await expect(page).toHaveURL(/#ticket-types-title$/)
  await page.getByRole('button', { name: '+ Add ticket type' }).click()
  const ticketDialog = page.getByRole('dialog')
  await ticketDialog.getByLabel('Name', { exact: true }).fill('Workshop admission')
  await ticketDialog.getByLabel('Price, ₸').fill('6000')
  await ticketDialog.getByLabel('Quantity').fill('20')
  await ticketDialog.getByLabel('Sales from').fill(astanaTime(now - 3_600_000))
  await ticketDialog.getByLabel('Sales until').fill(astanaTime(start - 3_600_000))
  await ticketDialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(ticketDialog).toBeHidden()
  await expect(steps(1)).toBeVisible()

  await page.getByRole('link', { name: 'Enter identity details' }).click()
  await expect(page).toHaveURL(/\/organizer\/profile\?event=\d+#identity$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Profile and payouts' })).toBeVisible()
  await expect(page.locator('[data-kind="organizerApplication"]')).toHaveText('Approved')
  await expect(page.getByLabel('Public name')).toHaveValue('Jazz organizers')
  await page.getByLabel('Public name').fill('Astana Workshop Team')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible()

  await page.getByLabel('Legal name').fill('Workshop Demo LLP')
  const phone = page.getByLabel('Contact phone')
  await phone.fill('123')
  await page.getByRole('button', { name: 'Verify identity', exact: true }).click()
  await expect(phone).toHaveAttribute('aria-invalid', 'true')
  await phone.fill('+7 701 123 45 67')
  await page.getByRole('button', { name: 'Verify identity', exact: true }).click()
  await expect(page.getByText(/Identity verified on /)).toBeVisible()
  await expect(phone).toHaveValue('+77011234567')
  await page.getByRole('link', { name: 'Back to paid sales' }).click()
  await expect(steps(2)).toBeVisible()

  await page.getByRole('link', { name: 'Set up payouts' }).click()
  await expect(page).toHaveURL(/\/organizer\/profile\?event=\d+#payout$/)
  await page.getByLabel('Account holder').fill('Workshop Demo LLP')
  await page.getByLabel('Bank name').fill('Demo Bank')
  const iban = page.getByRole('textbox', { name: 'IBAN', exact: true })
  await iban.fill('KZ123')
  await page.getByRole('button', { name: 'Connect payout account' }).click()
  await expect(iban).toHaveAttribute('aria-invalid', 'true')
  await iban.fill(demoIban)
  await page.getByRole('button', { name: 'Connect payout account' }).click()
  await expect(page.getByText('…0100', { exact: true })).toBeVisible()
  await expect(iban).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('…0100', { exact: true })).toBeVisible()
  await expect(iban).toHaveCount(0)
  await page.getByRole('link', { name: 'Back to paid sales' }).click()
  await expect(steps(3)).toBeVisible()

  await page.getByRole('button', { name: 'Read the terms' }).click()
  const terms = page.getByRole('alertdialog', { name: 'Paid-event terms' })
  await terms.getByRole('button', { name: 'Accept the terms' }).click()
  await expect(steps(4)).toBeVisible()
  const activation = page.getByRole('button', { name: 'Activate paid sales' })
  await expect(activation).toBeDisabled()
  await page.getByRole('button', { name: `Activation fee · ${feeLabel}` }).click()
  await expect(page.getByText('Demo mode: no real money is charged')).toBeVisible()
  const pay = page.getByRole('button', { name: `Pay activation fee ${feeLabel}` })
  await page.getByRole('radio', { name: 'Declined payment' }).check()
  await pay.click()
  await expect(page.getByRole('alert')).toContainText("The payment didn't go through.")
  await expect(steps(4)).toBeVisible()
  await expect(activation).toBeDisabled()
  await page.getByRole('radio', { name: 'Successful payment' }).check()
  await pay.click()
  await expect(steps(5)).toBeVisible()
  await expect(activation).toBeEnabled()
  await activation.click()
  await expect(page.getByText('Paid sales are active.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(page.locator('[data-kind="event"]').first()).toHaveText('Upcoming')
  await expect(page.locator('[data-slot="ticket-type-row"]')).toContainText('On sale')
  const published = await json<{ organizer_name: string }>(
    await request.get(`${api}/events/${event.id}`),
  )
  expect(published.organizer_name).toBe('Astana Workshop Team')

  const buyerPage = await browser.newPage({ baseURL, locale: 'en-US' })
  try {
    await login(buyerPage, buyer, `/events/${event.id}`)
    await buyerPage.getByRole('button', { name: 'Add one Workshop admission ticket' }).click()
    await buyerPage.getByRole('button', { name: 'Continue to checkout' }).click()
    await buyerPage.getByRole('textbox', { name: 'Full name' }).fill('Paid workshop attendee')
    await buyerPage.getByRole('checkbox', { name: /organizer’s terms/ }).check()
    await buyerPage.getByRole('button', { name: 'Reserve and continue to payment' }).click()
    await buyerPage.getByRole('button', { name: /Pay 6,000/ }).click()
    await expect(
      buyerPage.getByText('Your order is confirmed. Your tickets are below.'),
    ).toBeVisible()
    await expect(buyerPage.getByRole('img', { name: 'Ticket QR code' })).toHaveAttribute(
      'src',
      /^blob:/,
    )
  } finally {
    await buyerPage.close()
  }

  const reason = 'Suspended for the paid-sales acceptance test'
  await json(
    await request.post(`${api}/admin/events/${event.id}/paid-sales/suspend`, {
      headers: bearer(adminToken),
      data: { reason },
    }),
  )
  await page.reload()
  const card = page.locator('[data-slot="paid-sales-card"]')
  await expect(card).toHaveAttribute('data-status', 'suspended')
  await expect(card).toContainText(reason)
  await expect(card.getByRole('button')).toHaveCount(0)
})
