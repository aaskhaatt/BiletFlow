import { cn } from 'cn'
import { useId, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import { errorCodeOf, errorMessageKey } from '@/api/error-codes'
import type { CampaignResponse } from '@/api/generated/model'
import { useCampaignTicketTypes, useCreateCampaign, useUpdateCampaign } from '@/api/hooks/campaigns'
import { useMyEvents } from '@/api/hooks/organizer-events'
import CheckboxField from '@/components/CheckboxField'
import DateTimeField from '@/components/DateTimeField'
import { FieldMessage } from '@/components/FormField'
import InlineAlert from '@/components/InlineAlert'
import SelectField from '@/components/SelectField'
import StatusBadge from '@/components/StatusBadge'
import TextField from '@/components/TextField'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { applyServerFieldErrors } from '@/lib/form-errors'
import { formatKZT } from '@/lib/format'
import CampaignQrCard, { CampaignQrPlaceholder } from '@/pages/organizer/CampaignQrCard'
import CampaignResultsCard from '@/pages/organizer/CampaignResultsCard'
import {
  campaignStatus,
  changesOf,
  CODE_PATTERN,
  createPayload,
  discountTypeOf,
  generateCode,
  isWhole,
  text,
  valuesOf,
  type DiscountType,
  type FormValues,
} from '@/pages/organizer/campaign-values'
import OrganizerPage from '@/pages/organizer/OrganizerPage'

const DISCOUNT_TYPES: readonly DiscountType[] = ['percent', 'fixed']

/** How a new campaign is saved: on, or switched off at once. */
type After = 'activate' | 'off'

/** "Процент | Фиксированная сумма в ₸" (Figma "Тип скидки"): one choice, arrow keys move it. */
function DiscountTypeField({
  value,
  onValueChange,
  disabled,
}: {
  value: DiscountType
  onValueChange: (value: DiscountType) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const labelId = useId()

  return (
    <div className="flex flex-col gap-1.5" data-slot="discount-type">
      <span id={labelId} className="type-label text-ink">
        {t('organizerCampaigns.form.discountType')}
      </span>
      <RadioGroupPrimitive.Root
        aria-labelledby={labelId}
        value={value}
        disabled={disabled}
        onValueChange={(next) => onValueChange(discountTypeOf(next))}
        className="flex w-fit max-w-full flex-wrap rounded-md border border-line bg-paper"
      >
        {DISCOUNT_TYPES.map((type) => (
          <RadioGroupPrimitive.Item
            key={type}
            value={type}
            className={cn(
              'flex min-h-11 items-center justify-center rounded-[10px] px-4.5 type-label font-semibold text-ink-2 outline-none',
              'focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed',
              'data-[state=checked]:bg-brand data-[state=checked]:text-on-dark disabled:data-[state=checked]:bg-ink-muted',
            )}
          >
            {t(`organizerCampaigns.form.${type}`)}
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
    </div>
  )
}

/**
 * The form of a new campaign (`campaign` missing) and of an existing one (Figma
 * "Организатор / Новая кампания"). A new campaign is saved on or, with "Сохранить
 * выключенной", created and switched off at once (the API has no drafts). Once it
 * exists, only the name, the dates, the limit and the switch change; the discount,
 * the code and the ticket types are shown, locked.
 */
export default function CampaignForm({
  campaign,
  defaultEventId,
  notice,
  done,
}: {
  campaign?: CampaignResponse
  /** A new campaign for this event ("?event=" of the list). */
  defaultEventId?: number
  /** A warning to show above the form. */
  notice?: string
  /** A success message to show above the form. */
  done?: string
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const create = useCreateCampaign()
  const update = useUpdateCampaign()
  const events = useMyEvents()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [now] = useState(() => Date.now())
  const editing = campaign !== undefined
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    getValues,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: valuesOf(campaign, defaultEventId) })
  const eventId = Number(useWatch({ control, name: 'eventId' }))
  const discountType = useWatch({ control, name: 'discountType' })
  const hasEvent = Number.isInteger(eventId) && eventId > 0
  const types = useCampaignTicketTypes(eventId, { enabled: hasEvent })
  const paidTypes = (types.data ?? []).filter((type) => type.price > 0)
  const eventTitle = events.data?.find((event) => event.id === eventId)?.title

  // A cancelled event takes no new campaign (409), so it isn't offered. An existing
  // campaign keeps its event: the field only shows it, even before the events load.
  const eventOptions = campaign
    ? [{ value: String(campaign.event_id), label: eventTitle ?? `№${campaign.event_id}` }]
    : (events.data ?? [])
        .filter((event) => event.status !== 'cancelled')
        .map((event) => ({ value: String(event.id), label: event.title }))

  async function save(values: FormValues, after: After) {
    if (saving) return
    setSaving(true)
    setSaved(false)
    try {
      if (campaign) {
        const data = changesOf(values, campaign)
        const updated =
          Object.keys(data).length > 0
            ? await update.mutateAsync({ campaignId: campaign.id, data })
            : campaign
        reset(valuesOf(updated))
        setSaved(true)
        return
      }

      const created = await create.mutateAsync({
        eventId: Number(values.eventId),
        data: createPayload(values),
      })
      if (after === 'off') {
        try {
          await update.mutateAsync({ campaignId: created.id, data: { is_active: false } })
        } catch (error) {
          // The campaign exists now and is on: say so on its page, where it can be switched off
          await navigate(`/organizer/campaigns/${created.id}`, {
            replace: true,
            state: {
              notice: t('organizerCampaigns.form.savedPartly', {
                reason: t(errorMessageKey(error)),
              }),
            },
          })
          return
        }
      }
      await navigate(`/organizer/campaigns/${created.id}`, {
        state: { created: after === 'off' ? 'off' : 'on' },
      })
    } catch (error) {
      const code = errorCodeOf(error)
      const message = t(errorMessageKey(error))
      if (code === 'PromoCodeAlreadyExistsError') {
        setError('code', { type: 'server', message }, { shouldFocus: true })
      } else if (
        code === 'InvalidCampaignError' &&
        campaign &&
        text(values.maxRedemptions) !== ''
      ) {
        setError(
          'maxRedemptions',
          {
            type: 'server',
            message: t('organizerCampaigns.form.limitBelowUsed', {
              count: campaign.redemptions_count,
            }),
          },
          { shouldFocus: true },
        )
      } else if (
        !applyServerFieldErrors(error, setError, {
          message: t('validation.invalid'),
          fieldMap: {
            discount_value: 'discountValue',
            max_redemptions: 'maxRedemptions',
            starts_at: 'startsAt',
            ends_at: 'endsAt',
            ticket_type_ids: 'ticketTypeIds',
          },
        })
      ) {
        setError('root.server', { type: 'server', message })
      }
    } finally {
      setSaving(false)
    }
  }

  const submit = (after: After) => () => void handleSubmit((values) => save(values, after))()

  const actions = editing ? (
    <Button type="button" size="sm" loading={saving} onClick={submit('activate')}>
      {t('organizerCampaigns.form.saveChanges')}
    </Button>
  ) : (
    <>
      <Button type="button" variant="outline" size="sm" disabled={saving} onClick={submit('off')}>
        {t('organizerCampaigns.form.saveOff')}
      </Button>
      <Button type="button" size="sm" loading={saving} onClick={submit('activate')}>
        {t('organizerCampaigns.form.activate')}
      </Button>
    </>
  )

  const listCrumb = { label: t('organizerCampaigns.title'), to: '/organizer/campaigns' }

  const wholeFrom = (min: number, message: string) => (value: string) =>
    (isWhole(value) && Number(value) >= min) || message

  return (
    <OrganizerPage
      routeId={editing ? 'organizer-campaign' : 'organizer-campaign-new'}
      breadcrumb={[
        listCrumb,
        { label: editing ? campaign.name : t('organizerCampaigns.form.newTitle') },
      ]}
      title={editing ? campaign.name : t('organizerCampaigns.form.newTitle')}
      meta={
        editing ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <StatusBadge kind="campaign" status={campaignStatus(campaign, now)} />
            <p className="type-label font-normal text-ink-2">
              {[campaign.code, eventTitle].filter(Boolean).join(' · ')}
            </p>
          </div>
        ) : (
          <p className="type-body text-ink-2">{t('organizerCampaigns.form.newSubtitle')}</p>
        )
      }
      actions={actions}
    >
      {done && (
        <InlineAlert tone="ok" role="status">
          {done}
        </InlineAlert>
      )}
      {notice && (
        <InlineAlert tone="warn" role="alert">
          {notice}
        </InlineAlert>
      )}
      {saved && (
        <InlineAlert tone="ok" role="status">
          {t('organizerCampaigns.form.saved')}
        </InlineAlert>
      )}
      {errors.root?.server && (
        <InlineAlert tone="danger" role="alert">
          {errors.root.server.message}
        </InlineAlert>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_25rem]">
        <form
          noValidate
          aria-label={t('organizerCampaigns.form.formLabel')}
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault()
            submit('activate')()
          }}
        >
          <section
            aria-labelledby="campaign-params-title"
            className="space-y-4 rounded-lg border border-line bg-surface p-6"
          >
            <h2 id="campaign-params-title" className="type-card-title">
              {t('organizerCampaigns.form.params')}
            </h2>
            {editing && (
              <InlineAlert tone="info">{t('organizerCampaigns.form.locked')}</InlineAlert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label={t('organizerCampaigns.form.name')}
                placeholder={t('organizerCampaigns.form.namePlaceholder')}
                autoComplete="off"
                error={errors.name?.message}
                {...register('name', {
                  validate: (value) =>
                    value.trim() !== '' || t('organizerCampaigns.form.nameRequired'),
                })}
              />
              <Controller
                control={control}
                name="eventId"
                rules={{
                  validate: (value) =>
                    eventOptions.some((option) => option.value === value) ||
                    t('organizerCampaigns.form.eventRequired'),
                }}
                render={({ field, fieldState }) => (
                  <SelectField
                    label={t('organizerCampaigns.form.event')}
                    placeholder={t('organizerCampaigns.form.eventPlaceholder')}
                    options={eventOptions}
                    value={
                      eventOptions.some((option) => option.value === field.value) ? field.value : ''
                    }
                    onValueChange={(value) => {
                      field.onChange(value)
                      setValue('ticketTypeIds', [])
                    }}
                    onBlur={field.onBlur}
                    disabled={editing || !events.data}
                    error={fieldState.error?.message}
                  />
                )}
              />
            </div>
            {!editing && events.data && eventOptions.length === 0 && (
              <InlineAlert tone="info">
                {t('organizerCampaigns.form.noEvents')}{' '}
                <Link to="/organizer/events/new" className="font-semibold underline">
                  {t('organizerCampaigns.form.createEvent')}
                </Link>
              </InlineAlert>
            )}

            <Controller
              control={control}
              name="discountType"
              render={({ field }) => (
                <DiscountTypeField
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={editing}
                />
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              {editing ? (
                <TextField
                  label={t('organizerCampaigns.form.value')}
                  value={getValues('discountValue')}
                  readOnly
                  disabled
                />
              ) : (
                <TextField
                  label={t('organizerCampaigns.form.value')}
                  hint={t(
                    discountType === 'percent'
                      ? 'organizerCampaigns.form.valuePercentHint'
                      : 'organizerCampaigns.form.valueFixedHint',
                  )}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={discountType === 'percent' ? '20' : '1000'}
                  error={errors.discountValue?.message}
                  {...register('discountValue', {
                    validate: (value) => {
                      if (getValues('discountType') === 'percent') {
                        return (
                          (isWhole(value) && Number(value) >= 1 && Number(value) <= 100) ||
                          t('organizerCampaigns.form.valuePercentInvalid')
                        )
                      }
                      return wholeFrom(1, t('organizerCampaigns.form.valueFixedInvalid'))(value)
                    },
                  })}
                />
              )}
              <TextField
                label={t('organizerCampaigns.form.maxUses')}
                hint={t('organizerCampaigns.form.maxUsesHint')}
                inputMode="numeric"
                autoComplete="off"
                placeholder="100"
                error={errors.maxRedemptions?.message}
                {...register('maxRedemptions', {
                  validate: (value) => {
                    if (text(value) === '') return true
                    if (!isWhole(value) || Number(value) < 1)
                      return t('organizerCampaigns.form.maxUsesInvalid')
                    return (
                      !campaign ||
                      Number(value) >= campaign.redemptions_count ||
                      t('organizerCampaigns.form.limitBelowUsed', {
                        count: campaign.redemptions_count,
                      })
                    )
                  },
                })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="startsAt"
                render={({ field, fieldState }) => (
                  <DateTimeField
                    label={t('organizerCampaigns.form.startsAt')}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    error={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="endsAt"
                rules={{
                  validate: (value) => {
                    const start = getValues('startsAt')
                    return (
                      value === null ||
                      start === null ||
                      Date.parse(value) > Date.parse(start) ||
                      t('organizerCampaigns.form.endAfterStart')
                    )
                  },
                }}
                render={({ field, fieldState }) => (
                  <DateTimeField
                    label={t('organizerCampaigns.form.endsAt')}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    error={fieldState.error?.message}
                  />
                )}
              />
            </div>

            {editing ? (
              <TextField
                label={t('organizerCampaigns.form.code')}
                value={campaign.code}
                readOnly
                disabled
                className="font-semibold tracking-[0.0625rem]"
              />
            ) : (
              <div className="grid items-start gap-x-2.5 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Controller
                  control={control}
                  name="code"
                  rules={{
                    validate: (value) =>
                      text(value) === '' ||
                      CODE_PATTERN.test(text(value).toUpperCase()) ||
                      t('organizerCampaigns.form.codeInvalid'),
                  }}
                  render={({ field, fieldState }) => (
                    <TextField
                      label={t('organizerCampaigns.form.code')}
                      hint={t('organizerCampaigns.form.codeHint')}
                      placeholder={t('organizerCampaigns.form.codePlaceholder')}
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      maxLength={32}
                      className="font-semibold tracking-[0.0625rem] uppercase placeholder:font-normal placeholder:tracking-normal"
                      value={field.value}
                      onChange={(change) => field.onChange(change.target.value.toUpperCase())}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="sm:mt-[1.625rem]"
                  onClick={() => setValue('code', generateCode(), { shouldValidate: true })}
                >
                  {t('organizerCampaigns.form.generate')}
                </Button>
              </div>
            )}

            <fieldset className="space-y-2.5">
              <legend className="mb-2.5 type-label text-ink">
                {t('organizerCampaigns.form.ticketTypes')}
              </legend>
              {!hasEvent ? (
                <p className="type-small text-ink-muted">
                  {t('organizerCampaigns.form.ticketTypesPick')}
                </p>
              ) : types.isError ? (
                <InlineAlert tone="danger" role="alert">
                  {t(errorMessageKey(types.error))}
                </InlineAlert>
              ) : !types.data ? (
                <p role="status" className="type-small text-ink-muted">
                  {t('common.loading')}
                </p>
              ) : paidTypes.length === 0 ? (
                <InlineAlert tone="warn">{t('organizerCampaigns.form.noPaidTypes')}</InlineAlert>
              ) : (
                <Controller
                  control={control}
                  name="ticketTypeIds"
                  render={({ field, fieldState }) => (
                    <div className="space-y-2.5">
                      {paidTypes.map((type) => (
                        <CheckboxField
                          key={type.id}
                          label={`${type.name} · ${formatKZT(type.price)}`}
                          checked={field.value.includes(type.id)}
                          disabled={editing}
                          onCheckedChange={(checked) =>
                            field.onChange(
                              checked === true
                                ? [...field.value, type.id]
                                : field.value.filter((id) => id !== type.id),
                            )
                          }
                        />
                      ))}
                      <FieldMessage
                        id="campaign-ticket-types-message"
                        hint={t(
                          field.value.length === 0
                            ? 'organizerCampaigns.form.ticketTypesAll'
                            : 'organizerCampaigns.form.ticketTypesChosen',
                        )}
                        error={fieldState.error?.message}
                      />
                    </div>
                  )}
                />
              )}
            </fieldset>

            {editing && (
              <div className="flex items-center gap-3 rounded-md bg-paper px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p
                    id="campaign-active-label"
                    className="text-[0.9375rem] leading-[1.4] font-semibold"
                  >
                    {t('organizerCampaigns.form.active')}
                  </p>
                  <p id="campaign-active-hint" className="type-small text-ink-2">
                    {t('organizerCampaigns.form.activeHint')}
                  </p>
                </div>
                <Controller
                  control={control}
                  name="isActive"
                  render={({ field }) => (
                    <Switch
                      aria-labelledby="campaign-active-label"
                      aria-describedby="campaign-active-hint"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </div>
            )}
          </section>
        </form>

        <div className="space-y-6">
          {campaign ? <CampaignQrCard campaign={campaign} /> : <CampaignQrPlaceholder />}
          <CampaignResultsCard campaign={campaign} />
        </div>
      </div>
    </OrganizerPage>
  )
}
