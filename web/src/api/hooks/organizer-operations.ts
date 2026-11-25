import { useMutation, useQueryClient } from '@tanstack/react-query'
import { checkInUndoCheckIn } from '@/api/generated/endpoints/check-in/check-in'
import {
  ordersCancelOrder,
  ordersGetEventOrders,
  ordersRefundOrder,
  useOrdersGetEventAttendees,
  useOrdersGetEventOrders,
  useOrdersGetEventSales,
} from '@/api/generated/endpoints/orders/orders'
import {
  staffAssignStaff,
  staffRemoveStaff,
  useStaffListStaff,
} from '@/api/generated/endpoints/staff/staff'
import type { EventOrderRow, OrdersGetEventOrdersParams } from '@/api/generated/model'
import { invalidateEventQueries } from '@/api/hooks/organizer-events'

export type OrderFilters = Pick<OrdersGetEventOrdersParams, 'q' | 'status'>

export const useEventAttendees = useOrdersGetEventAttendees
export const useEventOrders = useOrdersGetEventOrders
export const useEventSales = useOrdersGetEventSales
export const useEventStaff = useStaffListStaff

export async function fetchEventOrders(eventId: number, filters: OrderFilters) {
  const rows: EventOrderRow[] = []
  const seen = new Set<number>()
  const limit = 200
  for (let offset = 0; ; offset += limit) {
    const { items, total } = await ordersGetEventOrders(eventId, { ...filters, limit, offset })
    for (const item of items) {
      if (!seen.has(item.id)) {
        rows.push(item)
        seen.add(item.id)
      }
    }
    if (items.length < limit || offset + items.length >= total) return rows
  }
}

function useRefreshOperations() {
  const client = useQueryClient()
  return () => invalidateEventQueries(client)
}

export function useUndoCheckIn(eventId: number) {
  const refresh = useRefreshOperations()
  return useMutation({
    mutationFn: (ticketId: number) => checkInUndoCheckIn(eventId, { ticket_id: ticketId }),
    onSuccess: refresh,
    networkMode: 'always',
  })
}

export function useOrganizerOrderAction() {
  const client = useQueryClient()
  const refresh = useRefreshOperations()
  return useMutation({
    mutationFn: (input: { id: number; reason?: string }) =>
      input.reason === undefined
        ? ordersCancelOrder(input.id, {})
        : ordersRefundOrder(input.id, { reason: input.reason }),
    onSuccess: async () => {
      await Promise.all([refresh(), client.invalidateQueries({ queryKey: ['attendee-orders'] })])
    },
    networkMode: 'always',
  })
}

export function useStaffActions(eventId: number) {
  const refresh = useRefreshOperations()
  const assign = useMutation({
    mutationFn: (email: string) => staffAssignStaff(eventId, { email }),
    onSuccess: refresh,
    networkMode: 'always',
  })
  const remove = useMutation({
    mutationFn: (userId: number) => staffRemoveStaff(eventId, userId),
    onSuccess: refresh,
    networkMode: 'always',
  })
  return { assign, remove }
}
