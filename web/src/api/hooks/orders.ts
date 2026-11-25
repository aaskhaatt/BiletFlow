import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ordersCancelOrder,
  ordersCreateOrder,
  ordersGetMyOrders,
  ordersGetOrder,
  ordersPayOrder,
  ordersPreviewOrder,
} from '@/api/generated/endpoints/orders/orders'
import { getTicketTypesGetTicketTypesByEventIdQueryKey } from '@/api/generated/endpoints/ticket-types/ticket-types'
import type {
  OrderCreate,
  OrderPreviewRequest,
  OrderResponse,
  PayOrderRequest,
} from '@/api/generated/model'
import { eventsQueryKey } from '@/api/hooks/events'
import { apiBlob } from '@/api/http'
import { useSession } from '@/auth/session-store'

const ordersKey = (generation: number) => ['attendee-orders', generation] as const
const orderKey = (generation: number, id: number) => [...ordersKey(generation), id] as const

export function useMyOrders() {
  const { generation } = useSession()
  return useQuery({
    queryKey: ordersKey(generation),
    queryFn: ({ signal }) => ordersGetMyOrders({ signal }),
  })
}

export function useOrder(id: number) {
  const { generation } = useSession()
  return useQuery({
    queryKey: orderKey(generation, id),
    queryFn: ({ signal }) => ordersGetOrder(id, { signal }),
  })
}

export function useOrderPreview(eventId: number, data: OrderPreviewRequest) {
  const { generation } = useSession()
  return useQuery({
    queryKey: ['order-preview', generation, eventId, data],
    queryFn: ({ signal }) => ordersPreviewOrder(eventId, data, { signal }),
    enabled: data.items.length > 0,
  })
}

function useUpdateOrders() {
  const client = useQueryClient()
  const { generation } = useSession()
  return async (order: OrderResponse) => {
    const detail = orderKey(generation, order.id)
    await client.cancelQueries({ queryKey: detail, exact: true })
    client.setQueryData(detail, order)
    client.setQueryData<OrderResponse[]>(ordersKey(generation), (orders) =>
      orders ? [order, ...orders.filter((existing) => existing.id !== order.id)] : undefined,
    )
    void client.invalidateQueries({ queryKey: ordersKey(generation), exact: true })
    void client.invalidateQueries({
      queryKey: getTicketTypesGetTicketTypesByEventIdQueryKey(order.event_id),
    })
    void client.invalidateQueries({ queryKey: eventsQueryKey() })
  }
}

export function useCreateOrder(eventId: number) {
  const onSuccess = useUpdateOrders()
  return useMutation({
    mutationFn: (data: OrderCreate) => ordersCreateOrder(eventId, data),
    networkMode: 'always',
    onSuccess,
  })
}

export function usePayOrder(id: number) {
  const onSuccess = useUpdateOrders()
  return useMutation({
    mutationFn: (data: PayOrderRequest) => ordersPayOrder(id, data),
    networkMode: 'always',
    onSuccess,
  })
}

export function useCancelOrder(id: number) {
  const onSuccess = useUpdateOrders()
  return useMutation({
    mutationFn: () => ordersCancelOrder(id, {}),
    networkMode: 'always',
    onSuccess,
  })
}

export function useTicketQr(id: number) {
  const { generation } = useSession()
  return useQuery({
    queryKey: ['ticket-qr', generation, id],
    queryFn: ({ signal }) => apiBlob(`/tickets/${id}/qr`, { signal }),
    staleTime: Infinity,
    gcTime: 0,
  })
}
