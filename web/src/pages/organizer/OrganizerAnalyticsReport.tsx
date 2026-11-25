import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type {
  CampaignAnalytics,
  EventAnalyticsResponse,
  EventResponse,
  TicketTypeAnalytics,
} from '@/api/generated/model'
import DemoBanner from '@/components/DemoBanner'
import EmptyState from '@/components/EmptyState'
import KpiCard from '@/components/KpiCard'
import ResponsiveTable, { type TableColumn } from '@/components/ResponsiveTable'
import SalesChart from '@/components/SalesChart'
import { formatRevenue } from '@/lib/event-display'
import { EVENT_UTC_OFFSET } from '@/lib/event-time'
import { formatEventDay } from '@/lib/format'

const moneyMetrics = ['gross', 'discounts', 'refunds', 'net'] as const

export default function OrganizerAnalyticsReport({
  data,
  event,
  hasPeriod,
  hasTicketType,
}: {
  data: EventAnalyticsResponse
  event: EventResponse
  hasPeriod: boolean
  hasTicketType: boolean
}) {
  const { t, i18n } = useTranslation()
  const [now] = useState(() => Date.now())
  const number = new Intl.NumberFormat(i18n.resolvedLanguage)
  const percentage = new Intl.NumberFormat(i18n.resolvedLanguage, {
    style: 'percent',
    maximumFractionDigits: 1,
  })
  const capacity = data.capacity
  const checkIn = data.check_in
  const beforeEvent = Date.parse(event.start_time) > now
  const eventFinished = Date.parse(event.end_time) <= now
  const sold = number.format(capacity.sold)
  const dash = '—'
  const columns: TableColumn<TicketTypeAnalytics>[] = [
    { id: 'name', header: t('organizerAnalytics.ticketType'), cell: (row) => row.name },
    {
      id: 'sold',
      header: t('eventOperations.metrics.sold'),
      cell: (row) => number.format(row.sold),
    },
    {
      id: 'revenue',
      header: t('organizerAnalytics.revenue'),
      cell: (row) => formatRevenue(row.revenue),
    },
    {
      id: 'held',
      header: t('eventOperations.metrics.reserved'),
      cell: (row) => number.format(row.held),
    },
    {
      id: 'checked_in',
      header: t('eventOperations.metrics.checked_in'),
      cell: (row) => number.format(row.checked_in),
    },
  ]
  const campaignColumns: TableColumn<CampaignAnalytics>[] = [
    {
      id: 'campaign',
      header: t('organizerCampaigns.table.campaign'),
      cell: (row) => (
        <Link
          className="text-brand underline underline-offset-4"
          to={`/organizer/campaigns/${row.campaign_id}`}
        >
          {row.name}
        </Link>
      ),
    },
    { id: 'code', header: t('organizerCampaigns.form.code'), cell: (row) => row.code },
    {
      id: 'orders',
      header: t('organizerAnalytics.campaignOrders'),
      cell: (row) => number.format(row.orders),
    },
    {
      id: 'tickets',
      header: t('organizerCampaigns.results.tickets'),
      cell: (row) => number.format(row.tickets),
    },
    {
      id: 'gross',
      header: t('organizerAnalytics.revenue'),
      cell: (row) => formatRevenue(row.gross),
    },
    {
      id: 'discount',
      header: t('organizerCampaigns.results.discounts'),
      cell: (row) => formatRevenue(row.discount),
    },
    {
      id: 'opens',
      header: t('organizerCampaigns.results.opens'),
      cell: (row) => number.format(row.link_opens),
    },
  ]

  return (
    <>
      {data.is_simulated && <DemoBanner />}
      <section className="space-y-3" aria-labelledby="analytics-summary">
        <h2 id="analytics-summary" className="type-card-title">
          {t('organizerAnalytics.summary')}
        </h2>
        {(hasPeriod || hasTicketType) && (
          <div className="type-small text-ink-2">
            {hasPeriod && <p>{t('organizerAnalytics.periodScope')}</p>}
            {hasTicketType && <p>{t('organizerAnalytics.moneyScope')}</p>}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard
            label={t('organizerAnalytics.soldCapacity')}
            value={
              capacity.capacity === null ? sold : `${sold} / ${number.format(capacity.capacity)}`
            }
          />
          <KpiCard
            label={t('organizerAnalytics.remaining')}
            value={capacity.remaining === null ? dash : number.format(capacity.remaining)}
          />
          {moneyMetrics.map((key) => (
            <KpiCard
              key={key}
              label={t(`organizerAnalytics.money.${key}`)}
              value={formatRevenue(data.money[key])}
            />
          ))}
        </div>
      </section>
      {data.sales_over_time.length ? (
        <SalesChart
          title={t('organizerAnalytics.daily')}
          points={data.sales_over_time.map((row) => ({
            date: row.date,
            label: formatEventDay(`${row.date}T00:00:00${EVENT_UTC_OFFSET}`),
            value: row.tickets,
          }))}
        />
      ) : (
        <EmptyState title={t('organizerAnalytics.noSales')} />
      )}
      <section className="space-y-3" aria-labelledby="analytics-ticket-types">
        <h2 id="analytics-ticket-types" className="type-card-title">
          {t('organizerAnalytics.byType')}
        </h2>
        {data.ticket_types.length ? (
          <ResponsiveTable
            caption={t('organizerAnalytics.byType')}
            rows={data.ticket_types}
            columns={columns}
            rowKey={(row) => row.ticket_type_id}
          />
        ) : (
          <EmptyState title={t('ticketTypes.empty')} />
        )}
      </section>
      <section className="space-y-3" aria-labelledby="analytics-attendance">
        <h2 id="analytics-attendance" className="type-card-title">
          {t('organizerAnalytics.attendance')}
        </h2>
        {beforeEvent && (
          <p className="type-small text-ink-2">{t('organizerAnalytics.attendanceUpcoming')}</p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiCard
            label={t('eventOperations.metrics.checked_in')}
            value={number.format(checkIn.checked_in)}
          />
          <KpiCard
            label={t(
              eventFinished ? 'organizerAnalytics.absent' : 'organizerAnalytics.notCheckedIn',
            )}
            value={beforeEvent ? dash : number.format(checkIn.absent)}
          />
          <KpiCard
            label={t('organizerAnalytics.attendanceRate')}
            value={
              beforeEvent || checkIn.percent === null
                ? dash
                : percentage.format(checkIn.percent / 100)
            }
          />
        </div>
      </section>
      <section className="space-y-3" aria-labelledby="analytics-campaigns">
        <h2 id="analytics-campaigns" className="type-card-title">
          {t('organizerAnalytics.campaigns')}
        </h2>
        {data.campaigns.length ? (
          <>
            {hasTicketType && (
              <p className="type-small text-ink-2">{t('organizerAnalytics.campaignTicketScope')}</p>
            )}
            {hasPeriod && (
              <p className="type-small text-ink-2">{t('organizerAnalytics.campaignOpensScope')}</p>
            )}
            <ResponsiveTable
              caption={t('organizerAnalytics.campaigns')}
              rows={data.campaigns}
              columns={campaignColumns}
              rowKey={(row) => row.campaign_id}
            />
          </>
        ) : (
          <EmptyState title={t('organizerCampaigns.empty.filteredTitle')} />
        )}
      </section>
    </>
  )
}
