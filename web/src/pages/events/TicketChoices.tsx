import { cn } from 'cn'
import { useTranslation } from 'react-i18next'
import type { TicketTypeResponse } from '@/api/generated/model'
import { Button } from '@/components/ui/button'
import { formatEventTime, formatKZT } from '@/lib/format'
import {
  type eventRegistration,
  ticketAvailability,
  ticketLimit,
  ticketsLeft,
} from '@/pages/events/availability'
import type { Selection } from '@/pages/events/selection'

export default function TicketChoices({
  tickets,
  selected,
  now,
  registration,
  onChange,
}: {
  tickets: TicketTypeResponse[]
  selected: Selection
  now: number
  registration: ReturnType<typeof eventRegistration>
  onChange: (ticket: TicketTypeResponse, step: number) => void
}) {
  const { t } = useTranslation()
  const registrationOpen = registration === 'open'

  return (
    <ul className="space-y-3">
      {tickets.map((ticket) => {
        const left = ticketsLeft(ticket)
        const availability = ticketAvailability(ticket, now)
        const limit = registrationOpen ? ticketLimit(ticket, now) : 0
        const quantity = Math.min(selected[ticket.id] ?? 0, limit)
        const status =
          registrationOpen && availability === 'soldOut'
            ? t('event.soldOut')
            : t('event.unavailable')

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
              {registration === 'open' ? (
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
                  {availability === 'upcoming' && (
                    <p className="type-small text-ink-muted">
                      {t('event.salesOpens', {
                        time: formatEventTime(ticket.sales_start, { withZone: true }),
                      })}
                    </p>
                  )}
                  {availability === 'open' && (
                    <p className="type-small text-ink-muted">
                      {t('event.salesUntil', {
                        time: formatEventTime(ticket.sales_end, { withZone: true }),
                      })}
                    </p>
                  )}
                  {availability === 'closed' && (
                    <p className="type-small text-ink-muted">{t('event.salesClosed')}</p>
                  )}
                </>
              ) : (
                <p className="type-small text-ink-muted">
                  {formatKZT(ticket.price)} · {t(`event.registration.${registration}.ticketStatus`)}
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
              <span className="type-small font-semibold text-ink-2">{status}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
