import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import type { EventResponse } from '@/api/generated/model'
import { useTicketTypes } from '@/api/hooks/events'
import ErrorState from '@/components/ErrorState'
import { CloseIcon } from '@/components/icons'
import StatusBadge from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatEventDay, formatKZT } from '@/lib/format'
import EventCover from '@/pages/events/EventCover'
import EventFacts from '@/pages/events/EventFacts'

/**
 * The page of an event that was public and then cancelled (GET /events/{id} answers
 * 200 with status "cancelled"). Figma "Зритель / Событие — отменено": a cancellation
 * notice with the date instead of the ticket choice; the ticket types stay listed,
 * all closed. Issued tickets and orders are already refunded or cancelled by the server.
 */
export default function CancelledEvent({ event }: { event: EventResponse }) {
  const { t } = useTranslation()
  const tickets = useTicketTypes(event.id)
  const visibleTickets = tickets.data?.filter((ticket) => !ticket.is_hidden) ?? []
  const date = event.cancelled_at ? formatEventDay(event.cancelled_at) : null

  return (
    <main
      id="main-content"
      tabIndex={-1}
      data-route-id="event"
      data-event-status="cancelled"
      className="viewer-container space-y-5 px-4 pt-4 pb-8 min-[1024px]:px-0 min-[1024px]:pt-6 min-[1024px]:pb-16"
    >
      <Link
        to="/"
        className="hidden min-[1024px]:inline-flex min-[1024px]:min-h-5 min-[1024px]:items-center type-label text-ink-muted hover:text-brand"
      >
        <span aria-hidden="true">←&nbsp;</span>
        {t('catalog.catalogNav')}
      </Link>
      <div className="space-y-5 min-[1024px]:grid min-[1024px]:grid-cols-[minmax(0,1fr)_400px] min-[1024px]:items-start min-[1024px]:gap-x-8 min-[1024px]:space-y-0">
        <div className="min-w-0 space-y-5">
          <EventCover
            image={event.image_url}
            className="h-50 rounded-lg min-[1024px]:aspect-video min-[1024px]:h-auto min-[1024px]:bg-line"
          />
          <div
            className="flex items-start gap-2.5 rounded-md bg-status-danger-bg px-3.5 py-3 text-status-danger-fg"
            role="status"
            data-slot="event-cancelled-notice"
          >
            <CloseIcon aria-hidden="true" className="size-5 shrink-0" />
            <div className="min-w-0 space-y-0.5 text-sm leading-[1.4] wrap-anywhere">
              <p className="font-semibold">{t('event.cancelled.title')}</p>
              <p>
                {date
                  ? t('event.cancelled.description', { date })
                  : t('event.cancelled.descriptionNoDate')}
              </p>
            </div>
          </div>
          <header className="min-w-0 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {event.category && (
                <p className="max-w-full rounded-sm border border-line bg-surface px-2.5 py-1 type-small font-medium wrap-anywhere">
                  {event.category}
                </p>
              )}
              <StatusBadge kind="event" status="cancelled" />
            </div>
            <h1 className="type-event-title wrap-anywhere min-[1024px]:text-[38px]">
              {event.title}
            </h1>
          </header>
          <EventFacts event={event} />
        </div>

        <section
          aria-label={t('event.tickets')}
          data-slot="event-tickets"
          className="flex min-w-0 flex-col gap-3 min-[1024px]:sticky min-[1024px]:top-6 min-[1024px]:max-h-[calc(100dvh-48px)] min-[1024px]:gap-3.5 min-[1024px]:overflow-y-auto min-[1024px]:rounded-lg min-[1024px]:border min-[1024px]:border-line min-[1024px]:bg-surface min-[1024px]:p-6"
        >
          <h2 className="type-card-title min-[1024px]:text-[20px]">{t('event.tickets')}</h2>
          {tickets.isPending && <p role="status">{t('common.loading')}</p>}
          {tickets.isError && (
            <ErrorState
              title={t('event.ticketsError')}
              description={t(errorMessageKey(tickets.error))}
              onRetry={() => void tickets.refetch()}
            />
          )}
          {visibleTickets.length > 0 && (
            <ul className="space-y-3">
              {visibleTickets.map((ticket) => (
                <li
                  key={ticket.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-line-field bg-paper p-4"
                >
                  <div className="min-w-36 flex-1 space-y-0.5 wrap-anywhere">
                    <h3 className="type-label font-semibold text-ink-2">{ticket.name}</h3>
                    <p className="type-small text-ink-muted">{formatKZT(ticket.price)}</p>
                  </div>
                  <span className="type-small font-semibold text-ink-muted">
                    {t('event.cancelled.ticketStatus')}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-2 pt-2 min-[1024px]:pt-0">
            <Button asChild className="h-13 w-full whitespace-normal">
              <Link to="/">{t('event.cancelled.browse')}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="w-full whitespace-normal">
              <Link to="/my/orders">{t('catalog.ordersNav')}</Link>
            </Button>
          </div>
        </section>
      </div>
    </main>
  )
}
