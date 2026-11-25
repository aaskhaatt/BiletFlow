import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Countdown from '@/components/Countdown'
import ImageUpload from '@/components/ImageUpload'
import KpiCard from '@/components/KpiCard'
import ProgressBar from '@/components/ProgressBar'
import ResponsiveTable, { type TableColumn } from '@/components/ResponsiveTable'
import SalesChart from '@/components/SalesChart'
import StatusBadge from '@/components/StatusBadge'
import TicketStub from '@/components/TicketStub'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EVENT_TIME_ZONE, formatEventTime, formatKZT } from '@/lib/format'

const dailySales = [
  { date: '2026-11-20', value: 7 },
  { date: '2026-11-21', value: 16 },
  { date: '2026-11-22', value: 0 },
  { date: '2026-11-23', value: 24 },
  { date: '2026-11-24', value: 19 },
]

const sampleEvents = [
  {
    id: 1,
    title: 'dev.data.concert',
    date: '2026-12-01T19:00:00+05:00',
    status: 'upcoming',
    sold: 152,
    revenue: 760000,
  },
  {
    id: 2,
    title: 'dev.data.workshop',
    date: '2026-12-08T17:30:00+05:00',
    status: 'upcoming',
    sold: 42,
    revenue: 0,
  },
  {
    id: 3,
    title: 'dev.data.exhibition',
    date: '2026-11-21T18:00:00+05:00',
    status: 'completed',
    sold: 88,
    revenue: 176000,
  },
] as const

type SampleEvent = (typeof sampleEvents)[number]

export default function DataDisplaysSection() {
  const { t, i18n } = useTranslation()
  const [expiresAt] = useState(() => new Date(Date.now() + 582_000).toISOString())
  const dateLabel = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    day: 'numeric',
    month: 'short',
    timeZone: EVENT_TIME_ZONE,
  })
  const number = new Intl.NumberFormat(i18n.resolvedLanguage)
  const columns: TableColumn<SampleEvent>[] = [
    { id: 'event', header: t('dev.data.event'), cell: (event) => t(event.title) },
    { id: 'venue', header: t('dev.data.venue'), cell: () => t('dev.data.venueName') },
    { id: 'date', header: t('chart.date'), cell: (event) => formatEventTime(event.date) },
    {
      id: 'status',
      header: t('dev.data.status'),
      cell: (event) => <StatusBadge kind="event" status={event.status} size="sm" />,
    },
    { id: 'sold', header: t('dev.data.sold'), cell: (event) => number.format(event.sold) },
    {
      id: 'revenue',
      header: t('dev.data.revenue'),
      cell: (event) => (event.revenue === 0 ? '—' : formatKZT(event.revenue)),
    },
  ]
  const upcoming = sampleEvents.filter((event) => event.status === 'upcoming')
  const completed = sampleEvents.filter((event) => event.status === 'completed')

  return (
    <section className="min-w-0 space-y-6" aria-labelledby="data-displays-title">
      <h2 id="data-displays-title" className="type-card-title">
        {t('dev.data.title')}
      </h2>
      <Tabs defaultValue="upcoming">
        <TabsList
          variant="line"
          aria-label={t('dev.data.eventList')}
          className="max-w-full flex-wrap group-data-horizontal/tabs:h-auto"
        >
          <TabsTrigger value="upcoming" count={upcoming.length} className="whitespace-normal">
            {t('dev.data.upcoming')}
          </TabsTrigger>
          <TabsTrigger value="completed" count={completed.length} className="whitespace-normal">
            {t('dev.data.completed')}
          </TabsTrigger>
        </TabsList>
        {[
          { value: 'upcoming', rows: upcoming },
          { value: 'completed', rows: completed },
        ].map(({ value, rows }) => (
          <TabsContent key={value} value={value} className="min-w-0">
            <ResponsiveTable
              caption={t(value === 'upcoming' ? 'dev.data.upcoming' : 'dev.data.completed')}
              columns={columns}
              rows={rows}
              rowKey={(event) => event.id}
            />
          </TabsContent>
        ))}
      </Tabs>

      <div className="grid gap-4 sm:grid-cols-2">
        <KpiCard label={t('dev.data.sold')} value={number.format(152)}>
          <ProgressBar label={t('dev.data.capacity')} value={152} max={200} />
        </KpiCard>
        <KpiCard label={t('dev.data.revenue')} value={formatKZT(760000)} />
      </div>

      <TicketStub
        title={t('dev.data.concert')}
        status={<StatusBadge kind="ticket" status="valid" size="sm" />}
        fields={[
          { label: t('chart.date'), value: formatEventTime(sampleEvents[0].date) },
          { label: t('ticket.attendee'), value: t('dev.data.attendee') },
          { label: t('dev.data.venue'), value: t('dev.data.venueName') },
          { label: t('ticket.ticketType'), value: t('ticket.standard') },
        ]}
        code="BF-XXXX-XXXX"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-line bg-surface p-4">
          <h3 className="type-label">{t('dev.data.reservation')}</h3>
          <Countdown expiresAt={expiresAt} />
        </div>
        <div className="space-y-2 rounded-lg border border-line bg-surface p-4">
          <h3 className="type-label">{t('dev.data.expiredReservation')}</h3>
          <Countdown expiresAt="2026-11-20T15:00:00+05:00" />
        </div>
      </div>
      <div className="max-w-lg rounded-lg border border-line bg-surface p-4">
        <ImageUpload onUpload={() => Promise.resolve()} />
      </div>
      <SalesChart
        title={t('dev.data.dailySales')}
        points={dailySales.map((point) => ({
          ...point,
          label: dateLabel.format(new Date(point.date + 'T12:00:00+05:00')),
        }))}
      />
    </section>
  )
}
