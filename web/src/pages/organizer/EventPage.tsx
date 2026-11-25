import { cn } from 'cn'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, useParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import type { EventResponse, OrganizerEventSummary } from '@/api/generated/model'
import {
  useManagedEvent,
  useMyEventSummaries,
  usePublishEvent,
  useUnpublishEvent,
} from '@/api/hooks/organizer-events'
import { useCheckInStats } from '@/api/hooks/organizer-event-stats'
import ConfirmDialog from '@/components/ConfirmDialog'
import ErrorState from '@/components/ErrorState'
import InlineAlert from '@/components/InlineAlert'
import KpiCard from '@/components/KpiCard'
import Skeleton from '@/components/Skeleton'
import StatusBadge from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatEventSpan, formatMoment, formatRevenue } from '@/lib/event-display'
import { isEditable, missingForPublish } from '@/lib/event-state'
import CancelEventDialog from '@/pages/organizer/CancelEventDialog'
import DuplicateEventDialog from '@/pages/organizer/DuplicateEventDialog'
import OrganizerPage from '@/pages/organizer/OrganizerPage'
import PaidSalesCard from '@/pages/organizer/PaidSalesCard'
import TicketTypesCard from '@/pages/organizer/TicketTypesCard'
import NotFoundPage from '@/pages/NotFoundPage'

const SECTIONS = [
  { id: 'overview', path: '' },
  { id: 'attendees', path: '/attendees' },
  { id: 'analytics', to: (id: number) => `/organizer/analytics?event=${id}` },
  { id: 'history', path: '/history' },
  { id: 'campaigns', to: (id: number) => `/organizer/campaigns?event=${id}` },
  { id: 'staff', path: '/staff' },
] as const

