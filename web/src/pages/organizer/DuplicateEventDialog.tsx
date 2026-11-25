import { useState, type ReactElement } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { errorMessageKey } from '@/api/error-codes'
import type { EventResponse } from '@/api/generated/model'
import { useDuplicateEvent } from '@/api/hooks/organizer-events'
import DateTimeField from '@/components/DateTimeField'
import InlineAlert from '@/components/InlineAlert'
import TextField from '@/components/TextField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { applyServerFieldErrors } from '@/lib/form-errors'

type FormValues = { title: string; start: string | null }

function DuplicateForm({ event, onClose }: { event: EventResponse; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const duplicate = useDuplicateEvent()
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: { title: '', start: null } })

  async function submit(values: FormValues) {
    const title = values.title.trim()
    try {
      const copy = await duplicate.mutateAsync({
        eventId: event.id,
        // Nothing sent keeps the title and the dates; a new start moves every date of the copy
        data: {
          ...(title && { title }),
          ...(values.start && { start_time: values.start }),
        },
      })
      toast.success(t('duplicateDialog.created'))
      onClose()
      await navigate(`/organizer/events/${copy.id}`)
    } catch (error) {
      if (
        !applyServerFieldErrors(error, setError, {
          message: t('validation.invalid'),
          fieldMap: { start_time: 'start' },
        })
      ) {
        setError('root.server', { type: 'server', message: t(errorMessageKey(error)) })
      }
    }
  }

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
        <DialogTitle>{t('duplicateDialog.title')}</DialogTitle>
        <DialogDescription>{t('duplicateDialog.description')}</DialogDescription>
      </div>
      <TextField
        label={t('duplicateDialog.name')}
        placeholder={event.title}
        autoComplete="off"
        error={errors.title?.message}
        {...register('title')}
      />
      <Controller
        control={control}
        name="start"
        render={({ field, fieldState }) => (
          <DateTimeField
            label={t('duplicateDialog.start')}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            name={field.name}
            error={fieldState.error?.message}
          />
        )}
      />
      <p className="type-small text-ink-muted">{t('duplicateDialog.startHint')}</p>
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
          {t('duplicateDialog.submit')}
        </Button>
      </div>
    </form>
  )
}

/**
 * "Дублировать в черновик": a copy of the event as a draft, with its ticket types.
 * Optionally a new title and a new start (every other date moves by the same amount).
 */
export default function DuplicateEventDialog({
  event,
  trigger,
}: {
  event: EventResponse
  trigger: ReactElement
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-7"
      >
        <DuplicateForm event={event} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
