import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const api = (process.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')
const date = '2026-11-25T10:15:00Z'
const me = {
  id: 1,
  email: 'admin@example.test',
  email_verified: true,
  is_platform_admin: true,
  is_event_staff: false,
  organizer: null,
}
const event = {
  id: 7,
  title: 'Astana Jazz',
  organizer_name: 'Dala Events',
  suspended_at: null as string | null,
}
const report = {
  event_id: event.id,
  reporter_user_id: 2,
  reason: 'fraud',
  created_at: date,
  status: 'open',
}
const user = {
  id: 2,
  email: 'viewer@example.test',
  is_platform_admin: false,
  email_verified_at: date,
  suspended_at: null as string | null,
  suspension_reason: null as string | null,
}
const organizer = {
  id: 10,
  user_id: 15,
  email: 'applicant@example.test',
  status: 'pending',
  display_name: 'Dala Jazz',
  legal_name: 'Dala Jazz LLP',
  contact_phone: '+7 700 123 4567',
  identity_verified_at: date,
  rejection_reason: null as string | null,
}

async function mockAdmin(page: Page) {
  const users = [{ ...user }, { ...user, id: me.id, email: me.email, is_platform_admin: true }]
  const reports = [
    { ...report, id: 9, details: 'Asked for a bank transfer' },
    { ...report, id: 10, details: 'Fake venue' },
  ]
  const eventState = { ...event }
  const applicant = { ...organizer }
  const unexpected: string[] = []
  const mutations: [string, unknown][] = []
  let amount = 15000
  await page.route(`${api}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const params = url.searchParams
    const key = `${request.method()} ${url.pathname}`
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    }
    const ok = (json: unknown) => route.fulfill({ status: 200, headers, json })
    const paged = (rows: unknown[]) => {
      const offset = Number(params.get('offset') ?? 0)
      const limit = Number(params.get('limit') ?? 50)
      return ok({ items: rows.slice(offset, offset + limit), total: rows.length })
    }
    const body = request.postDataJSON()

    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    switch (key) {
      case 'POST /auth/login':
      case 'POST /auth/refresh':
        return ok({
          access_token: 'admin-token',
          refresh_token: 'admin-refresh',
          token_type: 'bearer',
        })
      case 'GET /auth/me':
        return ok(me)
      case 'GET /admin/event-reports':
        return paged(
          reports.filter((row) => !params.has('status') || row.status === params.get('status')),
        )
      case 'GET /admin/paid-sales':
        return ok([
          { event_id: event.id, event_title: event.title, status: 'pending' },
          { event_id: 8, event_title: 'Classical music', status: 'suspended' },
        ])
      case 'GET /admin/payments':
        return paged([{ id: 9, status: 'failed' }])
      case 'GET /admin/events':
        return paged([eventState])
      case 'GET /admin/users':
        return paged(users.filter((row) => !params.has('q') || String(row.id) === params.get('q')))
      case 'GET /admin/organizers':
        return paged([applicant])
      case 'GET /admin/settings':
        return ok({ activation_fee_kzt: amount })
      case 'POST /admin/event-reports/9/review':
        mutations.push([key, body])
        reports[0].status = body.status
        return ok(reports[0])
      case 'POST /admin/events/7/suspend':
        mutations.push([key, body])
        eventState.suspended_at = date
        return ok(eventState)
      case 'POST /admin/users/2/suspend':
        mutations.push([key, body])
        users[0].suspended_at = date
        users[0].suspension_reason = body.reason
        return ok(users[0])
      case 'POST /admin/organizers/15/reject':
        mutations.push([key, body])
        applicant.status = 'rejected'
        applicant.rejection_reason = body.reason
        return ok(applicant)
      case 'PUT /admin/settings/activation-fee':
        mutations.push([key, body])
        amount = body.amount_kzt
        return ok({ activation_fee_kzt: amount })
      default:
        unexpected.push(key)
        return route.fulfill({ status: 500, headers, json: { error: 'UNEXPECTED_REQUEST' } })
    }
  })
  return { mutations, unexpected }
}

async function checkAccessibility(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    results.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '')),
  ).toEqual([])
}

test('admin moderates a report, restricts an event and a user, rejects an application and updates the fee', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const { mutations, unexpected } = await mockAdmin(page)
  await page.addInitScript(() => {
    localStorage.setItem('biletflow.language', 'ru')
    localStorage.setItem('biletflow.refresh-token', 'admin-refresh')
  })
  await page.goto('/admin')
  const heading = (name: string) => page.getByRole('heading', { name, level: 1 })
  const nav = page.getByRole('navigation', { name: 'Администрирование' })
  const reportCard = page.getByRole('link', { name: /Жалобы на события/ })
  await expect(heading('Модерация')).toBeVisible()
  await expect(reportCard.getByText('2', { exact: true })).toBeVisible()
  for (const label of ['Заявки на активацию', 'Платные продажи приостановлены', 'Сбои платежей']) {
    await expect(
      page.getByRole('link', { name: new RegExp(label) }).getByText('1', { exact: true }),
    ).toBeVisible()
  }
  await checkAccessibility(page)
  await reportCard.click()
  await expect(heading('Жалобы на события')).toBeVisible()
  const row = (text: string) => page.getByRole('row').filter({ hasText: text })
  await expect(row('Asked for a bank transfer')).toBeVisible()
  await checkAccessibility(page)
  await row('Asked for a bank transfer').getByRole('button', { name: 'Разобрать' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'Принять меры' }).click()
  await dialog.getByRole('textbox', { name: 'Заметка' }).fill('Checked payment details')
  await dialog.getByRole('button', { name: 'Сохранить решение' }).click()
  await expect(dialog).toBeHidden()
  await expect(row('Asked for a bank transfer')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Новые · 1' })).toBeVisible()
  await row('Fake venue').getByRole('button', { name: 'Остановить продажи' }).click()
  await dialog.getByRole('textbox', { name: 'Причина' }).fill('Venue could not be verified')
  await dialog.getByRole('button', { name: 'Остановить продажи' }).click()
  await expect(dialog).toBeHidden()
  await expect(row('Fake venue').getByText('Приостановлено')).toBeVisible()

  await nav.getByRole('link', { name: 'Пользователи' }).click()
  await expect(row(me.email).getByRole('button', { name: 'Приостановить' })).toBeDisabled()
  await checkAccessibility(page)
  await row(user.email).getByRole('button', { name: 'Приостановить' }).click()
  await dialog.getByRole('textbox', { name: 'Причина' }).fill('Confirmed abuse')
  await dialog.getByRole('button', { name: 'Приостановить доступ' }).click()
  await expect(dialog).toBeHidden()
  await expect(row(user.email).getByRole('button', { name: 'Вернуть доступ' })).toBeVisible()

  await page.goto('/admin/organizers')
  await row(organizer.email).getByRole('button', { name: 'Отклонить' }).click()
  await dialog.getByRole('textbox', { name: 'Причина' }).fill('Verification missing')
  await dialog.getByRole('button', { name: 'Отклонить' }).click()
  await expect(dialog).toBeHidden()
  await expect(row(organizer.email).getByText('Verification missing')).toBeVisible()

  await page.goto('/admin/settings')
  await expect(heading('Настройки платформы')).toBeVisible()
  const fee = page.getByRole('textbox', { name: 'Сумма в тенге' })
  await expect(fee).toHaveValue('15000')
  await checkAccessibility(page)
  await fee.fill('16000')
  await page.getByRole('button', { name: 'Сохранить сбор' }).click()
  await expect(page.getByText('Сбор за активацию обновлён.')).toBeVisible()
  expect(mutations).toEqual([
    ['POST /admin/event-reports/9/review', { status: 'actioned', note: 'Checked payment details' }],
    ['POST /admin/events/7/suspend', { reason: 'Venue could not be verified' }],
    ['POST /admin/users/2/suspend', { reason: 'Confirmed abuse' }],
    ['POST /admin/organizers/15/reject', { reason: 'Verification missing' }],
    ['PUT /admin/settings/activation-fee', { amount_kzt: 16000 }],
  ])
  expect(unexpected).toEqual([])
})