/** The sections of one event (Figma "Разделы события"): this page and the pages around it. */
export function EventSections({ eventId, current }: { eventId: number; current: string }) {
  const { t } = useTranslation()
  const base = `/organizer/events/${eventId}`

  return (
    <nav aria-label={t('organizerEvent.tabs.label')} className="border-b border-line">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {SECTIONS.map((section) => {
          const to = 'to' in section ? section.to(eventId) : base + section.path
          const active = section.id === current
          return (
            <li key={section.id}>
              <NavLink
                to={to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center border-b-2 px-3.5 type-body whitespace-nowrap focus-visible:outline-2 focus-visible:outline-brand',
                  active
                    ? 'border-brand font-semibold text-ink'
                    : 'border-transparent text-ink-2 hover:text-ink',
                )}
              >
                {t(`organizerEvent.tabs.${section.id}`)}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function ThinBar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <progress
      aria-label={label}
      value={Math.min(value, max)}
      max={max || 1}
      className="block h-1.5 w-full overflow-hidden rounded-full border-0 bg-line-soft accent-brand [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-line-soft [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-brand"
    />
  )
}

function Kpis({
  event,
  summary,
}: {
  event: EventResponse
  summary: OrganizerEventSummary | undefined
}) {
  const { t, i18n } = useTranslation()
  const stats = useCheckInStats(event.id)
  const number = new Intl.NumberFormat(i18n.resolvedLanguage)
  const percent = new Intl.NumberFormat(i18n.resolvedLanguage, { style: 'percent' })

  const sold = summary?.tickets_sold
  const capacity = event.capacity ?? undefined

  return (
    <div className="grid gap-4 md:grid-cols-3" data-slot="event-kpi">
      <KpiCard
        label={t('organizerEvent.kpi.capacity')}
        value={
          sold === undefined
            ? '—'
            : capacity
              ? `${number.format(sold)} / ${number.format(capacity)}`
              : number.format(sold)
        }
      >
        {sold !== undefined && capacity ? (
          <>
            <ThinBar label={t('organizerEvent.kpi.capacity')} value={sold} max={capacity} />
            <p className="type-small text-ink-2">
              {t('organizerEvent.kpi.filled', {
                percent: percent.format(Math.min(1, sold / capacity)),
              })}
            </p>
          </>
        ) : (
          <p className="type-small text-ink-2">{t('organizerEvent.kpi.noCapacity')}</p>
        )}
      </KpiCard>
      <KpiCard
        label={t('organizerEvent.kpi.revenue')}
        value={summary ? formatRevenue(summary.revenue) : '—'}
      >
        <p className="type-small text-ink-2">
          {summary && summary.revenue === 0 && summary.paid_sales_status !== 'active'
            ? t('organizerEvent.kpi.revenueInactive')
            : t('organizerEvent.kpi.revenueHint')}
        </p>
      </KpiCard>
      <KpiCard
        label={t('organizerEvent.kpi.checkedIn')}
        value={
          stats.data
            ? `${number.format(stats.data.checked_in)} / ${number.format(stats.data.registered)}`
            : '—'
        }
      >
        {event.lifecycle === 'upcoming' && (
          <p className="type-small text-ink-2">{t('organizerEvent.kpi.checkedInSoon')}</p>
        )}
      </KpiCard>
    </div>
  )
}

function MetaLine({ event }: { event: EventResponse }) {
  const { t } = useTranslation()
  if (event.lifecycle === 'draft') return <>{t('organizerEvent.meta.draft')}</>

  const visibility =
    event.visibility === 'unlisted' || event.visibility === 'private' ? event.visibility : 'public'
  const when = formatEventSpan(event.start_time, event.end_time)
  const parts = [
    event.lifecycle === 'cancelled' ? t('organizerEvent.meta.was', { when }) : when,
    event.venue_name,
    t(`visibility.${visibility}`),
  ].filter(Boolean)
  return <>{parts.join(' · ')}</>
}

function Hint({ event, blockedUnpublish }: { event: EventResponse; blockedUnpublish: boolean }) {
  const { t } = useTranslation()
  const lifecycle = ['draft', 'upcoming', 'active', 'completed', 'cancelled'].includes(
    event.lifecycle,
  )
    ? (event.lifecycle as 'draft' | 'upcoming' | 'active' | 'completed' | 'cancelled')
    : 'upcoming'
  const text =
    lifecycle === 'cancelled'
      ? event.cancelled_at
        ? t('organizerEvent.hint.cancelled', { when: formatMoment(event.cancelled_at) })
        : t('organizerEvent.hint.cancelledNoDate')
      : t(`organizerEvent.hint.${lifecycle}`)

  return (
    <p className="type-small text-ink-2">
      {text}
      {blockedUnpublish && ` ${t('organizerEvent.unpublish.blocked')}`}
    </p>
  )
}

function PublishPanel({
  event,
  ticketTypesMissing,
}: {
  event: EventResponse
  ticketTypesMissing: boolean
}) {
  const { t } = useTranslation()
  const missing = missingForPublish(event)
  if (missing.length === 0 && !ticketTypesMissing) return null

  return (
    <InlineAlert tone={missing.length > 0 ? 'warn' : 'info'}>
      {missing.length > 0 && (
        <div className="space-y-1" data-slot="publish-requirements">
          <p className="font-semibold">{t('organizerEvent.publish.missingTitle')}</p>
          <ul className="list-disc pl-5">
            {missing.map((item) => (
              <li key={item}>{t(`organizerEvent.publish.missing.${item}`)}</li>
            ))}
          </ul>
          <Link
            to={`/organizer/events/${event.id}/edit`}
            className="inline-block font-semibold underline"
          >
            {t('organizerEvent.publish.fill')}
          </Link>
        </div>
      )}
      {ticketTypesMissing && <p>{t('organizerEvent.publish.noTicketTypes')}</p>}
    </InlineAlert>
  )
}

function Overview({
  event,
  summary,
}: {
  event: EventResponse
  summary: OrganizerEventSummary | undefined
}) {
  const { t } = useTranslation()
  const publish = usePublishEvent()
  const unpublish = useUnpublishEvent()
  const [error, setError] = useState<unknown>()
  const lifecycle = event.lifecycle
  const missing = missingForPublish(event)
  const live = lifecycle === 'upcoming' || lifecycle === 'active'
  const blockedUnpublish = live && (summary?.tickets_sold ?? 0) > 0
  const done = lifecycle === 'completed' || lifecycle === 'cancelled'

  async function run(action: () => Promise<unknown>) {
    setError(undefined)
    try {
      await action()
    } catch (failure) {
      setError(failure)
    }
  }

  const actions = (
    <>
      <Button asChild variant="outline" size="sm">
        <Link to={`/organizer/events/${event.id}/preview`}>
          {t('organizerEvent.actions.preview')}
        </Link>
      </Button>
      {isEditable(event) && (
        <Button asChild variant="outline" size="sm">
          <Link to={`/organizer/events/${event.id}/edit`}>{t('organizerEvent.actions.edit')}</Link>
        </Button>
      )}
      {lifecycle === 'draft' && (
        <Button
          type="button"
          size="sm"
          disabled={missing.length > 0}
          loading={publish.isPending}
          onClick={() => void run(() => publish.mutateAsync({ eventId: event.id }))}
        >
          {t('organizerEvent.actions.publish')}
        </Button>
      )}
      {live && (
        <ConfirmDialog
          trigger={
            <Button type="button" variant="outline" size="sm" disabled={blockedUnpublish}>
              {t('organizerEvent.actions.unpublish')}
            </Button>
          }
          title={t('organizerEvent.unpublish.title')}
          description={t('organizerEvent.unpublish.description')}
          confirmLabel={t('organizerEvent.unpublish.confirm')}
          onConfirm={() => void run(() => unpublish.mutateAsync({ eventId: event.id }))}
        />
      )}
      {(lifecycle === 'draft' || live) && <CancelEventDialog event={event} />}
      {done && (
        <DuplicateEventDialog
          event={event}
          trigger={
            <Button type="button" variant="outline" size="sm">
              {t('organizerEvent.actions.duplicate')}
            </Button>
          }
        />
      )}
    </>
  )

  return (
    <OrganizerPage
      routeId="organizer-event"
      breadcrumb={[{ label: t('organizerEvents.title'), to: '/organizer' }, { label: event.title }]}
      title={event.title}
      meta={
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <StatusBadge kind="event" status={lifecycle} />
            <p className="type-label font-normal text-ink-2">
              <MetaLine event={event} />
            </p>
          </div>
          <Hint event={event} blockedUnpublish={blockedUnpublish} />
        </>
      }
      actions={actions}
    >
      <EventSections eventId={event.id} current="overview" />
      {event.suspended_at && (
        <InlineAlert tone="danger">
          <p className="font-semibold">{t('organizerEvent.meta.suspended')}</p>
          {event.suspension_reason && <p>{event.suspension_reason}</p>}
        </InlineAlert>
      )}
      {error !== undefined && (
        <InlineAlert tone="danger" role="alert">
          {t(errorMessageKey(error))}
        </InlineAlert>
      )}
      {lifecycle === 'draft' && <PublishPanel event={event} ticketTypesMissing={false} />}
      <Kpis event={event} summary={summary} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22.5rem]">
        <TicketTypesCard event={event} />
        <PaidSalesCard eventId={event.id} locked={done} />
      </div>
    </OrganizerPage>
  )
}

export default function EventPage() {
  const { t } = useTranslation()
  const eventId = Number(useParams().eventId)
  const valid = Number.isInteger(eventId) && eventId > 0
  const event = useManagedEvent(eventId, { enabled: valid })
  const summaries = useMyEventSummaries()

  if (!valid) return <NotFoundPage />
  if (event.isError) {
    return (
      <OrganizerPage
        routeId="organizer-event"
        breadcrumb={[{ label: t('organizerEvents.title'), to: '/organizer' }]}
        title={t('routeError.title')}
      >
        <ErrorState
          title={t('routeError.title')}
          description={t(errorMessageKey(event.error))}
          onRetry={() => void event.refetch()}
          retrying={event.isFetching}
        />
      </OrganizerPage>
    )
  }
  if (!event.data) {
    return (
      <OrganizerPage
        routeId="organizer-event"
        breadcrumb={[{ label: t('organizerEvents.title'), to: '/organizer' }]}
        title={<Skeleton className="h-9 w-72" />}
      >
        <div role="status">
          <span className="sr-only">{t('common.loading')}</span>
          <Skeleton className="h-40 rounded-lg" />
        </div>
      </OrganizerPage>
    )
  }

  const summary = summaries.data?.find((item) => item.event_id === event.data.id)
  return <Overview event={event.data} summary={summary} />
}
