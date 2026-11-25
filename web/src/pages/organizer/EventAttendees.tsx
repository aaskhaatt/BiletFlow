import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import type { AttendeeResponse, EventResponse } from '@/api/generated/model'
import { useCheckInStats } from '@/api/hooks/organizer-event-stats'
import { useEventAttendees, useUndoCheckIn } from '@/api/hooks/organizer-operations'
import ConfirmDialog from '@/components/ConfirmDialog'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import InlineAlert from '@/components/InlineAlert'
import ResponsiveTable, { type TableColumn } from '@/components/ResponsiveTable'
import SelectField from '@/components/SelectField'
import StatusBadge from '@/components/StatusBadge'
import TextField from '@/components/TextField'
import { Button } from '@/components/ui/button'
import { downloadCsv, toCsv } from '@/lib/csv'
import { formatClock } from '@/lib/event-display'
import { formatEventTime } from '@/lib/format'

const statuses = ['valid', 'checked_in', 'cancelled', 'refunded'] as const
const metrics = ['registered', 'checked_in', 'refunded', 'cancelled'] as const

export default function EventAttendees({ event }: { event: EventResponse }) {
  const { t, i18n } = useTranslation()
  const attendees = useEventAttendees(event.id)
  const stats = useCheckInStats(event.id)
  const undo = useUndoCheckIn(event.id)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const search = query.trim().toLocaleLowerCase()
  const filtered =
    attendees.data?.filter(
      (row) =>
        (status === 'all' || row.status === status) &&
        (type === 'all' || 'type:' + row.ticket_type_name === type) &&
        [row.attendee_name, row.buyer_email, String(row.order_id), String(row.ticket_id)].some(
          (field) => field.toLocaleLowerCase().includes(search),
        ),
    ) ?? []
  const names = [...new Set(attendees.data?.map((row) => row.ticket_type_name))].sort((a, b) =>
    a.localeCompare(b, i18n.resolvedLanguage),
  )
  const number = new Intl.NumberFormat(i18n.resolvedLanguage)
  const columns: TableColumn<AttendeeResponse>[] = [
    {
      id: 'name',
      header: t('attendee.attendeeName'),
      cell: (row) => (
        <>
          <p className="font-semibold">{row.attendee_name}</p>
          <p className="type-small text-ink-2">{row.buyer_email}</p>
        </>
      ),
    },
    { id: 'type', header: t('attendee.ticketType'), cell: (row) => row.ticket_type_name },
    {
      id: 'status',
      header: t('eventOperations.status'),
      cell: (row) => <StatusBadge kind="ticket" status={row.status} size="sm" />,
    },
    {
      id: 'checkin',
      header: t('eventOperations.checkIn'),
      cell: (row) =>
        row.checked_in_at && (
          <time
            dateTime={row.checked_in_at}
            title={formatEventTime(row.checked_in_at, { withZone: true })}
          >
            {[formatClock(row.checked_in_at), row.checked_in_by].filter(Boolean).join(' · ')}
          </time>
        ),
    },
    {
      id: 'order',
      header: t('eventOperations.order'),
      cell: (row) => (
        <Link
          className="text-brand underline"
          to={`/organizer/events/${event.id}/orders?${new URLSearchParams({ q: row.buyer_email.slice(0, 100) })}`}
        >
          #{row.order_id}
        </Link>
      ),
    },
    {
      id: 'actions',
      header: t('eventOperations.actions'),
      cell: (row) =>
        row.status === 'checked_in' && (
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm" disabled={undo.isPending}>
                {t('eventOperations.undoCheckIn')}
              </Button>
            }
            title={t('eventOperations.undoCheckIn')}
            description={t('eventOperations.undoDescription', { name: row.attendee_name })}
            confirmLabel={t('eventOperations.undoConfirm')}
            onConfirm={() => undo.mutate(row.ticket_id)}
          />
        ),
    },
  ]

  function exportCsv() {
    downloadCsv(
      `event-${event.id}-attendees.csv`,
      toCsv([
        [
          t('attendee.attendeeName'),
          t('checkout.email'),
          t('attendee.ticketType'),
          t('eventOperations.status'),
          t('eventOperations.checkIn'),
          t('eventOperations.checkedInBy'),
          t('eventOperations.order'),
        ],
        ...filtered.map((row) => [
          row.attendee_name,
          row.buyer_email,
          row.ticket_type_name,
          row.status,
          row.checked_in_at ?? '',
          row.checked_in_by ?? '',
          String(row.order_id),
        ]),
      ]),
    )
  }

  return (
    <>
      {stats.isError ? (
        <ErrorState
          title={t('eventOperations.statsError')}
          description={t(errorMessageKey(stats.error))}
          onRetry={() => void stats.refetch()}
          retrying={stats.isFetching}
        />
      ) : stats.data ? (
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric} className="space-y-1 rounded-lg border border-line bg-surface p-4">
              <dt className="type-label text-ink-2">{t(`eventOperations.metrics.${metric}`)}</dt>
              <dd className="type-card-title">{number.format(stats.data[metric])}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p role="status">{t('common.loading')}</p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label={t('eventOperations.attendeeSearch')}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <SelectField
          label={t('eventOperations.status')}
          value={status}
          onValueChange={setStatus}
          options={[
            { value: 'all', label: t('eventOperations.all') },
            ...statuses.map((value) => ({ value, label: t(`status.ticket.${value}`) })),
          ]}
        />
        <SelectField
          label={t('attendee.ticketType')}
          value={type}
          onValueChange={setType}
          options={[
            { value: 'all', label: t('eventOperations.all') },
            ...names.map((name) => ({ value: 'type:' + name, label: name })),
          ]}
        />
        <Button variant="outline" disabled={!filtered.length} onClick={exportCsv}>
          {t('eventOperations.export')}
        </Button>
      </div>
      {undo.isError && (
        <InlineAlert tone="danger" role="alert">
          {t(errorMessageKey(undo.error))}
        </InlineAlert>
      )}
      {undo.isSuccess && (
        <InlineAlert tone="ok" role="status">
          {t('eventOperations.checkInUndone')}
        </InlineAlert>
      )}
      {attendees.isError ? (
        <ErrorState
          title={t('eventOperations.attendeesError')}
          description={t(errorMessageKey(attendees.error))}
          onRetry={() => void attendees.refetch()}
          retrying={attendees.isFetching}
        />
      ) : !attendees.data ? (
        <p role="status">{t('common.loading')}</p>
      ) : filtered.length ? (
        <ResponsiveTable
          caption={t('eventOperations.attendees')}
          rows={filtered}
          columns={columns}
          rowKey={(row) => row.ticket_id}
        />
      ) : (
        <EmptyState
          title={t(
            attendees.data.length ? 'eventOperations.noMatches' : 'eventOperations.noAttendees',
          )}
        />
      )}
    </>
  )
}
