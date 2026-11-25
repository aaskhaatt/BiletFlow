import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { errorCodeOf, errorMessageKey } from '@/api/error-codes'
import type {
  EventResponse,
  TicketTypeUpdate,
  TicketTypeWithAvailability,
} from '@/api/generated/model'
import {
  useCreateTicketType,
  useHideTicketType,
  useUnhideTicketType,
  useUpdateTicketType,
} from '@/api/hooks/organizer-ticket-types'
import DateTimeField from '@/components/DateTimeField'
import InlineAlert from '@/components/InlineAlert'
import TextareaField from '@/components/TextareaField'
import TextField from '@/components/TextField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { applyServerFieldErrors } from '@/lib/form-errors'
import { fromEventLocalInput, toEventLocalInput } from '@/lib/event-time'

/** What a new ticket type starts with, and how many tickets one order may take by default. */
const DEFAULT_MAX_PER_ORDER = 10

type FormValues = {
  name: string
  description: string
  price: string
  quantity: string
  salesStart: string | null
  salesEnd: string | null
  maxPerOrder: string
  hidden: boolean
}

const isWhole = (text: string) => /^\d+$/.test(text.trim())

function defaultsFor(event: EventResponse, type?: TicketTypeWithAvailability): FormValues {
  if (type) {
    return {
      name: type.name,
      description: type.description ?? '',
      price: String(type.price),
      quantity: String(type.quantity),
      salesStart: type.sales_start,
      salesEnd: type.sales_end,
      maxPerOrder: String(type.max_per_order),
      hidden: type.is_hidden,
    }
  }
  // Sales open now, minute-exact in Astana time, and close when the event starts
  const now = fromEventLocalInput(toEventLocalInput(new Date().toISOString()))
  return {
    name: '',
    description: '',
    price: '',
    quantity: '',
    salesStart: now,
    salesEnd: event.start_time,
    maxPerOrder: String(DEFAULT_MAX_PER_ORDER),
    hidden: false,
  }
}

const sameMoment = (a: string | null, b: string | null) =>
  a !== null && b !== null && Date.parse(a) === Date.parse(b)

/** Only what changed: PATCH sends no field that stayed the same. */
function changesOf(values: FormValues, type: TicketTypeWithAvailability): TicketTypeUpdate {
  const data: TicketTypeUpdate = {}
  const name = values.name.trim()
  if (name !== type.name) data.name = name
  const description = values.description.trim()
  if (description !== (type.description ?? ''))
    data.description = description === '' ? null : description
  if (Number(values.price) !== type.price) data.price = Number(values.price)
  if (Number(values.quantity) !== type.quantity) data.quantity = Number(values.quantity)
  if (!sameMoment(values.salesStart, type.sales_start)) data.sales_start = values.salesStart
  if (!sameMoment(values.salesEnd, type.sales_end)) data.sales_end = values.salesEnd
  if (Number(values.maxPerOrder) !== type.max_per_order)
    data.max_per_order = Number(values.maxPerOrder)
  return data
}

