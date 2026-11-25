import { http, HttpResponse } from 'msw'
import type {
  ActivationRecord,
  AdminCampaignRow,
  AdminOrderRow,
  AdminOrganizerRow,
  AdminPaymentRow,
  AdminRefundRow,
  AdminUserResponse,
  EventReportResponse,
  EventResponse,
  HistoryEntry,
} from '@/api/generated/model'
import { eventResponse } from '@/test/fixtures'
import { apiUrl, server } from '@/test/msw-server'
import { attendee } from '@/test/sign-in'

export const admin = { ...attendee, is_platform_admin: true, email: 'admin@example.test' }
export const adminDate = '2026-11-26T10:00:00Z'
export const adminEvent = eventResponse({ id: 7, title: 'Astana Jazz' })
export const adminUser = (id = 2, email = 'viewer@example.test'): AdminUserResponse => ({
  id,
  email,
  is_platform_admin: id === admin.id,
  email_verified_at: adminDate,
  suspended_at: null,
  suspension_reason: null,
})
export const adminReport = (id = 9, status = 'open'): EventReportResponse => ({
  id,
  status,
  reason: 'fraud',
  event_id: 7,
  reporter_user_id: 2,
  details: 'Asked for a bank transfer',
  created_at: adminDate,
  reviewed_by_user_id: null,
  reviewed_at: null,
  review_note: null,
})
export const adminActivation = (id: number, status: string): ActivationRecord => ({
  event_id: id,
  event_title: `Activation ${id}`,
  status,
  fee_amount: 15000,
  fee_paid_at: adminDate,
  activated_at: null,
  suspended_at: null,
  suspension_reason: null,
})
export const adminOrganizer = (status = 'pending'): AdminOrganizerRow => ({
  id: 15,
  user_id: 3,
  status,
  email: 'applicant@example.test',
  display_name: 'Dala Jazz',
  legal_name: 'Dala Jazz LLP',
  contact_phone: '+7 700 000 0000',
  identity_verified_at: adminDate,
  rejection_reason: null,
})
export const adminOrder: AdminOrderRow = {
  id: 12,
  event_id: 7,
  user_id: 2,
  status: 'confirmed',
  total_amount: 5000,
  processing_fee: 250,
  buyer_name: 'Buyer Test',
  buyer_email: 'buyer@example.test',
  created_at: adminDate,
  paid_at: adminDate,
  cancelled_at: null,
  refunded_at: null,
}
export const adminPayment: AdminPaymentRow = {
  id: 11,
  purpose: 'order',
  amount: 5000,
  currency: 'KZT',
  status: 'failed',
  is_simulated: true,
  provider_reference: 'PAY-7',
  failure_reason: 'Declined',
  payer_user_id: 2,
  event_id: 7,
  order_id: 12,
  created_at: adminDate,
}
export const adminRefund: AdminRefundRow = {
  id: 13,
  order_id: 12,
  event_id: 7,
  amount: 5000,
  currency: 'KZT',
  status: 'succeeded',
  is_simulated: true,
  provider_reference: 'REF-7',
  reason: 'Cancelled',
  initiated_by_user_id: 2,
  created_at: adminDate,
}
export const adminCampaign: AdminCampaignRow = {
  id: 14,
  event_id: 7,
  event_title: 'Astana Jazz',
  code: 'JAZZ',
  name: 'Jazz Sale',
  discount_type: 'percent',
  discount_value: 10,
  is_active: true,
  max_redemptions: 10,
  redemptions_count: 2,
  link_opens: 15,
  orders: 2,
  tickets: 4,
  gross: 10000,
  discount: 1000,
  net: 9000,
  created_at: adminDate,
}
export const adminHistory: HistoryEntry = {
  id: 2,
  created_at: adminDate,
  action: 'event.suspended',
  type: 'event',
  entity_type: 'event',
  entity_id: 7,
  description: 'Event suspended',
  actor_user_id: admin.id,
  actor_email: admin.email,
}

export function adminError(
  code: string,
  status: number,
  fields: Record<string, string> | null = null,
) {
  return HttpResponse.json({ error: code, message: 'Server diagnostic', fields }, { status })
}

type Rows = {
  users: AdminUserResponse[]
  events: EventResponse[]
  orders: AdminOrderRow[]
  payments: AdminPaymentRow[]
  refunds: AdminRefundRow[]
  campaigns: AdminCampaignRow[]
  organizers: AdminOrganizerRow[]
  'event-reports': EventReportResponse[]
}

