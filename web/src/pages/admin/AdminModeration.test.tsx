import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { routes } from '@/app/routes'
import { ru } from '@/i18n/locales/ru'
import {
  admin,
  adminActivation,
  adminError,
  adminEvent,
  adminPayment,
  adminReport,
  adminUser,
  mockAdmin,
} from '@/test/admin-fixtures'
import { apiUrl, server } from '@/test/msw-server'
import { renderRoutes } from '@/test/render'
import { attendee, endSession, signIn, startSession } from '@/test/sign-in'

const messages = ru.adminZone

beforeEach(startSession)
afterEach(endSession)

async function open(route: string) {
  await signIn(admin)
  return renderRoutes(routes, { route })
}

describe('admin access and moderation', () => {
  it('admits an admin and gets each count from its API source', async () => {
    const api = mockAdmin({
      'event-reports': [adminReport(1), adminReport(2), adminReport(3, 'dismissed')],
      activations: [
        adminActivation(1, 'pending'),
        adminActivation(2, 'suspended'),
        adminActivation(3, 'active'),
      ],
      payments: [adminPayment, { ...adminPayment, id: 20, status: 'succeeded' }],
    })
    await open('/admin')
    expect(await screen.findByRole('navigation', { name: ru.nav.admin })).toBeInTheDocument()
    const cards = [
      [messages.moderation.reports, '/admin/reports', '2'],
      [messages.moderation.pending, '/admin/paid-sales?status=pending', '1'],
      [messages.moderation.suspended, '/admin/paid-sales?status=suspended', '1'],
      [messages.moderation.failed, '/admin/payments?status=failed', '1'],
    ]
    for (const [label, href, count] of cards) {
      const card = await screen.findByRole('link', { name: new RegExp(label) })
      expect(card).toHaveAttribute('href', href)
      await waitFor(() => expect(within(card).getByText(count)).toBeInTheDocument())
    }
    expect(
      api.requests.some(
        (url) => url.pathname === '/admin/event-reports' && url.searchParams.get('limit') === '1',
      ),
    ).toBe(true)
    expect(
      api.requests.some(
        (url) => url.pathname === '/admin/payments' && url.searchParams.get('status') === 'failed',
      ),
    ).toBe(true)
  })

  it('shows the existing access page to a non-admin without requesting moderation data', async () => {
    const api = mockAdmin()
    await signIn(attendee)
    renderRoutes(routes, { route: '/admin' })
    expect(await screen.findByText(ru.errors.PlatformAdminRequiredError)).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('data-route-id', 'admin-access-denied')
    expect(api.requests).toEqual([])
  })

  it('shows a translated profile failure and can retry', async () => {
    mockAdmin()
    await signIn(admin)
    let unavailable = true
    server.use(
      http.get(apiUrl('/auth/me'), () => {
        if (unavailable) return adminError('DatabaseUnavailableError', 503)
        return HttpResponse.json(admin)
      }),
    )
    renderRoutes(routes, { route: '/admin' })
    expect(await screen.findByText(ru.errors.DatabaseUnavailableError)).toBeInTheDocument()
    unavailable = false
    fireEvent.click(screen.getByRole('button', { name: ru.common.retry }))
    expect(
      await screen.findByRole('heading', { name: messages.moderation.title }),
    ).toBeInTheDocument()
  })

  it('shows the same permission message when the API revokes admin access', async () => {
    mockAdmin()
    server.use(
      http.get(apiUrl('/admin/users'), () => adminError('PlatformAdminRequiredError', 403)),
    )
    await open('/admin/users')
    expect(await screen.findByText(ru.errors.PlatformAdminRequiredError)).toBeInTheDocument()
    expect(screen.queryByText('Server diagnostic')).not.toBeInTheDocument()
  })
})

