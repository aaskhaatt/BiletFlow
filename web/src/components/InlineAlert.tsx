import { cn } from 'cn'
import type { ReactNode } from 'react'
import { ChatIcon, CheckIcon, CloseIcon, WarningIcon } from '@/components/icons'

const alertTones = {
  info: { Icon: ChatIcon, colors: 'bg-status-info-bg text-status-info-fg border-transparent' },
  ok: { Icon: CheckIcon, colors: 'bg-status-ok-bg text-status-ok-fg border-transparent' },
  warn: {
    Icon: WarningIcon,
    colors: 'bg-status-warn-bg text-status-warn-fg border-status-warn-line',
  },
  danger: {
    Icon: CloseIcon,
    colors: 'bg-status-danger-bg text-status-danger-fg border-transparent',
  },
}

type InlineAlertProps = {
  tone?: keyof typeof alertTones
  role?: 'alert' | 'status'
  children: ReactNode
}

export default function InlineAlert({ tone = 'info', role, children }: InlineAlertProps) {
  const { Icon, colors } = alertTones[tone]

  return (
    <div
      className={cn('type-body flex items-start gap-2 rounded-md border px-4 py-3', colors)}
      data-slot="inline-alert"
      data-tone={tone}
      role={role}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      <div className="min-w-0 wrap-anywhere">{children}</div>
    </div>
  )
}
