import { cn } from 'cn'
import type { Key, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { errorCodeOf, errorMessageKey } from '@/api/error-codes'
import { EventReportCreateReason } from '@/api/generated/model'
import { useAdminEvent, useAdminUser } from '@/api/hooks/admin'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import ResponsiveTable, { type TableColumn } from '@/components/ResponsiveTable'
import Skeleton from '@/components/Skeleton'
import { Button } from '@/components/ui/button'
import { formatEventTime } from '@/lib/format'
import OrganizerPage from '@/pages/organizer/OrganizerPage'

export function AdminPage({
  id,
  title,
  description,
  actions,
  children,
}: {
  id: string
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <OrganizerPage
      routeId={`admin-${id}`}
      title={title}
      meta={description && <p className="type-body text-ink-2">{description}</p>}
      actions={actions}
    >
      {children}
    </OrganizerPage>
  )
}

export function AdminError({
  error,
  retry,
  retrying,
}: {
  error: unknown
  retry: () => void
  retrying?: boolean
}) {
  const { t } = useTranslation()
  if (errorCodeOf(error) === 'PlatformAdminRequiredError') {
    return (
      <section role="alert" className="space-y-3 rounded-lg border border-line bg-surface p-6">
        <h2 className="type-card-title">{t('nav.admin')}</h2>
        <p className="type-body text-ink-2">{t('errors.PlatformAdminRequiredError')}</p>
        <Link className="inline-flex min-h-11 items-center type-label text-brand underline" to="/">
          {t('common.toHome')}
        </Link>
      </section>
    )
  }
  return (
    <ErrorState
      title={t('routeError.title')}
      description={t(errorMessageKey(error))}
      onRetry={retry}
      retrying={retrying}
    />
  )
}

export function AdminLoading() {
  const { t } = useTranslation()
  return (
    <div role="status" className="p-4">
      <span className="sr-only">{t('common.loading')}</span>
      <Skeleton className="h-32 w-full" />
    </div>
  )
}

export function AdminEmpty({ filtered = false }: { filtered?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="p-4">
      <EmptyState title={t(filtered ? 'adminZone.noMatches' : 'adminZone.noRows')} />
    </div>
  )
}

export function AdminTabs<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: Value
  options: readonly { value: Value; label: string; count?: number }[]
  onChange: (value: Value) => void
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap gap-1 border-b border-line px-4 pt-2"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={cn(
            'min-h-11 border-b-2 px-3 type-body hover:text-ink focus-visible:outline-2 focus-visible:outline-brand',
            value === option.value ? 'border-brand font-semibold' : 'border-transparent text-ink-2',
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && ` · ${option.count}`}
        </button>
      ))}
    </div>
  )
}

export function AdminTable<Row>(props: {
  caption: string
  columns: readonly TableColumn<Row>[]
  rows: readonly Row[]
  rowKey: (row: Row) => Key
}) {
  return (
    <div className="lg:[&_td]:align-top lg:[&_td:first-child]:pl-6 lg:[&_td:last-child]:pr-6 lg:[&_th]:font-medium lg:[&_th]:text-ink-muted lg:[&_th:first-child]:pl-6 lg:[&_th:last-child]:pr-6 lg:[&_thead_tr]:border-b lg:[&_thead_tr]:border-line lg:[&_thead_tr]:bg-surface">
      <ResponsiveTable {...props} />
    </div>
  )
}

export function AdminPagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}) {
  const { t } = useTranslation()
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const first = Math.min(total, (page - 1) * pageSize + 1)
  const last = Math.min(total, page * pageSize)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
      <p className="type-label text-ink-2" role="status">
        {t('adminZone.range', { first, last, total })}
      </p>
      {(pages > 1 || page > 1) && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
          >
            {t('adminZone.previous')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={page >= pages}
            onClick={() => onChange(page + 1)}
          >
            {t('adminZone.next')}
          </Button>
        </div>
      )}
    </div>
  )
}

export function AdminEventName({ id, showDetails = false }: { id: number; showDetails?: boolean }) {
  const { t } = useTranslation()
  const event = useAdminEvent(id)
  return (
    <div>
      <span className={showDetails ? 'font-semibold' : undefined}>
        {event.data?.title || t('adminZone.eventNumber', { id })}
      </span>
      {showDetails && event.data && (
        <CellNote>
          {t('adminZone.number', { id })}
          {event.data.organizer_name && ` · ${event.data.organizer_name}`}
        </CellNote>
      )}
    </div>
  )
}

export function AdminUserEmail({ id }: { id: number | null }) {
  const { t } = useTranslation()
  const user = useAdminUser(id ?? 0)
  return <span>{id === null ? '—' : user.data?.email || t('adminZone.userNumber', { id })}</span>
}

export function ReportReasonLabel({ reason }: { reason: string }) {
  const { t } = useTranslation()
  const known = Object.values(EventReportCreateReason).find((value) => value === reason)
  return known ? t(`reportEvent.reasons.${known}`) : reason
}

export function CellNote({ children }: { children: ReactNode }) {
  return <p className="mt-1 type-small text-ink-muted">{children}</p>
}

export function AdminTime({ date }: { date?: string | null }) {
  return date ? <time dateTime={date}>{formatEventTime(date)}</time> : '—'
}
