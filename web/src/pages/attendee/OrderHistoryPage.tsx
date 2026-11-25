import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import type { OrderResponse, TicketResponse } from '@/api/generated/model'
import { useMyOrders } from '@/api/hooks/orders'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import StatusBadge from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatKZT } from '@/lib/format'
import AttendeePage from '@/pages/attendee/AttendeePage'
import OrderEvent from '@/pages/attendee/OrderEvent'
import { isUpcomingOrder, orderStatus } from '@/pages/attendee/order-display'
import EventCover from '@/pages/events/EventCover'

export function MyOrdersPage() {
  return <History kind="orders" />
}

export function MyTicketsPage() {
  return <History kind="tickets" />
}

function History({ kind }: { kind: 'orders' | 'tickets' }) {
  const { t } = useTranslation()
  const orders = useMyOrders()
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <AttendeePage route={kind === 'orders' ? 'my-orders' : 'my-tickets'} title={t(`nav.${kind}`)}>
      {orders.isError ? (
        <ErrorState
          title={t(kind === 'orders' ? 'attendee.ordersError' : 'attendee.ticketError')}
          description={t(errorMessageKey(orders.error))}
          onRetry={() => void orders.refetch()}
          retrying={orders.isFetching}
        />
      ) : orders.data ? (
        <HistoryGroups orders={orders.data} kind={kind} now={now} />
      ) : (
        <p role="status">{t('common.loading')}</p>
      )}
    </AttendeePage>
  )
}

function HistoryGroups({
  orders,
  kind,
  now,
}: {
  orders: OrderResponse[]
  kind: 'orders' | 'tickets'
  now: number
}) {
  const { t } = useTranslation()
  const pending: ReactNode[] = []
  const upcoming: ReactNode[] = []
  const past: ReactNode[] = []

  for (const order of orders) {
    const isUpcoming = isUpcomingOrder(order, now)
    if (kind === 'tickets') {
      for (const ticket of order.tickets) {
        const active = isUpcoming && ticket.status !== 'cancelled' && ticket.status !== 'refunded'
        const group = active ? upcoming : past
        group.push(<HistoryItem key={ticket.id} order={order} ticket={ticket} now={now} />)
      }
    } else {
      const group = orderStatus(order, now) === 'pending' ? pending : isUpcoming ? upcoming : past
      group.push(<HistoryItem key={order.id} order={order} now={now} />)
    }
  }

  if (!pending.length && !upcoming.length && !past.length) {
    return (
      <>
        <EmptyState title={t(kind === 'orders' ? 'attendee.noOrders' : 'attendee.noTickets')} />
        <Button asChild variant="outline">
          <Link to="/">{t('event.toCatalog')}</Link>
        </Button>
      </>
    )
  }

  return (
    <>
      <HistoryGroup title={t('status.order.pending')} items={pending} />
      <HistoryGroup title={t('attendee.upcoming')} items={upcoming} />
      <HistoryGroup title={t('attendee.past')} items={past} />
    </>
  )
}

function HistoryGroup({ title, items }: { title: string; items: ReactNode[] }) {
  if (!items.length) return null
  return (
    <section className="space-y-3" aria-label={title}>
      <h2 className="type-card-title">{title}</h2>
      <ul className="space-y-3">{items}</ul>
    </section>
  )
}

function HistoryItem({
  order,
  ticket,
  now,
}: {
  order: OrderResponse
  ticket?: TicketResponse
  now: number
}) {
  const { t } = useTranslation()
  const status = orderStatus(order, now)
  return (
    <li className="flex flex-wrap items-start gap-4 rounded-lg border border-line bg-surface p-4">
      {order.event?.image_url && (
        <EventCover image={order.event.image_url} className="size-20 shrink-0 rounded-md" lazy />
      )}
      <div className="min-w-40 flex-1 space-y-2 wrap-anywhere">
        <OrderEvent order={order} heading="h3" />
        {ticket ? (
          <>
            <StatusBadge kind="ticket" status={ticket.status} />
            <p className="type-small">{ticket.attendee_name}</p>
          </>
        ) : (
          <>
            <StatusBadge kind="order" status={status} />
            <p className="type-small">
              {t('attendee.orderTitle', { id: order.id })} · {formatKZT(order.total_amount)}
            </p>
          </>
        )}
      </div>
      <Button asChild variant="outline" size="sm">
        {ticket ? (
          <Link to={`/tickets/${ticket.id}`}>{t('attendee.openTicket')}</Link>
        ) : (
          <Link to={`/orders/${order.id}`}>
            {t(status === 'pending' ? 'attendee.resumePayment' : 'attendee.openOrder')}
          </Link>
        )}
      </Button>
    </li>
  )
}
