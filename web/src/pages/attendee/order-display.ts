import type { OrderResponse, TicketResponse } from '@/api/generated/model'

export function holdRemaining(order: OrderResponse, now: number) {
  const expiration = Date.parse(order.expires_at ?? '')
  return Number.isFinite(expiration) ? Math.max(0, expiration - now) : 0
}

export function orderStatus(order: OrderResponse, now: number) {
  return order.status === 'pending' && holdRemaining(order, now) === 0 ? 'expired' : order.status
}

export function isUpcomingOrder(order: OrderResponse, now: number) {
  return (
    order.status === 'confirmed' &&
    order.event?.status !== 'cancelled' &&
    Date.parse(order.event?.end_time ?? '') > now
  )
}

export function canCancelOrder(order: OrderResponse, now: number) {
  return (
    orderStatus(order, now) === 'pending' ||
    (isUpcomingOrder(order, now) &&
      order.total_amount === 0 &&
      order.tickets.every((ticket) => ticket.status !== 'checked_in'))
  )
}

export function canPrintTicket(ticket: TicketResponse) {
  return ticket.status === 'valid' || ticket.status === 'checked_in'
}

export function formatHold(remaining: number) {
  const seconds = Math.ceil(remaining / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
