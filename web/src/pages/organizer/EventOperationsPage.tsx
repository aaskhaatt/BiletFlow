import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, useParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import { isApiError } from '@/api/errors'
import type { EventResponse } from '@/api/generated/model'
import { useManagedEvent } from '@/api/hooks/organizer-events'
import ErrorState from '@/components/ErrorState'
import StatusBadge from '@/components/StatusBadge'
import { formatEventSpan } from '@/lib/event-display'
import { parseEventId } from '@/pages/events/availability'
import { EventSections } from '@/pages/organizer/EventPage'
import EventAttendees from '@/pages/organizer/EventAttendees'
import EventOrders from '@/pages/organizer/EventOrders'
import EventStaff from '@/pages/organizer/EventStaff'
import OrganizerPage from '@/pages/organizer/OrganizerPage'
import NotFoundPage from '@/pages/NotFoundPage'

const sections = ['attendees', 'orders', 'refunds'] as const
type Section = (typeof sections)[number] | 'staff'

function OperationTabs({ eventId }: { eventId: number }) {
  const { t } = useTranslation()
  return (
    <nav
      aria-label={t('eventOperations.tabs')}
      className="flex flex-wrap gap-2 border-b border-line"
    >
      {sections.map((section) => (
        <NavLink
          key={section}
          to={`/organizer/events/${eventId}/${section}`}
          className="inline-flex min-h-11 items-center border-b-2 border-transparent px-3 type-label text-ink-2 hover:text-ink aria-[current=page]:border-brand aria-[current=page]:text-ink"
        >
          {t(`eventOperations.${section}`)}
        </NavLink>
      ))}
    </nav>
  )
}

function OperationContent({ event, section }: { event: EventResponse; section: Section }) {
  if (section === 'attendees') return <EventAttendees event={event} />
  if (section === 'staff') return <EventStaff event={event} />
  return <EventOrders event={event} refunded={section === 'refunds'} />
}

export default function EventOperationsPage({ section }: { section: Section }) {
  const eventId = parseEventId(useParams().eventId)
  return eventId === null ? (
    <NotFoundPage />
  ) : (
    <OperationRoute key={eventId + section} eventId={eventId} section={section} />
  )
}

function OperationRoute({ eventId, section }: { eventId: number; section: Section }) {
  const { t } = useTranslation()
  const event = useManagedEvent(eventId)
  const base = `/organizer/events/${eventId}`
  const title = t(`eventOperations.${section}`)
  let content: ReactNode = <p role="status">{t('common.loading')}</p>
  if (event.isError) {
    if (isApiError(event.error) && event.error.status === 404) return <NotFoundPage />
    content = (
      <ErrorState
        title={t('routeError.title')}
        description={t(errorMessageKey(event.error))}
        onRetry={() => void event.refetch()}
        retrying={event.isFetching}
      />
    )
  } else if (event.data) {
    content = (
      <>
        <EventSections eventId={eventId} current={section === 'staff' ? 'staff' : 'attendees'} />
        {section !== 'staff' && <OperationTabs eventId={eventId} />}
        <OperationContent event={event.data} section={section} />
      </>
    )
  }

  return (
    <OrganizerPage
      routeId={`organizer-event-${section}`}
      title={title}
      breadcrumb={[
        { label: t('organizerEvents.title'), to: '/organizer' },
        ...(event.data ? [{ label: event.data.title, to: base }] : []),
        { label: title },
      ]}
      meta={
        event.data && (
          <div className="flex flex-wrap items-center gap-2 type-small text-ink-2">
            <StatusBadge kind="event" status={event.data.lifecycle} size="sm" />
            <span>{formatEventSpan(event.data.start_time, event.data.end_time)}</span>
          </div>
        )
      }
    >
      {content}
    </OrganizerPage>
  )
}
