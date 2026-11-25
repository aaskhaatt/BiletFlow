import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { EventListItem } from '@/api/generated/model'
import { formatEventTime, formatKZT } from '@/lib/format'
import { cardTickets } from '@/pages/catalog/card-tickets'
import EventCover from '@/pages/events/EventCover'

/**
 * One event in the catalog: its title links to the event page. The price and the
 * "few left" warning come from the list item itself, no request per card.
 */
export default function EventCard({ event }: { event: EventListItem }) {
  const { t } = useTranslation()
  const { price, free, lowStock } = cardTickets(event)
  const venue = [event.venue_name, event.venue_address].filter(Boolean).join(', ')
  const href = `/events/${event.id}`

  return (
    <article
      className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface"
      data-slot="event-card"
    >
      <EventCover
        image={event.image_url}
        className="h-30 shrink-0 min-[1024px]:h-50 min-[1024px]:bg-line"
        lazy
      />
      <div className="flex flex-1 flex-col gap-2 p-4 min-[1024px]:px-5">
        <div className="flex flex-wrap gap-2">
          {event.category && (
            <span className="rounded-sm bg-paper px-2 py-1 type-small wrap-anywhere text-ink-2">
              {event.category}
            </span>
          )}
          {free && (
            <span className="hidden rounded-sm bg-brand-soft px-2 py-1 type-small font-semibold text-brand-press min-[1024px]:inline">
              {t('catalog.registration')}
            </span>
          )}
          {lowStock && (
            <span className="rounded-sm bg-status-danger-bg px-2 py-1 type-small font-semibold text-status-danger-fg">
              {t('catalog.lowStock')}
            </span>
          )}
        </div>
        <h2 className="type-card-title wrap-anywhere">
          <Link to={href} className="hover:text-brand hover:underline">
            {event.title}
          </Link>
        </h2>
        <p className="type-body text-ink-2">
          <time dateTime={event.start_time}>
            <span className="min-[1024px]:hidden">
              {formatEventTime(event.start_time, { withZone: true })}
            </span>
            <span className="hidden min-[1024px]:inline">
              {formatEventTime(event.start_time, { compact: true })} (UTC+5)
            </span>
          </time>
        </p>
        {venue && <p className="type-small wrap-anywhere text-ink-muted">{venue}</p>}
        {event.organizer_name && (
          <p className="type-small wrap-anywhere text-ink-muted">
            {t('catalog.organizer', { name: event.organizer_name })}
          </p>
        )}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3">
          {price !== null && (
            <p className="font-semibold">
              {price === 0 ? formatKZT(0) : t('catalog.priceFrom', { price: formatKZT(price) })}
            </p>
          )}
          <Link
            aria-label={t('catalog.eventDetails', { title: event.title })}
            to={href}
            className="ml-auto inline-flex min-h-11 items-center type-label text-brand hover:underline min-[1024px]:min-h-8"
          >
            {t('catalog.details')}{' '}
            <span className="ml-1" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </div>
    </article>
  )
}
