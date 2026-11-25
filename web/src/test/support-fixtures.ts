import { http, HttpResponse } from 'msw'
import type { OrderResponse, SupportCaseCreate, SupportCaseDetail } from '@/api/generated/model'
import { eventResponse } from '@/test/fixtures'
import { apiUrl, server } from '@/test/msw-server'
import { apiError } from '@/test/organizer-fixtures'

export const supportDate = '2026-11-25T10:02:00Z'

export function supportCase(overrides: Partial<SupportCaseDetail> = {}): SupportCaseDetail {
  return {
    id: 42,
    kind: 'attendee',
    category: 'payment',
    subject: 'Money charged twice',
    status: 'open',
    requester_user_id: 1,
    event_id: 7,
    order_id: 12,
    ticket_id: null,
    assigned_user_id: null,
    created_at: supportDate,
    updated_at: supportDate,
    messages: [
      { id: 1, author_user_id: 1, body: 'Please check my order.', created_at: supportDate },
    ],
    history: [],
    ...overrides,
  }
}

export function supportOrder(): OrderResponse {
  const event = eventResponse({ id: 7, title: 'Jazz Festival' })
  return {
    id: 12,
    event_id: event.id,
    status: 'refunded',
    total_amount: 5000,
    discount_amount: 0,
    promo_code: null,
    buyer_name: 'Ticket buyer',
    buyer_email: 'buyer@example.test',
    created_at: supportDate,
    expires_at: null,
    paid_at: supportDate,
    cancelled_at: null,
    refunded_at: supportDate,
    items: [],
    tickets: [
      {
        id: 14,
        code: 'BF-REFUNDED',
        ticket_type_id: 1,
        event_id: event.id,
        attendee_name: 'Ticket buyer',
        status: 'refunded',
        created_at: supportDate,
        checked_in_at: null,
      },
    ],
    event: {
      ...event,
      venue_name: event.venue_name ?? null,
      venue_address: event.venue_address ?? null,
      image_url: event.image_url ?? null,
      cancelled_at: event.cancelled_at ?? null,
    },
  }
}

export function mockSupport({
  initial = [],
  orders = [supportOrder()],
  userId = 1,
}: { initial?: SupportCaseDetail[]; orders?: OrderResponse[]; userId?: number } = {}) {
  const cases = [...initial]
  const creates: SupportCaseCreate[] = []
  const inboxRequests: URL[] = []
  const caseRequests: number[] = []
  const userRequests: string[] = []
  const writes: { action: string; payload: unknown }[] = []
  const event = eventResponse({ id: 7, title: 'Jazz Festival' })
  const find = (id: string | readonly string[] | undefined) =>
    cases.find((row) => row.id === Number(id))
  const summary = (item: SupportCaseDetail) => ({
    ...item,
    messages: undefined,
    history: undefined,
  })
  const updated = '2026-11-25T10:26:00Z'

  server.use(
    http.get(apiUrl('/orders/me'), () => HttpResponse.json(orders)),
    http.get(apiUrl('/orders/12'), () => HttpResponse.json(orders[0])),
    http.get(apiUrl('/events/me'), () => HttpResponse.json([event])),
    http.get(apiUrl('/events/7'), () => HttpResponse.json(event)),
    http.get(apiUrl('/events/7/ticket-types'), () => HttpResponse.json([])),
    http.get(apiUrl('/admin/users'), ({ request }) => {
      const q = new URL(request.url).searchParams.get('q') ?? ''
      userRequests.push(q)
      return q === '1'
        ? HttpResponse.json({ items: [{ id: 1, email: 'buyer@example.test' }], total: 1 })
        : HttpResponse.json({ items: [], total: 0 })
    }),
    http.get(apiUrl('/support/cases/me'), () =>
      HttpResponse.json(cases.filter((row) => row.requester_user_id === userId).map(summary)),
    ),
    http.get(apiUrl('/support/cases/inbox'), ({ request }) => {
      const url = new URL(request.url)
      inboxRequests.push(url)
      const { searchParams } = url
      const status = searchParams.get('status')
      const kind = searchParams.get('kind')
      return HttpResponse.json(
        cases
          .filter((item) => (!kind || item.kind === kind) && (!status || item.status === status))
          .map(summary),
      )
    }),
    http.get(apiUrl('/support/cases/:id'), ({ params }) => {
      caseRequests.push(Number(params.id))
      return find(params.id)
        ? HttpResponse.json(find(params.id))
        : apiError('SupportCaseNotFoundError', 404)
    }),
    http.post(apiUrl('/support/cases'), async ({ request }) => {
      const data = (await request.json()) as SupportCaseCreate
      creates.push(data)
      const item = supportCase({
        ...data,
        id: 51,
        requester_user_id: userId,
        event_id: data.event_id ?? (data.kind === 'attendee' ? 7 : null),
        order_id: data.order_id ?? null,
        ticket_id: data.ticket_id ?? null,
        messages: [{ id: 1, author_user_id: userId, body: data.message, created_at: supportDate }],
      })
      cases.push(item)
      return HttpResponse.json(item, { status: 201 })
    }),
    http.post(apiUrl('/support/cases/:id/messages'), async ({ params, request }) => {
      const item = find(params.id)
      if (!item) return apiError('SupportCaseNotFoundError', 404)
      const data = (await request.json()) as { body: string }
      writes.push({ action: 'message', payload: data })
      const message = {
        id: item.messages.length + 1,
        author_user_id: userId,
        body: data.body,
        created_at: updated,
      }
      item.messages.push(message)
      if (
        item.requester_user_id === userId &&
        ['waiting_for_customer', 'resolved'].includes(item.status)
      )
        item.status = 'open'
      return HttpResponse.json(message, { status: 201 })
    }),
    http.patch(apiUrl('/support/cases/:id/assignee'), async ({ params, request }) => {
      const item = find(params.id)
      if (!item) return apiError('SupportCaseNotFoundError', 404)
      const data = (await request.json()) as { user_id: number | null }
      writes.push({ action: 'assign', payload: data })
      item.assigned_user_id = data.user_id
      item.history.push({
        action: 'assigned',
        actor_user_id: userId,
        assigned_user_id: data.user_id,
        created_at: updated,
      })
      return HttpResponse.json(item)
    }),
    http.patch(apiUrl('/support/cases/:id/status'), async ({ params, request }) => {
      const item = find(params.id)
      if (!item) return apiError('SupportCaseNotFoundError', 404)
      const data = (await request.json()) as { status: string }
      writes.push({ action: 'status', payload: data })
      item.history.push({
        action: 'status_changed',
        actor_user_id: userId,
        from_status: item.status,
        to_status: data.status,
        created_at: updated,
      })
      item.status = data.status
      return HttpResponse.json(item)
    }),
  )
  return { cases, creates, inboxRequests, caseRequests, userRequests, writes }
}
