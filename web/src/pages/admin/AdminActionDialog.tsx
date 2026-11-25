import { useId, type ComponentProps, type ReactNode } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/api/error-codes'
import type { EventReportResponse, EventReportReviewStatus } from '@/api/generated/model'
import { useAdminAction, type AdminAction } from '@/api/hooks/admin'
import InlineAlert from '@/components/InlineAlert'
import RadioCards from '@/components/RadioCards'
import TextareaField from '@/components/TextareaField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { applyServerFieldErrors } from '@/lib/form-errors'
import { AdminEventName, AdminTime, AdminUserEmail, ReportReasonLabel } from './AdminPage'

type ReasonAction = Extract<AdminAction, { reason: string }>['type']
type ConfirmAction = Exclude<AdminAction, { reason: string } | { type: 'review' }>['type']
export type AdminDialogTarget =
  | {
      type: ReasonAction | ConfirmAction
      id: number
      label: ReactNode
      trigger: HTMLElement
    }
  | {
      type: 'review'
      report: EventReportResponse
      trigger: HTMLElement
    }

const ACTIONS = {
  suspendEvent: { reason: true, danger: true },
  unsuspendEvent: { reason: false, danger: false },
  suspendUser: { reason: true, danger: true },
  unsuspendUser: { reason: false, danger: false },
  suspendPaidSales: { reason: true, danger: true },
  reinstatePaidSales: { reason: false, danger: false },
  approveOrganizer: { reason: false, danger: false },
  rejectOrganizer: { reason: true, danger: true },
} as const

function AdminDialogFrame({
  title,
  description,
  confirm,
  busy,
  danger,
  wide,
  trigger,
  onClose,
  onSubmit,
  children,
}: {
  title: string
  description?: ReactNode
  confirm: string
  busy: boolean
  danger?: boolean
  wide?: boolean
  trigger: HTMLElement
  onClose: () => void
  onSubmit: React.FormEventHandler<HTMLFormElement>
  children?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent
        className={
          wide
            ? 'max-h-[calc(100dvh-2rem)] overflow-y-auto p-7 sm:max-w-[560px]'
            : 'max-h-[calc(100dvh-2rem)] overflow-y-auto p-7 sm:max-w-[480px]'
        }
        showCloseButton={!busy}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault()
        }}
        onInteractOutside={(event) => {
          event.preventDefault()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          const destination = trigger.isConnected
            ? trigger
            : document.getElementById('main-content')
          destination?.focus()
        }}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription asChild className={description ? undefined : 'sr-only'}>
          <div>{description ?? title}</div>
        </DialogDescription>
        <form noValidate className="space-y-4" onSubmit={onSubmit}>
          {children}
          <div className="flex flex-wrap justify-end gap-2.5">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant={danger ? 'destructive' : 'default'}
              loading={busy}
              disabled={busy}
            >
              {confirm}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CountedTextarea({
  length,
  maxLength,
  ...props
}: ComponentProps<typeof TextareaField> & { length: number; maxLength: number }) {
  const countId = useId()
  return (
    <TextareaField
      {...props}
      maxLength={maxLength}
      aria-describedby={countId}
      messageAside={
        <span id={countId} className="ml-auto shrink-0 type-small text-ink-muted tabular-nums">
          {length} / {maxLength}
        </span>
      }
    />
  )
}

