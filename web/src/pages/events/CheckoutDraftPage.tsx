import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import { isApiError } from '@/api/errors'
import type { EventResponse, TicketTypeWithAvailability } from '@/api/generated/model'
import { useEvent, useTicketTypes } from '@/api/hooks/events'
import { useCreateOrder, useOrderPreview } from '@/api/hooks/orders'
import { useMe } from '@/auth/use-me'
import CheckboxField from '@/components/CheckboxField'
import ErrorState from '@/components/ErrorState'
import FormField from '@/components/FormField'
import DemoBanner from '@/components/DemoBanner'
import InlineAlert from '@/components/InlineAlert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatKZT } from '@/lib/format'
import NotFoundPage from '@/pages/NotFoundPage'
import {
  eventRegistration,
  isRegistrationClosedError,
  parseEventId,
} from '@/pages/events/availability'
import {
  clearCheckoutDraft,
  readCheckoutDraft,
  saveCheckoutDraft,
  selectedQuantities,
  summarizeTickets,
  type CheckoutDraft,
} from '@/pages/events/selection'

const promoErrors = new Set([
  'PromoCodeNotFoundError',
  'PromoCodeNotActiveError',
  'PromoCodeUsedUpError',
  'PromoCodeNotApplicableError',
])
const unavailableErrors = new Set([
  'TicketTypeSoldOutError',
  'EventSoldOutError',
  'RegistrationClosedError',
  'InvalidOrderQuantityError',
  'TicketTypeNotAvailableError',
  'PaidSalesNotActiveError',
  'OrderNotPayableError',
  'EventNotFoundError',
])

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
  const eventPath = `/events/${eventId}${search}`
  return (
    <main
      id="main-content"
      tabIndex={-1}
      data-route-id="checkout"
      className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 sm:px-6"
    >
      <Link
        to={eventPath}
        className="inline-flex min-h-11 items-center type-label text-brand hover:underline"
      >
        {t('event.backToEvent')}
      </Link>
      <h1 className="type-event-title">{t('event.checkoutTitle')}</h1>
      {draft?.items.length ? (
        <DraftSummary eventId={eventId} draft={draft} eventPath={eventPath} />
      ) : (
        <p>{t('event.checkoutEmpty')}</p>
      )}
    </main>
  )
}

