import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import type { EventResponse } from '@/api/generated/model'
import { useManagedEvent } from '@/api/hooks/organizer-events'
import { useManagedTicketTypes } from '@/api/hooks/organizer-ticket-types'
import ErrorState from '@/components/ErrorState'
import InlineAlert from '@/components/InlineAlert'
import { CalendarIcon, PinIcon } from '@/components/icons'
import Skeleton from '@/components/Skeleton'
import StatusBadge from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { categoryLabel } from '@/lib/event-categories'
import { formatEventSpan, formatDateShort } from '@/lib/event-display'
import { isEditable } from '@/lib/event-state'
import { formatKZT } from '@/lib/format'
import OrganizerPage from '@/pages/organizer/OrganizerPage'
import NotFoundPage from '@/pages/NotFoundPage'

function Tickets({ event }: { event: EventResponse }) {
  const { t } = useTranslation()
  const types = useManagedTicketTypes(event.id)
  // Hidden types are not on the public page
  const shown = types.data?.filter((type) => !type.is_hidden) ?? []

  return (
    <section
      aria-labelledby="preview-tickets"
      className="space-y-3 rounded-lg border border-line bg-surface p-6"
    >
      <h2 id="preview-tickets" className="type-card-title">
        {t('eventPreview.tickets')}
      </h2>
      {types.isError ? (
        <p className="text-ink-2">{t(errorMessageKey(types.error))}</p>
      ) : !types.data ? (
        <Skeleton className="h-16 rounded-md" />
      ) : shown.length === 0 ? (
        <p className="text-ink-2">{t('eventPreview.noTickets')}</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((type) => (
            <li
              key={type.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-paper px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[0.9375rem] leading-[1.4] font-semibold wrap-anywhere">
                  {type.name}
                </p>
                {type.description && (
                  <p className="type-small text-ink-2 wrap-anywhere">{type.description}</p>
                )}
                <p className="type-small text-ink-muted">
                  {t('eventPreview.salesWindow', {
                    from: formatDateShort(type.sales_start),
                    to: formatDateShort(type.sales_end),
                  })}
                </p>
              </div>
              <p className="type-body font-semibold tabular-nums">{formatKZT(type.price)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * /organizer/events/:eventId/preview: the event the way attendees will see it, in any
 * status (the organizer's GET /events/{id}/manage answers for drafts and private events too).
 * Nothing here can be bought.
 */
export default function EventPreviewPage() {
  const { t } = useTranslation()
  const eventId = Number(useParams().eventId)
  const valid = Number.isInteger(eventId) && eventId > 0
  const event = useManagedEvent(eventId, { enabled: valid })
  const home = { label: t('organizerEvents.title'), to: '/organizer' }

  if (!valid) return <NotFoundPage />
  if (event.isError) {
    return (
      <OrganizerPage
        routeId="organizer-event-preview"
        breadcrumb={[home]}
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
        routeId="organizer-event-preview"
        breadcrumb={[home]}
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
  const visibility =
    data.visibility === 'unlisted' || data.visibility === 'private' ? data.visibility : 'public'
  const note =
    data.status === 'draft'
      ? 'draft'
      : data.status === 'cancelled'
        ? 'cancelled'
        : visibility === 'private'
          ? 'private'
          : visibility === 'unlisted'
            ? 'unlisted'
            : 'live'
  const category = categoryLabel(data.category)

  return (
    <OrganizerPage
      routeId="organizer-event-preview"
      breadcrumb={[
        home,
        { label: data.title, to: `/organizer/events/${data.id}` },
        { label: t('eventPreview.breadcrumb') },
      ]}
      title={data.title}
      meta={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusBadge kind="event" status={data.lifecycle} />
          {category && <span className="type-label font-normal text-ink-2">{category}</span>}
        </div>
      }
      actions={
        <>
          {isEditable(data) && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/organizer/events/${data.id}/edit`}>
                {t('organizerEvent.actions.edit')}
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link to={`/organizer/events/${data.id}`}>{t('eventForm.blocked.back')}</Link>
          </Button>
        </>
      }
    >
      <InlineAlert tone={note === 'live' ? 'info' : 'warn'}>
        <p className="font-semibold">{t('eventPreview.title')}</p>
        <p>{t(`eventPreview.note.${note}`)}</p>
      </InlineAlert>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22.5rem]">
        <div className="space-y-6">
          {data.image_url ? (
            <img
              src={data.image_url}
              alt={t('eventCover.preview')}
              className="aspect-video w-full rounded-lg object-cover"
            />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-line type-small text-ink-2">
              {t('eventPreview.noCover')}
            </div>
          )}
          <section
            aria-labelledby="preview-about"
            className="space-y-3 rounded-lg border border-line bg-surface p-6"
          >
            <h2 id="preview-about" className="type-card-title">
              {t('eventPreview.about')}
            </h2>
            {data.description ? (
              <p className="type-body whitespace-pre-line wrap-anywhere">{data.description}</p>
            ) : (
              <p className="text-ink-muted">{t('eventPreview.noDescription')}</p>
            )}
          </section>
          {data.refund_policy && (
            <section
              aria-labelledby="preview-refund"
              className="space-y-3 rounded-lg border border-line bg-surface p-6"
            >
              <h2 id="preview-refund" className="type-card-title">
                {t('eventForm.refund.title')}
              </h2>
              <p className="type-body whitespace-pre-line wrap-anywhere">{data.refund_policy}</p>
            </section>
          )}
        </div>
        <div className="space-y-6">
          <section className="space-y-3 rounded-lg border border-line bg-surface p-6">
            <p className="flex items-start gap-2.5 type-body">
              <CalendarIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ink-2" />
              <span>{formatEventSpan(data.start_time, data.end_time)}</span>
            </p>
            <p className="flex items-start gap-2.5 type-body">
              <PinIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ink-2" />
              <span className="wrap-anywhere">
                {[data.venue_name, data.venue_address].filter(Boolean).join(', ') ||
                  t('eventPreview.noVenue')}
              </span>
            </p>
            {data.organizer_name && (
              <p className="type-small text-ink-muted">
                {t('eventPreview.organizer', { name: data.organizer_name })}
              </p>
            )}
          </section>
          <Tickets event={data} />
        </div>
      </div>
    </OrganizerPage>
  )
}
