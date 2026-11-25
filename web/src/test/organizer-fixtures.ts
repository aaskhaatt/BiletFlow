import { http, HttpResponse } from 'msw'
import type {
  EventResponse,
  OrganizerEventSummary,
  PaidSalesStatusResponse,
  SupportCaseSummary,
  TicketTypeWithAvailability,
} from '@/api/generated/model'
import { apiUrl, server } from '@/test/msw-server'

/** A published, upcoming event. Pass what a test needs to differ. */
export function eventOf(over: Partial<EventResponse> = {}): EventResponse {
  return {
    id: 1,
    organizer_id: 10,
    title: 'Jazz night',
    description: 'Live jazz in the hall',
    start_time: '2026-12-01T19:00:00+05:00',
    end_time: '2026-12-01T22:00:00+05:00',
    status: 'published',
    category: 'Music',
    venue_name: 'Astana Hall',
    venue_address: 'Abay 1',
    capacity: 200,
    visibility: 'public',
    registration_opens_at: null,
    registration_closes_at: null,
    refund_policy: null,
    image_url: null,
    suspended_at: null,
    suspension_reason: null,
    lifecycle: 'upcoming',
    organizer_name: 'Jazz Club',
    published_at: '2026-11-01T10:00:00+05:00',
    cancelled_at: null,
    ...over,
  }
}

/** The numbers of an event, as GET /events/me/summary answers. */
export function summaryOf(
  event: EventResponse,
  over: Partial<OrganizerEventSummary> = {},
): OrganizerEventSummary {
  return {
    event_id: event.id,
    title: event.title,
    status: event.status,
    lifecycle: event.lifecycle,
    start_time: event.start_time,
    end_time: event.end_time,
    image_url: event.image_url ?? null,
    capacity: event.capacity ?? null,
    tickets_sold: 0,
    revenue: 0,
    paid_sales_status: 'not_started',
    ...over,
  }
}

export function ticketTypeOf(
  over: Partial<TicketTypeWithAvailability> = {},
): TicketTypeWithAvailability {
  return {
    id: 100,
    event_id: 1,
    name: 'Standard',
    description: null,
    price: 5000,
    quantity: 180,
    sales_start: '2026-10-01T10:00:00+05:00',
    sales_end: '2026-12-01T18:00:00+05:00',
    is_hidden: false,
    max_per_order: 10,
    sold_count: 0,
    available: 180,
    max_now: 10,
    on_sale: true,
    unavailable_reason: null,
    ...over,
  }
}

export function paidSalesOf(
  over: Partial<PaidSalesStatusResponse> = {},
  checklist: Partial<PaidSalesStatusResponse['checklist']> = {},
): PaidSalesStatusResponse {
  return {
    event_id: 1,
    status: 'not_started',
    fee_amount: 10000,
    currency: 'KZT',
    is_simulated: true,
    checklist: {
      has_paid_ticket_type: true,
      identity_verified: false,
      payout_account_connected: false,
      terms_accepted: false,
      fee_paid: false,
      ...checklist,
    },
    can_activate: false,
    activated_at: null,
    suspended_at: null,
    suspension_reason: null,
    ...over,
  }
}

export function supportCaseOf(id: number, status: string, updatedAt: string): SupportCaseSummary {
  return {
    id,
    kind: 'attendee',
    category: 'other',
    subject: 'Question',
    status,
    requester_user_id: 2,
    event_id: 1,
    order_id: null,
    ticket_id: null,
    assigned_user_id: null,
    created_at: updatedAt,
    updated_at: updatedAt,
  }
}

/** What the organizer's server answers; each test sets only what it looks at. */
export type OrganizerApi = {
  events?: EventResponse[]
  summaries?: OrganizerEventSummary[]
  inbox?: SupportCaseSummary[]
  /** Paid-sales checklist by event id; a missing event answers like a plain event. */
  paidSales?: Record<number, PaidSalesStatusResponse>
  ticketTypes?: Record<number, TicketTypeWithAvailability[]>
}

export function mockOrganizerApi(api: OrganizerApi) {
  server.use(
    http.get(apiUrl('/events/me'), () => HttpResponse.json(api.events ?? [])),
    http.get(apiUrl('/events/me/summary'), () => HttpResponse.json(api.summaries ?? [])),
    http.get(apiUrl('/support/cases/inbox'), () => HttpResponse.json(api.inbox ?? [])),
    http.get(apiUrl('/events/:id/paid-sales'), ({ params }) =>
      HttpResponse.json(
        api.paidSales?.[Number(params.id)] ??
          paidSalesOf({ event_id: Number(params.id) }, { has_paid_ticket_type: false }),
      ),
    ),
    http.get(apiUrl('/events/:id/ticket-types/manage'), ({ params }) =>
      HttpResponse.json(api.ticketTypes?.[Number(params.id)] ?? []),
    ),
    http.get(apiUrl('/events/:id/manage'), ({ params }) => {
      const event = api.events?.find((item) => item.id === Number(params.id))
      return event ? HttpResponse.json(event) : apiError('EventNotFoundError', 404)
    }),
    http.get(apiUrl('/events/:id/check-in/stats'), () =>
      HttpResponse.json({
        registered: 0,
        checked_in: 0,
        not_checked_in: 0,
        cancelled: 0,
        refunded: 0,
      }),
    ),
  )
}

/** An API error body, as the backend sends it. */
export function apiError(
  error: string,
  status: number,
  fields: Record<string, string> | null = null,
) {
  return HttpResponse.json({ error, message: error, fields }, { status })
}