function DraftSummary({
  eventId,
  draft,
  eventPath,
}: {
  eventId: number
  draft: CheckoutDraft
  eventPath: string
}) {
  const { t } = useTranslation()
  const event = useEvent(eventId)
  const tickets = useTicketTypes(eventId)
  const [now] = useState(Date.now)
  const error = event.error ?? tickets.error

  if (isRegistrationClosedError(error) || (isApiError(error) && error.status === 404)) {
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
  if (!event.data || !tickets.data) return <p role="status">{t('common.loading')}</p>
  if (eventRegistration(event.data, now) !== 'open') {
    return <InlineAlert tone="warn">{t('event.registrationUnavailable')}</InlineAlert>
  }
  const { items } = summarizeTickets(tickets.data, selectedQuantities(draft))
  if (!items.length) return <InlineAlert tone="warn">{t('event.checkoutEmpty')}</InlineAlert>

  return (
    <CheckoutForm
      event={event.data}
      eventPath={eventPath}
      tickets={tickets.data}
      items={items}
      originalItems={draft.items}
      initialPromo={draft.promo_code}
      campaign={draft.campaign}
      checkingStock={tickets.isFetching || event.isFetching}
    />
  )
}

type CheckoutFields = { buyer_name: string; terms: boolean }

function CheckoutForm({
  event,
  eventPath,
  tickets,
  items,
  originalItems,
  initialPromo,
  campaign,
  checkingStock,
}: {
  event: EventResponse
  eventPath: string
  tickets: TicketTypeWithAvailability[]
  items: CheckoutDraft['items']
  originalItems: CheckoutDraft['items']
  initialPromo: string | null
  campaign: string
  checkingStock: boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const me = useMe()
  const [promo, setPromo] = useState(initialPromo ?? '')
  const [applied, setApplied] = useState(initialPromo)
  const [submitError, setSubmitError] = useState<unknown>(null)
  const inFlight = useRef(false)
  const form = useForm<CheckoutFields>({ defaultValues: { buyer_name: '', terms: false } })
  const accepted = useWatch({ control: form.control, name: 'terms' })
  const preview = useOrderPreview(event.id, { items, promo_code: applied })
  const create = useCreateOrder(event.id)
  const promoFailure = [submitError, preview.error].find(
    (error) => isApiError(error) && promoErrors.has(error.error),
  )
  const otherError = promoFailure ? null : (submitError ?? preview.error)
  const needsSelection = isApiError(otherError) && unavailableErrors.has(otherError.error)
  const uncertainOrder =
    isApiError(submitError) && (submitError.status === 0 || submitError.status >= 500)
  const busy = form.formState.isSubmitting || create.isPending
  const changed = originalItems.some(
    (item) =>
      !items.some(
        (current) =>
          current.ticket_type_id === item.ticket_type_id && current.quantity === item.quantity,
      ),
  )
  const names = new Map(tickets.map((ticket) => [ticket.id, ticket.name]))

  function applyPromo(value: string | null) {
    setSubmitError(null)
    if (value === applied) void preview.refetch()
    else setApplied(value)
    setPromo(value ?? '')
    saveCheckoutDraft(event.id, { items: originalItems, promo_code: value, campaign })
  }

  async function submit(values: CheckoutFields) {
    if (
      inFlight.current ||
      !values.terms ||
      !me.data ||
      !preview.data ||
      preview.isFetching ||
      preview.isError ||
      checkingStock ||
      promoFailure
    )
      return
    inFlight.current = true
    setSubmitError(null)
    try {
      const order = await create.mutateAsync({
        buyer_name: values.buyer_name.trim(),
        items,
        promo_code: preview.data.promo_code,
      })
      clearCheckoutDraft(event.id)
      void navigate(`/orders/${order.id}`, { replace: true })
    } catch (error) {
      if (isApiError(error) && error.status === 422 && error.fields?.buyer_name) {
        form.setError('buyer_name', { message: t('validation.invalid') }, { shouldFocus: true })
      } else {
        setSubmitError(error)
      }
    } finally {
      inFlight.current = false
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => void form.handleSubmit(submit)(event)}
      className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]"
    >
      <section className="min-w-0 space-y-4 rounded-lg border border-line bg-surface p-4 sm:p-5">
        <h2 className="type-card-title">{t('checkout.buyer')}</h2>
        <FormField
          label={t('checkout.buyerName')}
          error={form.formState.errors.buyer_name?.message}
        >
          {(control) => (
            <Input
              {...control}
              autoComplete="name"
              required
              maxLength={200}
              readOnly={busy}
              {...form.register('buyer_name', {
                validate: (name) => !!name.trim() || t('checkout.nameRequired'),
                maxLength: { value: 200, message: t('validation.invalid') },
              })}
            />
          )}
        </FormField>
        {me.data ? (
          <dl className="space-y-1 wrap-anywhere">
            <dt className="type-label">{t('checkout.email')}</dt>
            <dd>{me.data.email}</dd>
          </dl>
        ) : me.isError ? (
          <ErrorState
            title={t('checkout.profileError')}
            description={t(errorMessageKey(me.error))}
            onRetry={() => void me.refetch()}
          />
        ) : (
          <p role="status">{t('common.loading')}</p>
        )}
        <div className="space-y-1 border-t border-line pt-4">
          <h3 className="type-label">{t('event.refundPolicy')}</h3>
          <p className="type-small whitespace-pre-wrap wrap-anywhere text-ink-2">
            {event.refund_policy?.trim() || t('checkout.noRefundPolicy')}
          </p>
        </div>
        <Controller
          control={form.control}
          name="terms"
          render={({ field }) => (
            <CheckboxField
              label={t('checkout.terms')}
              checked={field.value}
              onCheckedChange={(value) => field.onChange(value === true)}
              disabled={busy}
            />
          )}
        />
      </section>

      <section
        aria-label={t('event.tickets')}
        className="min-w-0 space-y-4 rounded-lg border border-line bg-surface p-4 sm:p-5"
      >
        <h2 className="type-card-title wrap-anywhere">{event.title}</h2>
        {changed && <InlineAlert tone="warn">{t('checkout.selectionChanged')}</InlineAlert>}
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.ticket_type_id} className="wrap-anywhere">
              {names.get(item.ticket_type_id)} × {item.quantity}
            </li>
          ))}
        </ul>
        <div className="space-y-2 border-t border-line pt-4">
          <FormField
            label={t('checkout.promo')}
            error={promoFailure ? t(errorMessageKey(promoFailure)) : undefined}
          >
            {(control) => (
              <div className="flex flex-wrap items-start gap-2">
                <Input
                  {...control}
                  value={promo}
                  maxLength={32}
                  autoComplete="off"
                  disabled={busy}
                  className="flex-1"
                  onChange={(event) => setPromo(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      if (promo.trim() && !busy && !checkingStock) applyPromo(promo.trim())
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!promo.trim() || busy || checkingStock || preview.isFetching}
                  onClick={() => applyPromo(promo.trim())}
                >
                  {t('checkout.applyPromo')}
                </Button>
              </div>
            )}
          </FormField>
          {preview.data?.promo_code && (
            <p className="type-small wrap-anywhere text-status-ok-fg">
              {t('event.promo', { code: preview.data.promo_code })}
            </p>
          )}
          {applied && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="px-0"
              disabled={busy}
              onClick={() => applyPromo(null)}
            >
              {t('checkout.withoutPromo')}
            </Button>
          )}
        </div>
        {otherError && (
          <InlineAlert tone="danger" role="alert">
            <p>{t(errorMessageKey(otherError))}</p>
            {needsSelection && (
              <Link className="underline" to={eventPath}>
                {t('checkout.updateSelection')}
              </Link>
            )}
            {uncertainOrder && (
              <Link className="underline" to="/my/orders">
                {t('checkout.checkOrders')}
              </Link>
            )}
            {preview.isError && !needsSelection && (
              <Button
                type="button"
                variant="link"
                className="px-0"
                onClick={() => void preview.refetch()}
              >
                {t('common.retry')}
              </Button>
            )}
          </InlineAlert>
        )}
        {preview.isFetching && <p role="status">{t('checkout.calculating')}</p>}
        {preview.data && !preview.isError && (
          <dl className="space-y-2 border-t border-line pt-4">
            <div className="flex justify-between gap-2">
              <dt>{t('checkout.subtotal')}</dt>
              <dd>{formatKZT(preview.data.subtotal)}</dd>
            </div>
            {preview.data.discount > 0 && (
              <div className="flex justify-between gap-2">
                <dt>{t('checkout.discount')}</dt>
                <dd>−{formatKZT(preview.data.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-2 font-semibold">
              <dt>{t('checkout.total')}</dt>
              <dd>{formatKZT(preview.data.total)}</dd>
            </div>
          </dl>
        )}
        {preview.data && !preview.isError && preview.data.total > 0 && <DemoBanner />}
        <Button
          type="submit"
          size="lg"
          className="w-full whitespace-normal"
          loading={busy}
          disabled={
            !accepted ||
            !me.data ||
            !preview.data ||
            preview.isFetching ||
            preview.isError ||
            checkingStock ||
            !!promoFailure
          }
        >
          {t(preview.data?.total === 0 ? 'checkout.register' : 'checkout.reserve')}
        </Button>
      </section>
    </form>
  )
}
