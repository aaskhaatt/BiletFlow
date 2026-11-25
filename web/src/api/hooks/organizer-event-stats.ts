// Numbers about one event that the organizer's event page and its dialogs show.
import { useCheckInCheckInStats } from '@/api/generated/endpoints/check-in/check-in'
import {
  useOrdersGetEventOrders,
  useOrdersGetEventSales,
} from '@/api/generated/endpoints/orders/orders'

/** GET /events/{id}/check-in/stats: tickets registered and checked in so far. */
export function useCheckInStats(eventId: number) {
  return useCheckInCheckInStats(eventId)
}

/**
 * What cancelling an event does, counted for its confirmation: paid orders (refunded),
 * free registrations (cancelled) and unpaid holds (cancelled). Asks only while `enabled`.
 */
export function useCancellationImpact(eventId: number, enabled: boolean) {
  const sales = useOrdersGetEventSales(eventId, { query: { enabled } })
  const confirmed = useOrdersGetEventOrders(
    eventId,
    { status: 'confirmed', limit: 1 },
    { query: { enabled } },
  )
  const pending = useOrdersGetEventOrders(
    eventId,
    { status: 'pending', limit: 1 },
    { query: { enabled } },
  )

  const ready = sales.data && confirmed.data && pending.data
  return {
    isError: sales.isError || confirmed.isError || pending.isError,
    isPending: !ready && !(sales.isError || confirmed.isError || pending.isError),
    counts: ready
      ? {
          paid: sales.data.paid_orders,
          free: Math.max(0, confirmed.data.total - sales.data.paid_orders),
          pending: pending.data.total,
        }
      : undefined,
  }
}
