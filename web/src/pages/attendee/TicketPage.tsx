import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import { useMyOrders } from '@/api/hooks/orders'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import { Button } from '@/components/ui/button'
import AttendeePage from '@/pages/attendee/AttendeePage'
import TicketPass from '@/pages/attendee/TicketPass'
import { parseEventId } from '@/pages/events/availability'
import NotFoundPage from '@/pages/NotFoundPage'

export default function TicketPage() {
  const id = parseEventId(useParams().ticketId)
  return id === null ? <NotFoundPage /> : <TicketRoute id={id} />
}

function TicketRoute({ id }: { id: number }) {
  const { t } = useTranslation()
  const orders = useMyOrders()
  const order = orders.data?.find((item) => item.tickets.some((ticket) => ticket.id === id))
  const ticket = order?.tickets.find((item) => item.id === id)
  return (
    <AttendeePage route="ticket" title={t('attendee.ticket')}>
      {orders.isError ? (
        <ErrorState
          title={t('attendee.ticketError')}
          description={t(errorMessageKey(orders.error))}
          onRetry={() => void orders.refetch()}
          retrying={orders.isFetching}
        />
      ) : order && ticket ? (
        <>
          <TicketPass key={id} order={order} ticket={ticket} />
          <Button variant="link" asChild className="px-0">
            <Link to={`/orders/${order.id}`}>{t('attendee.orderTitle', { id: order.id })}</Link>
          </Button>
        </>
      ) : orders.isPending ? (
        <p role="status">{t('common.loading')}</p>
      ) : (
        <EmptyState title={t('errors.TicketNotFoundError')} />
      )}
      <Button variant="link" asChild className="px-0">
        <Link to="/my/tickets">{t('nav.tickets')}</Link>
      </Button>
    </AttendeePage>
  )
}