function ChangeDialog({
  target,
  onClose,
}: {
  target: Exclude<AdminDialogTarget, { type: 'review' }>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const action = useAdminAction()
  const { type, id } = target
  const config = ACTIONS[type]
  const { register, handleSubmit, control, setError, formState } = useForm({
    defaultValues: { reason: '' },
  })
  const reason = useWatch({ control, name: 'reason' })
  const key = `adminZone.actions.${type}` as const
  const busy = action.isPending || formState.isSubmitting

  const submit = handleSubmit(async ({ reason }) => {
    const text = reason.trim()
    action.reset()
    try {
      if (config.reason) {
        await action.mutateAsync({ type: type as ReasonAction, id, reason: text })
      } else {
        await action.mutateAsync({ type: type as ConfirmAction, id })
      }
      onClose()
    } catch (error) {
      if (applyServerFieldErrors(error, setError, { message: t(errorMessageKey(error)) })) {
        action.reset()
      }
    }
  })

  return (
    <AdminDialogFrame
      title={t(`${key}.title`)}
      description={target.label}
      confirm={t(`${key}.confirm`)}
      busy={busy}
      danger={config.danger}
      wide={config.reason}
      trigger={target.trigger}
      onClose={onClose}
      onSubmit={submit}
    >
      {config.danger ? (
        <InlineAlert tone="danger">
          <p className="font-semibold">{t('adminZone.consequences')}</p>
          <p className="mt-1 type-small">{t(`${key}.description`)}</p>
        </InlineAlert>
      ) : (
        <p className="type-body text-ink-2">{t(`${key}.description`)}</p>
      )}
      {config.reason && (
        <CountedTextarea
          {...register('reason', {
            validate: (value) =>
              (value.trim().length >= 3 && value.trim().length <= 500) ||
              t('adminZone.reasonLength'),
          })}
          label={t('adminZone.reason')}
          placeholder={t('adminZone.reasonPlaceholder')}
          hint={t('adminZone.reasonLength')}
          error={formState.errors.reason?.message}
          length={reason.length}
          maxLength={500}
          disabled={busy}
        />
      )}
      {action.isError && (
        <InlineAlert tone="danger" role="alert">
          {t(errorMessageKey(action.error))}
        </InlineAlert>
      )}
    </AdminDialogFrame>
  )
}

function ReviewDialog({
  target,
  onClose,
}: {
  target: Extract<AdminDialogTarget, { type: 'review' }>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { report } = target
  const action = useAdminAction()
  const { register, control, setError, handleSubmit, formState } = useForm<{
    status: EventReportReviewStatus | ''
    note: string
  }>({ defaultValues: { status: '', note: '' } })
  const note = useWatch({ control, name: 'note' })
  const busy = action.isPending || formState.isSubmitting

  const submit = handleSubmit(async ({ status, note }) => {
    if (!status) return
    action.reset()
    try {
      await action.mutateAsync({
        type: 'review',
        id: report.id,
        data: { status, note: note.trim() || null },
      })
      onClose()
    } catch (error) {
      if (applyServerFieldErrors(error, setError, { message: t(errorMessageKey(error)) })) {
        action.reset()
      }
    }
  })

  return (
    <AdminDialogFrame
      title={t('adminZone.reports.reviewTitle')}
      confirm={t('adminZone.reports.save')}
      busy={busy}
      wide
      trigger={target.trigger}
      onClose={onClose}
      onSubmit={submit}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-md bg-paper p-4 type-small">
        <dt>{t('adminZone.columns.event')}</dt>
        <dd>
          <AdminEventName id={report.event_id} />
        </dd>
        <dt>{t('adminZone.reason')}</dt>
        <dd>
          <ReportReasonLabel reason={report.reason} />
        </dd>
        <dt>{t('adminZone.reports.details')}</dt>
        <dd className="wrap-anywhere">{report.details || '—'}</dd>
        <dt>{t('adminZone.columns.author')}</dt>
        <dd className="wrap-anywhere">
          <AdminUserEmail id={report.reporter_user_id} /> · <AdminTime date={report.created_at} />
        </dd>
      </dl>
      <Controller
        control={control}
        name="status"
        rules={{ required: t('adminZone.reports.chooseDecision') }}
        render={({ field, fieldState }) => (
          <RadioCards
            className="[&_[role=radiogroup][aria-invalid=true]>label]:border-status-danger-fg"
            label={t('adminZone.reports.decision')}
            value={field.value}
            onValueChange={field.onChange}
            disabled={busy}
            error={fieldState.error?.message}
            required
            options={[
              {
                value: 'dismissed',
                title: t('adminZone.reports.dismiss'),
                description: t('adminZone.reports.dismissHint'),
              },
              {
                value: 'actioned',
                title: t('adminZone.reports.action'),
                description: t('adminZone.reports.actionHint'),
              },
            ]}
          />
        )}
      />
      <CountedTextarea
        {...register('note', {
          maxLength: { value: 2000, message: t('adminZone.reports.noteLength') },
        })}
        label={t('adminZone.reports.note')}
        placeholder={t('adminZone.reports.notePlaceholder')}
        hint={t('adminZone.reports.noteHint')}
        error={formState.errors.note?.message}
        length={note.length}
        maxLength={2000}
        disabled={busy}
      />
      {action.isError && (
        <InlineAlert tone="danger" role="alert">
          {t(errorMessageKey(action.error))}
        </InlineAlert>
      )}
    </AdminDialogFrame>
  )
}

export default function AdminActionDialog({
  target,
  onClose,
}: {
  target: AdminDialogTarget | null
  onClose: () => void
}) {
  if (!target) return null
  return target.type === 'review' ? (
    <ReviewDialog target={target} onClose={onClose} />
  ) : (
    <ChangeDialog target={target} onClose={onClose} />
  )
}
