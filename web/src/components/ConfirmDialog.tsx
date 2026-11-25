import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertDialog } from 'radix-ui'
import { Button } from '@/components/ui/button'

type ConfirmDialogProps = {
  trigger: ReactElement
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => void
}

export default function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation()

  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-1/2 space-y-4 overflow-y-auto rounded-lg bg-surface p-6 shadow-lg">
          <AlertDialog.Title className="type-card-title wrap-anywhere">{title}</AlertDialog.Title>
          {destructive ? (
            <AlertDialog.Description asChild>
              <div className="space-y-1 rounded-md bg-status-danger-bg p-4 wrap-anywhere text-status-danger-fg">
                <p className="font-semibold">{t('common.irreversible')}</p>
                <p>{description}</p>
              </div>
            </AlertDialog.Description>
          ) : (
            <AlertDialog.Description className="wrap-anywhere text-ink-2">
              {description}
            </AlertDialog.Description>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <AlertDialog.Cancel asChild>
              <Button type="button" variant="outline" className="whitespace-normal">
                {t('common.cancel')}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                type="button"
                variant={destructive ? 'destructive' : 'default'}
                className="px-3 whitespace-normal"
                onClick={onConfirm}
              >
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
