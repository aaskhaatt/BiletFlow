import type { EventListItem } from '@/api/generated/model'

/** The card says "Мало мест" from this many tickets left down to one. */
export const LOW_STOCK_LIMIT = 5

/**
 * What a catalog card says about tickets, from the two numbers GET /events puts on
 * every item: `min_price` (cheapest visible ticket type, 0 = free, null = no ticket
 * types yet) and `tickets_remaining` (left across visible types, null = no types).
 */
export function cardTickets(event: Pick<EventListItem, 'min_price' | 'tickets_remaining'>) {
  const price = typeof event.min_price === 'number' ? event.min_price : null
  const left = typeof event.tickets_remaining === 'number' ? event.tickets_remaining : null
  return {
    /** Whole KZT, or null when there is nothing to show. */
    price,
    free: price === 0,
    lowStock: left !== null && left > 0 && left <= LOW_STOCK_LIMIT,
  }
}
