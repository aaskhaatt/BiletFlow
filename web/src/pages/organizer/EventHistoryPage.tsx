import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import type { EventResponse } from '@/api/generated/model'
import { useAdminEvent } from '@/api/hooks/admin'
import {
  fetchWholeHistory,
  useEventHistory,
  useManagedEvent,
  useMyEventSummaries,
  type HistoryParams,
} from '@/api/hooks/organizer-events'
import { useCheckInStats } from '@/api/hooks/organizer-event-stats'
import ErrorState from '@/components/ErrorState'
import InlineAlert from '@/components/InlineAlert'
import SelectField from '@/components/SelectField'
import Skeleton from '@/components/Skeleton'
import StatusBadge from '@/components/StatusBadge'
import TextField from '@/components/TextField'
import { Button } from '@/components/ui/button'
import { downloadCsv, toCsv } from '@/lib/csv'
import { formatDay, formatLogTime } from '@/lib/event-display'
import { HISTORY_TYPES } from '@/lib/event-history'
import { toEventLocalInput } from '@/lib/event-time'
import DuplicateEventDialog from '@/pages/organizer/DuplicateEventDialog'
import HistoryActionChip from '@/pages/organizer/HistoryActionChip'
import OrganizerPage from '@/pages/organizer/OrganizerPage'
import NotFoundPage from '@/pages/NotFoundPage'
import { AdminError } from '@/pages/admin/AdminPage'

const PAGE_SIZE = 20
const ALL = 'all'
const PERIODS = [ALL, '7', '30', 'custom'] as const
type Period = (typeof PERIODS)[number]
const DAY_MS = 24 * 60 * 60 * 1000

type Filters = {
  type: string
  action: string
  period: Period
  from: string
  to: string
  since: string
}
const NO_FILTERS: Filters = { type: ALL, action: '', period: ALL, from: '', to: '', since: '' }

/** The filters as the API asks for them. A day picked in the date fields means that day in Astana. */
function paramsOf(filters: Filters): Omit<HistoryParams, 'limit' | 'offset'> {
  const day = (date: string, time: string) => (date ? `${date}T${time}+05:00` : undefined)
  return {
    ...(filters.type !== ALL && { type: filters.type }),
    ...(filters.action.trim() && { action: filters.action.trim() }),
    ...(filters.period === 'custom'
      ? { date_from: day(filters.from, '00:00:00'), date_to: day(filters.to, '23:59:59') }
      : filters.period !== ALL && { date_from: filters.since }),
  }
}

type Stage = 'drafts' | 'upcoming' | 'active' | 'completed' | 'cancelled'
const STAGE_OF: Record<string, Stage> = {
  draft: 'drafts',
  upcoming: 'upcoming',
  active: 'active',
  completed: 'completed',
  cancelled: 'cancelled',
}

