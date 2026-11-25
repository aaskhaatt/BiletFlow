import { cn } from 'cn'
import { useTranslation } from 'react-i18next'
import type {
  TicketTypeWithAvailability,
  TicketTypeWithAvailabilityUnavailableReason,
} from '@/api/generated/model'
import { Button } from '@/components/ui/button'
import { formatEventTime, formatKZT } from '@/lib/format'
import { type eventRegistration, ticketLimit } from '@/pages/events/availability'
import type { Selection } from '@/pages/events/selection'

const unavailableMessage = {
  registration_closed: 'event.registration.closed.title',
  hidden: 'event.ticketHidden',
  not_started: 'event.salesOpens',
  ended: 'event.salesClosed',
  paid_sales_inactive: 'errors.PaidSalesNotActiveError',
  sold_out: 'event.soldOut',
} as const satisfies Record<NonNullable<TicketTypeWithAvailabilityUnavailableReason>, string>

export default function TicketChoices({
  tickets,
  selected,
  canChoose,
  registration,
  onChange,
}: {
  tickets: TicketTypeWithAvailability[]
  selected: Selection
  canChoose: boolean
  registration: ReturnType<typeof eventRegistration>
  onChange: (ticket: TicketTypeWithAvailability, step: number) => void
}) {
  const { t } = useTranslation()
  const registrationOpen = registration === 'open'

  return (
    <ul className="space-y-3">
      {tickets.map((ticket) => {
        const { available: left, unavailable_reason: reason } = ticket
        const limit = canChoose ? ticketLimit(ticket) : 0
        const quantity = Math.min(selected[ticket.id] ?? 0, limit)
        const statusKey =
          reason === 'registration_closed' && registration === 'upcoming'
            ? 'event.registration.upcoming.title'
            : (reason && unavailableMessage[reason]) || 'event.unavailable'

        return (
          <li
            key={ticket.id}
            className={cn(
              'flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4',
              limit === 0 ? 'border-dashed border-line-field bg-paper' : 'border-line bg-surface',
              quantity > 0 && 'border-brand ring-1 ring-brand',
            )}
          >
            <div className="min-w-36 flex-1 space-y-1 wrap-anywhere">
              <h3 className={cn('type-label', !registrationOpen && 'font-semibold text-ink-2')}>
                {ticket.name}
              </h3>
              {registrationOpen ? (
                <>
                  {ticket.description && (
                    <p className="type-small text-ink-2">{ticket.description}</p>
                  )}
                  <p className="font-semibold">{formatKZT(ticket.price)}</p>
                  {left > 0 && (
                    <p
                      className={cn(
                        'type-small',
                        left <= 5 ? 'text-status-danger-fg' : 'text-ink-muted',
                      )}
                    >
                      {t('event.remaining', { count: left })}
                    </p>
                  )}
                  {limit > 0 && (
                    <p className="type-small text-ink-muted">
                      {t('event.salesUntil', {
                        time: formatEventTime(ticket.sales_end, { withZone: true }),
                      })}
                    </p>
                  )}
                </>
              ) : (
                <p className="type-small text-ink-muted">
                  {formatKZT(ticket.price)}
                  {!reason && ` · ${t(`event.registration.${registration}.ticketStatus`)}`}
                </p>
              )}
            </div>
            {limit > 0 ? (
              <div
                className="flex shrink-0 items-center gap-1"
                role="group"
                aria-label={ticket.name}
              >
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="border-line bg-paper text-lg"
                  aria-label={t('event.removeTicket', { name: ticket.name })}
                  disabled={quantity === 0}
                  onClick={() => onChange(ticket, -1)}
                >
                  <span aria-hidden="true">−</span>
                </Button>
                <output
                  className="min-w-7 text-center font-semibold tabular-nums"
                  aria-label={t('event.quantity', { name: ticket.name })}
                >
                  {quantity}
                </output>
                <Button
                  type="button"
                  size="icon"
                  variant={quantity > 0 ? 'default' : 'outline'}
                  className={cn('text-lg', quantity === 0 && 'border-brand text-brand')}
                  aria-label={t('event.addTicket', { name: ticket.name })}
                  disabled={quantity === limit}
                  onClick={() => onChange(ticket, 1)}
                >
                  <span aria-hidden="true">+</span>
                </Button>
              </div>
            ) : (
              <span className="max-w-full type-small font-semibold wrap-anywhere text-ink-2">
                {statusKey === 'event.salesOpens'
                  ? t(statusKey, { time: formatEventTime(ticket.sales_start, { withZone: true }) })
                  : t(statusKey)}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
