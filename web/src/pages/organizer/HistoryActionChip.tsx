import { cn } from 'cn'
import { useTranslation } from 'react-i18next'
import { ICONS, type IconName } from '@/components/icons'
import { TONE_CLASSES, type StatusTone } from '@/components/status-badges'
import { isHistoryType } from '@/lib/event-history'

/** How the actions the backend writes to the audit log look: a word, and a color with its icon. */
const KNOWN: Record<string, { word: string; tone: StatusTone }> = {
  'event.created': { word: 'eventCreated', tone: 'neutral' },
  'event.updated': { word: 'eventUpdated', tone: 'neutral' },
  'event.published': { word: 'eventPublished', tone: 'ok' },
  'event.unpublished': { word: 'eventUnpublished', tone: 'neutral' },
  'event.cancelled': { word: 'eventCancelled', tone: 'danger' },
  'ticket_type.created': { word: 'ticketTypeCreated', tone: 'neutral' },
  'ticket_type.updated': { word: 'ticketTypeUpdated', tone: 'warn' },
  'order.created': { word: 'orderCreated', tone: 'neutral' },
  'order.paid': { word: 'orderPaid', tone: 'ok' },
  'order.payment_failed': { word: 'orderPaymentFailed', tone: 'warn' },
  'order.cancelled': { word: 'orderCancelled', tone: 'danger' },
  'order.refunded': { word: 'orderRefunded', tone: 'danger' },
  'ticket.checked_in': { word: 'ticketCheckedIn', tone: 'info' },
  'ticket.check_in_undone': { word: 'ticketCheckInUndone', tone: 'warn' },
  'campaign.created': { word: 'campaignCreated', tone: 'neutral' },
  'staff.assigned': { word: 'staffAssigned', tone: 'neutral' },
  'staff.removed': { word: 'staffRemoved', tone: 'neutral' },
  'paid_sales.activated': { word: 'paidSalesActivated', tone: 'ok' },
  'paid_sales.fee_paid': { word: 'paidSalesFeePaid', tone: 'info' },
  'paid_sales.terms_accepted': { word: 'paidSalesTermsAccepted', tone: 'neutral' },
}

const ICON_OF_TONE: Record<StatusTone, IconName> = {
  ok: 'check',
  info: 'chat',
  danger: 'close',
  warn: 'warning',
  neutral: 'settings',
  dark: 'settings',
}

/**
 * The coloured word before a line of the history ("Возврат", "Чек-ин"). An action the app
 * doesn't know yet shows the name of its kind ("Заказ") in grey.
 */
export default function HistoryActionChip({ action, type }: { action: string; type: string }) {
  const { t } = useTranslation()
  const known = Object.hasOwn(KNOWN, action) ? KNOWN[action] : undefined
  const tone: StatusTone = known?.tone ?? 'neutral'
  const Icon = ICONS[ICON_OF_TONE[tone]]
  const label = known
    ? t(`eventHistory.actions.${known.word}` as 'eventHistory.actions.eventCreated')
    : isHistoryType(type)
      ? t(`eventHistory.types.${type}`)
      : action

  return (
    <span
      data-slot="history-action"
      data-action={action}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-sm px-2.5 py-[5px] text-[0.8125rem] leading-[1.4] font-semibold',
        TONE_CLASSES[tone],
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 wrap-anywhere">{label}</span>
    </span>
  )
}