function HistoryView({ event, admin }: { event: EventResponse; admin: boolean }) {
  const { t, i18n } = useTranslation()
  const summaries = useMyEventSummaries(!admin)
  const stats = useCheckInStats(event.id, !admin)
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [offset, setOffset] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<unknown>()
  const params = paramsOf(filters)
  const history = useEventHistory(event.id, { ...params, limit: PAGE_SIZE, offset })
  const number = new Intl.NumberFormat(i18n.resolvedLanguage)

  function change(next: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...next }))
    setOffset(0)
  }

  async function exportCsv() {
    setExporting(true)
    setExportError(undefined)
    try {
      const entries = await fetchWholeHistory(event.id, params)
      const system = t('eventHistory.system')
      downloadCsv(
        `event-${event.id}-history.csv`,
        toCsv([
          [
            t('eventHistory.csv.time'),
            t('eventHistory.csv.type'),
            t('eventHistory.csv.action'),
            t('eventHistory.csv.description'),
            t('eventHistory.csv.actor'),
          ],
          ...entries.map((entry) => [
            toEventLocalInput(entry.created_at).replace('T', ' '),
            entry.type,
            entry.action,
            entry.description,
            entry.actor_email ?? system,
          ]),
        ]),
      )
    } catch (error) {
      setExportError(error)
    } finally {
      setExporting(false)
    }
  }

  const total = history.data?.total ?? 0
  const items = history.data?.items ?? []

  const sold = summaries.data?.find((item) => item.event_id === event.id)?.tickets_sold
  const facts = [
    formatDay(event.start_time),
    sold !== undefined && t('eventHistory.sold', { count: sold }),
    stats.data && t('eventHistory.checkedIn', { count: stats.data.checked_in }),
  ].filter(Boolean)
  const stage = STAGE_OF[event.lifecycle] ?? 'upcoming'

  return (
    <OrganizerPage
      routeId={admin ? 'admin-event-history' : 'organizer-event-history'}
      breadcrumb={
        admin
          ? [{ label: t('adminZone.lists.events'), to: '/admin/events' }, { label: event.title }]
          : [
              { label: t('organizerEvents.title'), to: '/organizer' },
              {
                label:
                  stage === 'drafts'
                    ? t('organizerEvents.drafts.title')
                    : t(`organizerEvents.tabs.${stage}`),
                to: '/organizer',
              },
              { label: event.title, to: `/organizer/events/${event.id}` },
            ]
      }
      title={t('eventHistory.pageTitle', { title: event.title })}
      meta={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusBadge kind="event" status={event.lifecycle} size="sm" />
          <p className="type-label font-normal text-ink-2">{facts.join(' · ')}</p>
        </div>
      }
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={exporting}
            onClick={() => void exportCsv()}
          >
            {t('eventHistory.export')}
          </Button>
          {!admin && (
            <DuplicateEventDialog
              event={event}
              trigger={
                <Button type="button" size="sm">
                  {t('organizerEvent.actions.duplicate')}
                </Button>
              }
            />
          )}
        </>
      }
    >
      {exportError !== undefined && (
        <InlineAlert tone="danger" role="alert">
          {t('eventHistory.exportFailed', { reason: t(errorMessageKey(exportError)) })}
        </InlineAlert>
      )}
      {!admin && <InlineAlert tone="info">{t('eventHistory.duplicateNote')}</InlineAlert>}

      <section aria-labelledby="journal-title" className="rounded-lg border border-line bg-surface">
        <div className="flex flex-wrap items-end justify-between gap-4 p-6">
          <h2 id="journal-title" className="type-card-title">
            {t('eventHistory.title')}
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            <SelectField
              label={t('eventHistory.filters.type')}
              className="w-52"
              value={filters.type}
              onValueChange={(type) => change({ type })}
              options={[
                { value: ALL, label: t('eventHistory.filters.allTypes') },
                ...HISTORY_TYPES.map((type) => ({
                  value: type,
                  label: t(`eventHistory.types.${type}`),
                })),
              ]}
            />
            <SelectField
              label={t('eventHistory.filters.period')}
              className="w-52"
              value={filters.period}
              onValueChange={(value) => {
                const period = PERIODS.find((item) => item === value) ?? ALL
                // "Last N days" is worked out here, when it is chosen, not on every render
                change({
                  period,
                  since:
                    period === '7' || period === '30'
                      ? new Date(Date.now() - Number(period) * DAY_MS).toISOString()
                      : '',
                })
              }}
              options={[
                { value: ALL, label: t('eventHistory.filters.allTime') },
                { value: '7', label: t('eventHistory.filters.days7') },
                { value: '30', label: t('eventHistory.filters.days30') },
                { value: 'custom', label: t('eventHistory.filters.custom') },
              ]}
            />
            {filters.period === 'custom' && (
              <>
                <TextField
                  type="date"
                  label={t('eventHistory.filters.from')}
                  hint={t('time.astanaZone')}
                  value={filters.from}
                  onChange={(input) => change({ from: input.target.value })}
                />
                <TextField
                  type="date"
                  label={t('eventHistory.filters.to')}
                  hint={t('time.astanaZone')}
                  value={filters.to}
                  onChange={(input) => change({ to: input.target.value })}
                />
              </>
            )}
            <TextField
              label={t('eventHistory.filters.action')}
              placeholder="order.refunded"
              autoComplete="off"
              fieldClassName="w-52"
              value={filters.action}
              onChange={(input) => change({ action: input.target.value })}
            />
          </div>
        </div>

        {history.isError ? (
          <div className="border-t border-line p-6">
            {admin ? (
              <AdminError
                error={history.error}
                retry={() => void history.refetch()}
                retrying={history.isFetching}
              />
            ) : (
              <ErrorState
                title={t('routeError.title')}
                description={t(errorMessageKey(history.error))}
                onRetry={() => void history.refetch()}
                retrying={history.isFetching}
              />
            )}
          </div>
        ) : !history.data ? (
          <div role="status" className="space-y-3 border-t border-line p-6">
            <span className="sr-only">{t('common.loading')}</span>
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : items.length === 0 ? (
          <p className="border-t border-line p-8 text-center text-ink-2">
            {t('eventHistory.empty')}
          </p>
        ) : (
          <ol className="border-t border-line" data-slot="history-list">
            {items.map((entry) => (
              <li
                key={entry.id}
                className="grid gap-x-6 gap-y-2 border-b border-line-soft px-6 py-3.5 last:border-b-0 md:grid-cols-[7.5rem_11rem_minmax(0,1fr)]"
              >
                <time dateTime={entry.created_at} className="type-label font-semibold tabular-nums">
                  {formatLogTime(entry.created_at)}
                </time>
                <div>
                  <HistoryActionChip action={entry.action} type={entry.type} />
                </div>
                <div className="min-w-0">
                  <p className="type-body wrap-anywhere">{entry.description}</p>
                  <p className="type-small text-ink-muted wrap-anywhere">
                    {entry.actor_email ?? t('eventHistory.system')}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}

        {history.data && total > PAGE_SIZE && (
          <nav
            aria-label={t('eventHistory.pages')}
            className="flex items-center justify-between gap-3 border-t border-line px-6 py-3"
          >
            <p className="type-small text-ink-2" aria-live="polite">
              {t('eventHistory.range', {
                from: number.format(offset + 1),
                to: number.format(Math.min(offset + PAGE_SIZE, total)),
                total: number.format(total),
              })}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                {t('eventHistory.previous')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                {t('eventHistory.next')}
              </Button>
            </div>
          </nav>
        )}
      </section>
      <p className="type-small text-ink-muted">{t('eventHistory.footnote')}</p>
    </OrganizerPage>
  )
}

/** /organizer/events/:eventId/history (Figma "История события"): the audit log of one event. */
export default function EventHistoryPage({ admin = false }: { admin?: boolean } = {}) {
  const { t } = useTranslation()
  const eventId = Number(useParams().eventId)
  const valid = Number.isSafeInteger(eventId) && eventId > 0
  const ownedEvent = useManagedEvent(eventId, { enabled: valid && !admin })
  const adminEvent = useAdminEvent(eventId, valid && admin)
  const event = admin ? adminEvent : ownedEvent
  const routeId = admin ? 'admin-event-history' : 'organizer-event-history'
  const home = admin
    ? { label: t('adminZone.lists.events'), to: '/admin/events' }
    : { label: t('organizerEvents.title'), to: '/organizer' }

  if (!valid || (admin && event.data === null)) return <NotFoundPage />
  if (event.isError) {
    return (
      <OrganizerPage routeId={routeId} breadcrumb={[home]} title={t('routeError.title')}>
        {admin ? (
          <AdminError
            error={event.error}
            retry={() => void event.refetch()}
            retrying={event.isFetching}
          />
        ) : (
          <ErrorState
            title={t('routeError.title')}
            description={t(errorMessageKey(event.error))}
            onRetry={() => void event.refetch()}
            retrying={event.isFetching}
          />
        )}
      </OrganizerPage>
    )
  }
  if (!event.data) {
    return (
      <OrganizerPage
        routeId={routeId}
        breadcrumb={[home]}
        title={<Skeleton className="h-9 w-72" />}
      >
        <div role="status">
          <span className="sr-only">{t('common.loading')}</span>
          <Skeleton className="h-40 rounded-lg" />
        </div>
      </OrganizerPage>
    )
  }

  return <HistoryView key={eventId} event={event.data} admin={admin} />
}
