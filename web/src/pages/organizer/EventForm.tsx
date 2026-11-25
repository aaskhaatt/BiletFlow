import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { errorCodeOf, errorMessageKey } from '@/api/error-codes'
import type { EventResponse } from '@/api/generated/model'
import {
  useCreateEvent,
  useDeleteEventImage,
  usePublishEvent,
  useUpdateEvent,
  useUploadEventImage,
} from '@/api/hooks/organizer-events'
import DateTimeField from '@/components/DateTimeField'
import InlineAlert from '@/components/InlineAlert'
import RadioCards from '@/components/RadioCards'
import SelectField from '@/components/SelectField'
import StatusBadge from '@/components/StatusBadge'
import TextareaField from '@/components/TextareaField'
import TextField from '@/components/TextField'
import { Button } from '@/components/ui/button'
import { categoryOptions, knownCategory } from '@/lib/event-categories'
import { applyServerFieldErrors } from '@/lib/form-errors'
import {
  changesOf,
  createPayload,
  valuesOf,
  VISIBILITIES,
  visibilityOf,
  type After,
  type FormValues,
  length,
  text,
} from '@/pages/organizer/event-form-values'
import CoverCard from '@/pages/organizer/CoverCard'
import OrganizerPage from '@/pages/organizer/OrganizerPage'
import PaidSalesCard from '@/pages/organizer/PaidSalesCard'
import TicketTypesCard from '@/pages/organizer/TicketTypesCard'

const NO_CATEGORY = '__none__'
const REFUND_POLICY_MAX = 2000

/**
 * The form of a new event (`event` missing) and of an existing one (Figma G1, G2):
 * basics, cover, date and place, registration window, access and refund policy.
 * "Сохранить черновик" creates the event and opens its page; changing an event sends
 * only the fields that changed.
 */
