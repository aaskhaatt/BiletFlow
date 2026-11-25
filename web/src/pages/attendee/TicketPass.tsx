import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import type { OrderResponse, TicketResponse } from '@/api/generated/model'
import { useTicketTypes } from '@/api/hooks/events'
import { useTicketQr } from '@/api/hooks/orders'
import ErrorState from '@/components/ErrorState'
import StatusBadge from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import OrderEvent from '@/pages/attendee/OrderEvent'
import { canPrintTicket } from '@/pages/attendee/order-display'
import PdfButton from '@/pages/attendee/PdfButton'

function TicketQr({ ticketId }: { ticketId: number }) {
  const { t } = useTranslation()
  const qr = useTicketQr(ticketId)
  if (qr.isError) {
    return (
      <ErrorState
        title={t('attendee.qrError')}
        description={t(errorMessageKey(qr.error))}
        onRetry={() => void qr.refetch()}
        retrying={qr.isFetching}
        heading="h3"
      />
    )
  }
  return qr.data ? <QrImage blob={qr.data} /> : <p role="status">{t('common.loading')}</p>
}

function QrImage({ blob }: { blob: Blob }) {
  const { t } = useTranslation()
  const image = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const element = image.current
    if (!element) return
    const url = URL.createObjectURL(blob)
    element.src = url
    return () => {
      element.removeAttribute('src')
      URL.revokeObjectURL(url)
    }
  }, [blob])
  return (
    <img
      ref={image}
      alt={t('attendee.ticketQr')}
      width={192}
      height={192}
      className="mx-auto max-w-full"
    />
  )
}

export default function TicketPass({
  order,
  ticket,
  showEvent = true,
}: {
  order: OrderResponse
  ticket: TicketResponse
  showEvent?: boolean
}) {
  const { t } = useTranslation()
  const types = useTicketTypes(order.event_id)
  const name = types.data?.find((type) => type.id === ticket.ticket_type_id)?.name
  const index = order.tickets.findIndex((item) => item.id === ticket.id)
  const previous = order.tickets[index - 1]
  const next = order.tickets[index + 1]
  const printable = canPrintTicket(ticket)

  return (
    <article
      aria-label={t('attendee.ticket')}
      className="space-y-4 rounded-lg border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        {showEvent && <OrderEvent order={order} />}
        <StatusBadge kind="ticket" status={ticket.status} />
      </div>
      <dl className="grid gap-3 wrap-anywhere sm:grid-cols-2">
        <div>
          <dt className="type-small text-ink-2">{t('attendee.ticketType')}</dt>
          <dd>{name ?? t('attendee.typeFallback', { id: ticket.ticket_type_id })}</dd>
        </div>
        <div>
          <dt className="type-small text-ink-2">{t('attendee.attendeeName')}</dt>
          <dd>{ticket.attendee_name}</dd>
        </div>
        <div>
          <dt className="type-small text-ink-2">{t('attendee.seat')}</dt>
          <dd>{t('attendee.noSeat')}</dd>
        </div>
        <div>
          <dt className="type-small text-ink-2">{t('attendee.ticketCode')}</dt>
          <dd className="font-mono">{ticket.code}</dd>
        </div>
      </dl>
      {ticket.status === 'valid' && (
        <div className="space-y-2 rounded-md bg-paper p-4 text-center">
          <TicketQr key={ticket.id} ticketId={ticket.id} />
          <p className="type-small text-ink-2">{t('attendee.showAtEntrance')}</p>
        </div>
      )}
      <PdfButton
        key={ticket.id}
        path={`/tickets/${ticket.id}/pdf`}
        filename={`ticket-${ticket.id}.pdf`}
        label={t('attendee.ticketPdf')}
        enabled={printable}
      />
      {order.tickets.length > 1 && (
        <nav
          aria-label={t('attendee.ticketNavigation')}
          className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3"
        >
          {previous ? (
            <Button asChild variant="outline" size="sm">
              <Link to={`/tickets/${previous.id}`}>{t('attendee.previousTicket')}</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              {t('attendee.previousTicket')}
            </Button>
          )}
          <span className="type-small">
            {t('attendee.ticketPosition', { current: index + 1, total: order.tickets.length })}
          </span>
          {next ? (
            <Button asChild variant="outline" size="sm">
              <Link to={`/tickets/${next.id}`}>{t('attendee.nextTicket')}</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              {t('attendee.nextTicket')}
            </Button>
          )}
        </nav>
      )}
    </article>
  )
}