function TicketTypeForm({
  event,
  type,
  onClose,
}: {
  event: EventResponse
  type?: TicketTypeWithAvailability
  onClose: () => void
}) {
  const { t } = useTranslation()
  const create = useCreateTicketType()
  const update = useUpdateTicketType()
  const hide = useHideTicketType()
  const unhide = useUnhideTicketType()
  const {
    register,
    control,
    handleSubmit,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: defaultsFor(event, type) })
  const editing = type !== undefined

  async function submit(values: FormValues) {
    const name = values.name.trim()
    const description = values.description.trim()
    try {
      if (type) {
        const data = changesOf(values, type)
        if (Object.keys(data).length > 0) {
          await update.mutateAsync({ ticketTypeId: type.id, data })
        }
        if (values.hidden !== type.is_hidden) {
          await (values.hidden ? hide : unhide).mutateAsync({ ticketTypeId: type.id })
        }
      } else {
        await create.mutateAsync({
          eventId: event.id,
          data: {
            name,
            description: description === '' ? undefined : description,
            price: Number(values.price),
            quantity: Number(values.quantity),
            sales_start: values.salesStart!,
            sales_end: values.salesEnd!,
            max_per_order: Number(values.maxPerOrder),
          },
        })
      }
      onClose()
    } catch (error) {
      const code = errorCodeOf(error)
      const message = t(errorMessageKey(error))
      if (code === 'QuantityBelowSoldError')
        setError('quantity', { type: 'server', message }, { shouldFocus: true })
      else if (code === 'InvalidTicketSalesTimeError')
        setError('salesEnd', { type: 'server', message }, { shouldFocus: true })
      else if (
        !applyServerFieldErrors(error, setError, {
          message: t('validation.invalid'),
          fieldMap: {
            sales_start: 'salesStart',
            sales_end: 'salesEnd',
            max_per_order: 'maxPerOrder',
          },
        })
      ) {
        setError('root.server', { type: 'server', message })
      }
    }
  }

  const wholeNumber = (min: number) => (value: string) =>
    (isWhole(value) && Number(value) >= min) || t('ticketTypeForm.wholeNumber', { min })

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(submitEvent) => {
        if (isSubmitting) {
          submitEvent.preventDefault()
          return
        }
        void handleSubmit(submit)(submitEvent)
      }}
    >
      <div className="space-y-1.5">
        <DialogTitle className="text-[1.375rem] leading-[1.3]">
          {t(editing ? 'ticketTypeForm.editTitle' : 'ticketTypeForm.createTitle')}
        </DialogTitle>
        <DialogDescription>{t('ticketTypeForm.event', { title: event.title })}</DialogDescription>
      </div>

      <TextField
        label={t('ticketTypeForm.name')}
        autoComplete="off"
        error={errors.name?.message}
        {...register('name', {
          validate: (value) => value.trim() !== '' || t('ticketTypeForm.nameRequired'),
        })}
      />
      <TextareaField
        label={t('ticketTypeForm.description')}
        rows={3}
        error={errors.description?.message}
        {...register('description')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t('ticketTypeForm.price')}
          hint={t('ticketTypeForm.priceHint')}
          inputMode="numeric"
          autoComplete="off"
          error={errors.price?.message}
          {...register('price', { validate: wholeNumber(0) })}
        />
        <TextField
          label={t('ticketTypeForm.quantity')}
          hint={type ? t('ticketTypeForm.sold', { count: type.sold_count }) : undefined}
          inputMode="numeric"
          autoComplete="off"
          error={errors.quantity?.message}
          {...register('quantity', {
            validate: (value) => {
              const whole = wholeNumber(1)(value)
              if (whole !== true) return whole
              return !type || Number(value) >= type.sold_count || t('errors.QuantityBelowSoldError')
            },
          })}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name="salesStart"
          rules={{ validate: (value) => value !== null || t('ticketTypeForm.dateRequired') }}
          render={({ field, fieldState }) => (
            <DateTimeField
              label={t('ticketTypeForm.salesStart')}
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
          name="salesEnd"
          rules={{
            validate: (value) => {
              if (value === null) return t('ticketTypeForm.dateRequired')
              const start = getValues('salesStart')
              return (
                start === null ||
                Date.parse(value) > Date.parse(start) ||
                t('ticketTypeForm.endAfterStart')
              )
            },
          }}
          render={({ field, fieldState }) => (
            <DateTimeField
              label={t('ticketTypeForm.salesEnd')}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              error={fieldState.error?.message}
            />
          )}
        />
      </div>
      <TextField
        fieldClassName="sm:w-56"
        label={t('ticketTypeForm.maxPerOrder')}
        hint={t('ticketTypeForm.maxPerOrderHint', { count: DEFAULT_MAX_PER_ORDER })}
        inputMode="numeric"
        autoComplete="off"
        error={errors.maxPerOrder?.message}
        {...register('maxPerOrder', { validate: wholeNumber(1) })}
      />

      {editing && (
        <div className="flex items-center gap-3 rounded-md bg-paper px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p id="hide-type-label" className="text-[0.9375rem] leading-[1.4] font-semibold">
              {t('ticketTypeForm.hide')}
            </p>
            <p id="hide-type-hint" className="type-small text-ink-2">
              {t('ticketTypeForm.hideHint')}
            </p>
          </div>
          <Controller
            control={control}
            name="hidden"
            render={({ field }) => (
              <Switch
                aria-labelledby="hide-type-label"
                aria-describedby="hide-type-hint"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </div>
      )}

      {errors.root?.server && (
        <InlineAlert tone="danger" role="alert">
          {errors.root.server.message}
        </InlineAlert>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <Button type="button" variant="outline" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {t('ticketTypeForm.save')}
        </Button>
      </div>
    </form>
  )
}

/**
 * The dialog to create a ticket type, or to change `type` (Figma G3). Mount it
 * when it should open; it starts from the type's values every time.
 */
export default function TicketTypeDialog({
  event,
  type,
  onClose,
}: {
  event: EventResponse
  type?: TicketTypeWithAvailability
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-7 sm:max-w-[32.5rem]"
      >
        <TicketTypeForm event={event} type={type} onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}
