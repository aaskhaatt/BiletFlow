import { Link } from 'react-router'
import type { EventResponse } from '@/api/generated/model'
import { formatEventTime } from '@/lib/format'

/** One event in the catalog: its title links to the event page. */
export default function EventCard({ event }: { event: EventResponse }) {
  const venue = [event.venue_name, event.venue_address].filter(Boolean).join(', ')

  return (
    <article
      className="space-y-2 rounded-lg border border-line bg-surface p-4"
      data-slot="event-card"
    >
      <h2 className="type-card-title wrap-anywhere">
        <Link to={`/events/${event.id}`} className="hover:text-brand hover:underline">
          {event.title}
        </Link>
      </h2>
      <p className="type-body text-ink-2">
        <time dateTime={event.start_time}>
          {formatEventTime(event.start_time, { withZone: true })}
        </time>
      </p>
      {venue && <p className="type-small wrap-anywhere text-ink-muted">{venue}</p>}
    </article>
  )
}
