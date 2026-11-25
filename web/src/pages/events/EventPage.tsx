import { cn } from 'cn'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useMatch, useNavigate, useParams, useSearchParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import { isApiError } from '@/api/errors'
import type { EventResponse, TicketTypeWithAvailability } from '@/api/generated/model'
import { useCampaignLink, useEvent, useTicketTypes } from '@/api/hooks/events'
import registrationClock from '@/assets/event-registration-clock.svg'
import reportWarning from '@/assets/event-report-warning.svg'
import ErrorState from '@/components/ErrorState'
import PublicEventFeedback from '@/components/PublicEventFeedback'
import { Button } from '@/components/ui/button'
import { formatEventTime, formatKZT } from '@/lib/format'
import { useViewerDesktop } from '@/lib/viewer-layout'
import {
  eventRegistration,
  isRegistrationClosedError,
  parseEventId,
  ticketLimit,
} from '@/pages/events/availability'
import CancelledEvent from '@/pages/events/CancelledEvent'
import { downloadEventCalendar } from '@/pages/events/calendar'
import EventCover from '@/pages/events/EventCover'
import EventFacts from '@/pages/events/EventFacts'
import EventLoading from '@/pages/events/EventLoading'
import {
  readCheckoutDraft,
  saveCheckoutDraft,
  selectedQuantities,
  summarizeTickets,
} from '@/pages/events/selection'
import TicketChoices from '@/pages/events/TicketChoices'

const bodyClass = 'viewer-container space-y-5 px-4 pt-4 min-[1024px]:px-0 min-[1024px]:pt-6'
const textLink = 'inline-flex min-h-11 items-center type-label text-brand hover:underline'

export default function EventPage() {
  const eventId = parseEventId(useParams().eventId)
  const desktop = useViewerDesktop()
  const report = useMatch('/events/:eventId/report') !== null
  const wasReport = useRef(report)
  useEffect(() => {
    if (desktop && wasReport.current && !report) {
      const frame = requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('[data-slot="event-report-link"]')?.focus(),
      )
      wasReport.current = false
      return () => cancelAnimationFrame(frame)
    }
    wasReport.current = report
  }, [desktop, report])

  return (
    <>
      {(!report || desktop) &&
        (eventId === null ? <EventNotFound /> : <EventRoute key={eventId} eventId={eventId} />)}
      <Outlet />
    </>
  )
}

function EventNotFound() {
  const { t } = useTranslation()
  return (
    <main
      id="main-content"
      tabIndex={-1}
      data-route-id="not-found"
      className="mx-auto flex w-full max-w-180 flex-1 flex-col px-4 pb-8"
    >
      <PublicEventFeedback
        heading="h1"
        icon="search"
        title={t('event.notFoundTitle')}
        description={t('event.notFoundText')}
        action={
          <Button asChild className="h-13 w-full whitespace-normal">
            <Link to="/">{t('event.toCatalog')}</Link>
          </Button>
        }
      />
    </main>
  )
}

function EventRoute({ eventId }: { eventId: number }) {
  const { t } = useTranslation()
  const event = useEvent(eventId)
  // A once-published event that was cancelled still has its page (200, status "cancelled")
  if (event.data?.status === 'cancelled') return <CancelledEvent event={event.data} />
  if (event.data && isRegistrationClosedError(event.error))
    return <EventDetails event={event.data} serverClosed />
  if (event.isError) {
    if (isApiError(event.error) && event.error.status === 404) return <EventNotFound />
    return (
      <main id="main-content" tabIndex={-1} className={bodyClass}>
        <ErrorState
          heading="h1"
          title={t('event.loadError')}
          description={t(errorMessageKey(event.error))}
          onRetry={() => void event.refetch()}
        />
      </main>
    )
  }
  return event.data ? <EventDetails event={event.data} /> : <EventLoading />
}

