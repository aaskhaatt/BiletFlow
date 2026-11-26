import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import { isApiError } from '@/api/errors'
import type { OrderResponse, PayOrderRequestSimulateOutcome } from '@/api/generated/model'
import { useCancelOrder, useOrder, usePayOrder } from '@/api/hooks/orders'
import ConfirmDialog from '@/components/ConfirmDialog'
import DemoBanner from '@/components/DemoBanner'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import InlineAlert from '@/components/InlineAlert'
import StatusBadge from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatEventTime, formatKZT } from '@/lib/format'
import AttendeePage from '@/pages/attendee/AttendeePage'
import OrderEvent from '@/pages/attendee/OrderEvent'
import {
  canCancelOrder,
  canPrintTicket,
  formatHold,
  holdRemaining,
  orderStatus,
} from '@/pages/attendee/order-display'
import PdfButton from '@/pages/attendee/PdfButton'
import TicketPass from '@/pages/attendee/TicketPass'
import { parseEventId } from '@/pages/events/availability'
import NotFoundPage from '@/pages/NotFoundPage'

const paymentBlockedErrors = new Set(['OrderNotPayableError', 'PaidSalesNotActiveError'])

export default function OrderPage() {
  const id = parseEventId(useParams().orderId)
  return id === null ? <NotFoundPage /> : <OrderRoute key={id} id={id} />
}

function OrderRoute({ id }: { id: number }) {
  const { t } = useTranslation()
  const order = useOrder(id)

  return (
    <AttendeePage route="order" title={t('attendee.orderTitle', { id })}>
      {order.isError && isApiError(order.error) && order.error.status === 404 ? (
        <EmptyState title={t('errors.OrderNotFoundError')} />
      ) : order.isError ? (
        <ErrorState
          title={t('attendee.orderError')}
          description={t(errorMessageKey(order.error))}
          onRetry={() => void order.refetch()}
          retrying={order.isFetching}
        />
      ) : order.data ? (
        <OrderDetails order={order.data} refresh={() => void order.refetch()} />
      ) : (
        <p role="status">{t('common.loading')}</p>
      )}
      <Button variant="link" asChild className="px-0">
        <Link to="/my/orders">{t('nav.orders')}</Link>
      </Button>
    </AttendeePage>
  )
}

