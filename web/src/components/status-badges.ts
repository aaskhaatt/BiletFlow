import type { IconName } from '@/components/icons'

// Which color and which icon each status gets in StatusBadge (W2.5). The keys
// are the statuses exactly as the API sends them; the texts are in the locale
// files, under status.<kind>.<status>.
//
// Color never stands alone (WCAG 2.1 AA, SRS 7): every badge has its icon and its
// text too, and the texts within one kind all differ, so a badge reads the same
// in grayscale.

/** A pair of design tokens: Tailwind classes for the fill and the text. */
export type StatusTone = 'ok' | 'info' | 'danger' | 'neutral' | 'warn' | 'dark'

export const TONE_CLASSES: Record<StatusTone, string> = {
  ok: 'bg-status-ok-bg text-status-ok-fg',
  info: 'bg-status-info-bg text-status-info-fg',
  danger: 'bg-status-danger-bg text-status-danger-fg',
  neutral: 'bg-status-neutral-bg text-status-neutral-fg',
  warn: 'bg-status-warn-bg text-status-warn-fg',
  dark: 'bg-ink text-on-dark',
}

interface StatusSpec {
  tone: StatusTone
  icon: IconName
}

export const STATUS_BADGES = {
  // Figma "Статус билета": ✓ Действителен, ✓ Отмечен на входе, ✕ Отменён, ↺ Возвращён
  ticket: {
    valid: { tone: 'ok', icon: 'check' },
    checked_in: { tone: 'info', icon: 'check' },
    cancelled: { tone: 'danger', icon: 'close' },
    refunded: { tone: 'neutral', icon: 'refund' },
  },
  order: {
    pending: { tone: 'warn', icon: 'clock' },
    confirmed: { tone: 'ok', icon: 'check' },
    cancelled: { tone: 'danger', icon: 'close' },
    refunded: { tone: 'neutral', icon: 'refund' },
    expired: { tone: 'neutral', icon: 'clock' },
  },
  // The event's `lifecycle` (not its `status`): worked out by the API from the
  // status and the dates. "Черновик" is the dark chip of the Figma event form.
  event: {
    draft: { tone: 'dark', icon: 'settings' },
    upcoming: { tone: 'ok', icon: 'calendar' },
    active: { tone: 'info', icon: 'clock' },
    completed: { tone: 'neutral', icon: 'check' },
    cancelled: { tone: 'danger', icon: 'close' },
  },
  paidSales: {
    not_started: { tone: 'neutral', icon: 'settings' },
    pending: { tone: 'warn', icon: 'clock' },
    active: { tone: 'ok', icon: 'check' },
    suspended: { tone: 'danger', icon: 'warning' },
  },
  // The organizer's application (`organizer.status` of GET /auth/me). Figma:
  // "Статус / На рассмотрении" is the yellow pill. "Отклонена" has no frame yet.
  organizerApplication: {
    pending: { tone: 'warn', icon: 'clock' },
    approved: { tone: 'ok', icon: 'check' },
    rejected: { tone: 'danger', icon: 'close' },
  },
  // Figma: "В работе" is blue
  support: {
    open: { tone: 'warn', icon: 'chat' },
    in_progress: { tone: 'info', icon: 'user' },
    waiting_for_customer: { tone: 'neutral', icon: 'clock' },
    resolved: { tone: 'ok', icon: 'check' },
  },
} as const satisfies Record<string, Record<string, StatusSpec>>

export type StatusKind = keyof typeof STATUS_BADGES

export const STATUS_KINDS = Object.keys(STATUS_BADGES) as StatusKind[]

/** The spec of a status, or undefined for one we don't know (a newer API). */
export function getStatusSpec(kind: StatusKind, status: string): StatusSpec | undefined {
  const table: Record<string, StatusSpec> = STATUS_BADGES[kind]
  return Object.hasOwn(table, status) ? table[status] : undefined
}
