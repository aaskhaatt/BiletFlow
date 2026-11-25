import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { routes } from '@/app/routes'
import { sessionStore } from '@/auth/session-store'
import { ru } from '@/i18n/locales/ru'
import { downloadCsvBlob } from '@/lib/csv'
import {
  admin,
  adminCampaign,
  adminError,
  adminEvent,
  adminHistory,
  adminOrder,
  adminOrganizer,
  adminPayment,
  adminRefund,
  adminUser,
  mockAdmin,
} from '@/test/admin-fixtures'
import { apiUrl, server } from '@/test/msw-server'
import { renderRoutes } from '@/test/render'
import { endSession, signIn, startSession } from '@/test/sign-in'

vi.mock('@/lib/csv', async (load) => ({
  ...(await load<typeof import('@/lib/csv')>()),
  downloadCsvBlob: vi.fn(),
}))

const messages = ru.adminZone

beforeEach(() => {
  startSession()
  vi.mocked(downloadCsvBlob).mockClear()
})
afterEach(endSession)

async function open(route: string) {
  await signIn(admin)
  return renderRoutes(routes, { route })
}

function choose(label: string, option: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: label }), { key: 'Enter' })
  fireEvent.keyDown(screen.getByRole('option', { name: option }), { key: 'Enter' })
}

function changeReason(dialog: ReturnType<typeof within>, value: string) {
  fireEvent.change(dialog.getByRole('textbox', { name: messages.reason }), { target: { value } })
}

describe('shared admin lists', () => {
  it('debounces search, keeps filters and pagination in the URL, and exports the filtered rows with BOM', async () => {
    const users = Array.from({ length: 51 }, (_, index) =>
      adminUser(index + 2, `viewer-${index}@example.test`),
    )
    const api = mockAdmin({ users })
    const { router } = await open('/admin/users')
    expect(await screen.findByText('Показано 1–50 из 51')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: messages.next }))
    expect(await screen.findByText('Показано 51–51 из 51')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?page=2')
    expect(api.requests.at(-1)?.searchParams.get('offset')).toBe('50')
    const search = screen.getByRole('searchbox', { name: messages.search })
    fireEvent.change(search, { target: { value: 'viewer-1' } })
    fireEvent.change(search, { target: { value: 'viewer-10' } })
    expect(router.state.location.search).toBe('?page=2')
    expect(await screen.findByText('viewer-10@example.test')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?q=viewer-10')
    expect(api.requests.some((url) => url.searchParams.get('q') === 'viewer-1')).toBe(false)
    choose(messages.columns.status, ru.status.adminUser.active)
    await waitFor(() => expect(api.requests.at(-1)?.searchParams.get('suspended')).toBe('false'))
    expect(router.state.location.search).toBe('?q=viewer-10&suspended=false')
    fireEvent.click(await screen.findByRole('button', { name: messages.exportCsv }))
    await waitFor(() => expect(downloadCsvBlob).toHaveBeenCalledTimes(1))
    const [filename, blob] = vi.mocked(downloadCsvBlob).mock.calls[0]
    expect(filename).toBe('users.csv')
    expect(new Uint8Array(await blob.arrayBuffer()).slice(0, 3)).toEqual(
      new Uint8Array([0xef, 0xbb, 0xbf]),
    )
    expect(api.requests.at(-1)?.searchParams.toString()).toBe(
      'q=viewer-10&suspended=false&format=csv',
    )
    fireEvent.change(search, { target: { value: 'does-not-exist' } })
    expect(await screen.findByText(messages.noMatches)).toBeInTheDocument()
  })

  it('translates a list failure, retries, then distinguishes the empty list', async () => {
    mockAdmin()
    let fail = true
    server.use(
      http.get(apiUrl('/admin/campaigns'), () =>
        fail
          ? adminError('DatabaseUnavailableError', 503)
          : HttpResponse.json({ items: [], total: 0 }),
      ),
    )
    await open('/admin/campaigns')
    expect(
      await screen.findByText(ru.errors.DatabaseUnavailableError, undefined, { timeout: 2500 }),
    ).toBeInTheDocument()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: ru.common.retry }))
    expect(await screen.findByText(messages.noRows)).toBeInTheDocument()
  })

  it('translates CSV failures', async () => {
    mockAdmin()
    server.use(
      http.get(apiUrl('/admin/users'), ({ request }) =>
        new URL(request.url).searchParams.has('format')
          ? adminError('DatabaseUnavailableError', 503)
          : HttpResponse.json({ items: [], total: 0 }),
      ),
    )
    await open('/admin/users')
    expect(await screen.findByText(messages.noRows)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: messages.exportCsv }))
    expect(await screen.findByText(ru.errors.DatabaseUnavailableError)).toBeInTheDocument()
  })

  it.each([
    [
      'events?status=published&suspended=false',
      'Astana Jazz',
      'events',
      { status: 'published', suspended: 'false' },
    ],
    [
      'orders?status=confirmed&event_id=7',
      'Buyer Test',
      'orders',
      { status: 'confirmed', event_id: '7' },
    ],
    [
      'payments?status=failed&purpose=order&event_id=7',
      'PAY-7',
      'payments',
      { status: 'failed', purpose: 'order', event_id: '7' },
    ],
    ['refunds?event_id=7', 'REF-7', 'refunds', { event_id: '7' }],
    [
      'campaigns?active=true&event_id=7',
      'Jazz Sale',
      'campaigns',
      { active: 'true', event_id: '7' },
    ],
  ])(
    'uses the deep-link filters for %s and exports them without pagination',
    async (path, text, endpoint, filters) => {
      const api = mockAdmin({
        events: [adminEvent],
        users: [adminUser()],
        orders: [adminOrder],
        payments: [adminPayment],
        refunds: [adminRefund],
        campaigns: [adminCampaign],
      })
      await open(`/admin/${path}`)
      expect(await screen.findByText(text)).toBeInTheDocument()
      const request = api.requests.find((url) => url.pathname === `/admin/${endpoint}`)
      for (const [key, value] of Object.entries(filters)) {
        expect(request?.searchParams.get(key)).toBe(value)
      }
      expect(screen.getByText(ru.time.astanaZone)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: messages.exportCsv }))
      await waitFor(() =>
        expect(downloadCsvBlob).toHaveBeenCalledWith(`${endpoint}.csv`, expect.any(Blob)),
      )
      const csv = api.requests.find(
        (url) => url.pathname === `/admin/${endpoint}` && url.searchParams.get('format') === 'csv',
      )
      expect(Object.fromEntries(csv!.searchParams)).toEqual({ ...filters, format: 'csv' })
    },
  )
})

