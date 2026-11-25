import { isApiError } from '@/api/errors'
import type { EventResponse, TicketTypeWithAvailability } from '@/api/generated/model'

export function parseEventId(value: string | undefined) {
  const id = Number(value)
  return value && /^\d+$/.test(value) && Number.isSafeInteger(id) && id > 0 ? id : null
}

export function eventRegistration(event: EventResponse, now: number) {
  if (
    event.status !== 'published' ||
    event.lifecycle === 'completed' ||
    now > Date.parse(event.registration_closes_at ?? event.end_time)
  ) {
    return 'closed'
  }
  if (event.registration_opens_at && now < Date.parse(event.registration_opens_at))
    return 'upcoming'
  return 'open'
}

export function isRegistrationClosedError(error: unknown) {
  return isApiError(error) && error.status === 409 && error.error === 'RegistrationClosedError'
}

export function ticketLimit(ticket: TicketTypeWithAvailability) {
  if (!ticket.on_sale || ticket.is_hidden) return 0
  const limit = Math.min(ticket.max_now, ticket.available)
  return limit > 0 ? limit : 0
}