export function mockAdmin(
  overrides: Partial<Rows> & {
    activations?: ActivationRecord[]
    history?: HistoryEntry[]
  } = {},
) {
  const rows: Rows = {
    users: [],
    events: [],
    orders: [],
    payments: [],
    refunds: [],
    campaigns: [],
    organizers: [],
    'event-reports': [],
    ...overrides,
  }
  let fee = 15000
  const paidSales = overrides.activations ?? []
  const requests: URL[] = []
  const mutations: { path: string; body: unknown }[] = []
  const date = adminDate

  const resources = [
    'users',
    'events',
    'orders',
    'payments',
    'refunds',
    'campaigns',
    'organizers',
    'event-reports',
  ] as const
  server.use(
    ...resources.map((resource) =>
      http.get(apiUrl(`/admin/${resource}`), ({ request }) => {
        const url = new URL(request.url)
        requests.push(url)
        const p = url.searchParams
        const q = p.get('q')?.toLowerCase()
        const items = rows[resource]
          .filter(
            (item) =>
              (!q || String(item.id) === q || JSON.stringify(item).toLowerCase().includes(q)) &&
              (!p.has('status') || ('status' in item && item.status === p.get('status'))) &&
              (!p.has('event_id') ||
                ('event_id' in item && String(item.event_id) === p.get('event_id'))) &&
              (!p.has('purpose') || ('purpose' in item && item.purpose === p.get('purpose'))) &&
              (!p.has('active') ||
                ('is_active' in item && String(item.is_active) === p.get('active'))) &&
              (!p.has('suspended') ||
                ('suspended_at' in item && String(!!item.suspended_at) === p.get('suspended'))),
          )
          .sort((a, b) => b.id - a.id)
        if (p.get('format') === 'csv')
          return new HttpResponse('\uFEFFid\r\n1\r\n', { headers: { 'Content-Type': 'text/csv' } })
        const offset = Number(p.get('offset') ?? 0)
        const limit = Number(p.get('limit') ?? 50)
        return HttpResponse.json({
          items: items.slice(offset, offset + limit),
          total: items.length,
        })
      }),
    ),
  )

  async function record(request: Request) {
    const body = request.headers.get('Content-Type')?.includes('application/json')
      ? await request.json()
      : undefined
    mutations.push({ path: new URL(request.url).pathname, body })
    return body
  }

  server.use(
    http.get(apiUrl('/admin/paid-sales'), () => HttpResponse.json(paidSales)),
    http.get(apiUrl('/admin/settings'), () => HttpResponse.json({ activation_fee_kzt: fee })),
    http.get(apiUrl('/events/:eventId/history'), () =>
      HttpResponse.json({ items: overrides.history ?? [], total: overrides.history?.length ?? 0 }),
    ),
    http.put(apiUrl('/admin/settings/activation-fee'), async ({ request }) => {
      fee = (await record(request)).amount_kzt
      return HttpResponse.json({ activation_fee_kzt: fee })
    }),
    http.post(apiUrl('/admin/event-reports/:id/review'), async ({ request, params }) => {
      const data = await record(request)
      const item = rows['event-reports'].find((row) => row.id === Number(params.id))
      if (!item) return adminError('EventReportNotFoundError', 404)
      Object.assign(item, {
        status: data.status,
        review_note: data.note,
        reviewed_at: date,
        reviewed_by_user_id: admin.id,
      })
      return HttpResponse.json(item)
    }),
    http.post(apiUrl('/admin/events/:id/paid-sales/:action'), async ({ request, params }) => {
      const data = await record(request)
      const item = paidSales.find((row) => row.event_id === Number(params.id))
      if (!item) return adminError('PaidSalesNotFoundError', 404)
      const suspended = params.action === 'suspend'
      Object.assign(item, {
        status: suspended ? 'suspended' : 'active',
        suspended_at: suspended ? date : null,
        suspension_reason: data?.reason ?? null,
      })
      return HttpResponse.json(item)
    }),
    http.post(apiUrl('/admin/events/:id/:action'), async ({ request, params }) => {
      const data = await record(request)
      const item = rows.events.find((row) => row.id === Number(params.id))
      if (!item) return adminError('EventNotFoundError', 404)
      Object.assign(item, {
        suspended_at: params.action === 'suspend' ? date : null,
        suspension_reason: data?.reason ?? null,
      })
      return HttpResponse.json(item)
    }),
    http.post(apiUrl('/admin/users/:id/:action'), async ({ request, params }) => {
      const data = await record(request)
      const item = rows.users.find((row) => row.id === Number(params.id))
      if (!item) return adminError('UserNotFoundError', 404)
      if (item.id === admin.id) return adminError('CannotSuspendSelfError', 400)
      Object.assign(item, {
        suspended_at: params.action === 'suspend' ? date : null,
        suspension_reason: data?.reason ?? null,
      })
      return HttpResponse.json(item)
    }),
    http.patch(apiUrl('/organizers/:id/approve'), async ({ request, params }) => {
      await record(request)
      const item = rows.organizers.find((row) => row.user_id === Number(params.id))
      if (!item) return adminError('OrganizerNotFoundError', 404)
      Object.assign(item, { status: 'approved' })
      return HttpResponse.json(item)
    }),
    http.post(apiUrl('/admin/organizers/:id/reject'), async ({ request, params }) => {
      const data = await record(request)
      const item = rows.organizers.find((row) => row.user_id === Number(params.id))
      if (item?.status !== 'pending') return adminError('InvalidOrganizerStatusError', 409)
      Object.assign(item, { status: 'rejected', rejection_reason: data.reason })
      return HttpResponse.json(item)
    }),
  )
  return { requests, mutations, rows }
}