function EventDetails({
  event,
  serverClosed = false,
}: {
  event: EventResponse
  serverClosed?: boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const [now, setNow] = useState(Date.now)
  const [selection, setSelection] = useState(() => selectedQuantities(readCheckoutDraft(event.id)))
  const token = search.get('campaign') ?? ''
  const campaign = useCampaignLink(token)
  const promo = campaign.data?.event_id === event.id ? campaign.data.promo_code : null
  const tickets = useTicketTypes(event.id)
  const { data: ticketTypes, dataUpdatedAt, refetch: refreshTickets } = tickets
  const visibleTickets = ticketTypes?.filter((ticket) => !ticket.is_hidden) ?? []
  const registrationCloses = event.registration_closes_at ?? event.end_time
  const schedule = eventRegistration(event, now)
  const closedByApi = serverClosed || isRegistrationClosedError(tickets.error)
  const registration = closedByApi && schedule === 'open' ? 'closed' : schedule
  const canChoose = registration === 'open' && !tickets.isError
  const showBar =
    registration !== 'open' || visibleTickets.some((ticket) => ticketLimit(ticket) > 0)
  const { count, subtotal } = summarizeTickets(visibleTickets, canChoose ? selection : {})

  useEffect(() => {
    const sync = () => setNow(Date.now())
    const timer = window.setInterval(sync, 1000)
    document.addEventListener('visibilitychange', sync)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])

  useEffect(() => {
    if (!ticketTypes?.length) return
    const now = Date.now()
    // The API decides whether each type is on sale. Refresh its answer when a window changes.
    const boundaries = [
      event.registration_opens_at,
      registrationCloses,
      ...ticketTypes.flatMap((ticket) => [ticket.sales_start, ticket.sales_end]),
    ]
    const next = Math.min(
      ...boundaries.map((time) => Date.parse(time ?? '')).filter((time) => time >= now),
    )
    if (!Number.isFinite(next)) return
    const timer = window.setTimeout(
      () => void refreshTickets(),
      Math.min(next - now + 1, 2_147_483_647),
    )
    return () => window.clearTimeout(timer)
  }, [ticketTypes, dataUpdatedAt, event.registration_opens_at, registrationCloses, refreshTickets])

  function changeQuantity(ticket: TicketTypeWithAvailability, step: number) {
    if (!canChoose) return
    const limit = ticketLimit(ticket)
    const current = Math.min(selection[ticket.id] ?? 0, limit)
    const next = {
      ...selection,
      [ticket.id]: Math.max(0, Math.min(current + step, limit)),
    }
    setSelection(next)
    saveCheckoutDraft(event.id, {
      items: summarizeTickets(visibleTickets, next).items,
      promo_code: promo,
      campaign: token,
    })
  }

  function checkout() {
    const draft = summarizeTickets(visibleTickets, selection)
    if (!canChoose || !draft.count || campaign.isFetching) return
    saveCheckoutDraft(event.id, { items: draft.items, promo_code: promo, campaign: token })
    void navigate(`/events/${event.id}/checkout`)
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      data-route-id="event"
      className={cn(bodyClass, showBar ? 'pb-36' : 'pb-8', 'min-[1024px]:pb-16')}
    >
      <Link
        to="/"
        className="hidden min-[1024px]:inline-flex min-[1024px]:min-h-5 min-[1024px]:items-center type-label text-ink-muted hover:text-brand"
      >
        <span aria-hidden="true">←&nbsp;</span>
        {t('catalog.catalogNav')}
      </Link>
      <div className="space-y-5 min-[1024px]:grid min-[1024px]:grid-cols-[minmax(0,1fr)_400px] min-[1024px]:items-start min-[1024px]:gap-x-8 min-[1024px]:gap-y-7 min-[1024px]:space-y-0">
        <header className="min-w-0 space-y-3 min-[1024px]:col-start-1 min-[1024px]:row-start-1">
          <EventCover
            image={event.image_url}
            className="mb-5 h-50 rounded-lg min-[1024px]:mb-7 min-[1024px]:aspect-video min-[1024px]:h-auto min-[1024px]:bg-line"
          />
          {event.category && (
            <p className="w-fit max-w-full rounded-sm border border-line bg-surface px-2.5 py-1 type-small wrap-anywhere">
              {event.category}
            </p>
          )}
          <h1 className="type-event-title wrap-anywhere min-[1024px]:text-[38px]">{event.title}</h1>
          <EventFacts event={event} />
          <button
            type="button"
            className={cn(textLink, 'min-[1024px]:min-h-7')}
            onClick={() => downloadEventCalendar(event)}
          >
            {t('event.calendar')}
          </button>
        </header>

        <section
          aria-label={t('event.tickets')}
          data-slot="event-tickets"
          className="flex min-w-0 flex-col gap-3 min-[1024px]:sticky min-[1024px]:top-6 min-[1024px]:col-start-2 min-[1024px]:row-span-2 min-[1024px]:row-start-1 min-[1024px]:max-h-[calc(100dvh-48px)] min-[1024px]:gap-3.5 min-[1024px]:overflow-y-auto min-[1024px]:rounded-lg min-[1024px]:border min-[1024px]:border-line min-[1024px]:bg-surface min-[1024px]:p-6"
        >
          <h2 className="type-card-title min-[1024px]:-order-2 min-[1024px]:text-[20px]">
            {t('event.tickets')}
          </h2>
          {promo && registration === 'open' && (
            <p
              className="-order-1 rounded-md bg-brand-soft p-3 type-label wrap-anywhere text-brand-press"
              role="status"
            >
              {t('event.promo', { code: promo })}
            </p>
          )}
          {registration !== 'open' && (
            <div
              className="flex items-start gap-2.5 rounded-md bg-status-neutral-bg px-3.5 py-3 text-status-neutral-fg"
              role="status"
            >
              <img src={registrationClock} width="20" height="20" alt="" className="shrink-0" />
              <div className="min-w-0 space-y-1 text-sm leading-[1.4] wrap-anywhere">
                <p className="font-semibold">{t(`event.registration.${registration}.title`)}</p>
                <p>
                  {closedByApi && schedule === 'open'
                    ? t('event.closedByServer')
                    : t(`event.registration.${registration}.description`, {
                        time: formatEventTime(
                          registration === 'upcoming' && event.registration_opens_at
                            ? event.registration_opens_at
                            : registrationCloses,
                          { withZone: true },
                        ),
                      })}
                </p>
              </div>
            </div>
          )}
          {tickets.isPending && <p role="status">{t('common.loading')}</p>}
          {tickets.isError && !closedByApi && (
            <ErrorState
              title={t('event.ticketsError')}
              description={t(errorMessageKey(tickets.error))}
              onRetry={() => void tickets.refetch()}
            />
          )}
          {tickets.data &&
            (visibleTickets.length ? (
              <TicketChoices
                tickets={visibleTickets}
                selected={selection}
                canChoose={canChoose}
                registration={registration}
                onChange={changeQuantity}
              />
            ) : (
              <p className="type-body text-ink-2">{t('event.noTickets')}</p>
            ))}
          <div
            data-slot="event-checkout-bar"
            className={cn(
              'fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-180 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] min-[1024px]:static min-[1024px]:z-auto min-[1024px]:max-w-none min-[1024px]:pb-0',
              !showBar && 'hidden min-[1024px]:block',
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 min-[1024px]:px-0 min-[1024px]:pt-3.5 min-[1024px]:pb-0">
              <div className="min-w-0" aria-live="polite">
                <p className="type-small text-ink-muted">
                  {count > 0 ? t('event.selected', { count }) : t('event.noneSelected')}
                </p>
                <p
                  className={cn(
                    'font-semibold wrap-anywhere',
                    !promo &&
                      'min-[1024px]:font-display min-[1024px]:text-[26px] min-[1024px]:leading-tight',
                  )}
                >
                  {count === 0
                    ? '0 ₸'
                    : promo
                      ? t('event.beforeDiscount', { subtotal: formatKZT(subtotal) })
                      : formatKZT(subtotal)}
                </p>
              </div>
              <Button
                type="button"
                className="h-13 max-w-full whitespace-normal"
                disabled={!canChoose || count === 0 || campaign.isFetching}
                onClick={checkout}
              >
                {t('event.checkout')}
              </Button>
            </div>
          </div>
        </section>

        <section
          aria-label={t('event.about')}
          className="min-w-0 space-y-2 min-[1024px]:col-start-1 min-[1024px]:row-start-2 min-[1024px]:space-y-3 min-[1024px]:border-t min-[1024px]:border-line min-[1024px]:pt-7"
        >
          <h2 className="type-card-title">{t('event.about')}</h2>
          {event.description && (
            <p className="type-body whitespace-pre-wrap wrap-anywhere text-ink-2">
              {event.description}
            </p>
          )}
          {event.refund_policy && (
            <div className="hidden space-y-2 min-[1024px]:block">
              <h3 className="type-label font-semibold">{t('event.refundPolicy')}</h3>
              <p className="type-body whitespace-pre-wrap wrap-anywhere text-ink-2">
                {event.refund_policy}
              </p>
            </div>
          )}
          <div className="flex flex-col items-start">
            <Link
              className={cn(textLink, 'min-[1024px]:min-h-8')}
              to={`/support/new?event_id=${event.id}`}
            >
              {t('event.support')}
            </Link>
            <Link
              className="inline-flex min-h-11 items-center gap-1.5 type-label text-ink-2 hover:underline min-[1024px]:min-h-8"
              data-slot="event-report-link"
              to={{ pathname: `/events/${event.id}/report`, search: search.toString() }}
            >
              <img src={reportWarning} width="16" height="16" alt="" className="shrink-0" />
              {t('reportEvent.action')}
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