describe('event reports', () => {
  it('validates a decision, then moves dismissed and actioned reports out of the new queue', async () => {
    const api = mockAdmin({
      events: [adminEvent],
      users: [adminUser(), adminUser(admin.id, admin.email)],
      'event-reports': [adminReport(9), { ...adminReport(10), details: 'Second report' }],
    })
    await open('/admin/reports')
    expect(await screen.findByRole('button', { name: 'Новые · 2' })).toBeInTheDocument()
    expect(await screen.findAllByText('Astana Jazz')).toHaveLength(2)
    const cases = [
      {
        row: 'Asked for a bank transfer',
        id: 9,
        choice: messages.reports.dismiss,
        status: 'dismissed',
      },
      { row: 'Second report', id: 10, choice: messages.reports.action, status: 'actioned' },
    ]

    for (const item of cases) {
      const row = (await screen.findByText(item.row)).closest('tr')!
      fireEvent.click(within(row).getByRole('button', { name: messages.reports.review }))
      const dialog = await screen.findByRole('dialog')
      const confirm = within(dialog).getByRole('button', { name: messages.reports.save })
      fireEvent.click(confirm)
      expect(await within(dialog).findByText(messages.reports.chooseDecision)).toBeInTheDocument()
      fireEvent.click(within(dialog).getByRole('radio', { name: item.choice }))
      fireEvent.change(within(dialog).getByRole('textbox', { name: messages.reports.note }), {
        target: { value: 'Checked the event' },
      })
      expect(within(dialog).getByText('17 / 2000')).toBeInTheDocument()
      fireEvent.click(confirm)
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(api.mutations.at(-1)).toEqual({
        path: `/admin/event-reports/${item.id}/review`,
        body: { status: item.status, note: 'Checked the event' },
      })
      expect(screen.queryByText(item.row)).not.toBeInTheDocument()
    }
    fireEvent.click(await screen.findByRole('button', { name: 'Обработанные · 2' }))
    expect(
      await screen.findByRole('columnheader', { name: messages.reports.decision }),
    ).toBeInTheDocument()
    expect(await screen.findByText(ru.status.eventReport.dismissed)).toBeInTheDocument()
    expect(await screen.findByText(ru.status.eventReport.actioned)).toBeInTheDocument()
    expect(await screen.findAllByText(admin.email)).toHaveLength(2)
    expect(screen.getAllByText('Checked the event')).toHaveLength(2)

    const menu = within(screen.getByRole('navigation', { name: ru.nav.admin }))
    fireEvent.click(menu.getByRole('link', { name: ru.nav.moderation }))
    const card = await screen.findByRole('link', { name: new RegExp(messages.moderation.reports) })
    expect(await within(card).findByText('0')).toBeInTheDocument()
  })

  it('stops event sales with a reason and leaves the separate report decision available', async () => {
    const api = mockAdmin({
      events: [{ ...adminEvent }],
      users: [adminUser()],
      'event-reports': [adminReport()],
    })
    await open('/admin/reports')
    fireEvent.click(
      await screen.findByRole('button', { name: messages.actions.suspendEvent.confirm }),
    )
    const dialog = screen.getByRole('dialog')
    const submit = within(dialog).getByRole('button', {
      name: messages.actions.suspendEvent.confirm,
    })
    fireEvent.click(submit)
    const reason = within(dialog).getByRole('textbox', { name: messages.reason })
    await waitFor(() => expect(reason).toHaveAttribute('aria-invalid', 'true'))
    fireEvent.change(reason, { target: { value: 'Verified fraud' } })
    fireEvent.click(submit)
    expect(await screen.findByText(ru.status.adminEvent.suspended)).toBeInTheDocument()
    expect(api.mutations.at(-1)).toEqual({
      path: '/admin/events/7/suspend',
      body: { reason: 'Verified fraud' },
    })
    expect(screen.getByRole('button', { name: messages.reports.review })).toBeEnabled()
  })

  it('puts a server validation response on the note field', async () => {
    mockAdmin({ events: [adminEvent], users: [adminUser()], 'event-reports': [adminReport()] })
    server.use(
      http.post(apiUrl('/admin/event-reports/9/review'), () =>
        adminError('VALIDATION_ERROR', 422, { note: 'Invalid note' }),
      ),
    )
    await open('/admin/reports')
    fireEvent.click(await screen.findByRole('button', { name: messages.reports.review }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.click(dialog.getByRole('radio', { name: messages.reports.action }))
    fireEvent.click(dialog.getByRole('button', { name: messages.reports.save }))
    await waitFor(() =>
      expect(dialog.getByRole('textbox', { name: messages.reports.note })).toHaveAttribute(
        'aria-invalid',
        'true',
      ),
    )
    expect(dialog.queryByText('Invalid note')).not.toBeInTheDocument()
  })
})

describe('paid sales', () => {
  it('filters all states and suspends and reinstates an activation', async () => {
    const api = mockAdmin({
      activations: [
        adminActivation(1, 'pending'),
        adminActivation(2, 'active'),
        adminActivation(3, 'suspended'),
      ],
    })
    await open('/admin/paid-sales?status=pending')
    expect(await screen.findByText('Activation 1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: messages.suspend })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `${ru.status.paidSales.active} · 1` }))
    fireEvent.click(await screen.findByRole('button', { name: messages.suspend }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.change(dialog.getByRole('textbox', { name: messages.reason }), {
      target: { value: 'Checking complaints' },
    })
    fireEvent.click(dialog.getByRole('button', { name: messages.actions.suspendPaidSales.confirm }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.mutations.at(-1)).toEqual({
      path: '/admin/events/2/paid-sales/suspend',
      body: { reason: 'Checking complaints' },
    })
    fireEvent.click(screen.getByRole('button', { name: `${ru.status.paidSales.suspended} · 2` }))
    const row = (await screen.findByText('Activation 2')).closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: messages.reinstate }))
    const restoration = within(screen.getByRole('dialog'))
    expect(restoration.queryByRole('textbox')).not.toBeInTheDocument()
    fireEvent.click(
      restoration.getByRole('button', { name: messages.actions.reinstatePaidSales.confirm }),
    )
    await waitFor(() => expect(screen.queryByText('Activation 2')).not.toBeInTheDocument())
    expect(api.mutations.at(-1)?.path).toBe('/admin/events/2/paid-sales/reinstate')
  })
})
