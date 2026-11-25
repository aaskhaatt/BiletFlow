import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/api/error-codes'
import type { TicketTypeSales } from '@/api/generated/model'
import { useEventSales } from '@/api/hooks/organizer-operations'
import DemoBanner from '@/components/DemoBanner'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import ResponsiveTable, { type TableColumn } from '@/components/ResponsiveTable'
import { formatRevenue } from '@/lib/event-display'
import { formatKZT } from '@/lib/format'

const amounts = [
  'gross_sales',
  'discounts',
  'processing_fees',
  'refunds',
  'estimated_payout',
] as const
const counts = ['sold', 'reserved', 'available', 'refunded', 'checked_in'] as const

export default function EventSalesSummary({ eventId }: { eventId: number }) {
  const { t, i18n } = useTranslation()
  const sales = useEventSales(eventId)
  const number = new Intl.NumberFormat(i18n.resolvedLanguage)
  const columns: TableColumn<TicketTypeSales>[] = [
    { id: 'name', header: t('attendee.ticketType'), cell: (row) => row.name },
    { id: 'price', header: t('eventOperations.amount'), cell: (row) => formatKZT(row.price) },
    ...counts.map((id) => ({
      id,
      header: t(`eventOperations.metrics.${id}`),
      cell: (row: TicketTypeSales) => number.format(row[id]),
    })),
  ]
  return (
    <section
      aria-labelledby="sales-summary"
      className="min-w-0 space-y-4 rounded-lg border border-line bg-surface p-4"
    >
      <h2 id="sales-summary" className="type-card-title">
        {t('eventOperations.sales')}
      </h2>
      {sales.isError ? (
        <ErrorState
          title={t('eventOperations.statsError')}
          description={t(errorMessageKey(sales.error))}
          onRetry={() => void sales.refetch()}
          retrying={sales.isFetching}
          heading="h3"
        />
      ) : !sales.data ? (
        <p role="status">{t('common.loading')}</p>
      ) : (
        <>
          {sales.data.is_simulated && <DemoBanner />}
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {amounts.map((id) => (
              <div key={id}>
                <dt className="type-small text-ink-2">{t(`eventOperations.metrics.${id}`)}</dt>
                <dd className="type-label">{formatRevenue(sales.data[id])}</dd>
              </div>
            ))}
            <div>
              <dt className="type-small text-ink-2">{t('eventOperations.metrics.paid_orders')}</dt>
              <dd className="type-label">{number.format(sales.data.paid_orders)}</dd>
            </div>
          </dl>
          {sales.data.ticket_types.length ? (
            <ResponsiveTable
              caption={t('eventOperations.sales')}
              rows={sales.data.ticket_types}
              columns={columns}
              rowKey={(row) => row.ticket_type_id}
            />
          ) : (
            <EmptyState title={t('ticketTypes.empty')} />
          )}
        </>
      )}
    </section>
  )
}
