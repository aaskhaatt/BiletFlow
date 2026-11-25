import { isApiError } from '@/api/errors'
import type { EventResponse, TicketTypeResponse } from '@/api/generated/model'

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

export function ticketsLeft(ticket: TicketTypeResponse) {
  return Math.max(0, ticket.quantity - ticket.sold_count)
}

export function ticketAvailability(ticket: TicketTypeResponse, now: number) {
  if (ticketsLeft(ticket) === 0) return 'soldOut'
  if (ticket.is_hidden || now > Date.parse(ticket.sales_end)) return 'closed'
  if (now < Date.parse(ticket.sales_start)) return 'upcoming'
  return 'open'
}

export function ticketLimit(ticket: TicketTypeResponse, now: number) {
  return ticketAvailability(ticket, now) === 'open'
    ? Math.min(ticket.max_per_order, ticketsLeft(ticket))
    : 0
}

/** The catalog can use the list response directly once the API supplies R1. */
export function catalogAvailability(
  event: EventResponse,
  types: TicketTypeResponse[] | undefined,
  now: number,
) {
  const sale =
    eventRegistration(event, now) === 'open'
      ? (types?.filter((ticket) => ticketLimit(ticket, now) > 0) ?? [])
      : []
  const left = sale.reduce((total, ticket) => total + ticketsLeft(ticket), 0)
  return {
    price: sale.length ? Math.min(...sale.map((ticket) => ticket.price)) : null,
    lowStock: left > 0 && left <= 5,
    freeOnly: sale.length > 0 && sale.every((ticket) => ticket.price === 0),
  }
}
