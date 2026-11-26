import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import type { EventOrderRow, EventResponse } from '@/api/generated/model'
import {
  fetchEventOrders,
  useEventOrders,
  useOrganizerOrderAction,
  type OrderFilters,
} from '@/api/hooks/organizer-operations'
import ConfirmDialog from '@/components/ConfirmDialog'
import DemoBanner from '@/components/DemoBanner'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import InlineAlert from '@/components/InlineAlert'
import ResponsiveTable, { type TableColumn } from '@/components/ResponsiveTable'
import SelectField from '@/components/SelectField'
import StatusBadge from '@/components/StatusBadge'
import TextareaField from '@/components/TextareaField'
import TextField from '@/components/TextField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { downloadCsv, toCsv } from '@/lib/csv'
import { formatRevenue } from '@/lib/event-display'
import { formatEventTime } from '@/lib/format'
import EventSalesSummary from '@/pages/organizer/EventSalesSummary'

const statuses = ['pending', 'confirmed', 'cancelled', 'refunded', 'expired'] as const
const PAGE_SIZE = 20

function RefundOrder({
  order,
  event,
  busy,
  onRefund,
}: {
  order: EventOrderRow
  event: EventResponse
  busy: boolean
  onRefund: (reason: string) => Promise<boolean>
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const sending = useRef(false)
  const submitRef = useRef<HTMLTextAreaElement>(null)
  const clean = reason.trim()

  function changeOpen(open: boolean) {
    if (sending.current) return
    setOpen(open)
    if (open) {
      setReason('')
      setInvalid(false)
      setError(null)
    }
  }

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if (sending.current || busy) return
    const length = Array.from(clean).length
    if (length < 3 || length > 500) {
      setInvalid(true)
      submitRef.current?.focus()
      return
    }
    sending.current = true
    setError(null)
    try {
      if (await onRefund(clean)) setOpen(false)
    } catch (error) {
      setError(error)
    } finally {
      sending.current = false
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy}>
          {t('eventOperations.refundOrder')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto" showCloseButton={!busy}>
        <DialogTitle>{t('eventOperations.refundOrder')}</DialogTitle>
        <DialogDescription>{t('eventOperations.refundWarning')}</DialogDescription>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 type-small wrap-anywhere">
          <dt>{t('eventOperations.event')}</dt>
          <dd>{event.title}</dd>
          <dt>{t('attendee.attendeeName')}</dt>
          <dd>
            {order.buyer_name} · {order.buyer_email}
          </dd>
          <dt>{t('nav.tickets')}</dt>
          <dd>{order.tickets}</dd>
          <dt>{t('eventOperations.amount')}</dt>
          <dd>{formatRevenue(order.total_amount)}</dd>
        </dl>
        <div>
          <p className="type-label">{t('event.refundPolicy')}</p>
          <p className="type-small whitespace-pre-wrap wrap-anywhere">
            {event.refund_policy?.trim() || t('checkout.noRefundPolicy')}
          </p>
        </div>
        <form noValidate className="space-y-3" onSubmit={(event) => void submit(event)}>
          <TextareaField
            ref={submitRef}
            label={t('eventOperations.refundReason')}
            value={reason}
            maxLength={500}
            required
            readOnly={busy}
            error={invalid ? t('eventOperations.reasonLength') : undefined}
            onChange={(event) => {
              setReason(event.target.value)
              setInvalid(false)
            }}
          />
          {error != null && (
            <InlineAlert tone="danger" role="alert">
              {t(errorMessageKey(error))}
            </InlineAlert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => changeOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="destructive" loading={busy}>
              {t('eventOperations.confirmRefund')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function EventOrders({
  event,
  refunded,
}: {
  event: EventResponse
  refunded: boolean
}) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const q = (params.get('q') ?? '').trim().slice(0, 100)
  const [success, setSuccess] = useState<'cancelled' | 'refunded' | null>(null)
  const [cancelError, setCancelError] = useState<unknown>(null)
  const [exportError, setExportError] = useState<unknown>(null)
  const [exporting, setExporting] = useState(false)
  const inFlight = useRef(false)
  const status = refunded ? 'refunded' : statuses.find((value) => value === params.get('status'))
  const rawPage = Number(params.get('page') ?? '1')
  const page =
    Number.isSafeInteger(rawPage) &&
    rawPage > 0 &&
    rawPage <= Math.floor(Number.MAX_SAFE_INTEGER / PAGE_SIZE)
      ? rawPage
      : 1
  const offset = (page - 1) * PAGE_SIZE
  const filters: OrderFilters = { status, q: q || undefined }
  const orders = useEventOrders(event.id, { ...filters, limit: PAGE_SIZE, offset })
  const action = useOrganizerOrderAction()
  const total = orders.data?.total ?? 0
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function setFilter(name: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    if (name !== 'page') next.delete('page')
    setParams(next)
  }

  async function update(id: number, reason?: string) {
    if (inFlight.current) return false
    inFlight.current = true
    setCancelError(null)
    setSuccess(null)
    try {
      await action.mutateAsync({ id, reason })
      setSuccess(reason === undefined ? 'cancelled' : 'refunded')
      return true
    } finally {
      inFlight.current = false
    }
  }

  async function exportCsv() {
    setExportError(null)
    setExporting(true)
    try {
      const rows = await fetchEventOrders(event.id, filters)
      downloadCsv(
        `event-${event.id}-${refunded ? 'refunds' : 'orders'}.csv`,
        toCsv([
          [
            t('eventOperations.order'),
            t('attendee.attendeeName'),
            t('checkout.email'),
            t('eventOperations.status'),
            t('eventOperations.created'),
            t('nav.tickets'),
            t('eventOperations.amount'),
            t('checkout.discount'),
            t('eventOperations.paymentReference'),
            t('eventOperations.refundAmount'),
            t('eventOperations.refundDate'),
            t('eventOperations.refundReason'),
            t('eventOperations.refundReference'),
          ],
          ...rows.map((row) => [
            String(row.id),
            row.buyer_name,
            row.buyer_email,
            row.status,
            row.created_at,
            String(row.tickets),
            String(row.total_amount),
            String(row.discount_amount),
            row.payment_reference ?? '',
            row.refund ? String(row.refund.amount) : '',
            row.refund?.created_at ?? '',
            row.refund?.reason ?? '',
            row.refund?.provider_reference ?? '',
          ]),
        ]),
      )
    } catch (error) {
      setExportError(error)
    } finally {
      setExporting(false)
    }
  }

  const columns: TableColumn<EventOrderRow>[] = [
    {
      id: 'order',
      header: t('eventOperations.order'),
      cell: (row) => (
        <>
          <p className="font-semibold">#{row.id}</p>
          <time className="type-small text-ink-2" dateTime={row.created_at}>
            {formatEventTime(row.created_at)}
          </time>
        </>
      ),
    },
    {
      id: 'buyer',
      header: t('attendee.attendeeName'),
      cell: (row) => (
        <>
          <p>{row.buyer_name}</p>
          <p className="type-small text-ink-2">{row.buyer_email}</p>
        </>
      ),
    },
    {
      id: 'status',
      header: t('eventOperations.status'),
      cell: (row) => <StatusBadge kind="order" status={row.status} size="sm" />,
    },
    {
      id: 'amount',
      header: t('eventOperations.amount'),
      cell: (row) => (
        <>
          <p className="font-semibold">{formatRevenue(row.total_amount)}</p>
          <p className="type-small">{t('eventOperations.ticketCount', { count: row.tickets })}</p>
          {row.discount_amount > 0 && (
            <p className="type-small">
              {t('checkout.discount')} · {formatRevenue(row.discount_amount)}
            </p>
          )}
          {row.processing_fee > 0 && (
            <p className="type-small">
              {t('eventOperations.metrics.processing_fees')} · {formatRevenue(row.processing_fee)}
            </p>
          )}
          {row.promo_code && (
            <p className="type-small">
              {t('checkout.promo')} · {row.promo_code}
            </p>
          )}
          {row.payment_reference && <p className="font-mono type-small">{row.payment_reference}</p>}
        </>
      ),
    },
    {
      id: 'refund',
      header: t('eventOperations.refunds'),
      cell: (row) =>
        row.refund ? (
          <>
            <p className="font-semibold">{formatRevenue(row.refund.amount)}</p>
            <time dateTime={row.refund.created_at} className="type-small">
              {formatEventTime(row.refund.created_at)}
            </time>
            {row.refund.reason && (
              <p className="type-small whitespace-pre-wrap">{row.refund.reason}</p>
            )}
            <p className="font-mono type-small">{row.refund.provider_reference}</p>
          </>
        ) : (
          '—'
        ),
    },
    ...(!refunded
      ? [
          {
            id: 'actions',
            header: t('eventOperations.actions'),
            cell: (row: EventOrderRow) => {
              if (row.status === 'confirmed' && row.total_amount > 0) {
                return (
                  <RefundOrder
                    order={row}
                    event={event}
                    busy={action.isPending}
                    onRefund={(reason) => update(row.id, reason)}
                  />
                )
              }
              if (
                row.status === 'pending' ||
                (row.status === 'confirmed' &&
                  row.total_amount === 0 &&
                  Date.parse(event.end_time) > Date.now())
              ) {
                return (
                  <ConfirmDialog
                    trigger={
                      <Button variant="outline" size="sm" disabled={action.isPending}>
                        {t('attendee.cancelOrder')}
                      </Button>
                    }
                    title={t('attendee.cancelTitle')}
                    description={t(
                      row.status === 'pending'
                        ? 'attendee.cancelHoldDescription'
                        : 'attendee.cancelTicketDescription',
                    )}
                    confirmLabel={t('attendee.confirmCancel')}
                    destructive
                    onConfirm={() => void update(row.id).catch(setCancelError)}
                  />
                )
              }
            },
          },
        ]
      : []),
  ]

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <form
          key={q}
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const search = new FormData(event.currentTarget).get('q')
            setFilter('q', String(search ?? '').trim())
          }}
        >
          <TextField
            label={t('eventOperations.orderSearch')}
            type="search"
            name="q"
            maxLength={100}
            defaultValue={q}
          />
          <Button type="submit" variant="outline">
            {t('eventOperations.search')}
          </Button>
        </form>
        {!refunded && (
          <SelectField
            label={t('eventOperations.status')}
            value={status ?? 'all'}
            onValueChange={(value) => setFilter('status', value === 'all' ? '' : value)}
            options={[
              { value: 'all', label: t('eventOperations.all') },
              ...statuses.map((value) => ({ value, label: t(`status.order.${value}`) })),
            ]}
          />
        )}
        <Button
          variant="outline"
          loading={exporting}
          disabled={!total}
          onClick={() => void exportCsv()}
        >
          {t('eventOperations.export')}
        </Button>
      </div>
      {cancelError != null && (
        <InlineAlert tone="danger" role="alert">
          {t(errorMessageKey(cancelError))}
        </InlineAlert>
      )}
      {exportError != null && (
        <InlineAlert tone="danger" role="alert">
          {t(errorMessageKey(exportError))}
        </InlineAlert>
      )}
      {success && (
        <InlineAlert tone="ok" role="status">
          {t(`attendee.orderMessage.${success}`)}
        </InlineAlert>
      )}
      {orders.isError ? (
        <ErrorState
          title={t('eventOperations.ordersError')}
          description={t(errorMessageKey(orders.error))}
          onRetry={() => void orders.refetch()}
          retrying={orders.isFetching}
        />
      ) : !orders.data ? (
        <p role="status">{t('common.loading')}</p>
      ) : (
        <>
          {refunded && orders.data.items.some((row) => row.is_simulated) && <DemoBanner />}
          {orders.data.items.length ? (
            <ResponsiveTable
              caption={t(refunded ? 'eventOperations.refunds' : 'eventOperations.orders')}
              columns={columns}
              rows={orders.data.items}
              rowKey={(row) => row.id}
            />
          ) : (
            <EmptyState
              title={t(
                q || (!refunded && status) || page > 1
                  ? 'eventOperations.noMatches'
                  : refunded
                    ? 'eventOperations.noRefunds'
                    : 'eventOperations.noOrders',
              )}
            />
          )}
          {(lastPage > 1 || page > 1) && (
            <nav
              aria-label={t('eventOperations.pagination')}
              className="flex flex-wrap items-center gap-3"
            >
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setFilter('page', String(Math.min(page - 1, lastPage)))}
              >
                {t('catalog.previous')}
              </Button>
              <p className="type-small">{t('catalog.pageOf', { page, pages: lastPage })}</p>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= lastPage}
                onClick={() => setFilter('page', String(page + 1))}
              >
                {t('catalog.next')}
              </Button>
            </nav>
          )}
        </>
      )}
      {!refunded && <EventSalesSummary eventId={event.id} />}
    </>
  )
}
