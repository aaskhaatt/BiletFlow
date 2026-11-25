import type {
  EventListItem,
  EventResponse,
  TicketTypeWithAvailability,
} from '@/api/generated/model'

// Answers for MSW handlers, typed with the generated API types and shaped like the
// demo data (event 1 "Astana Jazz Night"). When the backend changes a response,
// the type check fails here first. Tests override only the fields they care about.

/** One event, as GET /events/{id} answers. */
export function eventResponse(overrides: Partial<EventResponse> = {}): EventResponse {
  return {
    id: 1,
    organizer_id: 1,
    title: 'Astana Jazz Night',
    description: 'An evening of Kazakh and international jazz standards.',
    start_time: '2026-12-07T14:00:00Z',
    end_time: '2026-12-07T17:00:00Z',
    status: 'published',
    category: 'Music',
    venue_name: 'Astana Opera',
    venue_address: 'Kunayev St 1',
    capacity: 250,
    visibility: 'public',
    registration_opens_at: null,
    registration_closes_at: null,
    refund_policy: null,
    image_url: null,
    suspended_at: null,
    suspension_reason: null,
    lifecycle: 'upcoming',
    organizer_name: 'TOO Dala Events',
    published_at: '2026-11-01T10:00:00+05:00',
    cancelled_at: null,
    ...overrides,
  }
}

/** One catalog card, as GET /events answers: the event plus its price and stock. */
export function eventListItem(overrides: Partial<EventListItem> = {}): EventListItem {
  return {
    ...eventResponse(),
    min_price: 8000,
    tickets_remaining: 217,
    ...overrides,
  }
}

/** One ticket type that is on sale, as GET /events/{id}/ticket-types answers. */
export function ticketType(
  overrides: Partial<TicketTypeWithAvailability> = {},
): TicketTypeWithAvailability {
  return {
    id: 1,
    event_id: 1,
    name: 'Standard',
    description: null,
    price: 8000,
    quantity: 200,
    sales_start: '2026-10-26T04:30:00+05:00',
    sales_end: '2026-12-07T18:00:00+05:00',
    is_hidden: false,
    max_per_order: 10,
    sold_count: 10,
    available: 190,
    max_now: 10,
    on_sale: true,
    unavailable_reason: null,
    ...overrides,
  }
}
