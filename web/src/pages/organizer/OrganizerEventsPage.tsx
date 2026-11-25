import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import type { EventResponse, OrganizerEventSummary } from '@/api/generated/model'
import { useMyEvents, useMyEventSummaries } from '@/api/hooks/organizer-events'
import { isOpenSupportCase, useSupportInbox } from '@/api/hooks/support'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import InlineAlert from '@/components/InlineAlert'
import KpiCard from '@/components/KpiCard'
import ProgressBar from '@/components/ProgressBar'
import ResponsiveTable, { type TableColumn } from '@/components/ResponsiveTable'
import Skeleton from '@/components/Skeleton'
import StatusBadge from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDateShort, formatRevenue } from '@/lib/event-display'
import OrganizerPage from '@/pages/organizer/OrganizerPage'
import PaidSalesBanner from '@/pages/organizer/PaidSalesBanner'

const TABS = ['upcoming', 'active', 'completed', 'cancelled'] as const
type Tab = (typeof TABS)[number]

const DAY_MS = 24 * 60 * 60 * 1000

type Row = { event: EventResponse; summary: OrganizerEventSummary | undefined }

const byStart = (a: Row, b: Row) => Date.parse(a.event.start_time) - Date.parse(b.event.start_time)

/** Upcoming and running events: the soonest first. Past ones: the latest first. */
function sortedFor(tab: Tab, rows: Row[]): Row[] {
  const ordered = [...rows].sort(byStart)
  return tab === 'upcoming' || tab === 'active' ? ordered : ordered.reverse()
}

function SalesCell({ row }: { row: Row }) {
  const { t, i18n } = useTranslation()
  const { event, summary } = row
  if (!summary || event.lifecycle === 'draft') return <span aria-label="—">—</span>
  if (!summary.capacity) {
    return (
      <p className="type-label tabular-nums">
        {t('organizerEvents.table.sold', {
          count: new Intl.NumberFormat(i18n.resolvedLanguage).format(summary.tickets_sold),
        })}
      </p>
    )
  }
  return (
    <ProgressBar
      label={t('organizerEvents.table.sales')}
      value={summary.tickets_sold}
      max={summary.capacity}
    />
  )
}

function EventsTable({ rows, caption }: { rows: Row[]; caption: string }) {
  const { t } = useTranslation()

  const columns: TableColumn<Row>[] = [
    {
      id: 'event',
      header: t('organizerEvents.table.event'),
      cell: ({ event }) => (
        <div className="min-w-0 space-y-0.5">
          <Link
            to={`/organizer/events/${event.id}`}
            className="type-body font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {event.title}
          </Link>
          <p className="type-small text-ink-muted">
            {[
              event.venue_name || t('organizerEvents.table.noVenue'),
              t(`visibility.${visibilityOf(event)}`),
            ].join(' · ')}
          </p>
        </div>
      ),
    },
    {
      id: 'date',
      header: t('organizerEvents.table.date'),
      cell: ({ event }) => <span className="type-body">{formatDateShort(event.start_time)}</span>,
    },
    {
      id: 'status',
      header: t('organizerEvents.table.status'),
      cell: ({ event }) => <StatusBadge kind="event" status={event.lifecycle} size="sm" />,
    },
    {
      id: 'sales',
      header: t('organizerEvents.table.sales'),
      cell: (row) => <SalesCell row={row} />,
    },
    {
      id: 'revenue',
      header: t('organizerEvents.table.revenue'),
      cell: ({ event, summary }) =>
        summary && event.lifecycle !== 'draft' && summary.revenue > 0 ? (
          <span className="type-body font-medium tabular-nums">
            {formatRevenue(summary.revenue)}
          </span>
        ) : (
          <span className="type-body text-ink-muted">—</span>
        ),
    },
    {
      id: 'open',
      header: t('organizerEvents.table.actions'),
      cell: ({ event }) => (
        <Link
          to={`/organizer/events/${event.id}`}
          className="type-label text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {t('organizerEvents.table.open')} <span className="sr-only">{event.title}</span>
        </Link>
      ),
    },
  ]

  return (
    <ResponsiveTable
      caption={caption}
      columns={columns}
      rows={rows}
      rowKey={({ event }) => event.id}
    />
  )
}

function visibilityOf(event: EventResponse): 'public' | 'unlisted' | 'private' {
  return event.visibility === 'unlisted' || event.visibility === 'private'
    ? event.visibility
    : 'public'
}