export default function EventForm({ event, notice }: { event?: EventResponse; notice?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createEvent = useCreateEvent()
  const updateEvent = useUpdateEvent()
  const publishEvent = usePublishEvent()
  const uploadImage = useUploadEventImage()
  const deleteImage = useDeleteEventImage()
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const {
    register,
    control,
    handleSubmit,
    setError,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: valuesOf(event) })
  const refundPolicy = useWatch({ control, name: 'refundPolicy' })
  const isDraft = !event || event.status === 'draft'
  const refundLength = length(refundPolicy ?? '')

  const categories = categoryOptions()
  const stored = event?.category
  const options = [
    { value: NO_CATEGORY, label: t('eventForm.noCategory') },
    ...categories,
    // A category that isn't on the list (an older or foreign one) stays selectable, as it is
    ...(stored && !knownCategory(stored) ? [{ value: stored, label: stored }] : []),
  ]

  async function save(values: FormValues, after: After) {
    if (saving) return
    if (after === 'publish' || !isDraft) {
      const missing = [
        !text(values.venueName) &&
          setError('venueName', { type: 'required', message: t('eventForm.dates.venueRequired') }),
        !text(values.venueAddress) &&
          setError('venueAddress', {
            type: 'required',
            message: t('eventForm.dates.addressRequired'),
          }),
      ].filter((item) => item !== false)
      if (missing.length > 0) return
    }

    setSaving(true)
    let id = event?.id
    try {
      if (event) {
        const data = changesOf(values, event)
        if (Object.keys(data).length > 0) await updateEvent.mutateAsync({ eventId: event.id, data })
      } else {
        const created = await createEvent.mutateAsync({ data: createPayload(values) })
        id = created.id
        if (coverFile) {
          try {
            await uploadImage.mutateAsync({ eventId: id, data: { file: coverFile } })
          } catch (error) {
            // The event exists now: go on to its editor, where the cover can be tried again
            await navigate(`/organizer/events/${id}/edit`, {
              replace: true,
              state: {
                notice: t('eventForm.savedPartly.coverFailed', {
                  reason: t(errorMessageKey(error)),
                }),
              },
            })
            return
          }
        }
      }
    } catch (error) {
      setSaving(false)
      const message = t(errorMessageKey(error))
      const code = errorCodeOf(error)
      if (code === 'InvalidEventTimeError')
        setError('end', { type: 'server', message }, { shouldFocus: true })
      else if (
        !applyServerFieldErrors(error, setError, {
          message: t('validation.invalid'),
          fieldMap: {
            start_time: 'start',
            end_time: 'end',
            venue_name: 'venueName',
            venue_address: 'venueAddress',
            registration_opens_at: 'registrationOpens',
            registration_closes_at: 'registrationCloses',
            refund_policy: 'refundPolicy',
          },
        })
      ) {
        setError('root.server', { type: 'server', message })
      }
      return
    }

    // The event is saved. From here a failure must not create it a second time.
    const eventId = id!
    if (after === 'publish' && isDraft) {
      try {
        await publishEvent.mutateAsync({ eventId })
      } catch (error) {
        await navigate(`/organizer/events/${eventId}/edit`, {
          replace: true,
          state: {
            notice: t('eventForm.savedPartly.publishFailed', { reason: t(errorMessageKey(error)) }),
          },
        })
        setSaving(false)
        return
      }
    }
    await navigate(
      after === 'preview' ? `/organizer/events/${eventId}/preview` : `/organizer/events/${eventId}`,
    )
  }

  const submit = (after: After) => () => void handleSubmit((values) => save(values, after))()

  const actions = (
    <>
      <Button type="button" variant="outline" size="sm" disabled={saving} onClick={submit('event')}>
        {t(isDraft ? 'eventForm.saveDraft' : 'eventForm.saveChanges')}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={saving}
        onClick={submit('preview')}
      >
        {t('eventForm.preview')}
      </Button>
      {isDraft && (
        <Button type="button" size="sm" loading={saving} onClick={submit('publish')}>
          {t('eventForm.publish')}
        </Button>
      )}
    </>
  )

  const crumbs = event
    ? [
        { label: t('organizerEvents.title'), to: '/organizer' },
        { label: event.title, to: `/organizer/events/${event.id}` },
        { label: t('eventForm.breadcrumbEdit') },
      ]
    : [{ label: t('organizerEvents.title'), to: '/organizer' }, { label: t('eventForm.newTitle') }]

  const wholeCapacity = (value: string) =>
    text(value) === '' ||
    (/^\d+$/.test(text(value)) && Number(value) >= 1) ||
    t('eventForm.basics.capacityInvalid')

  return (
    <OrganizerPage
      routeId={event ? 'organizer-event-edit' : 'organizer-event-new'}
      breadcrumb={crumbs}
      title={event ? event.title : t('eventForm.newTitle')}
      meta={<StatusBadge kind="event" status={event ? event.lifecycle : 'draft'} />}
      actions={actions}
    >
      {notice && (
        <InlineAlert tone="warn" role="alert">
          {notice}
        </InlineAlert>
      )}
      {errors.root?.server && (
        <InlineAlert tone="danger" role="alert">
          {errors.root.server.message}
        </InlineAlert>
      )}
      <form
        noValidate
        aria-label={t('eventForm.formLabel')}
        className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_25rem]"
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault()
          submit('event')()
        }}
      >
        <div className="space-y-6">
          <section
            aria-labelledby="basics-title"
            className="space-y-4 rounded-lg border border-line bg-surface p-6"
          >
            <h2 id="basics-title" className="type-card-title">
              {t('eventForm.basics.title')}
            </h2>
            <TextField
              label={t('eventForm.basics.name')}
              placeholder={t('eventForm.basics.namePlaceholder')}
              autoComplete="off"
              error={errors.title?.message}
              {...register('title', {
                validate: (value) => value.trim() !== '' || t('eventForm.basics.nameRequired'),
              })}
            />
            <TextareaField
              label={t('eventForm.basics.description')}
              placeholder={t('eventForm.basics.descriptionPlaceholder')}
              hint={t('eventForm.basics.descriptionHint')}
              rows={4}
              error={errors.description?.message}
              {...register('description')}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="category"
                render={({ field, fieldState }) => (
                  <SelectField
                    label={t('eventForm.basics.category')}
                    placeholder={t('eventForm.basics.categoryPlaceholder')}
                    options={options}
                    value={field.value || NO_CATEGORY}
                    onValueChange={(value) => field.onChange(value === NO_CATEGORY ? '' : value)}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                  />
                )}
              />
              <TextField
                label={t('eventForm.basics.capacity')}
                hint={t('eventForm.basics.capacityHint')}
                inputMode="numeric"
                autoComplete="off"
                error={errors.capacity?.message}
                {...register('capacity', { validate: wholeCapacity })}
              />
            </div>
          </section>

          <CoverCard
            imageUrl={event?.image_url}
            deferred={!event}
            onChoose={async (file) => {
              if (event) await uploadImage.mutateAsync({ eventId: event.id, data: { file } })
              else setCoverFile(file)
            }}
            onRemove={async () => {
              if (event) await deleteImage.mutateAsync({ eventId: event.id })
              else setCoverFile(null)
            }}
          />

          <section
            aria-labelledby="dates-title"
            className="space-y-4 rounded-lg border border-line bg-surface p-6"
          >
            <h2 id="dates-title" className="type-card-title">
              {t('eventForm.dates.title')}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="start"
                rules={{ validate: (value) => value !== null || t('eventForm.dates.required') }}
                render={({ field, fieldState }) => (
                  <DateTimeField
                    label={t('eventForm.dates.start')}
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
                name="end"
                rules={{
                  validate: (value) => {
                    if (value === null) return t('eventForm.dates.required')
                    const start = getValues('start')
                    return (
                      start === null ||
                      Date.parse(value) > Date.parse(start) ||
                      t('eventForm.dates.endAfterStart')
                    )
                  },
                }}
                render={({ field, fieldState }) => (
                  <DateTimeField
                    label={t('eventForm.dates.end')}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    error={fieldState.error?.message}
                  />
                )}
              />
            </div>
            <p className="rounded-md bg-brand-soft px-3.5 py-2.5 type-label text-brand-press">
              {t('eventForm.dates.zoneNote')}
            </p>
            <TextField
              label={t('eventForm.dates.venue')}
              placeholder={t('eventForm.dates.venuePlaceholder')}
              autoComplete="off"
              error={errors.venueName?.message}
              {...register('venueName')}
            />
            <TextField
              label={t('eventForm.dates.address')}
              placeholder={t('eventForm.dates.addressPlaceholder')}
              autoComplete="off"
              error={errors.venueAddress?.message}
              {...register('venueAddress')}
            />
          </section>

          <section
            aria-labelledby="registration-title"
            className="space-y-4 rounded-lg border border-line bg-surface p-6"
          >
            <h2 id="registration-title" className="type-card-title">
              {t('eventForm.registration.title')}
            </h2>
            <p className="type-label font-normal text-ink-2">
              {t('eventForm.registration.description')}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="registrationOpens"
                render={({ field, fieldState }) => (
                  <DateTimeField
                    label={t('eventForm.registration.opens')}
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
                name="registrationCloses"
                rules={{
                  validate: (value) => {
                    const opens = getValues('registrationOpens')
                    return (
                      value === null ||
                      opens === null ||
                      Date.parse(value) > Date.parse(opens) ||
                      t('eventForm.registration.closesAfterOpens')
                    )
                  },
                }}
                render={({ field, fieldState }) => (
                  <DateTimeField
                    label={t('eventForm.registration.closes')}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    error={fieldState.error?.message}
                  />
                )}
              />
            </div>
          </section>

          <section
            aria-labelledby="access-title"
            className="space-y-4 rounded-lg border border-line bg-surface p-6"
          >
            <h2 id="access-title" className="type-card-title">
              {t('eventForm.access.title')}
            </h2>
            <Controller
              control={control}
              name="visibility"
              render={({ field }) => (
                <RadioCards
                  label={t('eventForm.access.label')}
                  value={field.value}
                  onValueChange={(value) => field.onChange(visibilityOf(value))}
                  options={VISIBILITIES.map((value) => ({
                    value,
                    title: t(`eventForm.access.${value}`),
                    description: t(`eventForm.access.${value}Hint`),
                  }))}
                />
              )}
            />
          </section>

          <section
            aria-labelledby="refund-title"
            className="space-y-3 rounded-lg border border-line bg-surface p-6"
          >
            <h2 id="refund-title" className="type-card-title">
              {t('eventForm.refund.title')}
            </h2>
            <TextareaField
              label={t('eventForm.refund.label')}
              rows={5}
              error={errors.refundPolicy?.message}
              {...register('refundPolicy', {
                validate: (value) =>
                  length(value) <= REFUND_POLICY_MAX ||
                  t('eventForm.refund.tooLong', { max: REFUND_POLICY_MAX }),
              })}
            />
            <div className="flex justify-between gap-4 type-small text-ink-muted">
              <p>{t('eventForm.refund.hint')}</p>
              <p
                data-slot="refund-counter"
                className={refundLength > REFUND_POLICY_MAX ? 'text-status-danger-fg' : undefined}
              >
                {t('eventForm.refund.counter', { count: refundLength, max: REFUND_POLICY_MAX })}
              </p>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          {event ? (
            <>
              <TicketTypesCard event={event} />
              <PaidSalesCard
                eventId={event.id}
                locked={event.status === 'cancelled' || event.lifecycle === 'completed'}
              />
            </>
          ) : (
            <section className="space-y-2 rounded-lg border border-line bg-surface p-5">
              <h2 className="type-card-title">{t('ticketTypes.title')}</h2>
              <p className="type-label font-normal text-ink-2">{t('eventForm.ticketTypesLater')}</p>
            </section>
          )}
          <section className="space-y-2.5 rounded-lg border border-line bg-surface p-5">
            <h2 className="type-card-title">{t('eventForm.campaigns.title')}</h2>
            <p className="type-label font-normal text-ink-2">{t('eventForm.campaigns.text')}</p>
            {event && event.status === 'published' && (
              <Link
                to={`/organizer/campaigns?event=${event.id}`}
                className="type-label text-brand hover:underline"
              >
                {t('eventForm.campaigns.open')}
              </Link>
            )}
          </section>
        </div>
      </form>
    </OrganizerPage>
  )
}
