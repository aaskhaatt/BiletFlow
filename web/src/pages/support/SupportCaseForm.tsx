import { cn } from 'cn'
import { useId, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import type { EventResponse, OrderResponse, SupportCaseCreate } from '@/api/generated/model'
import { useMyEvents } from '@/api/hooks/organizer-events'
import { useMyOrders } from '@/api/hooks/orders'
import { useOpenSupportCase } from '@/api/hooks/support'
import ErrorState from '@/components/ErrorState'
import InlineAlert from '@/components/InlineAlert'
import RadioCards from '@/components/RadioCards'
import SelectField from '@/components/SelectField'
import TextareaField from '@/components/TextareaField'
import TextField from '@/components/TextField'
import { Button } from '@/components/ui/button'
import { applyServerFieldErrors } from '@/lib/form-errors'
import { formatEventTime } from '@/lib/format'
import OrganizerPage from '@/pages/organizer/OrganizerPage'
import { SupportContextLabel, SupportEventTitle } from '@/pages/support/SupportLabels'
import {
  attendeeCategories,
  MAX_MESSAGE,
  MAX_SUBJECT,
  platformCategories,
  readCaseContext,
  type CaseContext,
} from '@/pages/support/support-values'
import SupportViewerPage from '@/pages/support/SupportViewerPage'

type CaseFields = { category: string; subject: string; message: string; reference: string }
type ContextChoice = {
  fixed?: CaseContext
  orders?: OrderResponse[]
  events?: EventResponse[]
}

const contextTitle = {
  event_id: 'supportCases.aboutEvent',
  order_id: 'supportCases.aboutOrder',
  ticket_id: 'supportCases.aboutTicket',
} as const

function FixedOrderContext({ context }: { context: CaseContext }) {
  const { data } = useMyOrders()
  const order = data?.find((item) =>
    context.key === 'order_id'
      ? item.id === context.id
      : item.tickets.some((ticket) => ticket.id === context.id),
  )
  return (
    <>
      <span>
        <SupportContextLabel context={context} />
      </span>
      {order && (
        <>
          {' · '}
          {order.event.title}
          <p className="mt-1 type-small text-ink-2">
            {formatEventTime(order.event.start_time, { withZone: true })}
          </p>
        </>
      )}
    </>
  )
}

function CaseForm({
  kind,
  fixed,
  orders,
  events,
}: ContextChoice & { kind: SupportCaseCreate['kind'] }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const create = useOpenSupportCase()
  const active = useRef(false)
  const [error, setError] = useState<unknown>()
  const form = useForm<CaseFields>({
    defaultValues: { category: '', subject: '', message: '', reference: 'none' },
  })
  const platform = kind === 'platform'
  const categories = platform ? platformCategories : attendeeCategories
  const categoryOptions = categories.map((value) => ({
    value,
    label: t(`supportCases.categories.${value}`),
  }))
  const scopeId = useId()
  const subjectCount = useWatch({ control: form.control, name: 'subject' })
  const messageCount = useWatch({ control: form.control, name: 'message' })
  const number = new Intl.NumberFormat(i18n.resolvedLanguage)
  const fields = form.formState.errors
  const busy = form.formState.isSubmitting
  const length = (value: string) => Array.from(value).length
  const textRules = (max: number) => ({
    validate: (value: string) => {
      const count = length(value.trim())
      return count === 0
        ? t('supportCases.required')
        : count <= max || t('supportCases.limited', { count: max })
    },
  })

  async function submit({ category, subject, message, reference }: CaseFields) {
    if (active.current) return
    active.current = true
    setError(undefined)
    const context = fixed
      ? { [fixed.key]: fixed.id }
      : reference === 'none'
        ? {}
        : { [platform ? 'event_id' : 'order_id']: Number(reference) }
    try {
      const created = await create.mutateAsync({
        kind,
        category,
        subject: subject.trim(),
        message: message.trim(),
        ...context,
      })
      await navigate(`/support/${created.id}`, { replace: true })
    } catch (error) {
      if (
        !applyServerFieldErrors(error, form.setError, {
          message: t('supportCases.invalidField'),
          fieldMap: { event_id: 'reference', order_id: 'reference', ticket_id: 'reference' },
        })
      )
        setError(error)
    } finally {
      active.current = false
    }
  }

  const orderOptions = orders?.map((order) => ({
    value: String(order.id),
    label: `${t('supportCases.orderNumber', { id: order.id })} · ${order.event.title}`,
  }))
  const eventOptions = (events ?? []).map((event) => ({
    value: String(event.id),
    label: event.title,
  }))
  const reference = (optional: boolean) => (
    <Controller
      name="reference"
      control={form.control}
      rules={{
        validate: (value) =>
          optional ||
          orderOptions?.some((order) => order.value === value) ||
          t('supportCases.chooseOrder'),
      }}
      render={({ field, fieldState }) => (
        <SelectField
          id={`${scopeId}-reference`}
          label={t(optional ? 'supportCases.event' : 'supportCases.about')}
          value={field.value === 'none' && !optional ? '' : field.value}
          onValueChange={field.onChange}
          onBlur={field.onBlur}
          placeholder={optional ? undefined : t('supportCases.chooseOrder')}
          hint={t(optional ? 'supportCases.optionalEvent' : 'supportCases.chooseOrderHelp')}
          options={
            optional
              ? [{ value: 'none', label: t('supportCases.noEvent') }, ...eventOptions]
              : (orderOptions ?? [])
          }
          required={!optional}
          disabled={busy || (optional && !events)}
          error={fieldState.error?.message}
        />
      )}
    />
  )

  return (
    <form
      noValidate
      onSubmit={(event) => void form.handleSubmit(submit)(event)}
      className={cn('space-y-4', platform && 'rounded-lg border border-line bg-surface p-4 sm:p-7')}
    >
      {!platform &&
        (fixed ? (
          <div className="rounded-md border border-line bg-surface p-3.5">
            <p className="type-small text-ink-muted">{t(contextTitle[fixed.key])}</p>
            <div className="mt-1 type-label wrap-anywhere">
              {fixed.key === 'event_id' ? (
                <SupportEventTitle id={fixed.id} withTime />
              ) : (
                <FixedOrderContext context={fixed} />
              )}
            </div>
            <p className="mt-1 type-small text-ink-2">{t('supportCases.contextHelp')}</p>
            {fields.reference && (
              <p role="alert" className="type-small text-status-danger-fg">
                {fields.reference.message}
              </p>
            )}
          </div>
        ) : (
          reference(false)
        ))}
      <Controller
        name="category"
        control={form.control}
        rules={{
          validate: (value) =>
            categoryOptions.some((category) => category.value === value) ||
            t('supportCases.requiredCategory'),
        }}
        render={({ field, fieldState }) =>
          platform ? (
            <RadioCards
              label={t('supportCases.category')}
              value={field.value}
              onValueChange={field.onChange}
              required
              disabled={busy}
              options={categoryOptions.map(({ value, label }) => ({ value, title: label }))}
              error={fieldState.error?.message}
            />
          ) : (
            <SelectField
              label={t('supportCases.category')}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              placeholder={t('supportCases.categoryPrompt')}
              options={categoryOptions}
              required
              disabled={busy}
              error={fieldState.error?.message}
            />
          )
        }
      />
      {platform && reference(true)}
      <div className="relative">
        <TextField
          {...form.register('subject', textRules(MAX_SUBJECT))}
          label={t('supportCases.subject')}
          placeholder={t('supportCases.subjectPlaceholder')}
          hint={t('supportCases.limit', { count: MAX_SUBJECT })}
          error={fields.subject?.message}
          readOnly={busy}
          required
        />
        <p
          aria-hidden="true"
          className={cn(
            'type-small text-right text-ink-muted',
            !fields.subject && 'absolute right-0 bottom-0',
          )}
        >
          {number.format(length(subjectCount))} / {number.format(MAX_SUBJECT)}
        </p>
      </div>
      <div className="relative">
        <TextareaField
          {...form.register('message', textRules(MAX_MESSAGE))}
          label={t('supportCases.message')}
          placeholder={t('supportCases.messagePlaceholder')}
          hint={t('supportCases.limit', { count: MAX_MESSAGE })}
          error={fields.message?.message}
          className="min-h-37.5"
          readOnly={busy}
          required
        />
        <p
          aria-hidden="true"
          className={cn(
            'type-small text-right text-ink-muted',
            !fields.message && 'absolute right-0 bottom-0',
          )}
        >
          {number.format(length(messageCount))} / {number.format(MAX_MESSAGE)}
        </p>
      </div>
      {error != null && (
        <InlineAlert tone="danger" role="alert">
          {t(errorMessageKey(error))}
        </InlineAlert>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={busy} className={platform ? undefined : 'w-full'}>
          {t(busy ? 'supportCases.sending' : 'supportCases.send')}
        </Button>
        {platform &&
          (busy ? (
            <Button type="button" variant="outline" disabled>
              {t('common.cancel')}
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link to="/organizer/support">{t('common.cancel')}</Link>
            </Button>
          ))}
      </div>
      {!platform && <p className="type-small text-ink-2">{t('supportCases.replyByEmail')}</p>}
    </form>
  )
}

function OrderCaseForm() {
  const { t } = useTranslation()
  const orders = useMyOrders()
  if (orders.isError)
    return (
      <ErrorState
        title={t('supportCases.ordersError')}
        description={t(errorMessageKey(orders.error))}
        onRetry={() => void orders.refetch()}
        retrying={orders.isFetching}
      />
    )
  if (!orders.data) return <p role="status">{t('common.loading')}</p>
  return orders.data.length ? (
    <CaseForm kind="attendee" orders={orders.data} />
  ) : (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
      <p>{t('supportCases.noOrders')}</p>
      <Button variant="outline" asChild>
        <Link to="/">{t('event.toCatalog')}</Link>
      </Button>
    </div>
  )
}

export function NewSupportCasePage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const context = readCaseContext(params)
  return (
    <SupportViewerPage
      routeId="new-support-case"
      title={t('supportCases.newCase')}
      back={{ to: '/support', label: t('supportCases.myCases') }}
    >
      {context ? (
        <CaseForm key={`${context.key}:${context.id}`} kind="attendee" fixed={context} />
      ) : (
        <OrderCaseForm />
      )}
    </SupportViewerPage>
  )
}

export function NewPlatformCasePage() {
  const { t } = useTranslation()
  const events = useMyEvents()
  return (
    <OrganizerPage
      routeId="organizer-new-support-case"
      title={t('supportCases.platformTitle')}
      breadcrumb={[{ to: '/organizer/support', label: t('nav.support') }]}
    >
      <div className="max-w-180 space-y-5">
        <p className="type-body text-ink-2">{t('supportCases.platformIntro')}</p>
        {events.isError && (
          <ErrorState
            title={t('supportCases.eventsError')}
            description={t(errorMessageKey(events.error))}
            onRetry={() => void events.refetch()}
            retrying={events.isFetching}
          />
        )}
        <CaseForm kind="platform" events={events.data} />
      </div>
    </OrganizerPage>
  )
}