function Kpis({ summaries }: { summaries: OrganizerEventSummary[] | undefined }) {
  const { t, i18n } = useTranslation()
  const inbox = useSupportInbox()
  const [now] = useState(() => Date.now())
  const number = new Intl.NumberFormat(i18n.resolvedLanguage)

  const sold = summaries?.reduce((sum, event) => sum + event.tickets_sold, 0)
  const revenue = summaries?.reduce((sum, event) => sum + event.revenue, 0)
  const open = inbox.data?.filter(isOpenSupportCase)
  const overdue = open?.filter((item) => now - Date.parse(item.updated_at) > DAY_MS).length

  return (
    <div className="grid gap-4 md:grid-cols-3" data-slot="events-kpi">
      <KpiCard
        label={t('organizerEvents.kpi.sold')}
        value={sold === undefined ? '—' : number.format(sold)}
      >
        <p className="type-small text-ink-2">{t('organizerEvents.kpi.soldHint')}</p>
      </KpiCard>
      <KpiCard
        label={t('organizerEvents.kpi.revenue')}
        value={revenue === undefined ? '—' : formatRevenue(revenue)}
      >
        <p className="type-small text-ink-2">{t('organizerEvents.kpi.revenueHint')}</p>
      </KpiCard>
      <KpiCard
        label={t('organizerEvents.kpi.support')}
        value={open === undefined ? '—' : number.format(open.length)}
      >
        {overdue !== undefined && (
          <p className="type-small text-ink-2">
            {overdue > 0
              ? t('organizerEvents.kpi.supportOverdue', { count: overdue })
              : t('organizerEvents.kpi.supportNoOverdue')}
          </p>
        )}
      </KpiCard>
    </div>
  )
}

function ListSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" className="space-y-4">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  )
}

export default function OrganizerEventsPage() {
  const { t } = useTranslation()
  const events = useMyEvents()
  const summaries = useMyEventSummaries()
  const [selected, setSelected] = useState<Tab>()

  const create = (
    <Button asChild>
      <Link to="/organizer/events/new">{t('organizerEvents.create')}</Link>
    </Button>
  )

  let content
  if (events.isError) {
    content = (
      <ErrorState
        title={t('routeError.title')}
        description={t(errorMessageKey(events.error))}
        onRetry={() => void events.refetch()}
        retrying={events.isFetching}
      />
    )
  } else if (!events.data) {
    content = <ListSkeleton />
  } else if (events.data.length === 0) {
    content = (
      <div className="space-y-4">
        <EmptyState
          icon="calendar"
          title={t('organizerEvents.empty.title')}
          description={t('organizerEvents.empty.description')}
        />
        <div className="flex justify-center">{create}</div>
      </div>
    )
  } else {
    const numbers = new Map(summaries.data?.map((summary) => [summary.event_id, summary]))
    const rows: Row[] = events.data.map((event) => ({ event, summary: numbers.get(event.id) }))
    const inTab = (tab: Tab) => rows.filter((row) => row.event.lifecycle === tab)
    const drafts = rows.filter((row) => row.event.lifecycle === 'draft')
    const current = selected ?? TABS.find((tab) => inTab(tab).length > 0) ?? 'upcoming'

    content = (
      <>
        {summaries.isError && (
          <InlineAlert tone="warn" role="alert">
            {t('organizerEvents.summaryFailed')}{' '}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => void summaries.refetch()}
            >
              {t('common.retry')}
            </Button>
          </InlineAlert>
        )}
        {summaries.data && <PaidSalesBanner summaries={summaries.data} />}
        <Kpis summaries={summaries.data} />
        <section className="overflow-hidden rounded-lg border border-line bg-surface">
          <Tabs value={current} onValueChange={(value) => setSelected(value as Tab)}>
            <TabsList
              variant="line"
              aria-label={t('organizerEvents.tabs.label')}
              className="h-auto w-full justify-start overflow-x-auto border-b border-line px-4 pt-3 pb-1.5"
            >
              {TABS.map((tab) => (
                <TabsTrigger key={tab} value={tab} count={inTab(tab).length} className="flex-none">
                  {t(`organizerEvents.tabs.${tab}`)}
                </TabsTrigger>
              ))}
            </TabsList>
            {TABS.map((tab) => (
              <TabsContent key={tab} value={tab}>
                {inTab(tab).length > 0 ? (
                  <EventsTable
                    rows={sortedFor(tab, inTab(tab))}
                    caption={t(`organizerEvents.tabs.${tab}`)}
                  />
                ) : (
                  <p className="p-6 text-center text-ink-2">{t('organizerEvents.empty.tab')}</p>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </section>
        {drafts.length > 0 && (
          <section aria-labelledby="drafts-title" className="space-y-3">
            <div>
              <h2 id="drafts-title" className="type-card-title">
                {t('organizerEvents.drafts.title')} · {drafts.length}
              </h2>
              <p className="type-small text-ink-muted">{t('organizerEvents.drafts.description')}</p>
            </div>
            <div className="overflow-hidden rounded-lg border border-line bg-surface">
              <EventsTable
                rows={sortedFor('completed', drafts)}
                caption={t('organizerEvents.drafts.title')}
              />
            </div>
          </section>
        )}
      </>
    )
  }

  return (
    <OrganizerPage routeId="organizer-events" title={t('organizerEvents.title')} actions={create}>
      {content}
    </OrganizerPage>
  )
}
