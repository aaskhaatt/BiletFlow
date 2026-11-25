import type { EventResponse } from '@/api/generated/model'
import desktopCalendarIcon from '@/assets/desktop-event-calendar.svg'
import desktopLocationIcon from '@/assets/desktop-event-location.svg'
import calendarIcon from '@/assets/event-calendar.svg'
import locationIcon from '@/assets/event-location.svg'
import { eventTimeZoneLabel, formatEventTimeRange } from '@/lib/format'

/** When and where: the date range in Astana time and the venue. Shared by the event page and the cancelled-event page. */
export default function EventFacts({ event }: { event: EventResponse }) {
  return (
    <div className="space-y-3 min-[1024px]:flex min-[1024px]:flex-wrap min-[1024px]:gap-x-10 min-[1024px]:gap-y-3 min-[1024px]:space-y-0">
      <div className="flex items-start gap-3">
        <picture className="mt-0.5 shrink-0">
          <source media="(min-width: 1024px)" srcSet={desktopCalendarIcon} />
          <img src={calendarIcon} width="20" height="20" alt="" />
        </picture>
        <div className="min-w-0">
          <time dateTime={event.start_time} className="type-label">
            {formatEventTimeRange(event.start_time, event.end_time)}
          </time>
          <p className="type-small text-ink-muted">{eventTimeZoneLabel()}</p>
        </div>
      </div>
      {(event.venue_name || event.venue_address) && (
        <div className="flex items-start gap-3">
          <picture className="mt-0.5 shrink-0">
            <source media="(min-width: 1024px)" srcSet={desktopLocationIcon} />
            <img src={locationIcon} width="20" height="20" alt="" />
          </picture>
          <div className="min-w-0 wrap-anywhere">
            {event.venue_name && <p className="type-label">{event.venue_name}</p>}
            {event.venue_address && (
              <p className="type-small text-ink-muted">{event.venue_address}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
