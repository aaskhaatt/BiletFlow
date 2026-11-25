import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import { useEvent, useTicketTypes } from '@/api/hooks/events'
import ErrorState from '@/components/ErrorState'
import InlineAlert from '@/components/InlineAlert'
import { formatKZT } from '@/lib/format'
import NotFoundPage from '@/pages/NotFoundPage'
import {
  eventRegistration,
  isRegistrationClosedError,
  parseEventId,
} from '@/pages/events/availability'
import {
  type CheckoutDraft,
  readCheckoutDraft,
  selectedQuantities,
  summarizeTickets,
} from '@/pages/events/selection'

export default function CheckoutDraftPage() {
  const eventId = parseEventId(useParams().eventId)
  return eventId === null ? (
    <NotFoundPage />
  ) : (
    <CheckoutDraftRoute key={eventId} eventId={eventId} />
  )
}

function CheckoutDraftRoute({ eventId }: { eventId: number }) {
  const { t } = useTranslation()
  const [draft] = useState(() => readCheckoutDraft(eventId))
  const search = draft?.campaign ? '?' + new URLSearchParams({ campaign: draft.campaign }) : ''
  return (
    <main
      id="main-content"
      tabIndex={-1}
      data-route-id="checkout"
      className="mx-auto max-w-180 space-y-4 px-4 py-5"
    >
      <h1 className="type-event-title">{t('event.checkoutTitle')}</h1>
      {draft?.items.length ? (
        <DraftSummary eventId={eventId} draft={draft} />
      ) : (
        <p>{t('event.checkoutEmpty')}</p>
      )}
      <Link
        to={`/events/${eventId}${search}`}
        className="inline-flex min-h-11 items-center type-label text-brand underline"
      >
        {t('event.backToEvent')}
      </Link>
    </main>
  )
}

function DraftSummary({ eventId, draft }: { eventId: number; draft: CheckoutDraft }) {
  const { t } = useTranslation()
  const event = useEvent(eventId)
  const tickets = useTicketTypes(eventId)
  const [now] = useState(Date.now)
  const error = event.error ?? tickets.error

  if (isRegistrationClosedError(error)) {
    return <InlineAlert tone="warn">{t('event.registrationUnavailable')}</InlineAlert>
  }
  if (error) {
    return (
      <ErrorState
        title={t('event.ticketsError')}
        description={t(errorMessageKey(error))}
        onRetry={() => {
          if (event.isError) void event.refetch()
          if (tickets.isError) void tickets.refetch()
        }}
      />
    )
  }
  if (!event.data || !tickets.data || tickets.isFetching) {
    return <p role="status">{t('common.loading')}</p>
  }
  if (eventRegistration(event.data, now) !== 'open') {
    return <InlineAlert tone="warn">{t('event.registrationUnavailable')}</InlineAlert>
  }

  const { items, count, subtotal } = summarizeTickets(tickets.data, selectedQuantities(draft))
  const names = new Map(tickets.data.map((ticket) => [ticket.id, ticket.name]))
  return count ? (
    <section
      aria-label={t('event.tickets')}
      className="space-y-3 rounded-lg border border-line bg-surface p-4"
    >
      <h2 className="type-card-title wrap-anywhere">{event.data.title}</h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.ticket_type_id} className="wrap-anywhere">
            {names.get(item.ticket_type_id)} × {item.quantity}
          </li>
        ))}
      </ul>
      {draft.promo_code && (
        <p className="wrap-anywhere">{t('event.promo', { code: draft.promo_code })}</p>
      )}
      <p className="font-semibold">
        {draft.promo_code
          ? t('event.beforeDiscount', { subtotal: formatKZT(subtotal) })
          : formatKZT(subtotal)}
      </p>
    </section>
  ) : (
    <InlineAlert tone="warn">{t('event.checkoutEmpty')}</InlineAlert>
  )
}
