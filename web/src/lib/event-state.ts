// What an organizer may do with an event, worked out from the event itself.
// The API checks the same rules (and answers with an error); these only decide
// which buttons to show and what to warn about before the request.
import type { EventResponse, TicketTypeWithAvailability } from '@/api/generated/model'

export type PublishRequirement = 'venue' | 'address'

/** What a draft still needs before it can be published: the API refuses without a venue and an address. */
export function missingForPublish(
  event: Pick<EventResponse, 'venue_name' | 'venue_address'>,
): PublishRequirement[] {
  const missing: PublishRequirement[] = []
  if (!event.venue_name?.trim()) missing.push('venue')
  if (!event.venue_address?.trim()) missing.push('address')
  return missing
}

/** Cancelled events can't be changed; a finished one has nothing left to change. */
export function isEditable(event: Pick<EventResponse, 'status' | 'lifecycle'>): boolean {
  return event.status !== 'cancelled' && event.lifecycle !== 'completed'
}

/** The status chip of a ticket type in the organizer's list. */
export function ticketTypeStatus(
  type: Pick<TicketTypeWithAvailability, 'is_hidden' | 'on_sale' | 'unavailable_reason'>,
  event: Pick<EventResponse, 'status'>,
): string {
  if (type.is_hidden) return 'hidden'
  if (type.on_sale) return 'on_sale'
  if (event.status === 'draft') return 'unpublished'
  return type.unavailable_reason ?? 'registration_closed'
}