function OrderDetails({ order, refresh }: { order: OrderResponse; refresh: () => void }) {
  const { t } = useTranslation()
  const [now, setNow] = useState(Date.now)
  const [outcome, setOutcome] = useState<PayOrderRequestSimulateOutcome>('success')
  const [operationError, setOperationError] = useState<unknown>(null)
  const [serverExpired, setServerExpired] = useState(false)
  const [paymentBlocked, setPaymentBlocked] = useState(false)
  const inFlight = useRef(false)
  const pay = usePayOrder(order.id)
  const cancel = useCancelOrder(order.id)
  const busy = pay.isPending || cancel.isPending

  useEffect(() => {
    const sync = () => setNow(Date.now())
    const timer = window.setInterval(sync, 1000)
    document.addEventListener('visibilitychange', sync)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])

  const remaining = holdRemaining(order, now)
  const status = order.status === 'pending' && serverExpired ? 'expired' : orderStatus(order, now)
  const hasPrintable = order.tickets.some(canPrintTicket)
  const activeTicket = order.tickets[0]
  const statusText =
    status === 'confirmed' ||
    status === 'expired' ||
    status === 'cancelled' ||
    status === 'refunded'
      ? t(`attendee.orderMessage.${status}`)
      : null

  async function payOrder() {
    if (inFlight.current || status !== 'pending' || paymentBlocked) return
    if (holdRemaining(order, Date.now()) === 0) {
      setNow(Date.now())
      return
    }
    inFlight.current = true
    setOperationError(null)
    try {
      await pay.mutateAsync({ simulate_outcome: outcome })
    } catch (error) {
      setOperationError(error)
      if (isApiError(error)) {
        if (error.error === 'OrderExpiredError') setServerExpired(true)
        if (paymentBlockedErrors.has(error.error)) setPaymentBlocked(true)
        if (error.error !== 'PaymentFailedError') refresh()
      }
    } finally {
      inFlight.current = false
    }
  }

  async function cancelOrder() {
    if (inFlight.current || serverExpired || !canCancelOrder(order, Date.now())) return
    inFlight.current = true
    setOperationError(null)
    try {
      await cancel.mutateAsync()
    } catch (error) {
      setOperationError(error)
      refresh()
    } finally {
      inFlight.current = false
    }
  }

  return (
    <>
      <section className="space-y-4 rounded-lg border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <OrderEvent order={order} />
          <StatusBadge kind="order" status={status} />
        </div>
        <dl className="grid gap-3 wrap-anywhere sm:grid-cols-2">
          <div>
            <dt className="type-small text-ink-2">{t('attendee.attendeeName')}</dt>
            <dd>{order.buyer_name}</dd>
          </div>
          <div>
            <dt className="type-small text-ink-2">{t('checkout.total')}</dt>
            <dd className="font-semibold">{formatKZT(order.total_amount)}</dd>
          </div>
        </dl>
        <Button variant="link" asChild className="px-0">
          <Link to={`/support/new?order_id=${order.id}`}>{t('supportCases.contact')}</Link>
        </Button>
        {statusText && (
          <InlineAlert tone={status === 'confirmed' ? 'ok' : 'warn'} role="status">
            {statusText}
          </InlineAlert>
        )}
        {status !== 'pending' && order.total_amount > 0 && <DemoBanner />}
        {status === 'expired' && (
          <Button asChild variant="outline">
            <Link to={`/events/${order.event_id}`}>{t('attendee.startAgain')}</Link>
          </Button>
        )}
      </section>

      {operationError != null && (
        <InlineAlert tone="danger" role="alert">
          <p>{t(errorMessageKey(operationError))}</p>
          {paymentBlocked && status === 'pending' && <p>{t('attendee.paymentUnavailable')}</p>}
        </InlineAlert>
      )}

      {status === 'pending' && order.expires_at && (
        <section className="space-y-4 rounded-lg border border-line bg-surface p-4 sm:p-5">
          <h2 className="type-card-title">{t('attendee.paymentTitle')}</h2>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="type-small text-ink-2">
              {t('attendee.reservedUntil', {
                time: formatEventTime(order.expires_at, { withZone: true }),
              })}
            </p>
            <span
              className="font-semibold tabular-nums"
              role="timer"
              aria-label={t('attendee.timeLeft')}
            >
              {formatHold(remaining)}
            </span>
          </div>
          {remaining <= 60_000 && (
            <InlineAlert tone="warn" role="status">
              {t('attendee.lastMinute')}
            </InlineAlert>
          )}
          <DemoBanner />
          <fieldset className="space-y-2" disabled={busy || paymentBlocked}>
            <legend className="type-label">{t('attendee.testCard')}</legend>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="outcome"
                value="success"
                checked={outcome === 'success'}
                onChange={() => setOutcome('success')}
                className="size-5 accent-brand"
              />
              {t('attendee.paymentSuccess')}
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="outcome"
                value="failure"
                checked={outcome === 'failure'}
                onChange={() => setOutcome('failure')}
                className="size-5 accent-brand"
              />
              {t('attendee.paymentFailure')}
            </label>
          </fieldset>
          <Button
            disabled={busy || paymentBlocked}
            loading={pay.isPending}
            onClick={() => void payOrder()}
          >
            {t('attendee.pay', { total: formatKZT(order.total_amount) })}
          </Button>
        </section>
      )}

      {activeTicket && (
        <section className="space-y-3" aria-label={t('nav.tickets')}>
          <h2 className="type-card-title">{t('nav.tickets')}</h2>
          <TicketPass order={order} ticket={activeTicket} showEvent={false} />
          <PdfButton
            path={`/orders/${order.id}/pdf`}
            filename={`order-${order.id}-tickets.pdf`}
            label={t('attendee.orderPdf')}
            enabled={hasPrintable}
          />
        </section>
      )}

      {status !== 'expired' && canCancelOrder(order, now) && (
        <ConfirmDialog
          trigger={
            <Button variant="outline" disabled={busy} loading={cancel.isPending}>
              {t('attendee.cancelOrder')}
            </Button>
          }
          title={t('attendee.cancelTitle')}
          description={t(
            status === 'pending'
              ? 'attendee.cancelHoldDescription'
              : 'attendee.cancelTicketDescription',
          )}
          confirmLabel={t('attendee.confirmCancel')}
          destructive
          onConfirm={() => void cancelOrder()}
        />
      )}
    </>
  )
}
