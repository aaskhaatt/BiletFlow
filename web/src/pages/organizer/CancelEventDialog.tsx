import { AlertDialog } from 'radix-ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/api/error-codes'
import type { EventResponse } from '@/api/generated/model'
import { useCancelEvent } from '@/api/hooks/organizer-events'
import { useCancellationImpact } from '@/api/hooks/organizer-event-stats'
import DemoBanner from '@/components/DemoBanner'
import InlineAlert from '@/components/InlineAlert'
import { Button } from '@/components/ui/button'
import { formatEventSpan } from '@/lib/event-display'

/**
 * The strong confirmation before "Отменить событие" (Figma G7): what happens to the
 * paid orders, the free registrations and the unpaid holds, and that it can't be
 * undone. The counts are asked for only once the dialog is open.
 */
export default function CancelEventDialog({
  event,
  onCancelled,
}: {
  event: EventResponse
  onCancelled?: () => void
}) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<unknown>()
  const cancel = useCancelEvent()
  const impact = useCancellationImpact(event.id, open)
  const number = new Intl.NumberFormat(i18n.resolvedLanguage)

  async function confirm() {
    setError(undefined)
    try {
      await cancel.mutateAsync({ eventId: event.id })
      setOpen(false)
      onCancelled?.()
    } catch (failure) {
      setError(failure)
    }
  }

  const count = (value: number | undefined) => (value === undefined ? '…' : number.format(value))

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        // The dialog can't be dismissed while the cancellation is being sent
        if (cancel.isPending) return
        setOpen(next)
        if (next) setError(undefined)
      }}
    >
      <AlertDialog.Trigger asChild>
        <Button
          type="button"
          variant="outline"
          className="border-status-danger-fg text-status-danger-fg hover:bg-status-danger-bg"
        >
          {t('organizerEvent.actions.cancel')}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[30rem] -translate-1/2 space-y-4 overflow-y-auto rounded-lg bg-surface p-7 shadow-lg">
          <AlertDialog.Title className="text-[1.375rem] leading-[1.3] font-medium font-display wrap-anywhere">
            {t('organizerEvent.cancelDialog.title')}
          </AlertDialog.Title>
          <AlertDialog.Description className="sr-only">
            {t('organizerEvent.cancelDialog.warning')}
          </AlertDialog.Description>

          <dl className="space-y-2.5 rounded-md bg-paper p-4 type-body">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-2">{t('organizerEvent.cancelDialog.event')}</dt>
              <dd className="text-right font-semibold wrap-anywhere">{event.title}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-2">{t('organizerEvent.cancelDialog.date')}</dt>
              <dd className="text-right font-semibold">
                {formatEventSpan(event.start_time, event.end_time)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-2">{t('organizerEvent.cancelDialog.paid')}</dt>
              <dd className="text-right font-semibold">
                {t('organizerEvent.cancelDialog.paidValue', { count: count(impact.counts?.paid) })}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-2">{t('organizerEvent.cancelDialog.free')}</dt>
              <dd className="text-right font-semibold">
                {t('organizerEvent.cancelDialog.freeValue', { count: count(impact.counts?.free) })}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-2">{t('organizerEvent.cancelDialog.pending')}</dt>
              <dd className="text-right font-semibold">{count(impact.counts?.pending)}</dd>
            </div>
          </dl>
          {impact.isError && (
            <p className="type-small text-ink-2">{t('organizerEvent.cancelDialog.countsFailed')}</p>
          )}

          <InlineAlert tone="danger">
            <p className="font-semibold">{t('organizerEvent.cancelDialog.warningTitle')}</p>
            <p className="mt-1">{t('organizerEvent.cancelDialog.warning')}</p>
          </InlineAlert>
          <DemoBanner />
          {error !== undefined && (
            <InlineAlert tone="danger" role="alert">
              {t(errorMessageKey(error))}
            </InlineAlert>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <AlertDialog.Cancel asChild>
              <Button type="button" variant="outline" className="whitespace-normal">
                {t('organizerEvent.cancelDialog.keep')}
              </Button>
            </AlertDialog.Cancel>
            <Button
              type="button"
              variant="destructive"
              className="px-3 whitespace-normal"
              loading={cancel.isPending}
              onClick={() => void confirm()}
            >
              {t('organizerEvent.cancelDialog.confirm')}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