describe('admin actions', () => {
  it('disables self-suspension, suspends the other user, shows the reason and restores access', async () => {
    const api = mockAdmin({ users: [adminUser(admin.id, admin.email), adminUser()] })
    await open('/admin/users')
    const self = (await screen.findAllByText(admin.email))
      .find((item) => item.closest('tr'))!
      .closest('tr')!
    const button = within(self).getByRole('button', { name: messages.suspend })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription(ru.errors.CannotSuspendSelfError)
    const user = (await screen.findByText('viewer@example.test')).closest('tr')!
    fireEvent.click(within(user).getByRole('button', { name: messages.suspend }))
    const dialog = within(screen.getByRole('dialog'))
    changeReason(dialog, '  Abuse confirmed  ')
    expect(dialog.getByText('19 / 500')).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: messages.actions.suspendUser.confirm }))
    const restore = await within(user).findByRole('button', {
      name: messages.actions.unsuspendUser.confirm,
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.mutations.at(-1)).toEqual({
      path: '/admin/users/2/suspend',
      body: { reason: 'Abuse confirmed' },
    })
    expect(within(user).getByText('Abuse confirmed')).toBeInTheDocument()
    fireEvent.click(restore)
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: messages.actions.unsuspendUser.confirm,
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(within(user).getByText(ru.status.adminUser.active)).toBeInTheDocument()
    expect(api.mutations.at(-1)?.path).toBe('/admin/users/2/unsuspend')
  })

  it('shows CannotSuspendSelfError if the server refuses a request', async () => {
    mockAdmin({ users: [adminUser()] })
    server.use(
      http.post(apiUrl('/admin/users/2/suspend'), () => adminError('CannotSuspendSelfError', 400)),
    )
    await open('/admin/users')
    fireEvent.click(await screen.findByRole('button', { name: messages.suspend }))
    const dialog = within(screen.getByRole('dialog'))
    changeReason(dialog, 'Required reason')
    fireEvent.click(dialog.getByRole('button', { name: messages.actions.suspendUser.confirm }))
    expect(await dialog.findByText(ru.errors.CannotSuspendSelfError)).toBeInTheDocument()
  })

  it('restores a suspended event and links to the admin history', async () => {
    const api = mockAdmin({
      events: [{ ...adminEvent, suspended_at: '2026-11-25T10:00:00Z' }],
      history: [adminHistory],
    })
    await open('/admin/events')
    expect(await screen.findByText(ru.status.adminEvent.suspended)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: messages.reinstate }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: messages.actions.unsuspendEvent.confirm,
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.mutations.at(-1)?.path).toBe('/admin/events/7/unsuspend')
    const history = screen.getByRole('link', { name: messages.history })
    expect(history).toHaveAttribute('href', '/admin/events/7/history')
    fireEvent.click(history)
    expect(
      await screen.findByRole('heading', { name: 'Astana Jazz · история' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Event suspended')).toBeInTheDocument()
    const crumbs = within(screen.getByRole('navigation', { name: ru.organizerPage.breadcrumb }))
    expect(crumbs.getByRole('link', { name: /События/ })).toHaveAttribute('href', '/admin/events')
    expect(screen.getByRole('navigation', { name: ru.nav.admin })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: ru.organizerEvent.actions.duplicate }),
    ).not.toBeInTheDocument()
  })

  it('rejects a pending organizer by user ID and can approve the rejected application', async () => {
    const api = mockAdmin({ organizers: [adminOrganizer()] })
    await open('/admin/organizers')
    const action = messages.actions.rejectOrganizer
    fireEvent.click(await screen.findByRole('button', { name: action.confirm }))
    const dialog = within(screen.getByRole('dialog'))
    changeReason(dialog, 'Missing identity verification')
    fireEvent.click(dialog.getByRole('button', { name: action.confirm }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.mutations.at(-1)).toEqual({
      path: '/admin/organizers/3/reject',
      body: { reason: 'Missing identity verification' },
    })
    expect(screen.getByText(ru.status.organizerApplication.rejected)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: action.confirm })).not.toBeInTheDocument()
    const approve = messages.actions.approveOrganizer.confirm
    fireEvent.click(screen.getByRole('button', { name: approve }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: approve }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.mutations.at(-1)?.path).toBe('/organizers/3/approve')
    expect(screen.getByText(ru.status.organizerApplication.approved)).toBeInTheDocument()
  })

  it('shows a concurrent organizer rejection conflict and refreshes the row', async () => {
    const api = mockAdmin({ organizers: [adminOrganizer()] })
    await open('/admin/organizers')
    const action = messages.actions.rejectOrganizer
    fireEvent.click(await screen.findByRole('button', { name: action.confirm }))
    api.rows.organizers[0].status = 'approved'
    const dialog = within(screen.getByRole('dialog'))
    changeReason(dialog, 'Missing verification')
    fireEvent.click(dialog.getByRole('button', { name: action.confirm }))
    expect(await dialog.findByText(ru.errors.InvalidOrganizerStatusError)).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: ru.common.cancel }))
    expect(await screen.findByText(ru.status.organizerApplication.approved)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: action.confirm })).not.toBeInTheDocument()
  })

  it('validates whole tenge, maps server errors and invalidates cached organizer checklists', async () => {
    const api = mockAdmin()
    const { queryClient } = await open('/admin/settings')
    const key = ['/events/7/paid-sales', sessionStore.getSnapshot().generation]
    queryClient.setQueryData(key, { fee_amount: 15000 })
    server.use(
      http.put(
        apiUrl('/admin/settings/activation-fee'),
        () => adminError('VALIDATION_ERROR', 422, { amount_kzt: 'Invalid amount' }),
        { once: true },
      ),
    )
    const field = await screen.findByRole('textbox', { name: messages.settings.amount })
    expect(field).toHaveValue('15000')
    const submit = screen.getByRole('button', { name: messages.settings.save })
    fireEvent.change(field, { target: { value: '14.5' } })
    fireEvent.click(submit)
    expect(await screen.findByText(messages.settings.invalidAmount)).toBeInTheDocument()
    expect(api.mutations).toEqual([])
    fireEvent.change(field, { target: { value: '15001' } })
    fireEvent.click(submit)
    expect(await screen.findByText(ru.errors.VALIDATION_ERROR)).toBeInTheDocument()
    fireEvent.change(field, { target: { value: '0' } })
    fireEvent.click(submit)
    expect(await screen.findByText(messages.settings.saved)).toBeInTheDocument()
    expect(api.mutations.at(-1)).toEqual({
      path: '/admin/settings/activation-fee',
      body: { amount_kzt: 0 },
    })
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
  })
})
