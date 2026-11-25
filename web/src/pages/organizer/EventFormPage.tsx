import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import { useManagedEvent } from '@/api/hooks/organizer-events'
import ErrorState from '@/components/ErrorState'
import InlineAlert from '@/components/InlineAlert'
import Skeleton from '@/components/Skeleton'
import StatusBadge from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { isEditable } from '@/lib/event-state'
import DuplicateEventDialog from '@/pages/organizer/DuplicateEventDialog'
import EventForm from '@/pages/organizer/EventForm'
import OrganizerPage from '@/pages/organizer/OrganizerPage'
import NotFoundPage from '@/pages/NotFoundPage'

/** /organizer/events/new */
export function NewEventPage() {
  return <EventForm />
}

/** /organizer/events/:eventId/edit */
export function EditEventPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const eventId = Number(useParams().eventId)
  const valid = Number.isInteger(eventId) && eventId > 0
  const event = useManagedEvent(eventId, { enabled: valid })
  const crumbs = [{ label: t('organizerEvents.title'), to: '/organizer' }]

  if (!valid) return <NotFoundPage />
  if (event.isError) {
    return (
      <OrganizerPage
        routeId="organizer-event-edit"
        breadcrumb={crumbs}
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
        routeId="organizer-event-edit"
        breadcrumb={crumbs}
        title={<Skeleton className="h-9 w-72" />}
      >
        <div role="status">
          <span className="sr-only">{t('common.loading')}</span>
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </OrganizerPage>
    )
  }

  const data = event.data
  if (!isEditable(data)) {
    // A cancelled event can't be changed (the API answers 409): offer a copy instead
    return (
      <OrganizerPage
        routeId="organizer-event-edit"
        breadcrumb={[...crumbs, { label: data.title, to: `/organizer/events/${data.id}` }]}
        title={data.title}
        meta={<StatusBadge kind="event" status={data.lifecycle} />}
      >
        <InlineAlert tone="info">
          {t(
            data.status === 'cancelled'
              ? 'eventForm.blocked.cancelled'
              : 'eventForm.blocked.completed',
          )}
        </InlineAlert>
        <div className="flex flex-wrap gap-2.5">
          <DuplicateEventDialog
            event={data}
            trigger={<Button type="button">{t('organizerEvent.actions.duplicate')}</Button>}
          />
          <Button asChild variant="outline">
            <Link to={`/organizer/events/${data.id}`}>{t('eventForm.blocked.back')}</Link>
          </Button>
        </div>
      </OrganizerPage>
    )
  }

  const notice: unknown = location.state?.notice
  return (
    <EventForm
      key={data.id}
      event={data}
      notice={typeof notice === 'string' ? notice : undefined}
    />
  )
}
