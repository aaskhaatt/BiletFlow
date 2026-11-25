import { useTranslation } from 'react-i18next'
import type { OrderResponse } from '@/api/generated/model'
import { formatEventTime } from '@/lib/format'

export default function OrderEvent({
  order,
  heading: Heading = 'h2',
}: {
  order: OrderResponse
  heading?: 'h2' | 'h3'
}) {
  const { t } = useTranslation()
  const event = order.event
  const venue = [event?.venue_name, event?.venue_address].filter(Boolean).join(', ')

  return (
    <div className="min-w-0 space-y-1 wrap-anywhere">
      <Heading className="type-card-title">
        {event?.title || t('attendee.eventFallback', { id: order.event_id })}
      </Heading>
      {event?.start_time && (
        <p className="type-small text-ink-2">
          <time dateTime={event.start_time}>
            {formatEventTime(event.start_time, { withZone: true })}
          </time>
        </p>
      )}
      {venue && <p className="type-small text-ink-2">{venue}</p>}
      {event?.status === 'cancelled' && (
        <p className="type-small font-semibold text-status-danger-fg">
          {t('event.cancelled.title')}
        </p>
      )}
    </div>
  )
}
