import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import type { EventReportResponse } from '@/api/generated/model'
import { REPORT_PAGE_SIZE, useAdminEvent, useAdminReports, useReportCount } from '@/api/hooks/admin'
import type { TableColumn } from '@/components/ResponsiveTable'
import StatusBadge from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import AdminActionDialog, { type AdminDialogTarget } from './AdminActionDialog'
import {
  AdminEmpty,
  AdminError,
  AdminEventName,
  AdminLoading,
  AdminPage,
  AdminPagination,
  AdminTable,
  AdminTabs,
  AdminTime,
  AdminUserEmail,
  CellNote,
  ReportReasonLabel,
} from './AdminPage'

function ReportReason({ report }: { report: EventReportResponse }) {
  const { t } = useTranslation()
  return (
    <>
      <p className="font-semibold">
        <ReportReasonLabel reason={report.reason} />
      </p>
      <CellNote>{report.details || t('adminZone.reports.noDetails')}</CellNote>
    </>
  )
}

function ReportActions({
  report,
  onAction,
}: {
  report: EventReportResponse
  onAction: (target: AdminDialogTarget) => void
}) {
  const { t } = useTranslation()
  const event = useAdminEvent(report.event_id)
  return (
    <div className="flex flex-col items-stretch gap-1">
      <Button
        type="button"
        variant="outline"
        onClick={(e) => onAction({ type: 'review', report, trigger: e.currentTarget })}
      >
        {t('adminZone.reports.review')}
      </Button>
      {event.data?.suspended_at ? (
        <StatusBadge kind="adminEvent" status="suspended" size="sm" />
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="text-status-danger-fg hover:bg-status-danger-bg"
          onClick={(e) =>
            onAction({
              type: 'suspendEvent',
              id: report.event_id,
              trigger: e.currentTarget,
              label: <AdminEventName id={report.event_id} showDetails />,
            })
          }
        >
          {t('adminZone.actions.suspendEvent.confirm')}
        </Button>
      )}
    </div>
  )
}

type ReportTab = 'open' | 'reviewed'

export default function AdminReportsPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const reviewed = params.get('status') === 'reviewed'
  const rawPage = Number(params.get('page'))
  const page =
    Number.isSafeInteger(rawPage) &&
    rawPage > 0 &&
    Number.isSafeInteger((rawPage - 1) * REPORT_PAGE_SIZE)
      ? rawPage
      : 1
  const open = useReportCount('open')
  const dismissed = useReportCount('dismissed')
  const actioned = useReportCount('actioned')
  const query = useAdminReports(reviewed, page)
  const [target, setTarget] = useState<AdminDialogTarget | null>(null)
  const lastPage = query.data
    ? Math.max(1, Math.ceil(query.data.total / REPORT_PAGE_SIZE))
    : undefined
  useEffect(() => {
    if (lastPage !== undefined && page > lastPage) {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (lastPage === 1) next.delete('page')
          else next.set('page', String(lastPage))
          return next
        },
        { replace: true },
      )
    }
  }, [lastPage, page, setParams])

  const columns: TableColumn<EventReportResponse>[] = [
    {
      id: 'event',
      header: t('adminZone.columns.event'),
      cell: (row) => <AdminEventName id={row.event_id} showDetails />,
    },
    { id: 'reason', header: t('adminZone.reason'), cell: (row) => <ReportReason report={row} /> },
    {
      id: 'author',
      header: t('adminZone.columns.author'),
      cell: (row) => <AdminUserEmail id={row.reporter_user_id} />,
    },
    {
      id: 'date',
      header: t('adminZone.columns.date'),
      cell: (row) => <AdminTime date={row.created_at} />,
    },
    {
      id: 'status',
      header: t('adminZone.columns.status'),
      cell: (row) => <StatusBadge kind="eventReport" status={row.status} />,
    },
    reviewed
      ? {
          id: 'decision',
          header: t('adminZone.reports.decision'),
          cell: (row) => (
            <>
              <p className="type-small font-semibold">
                <AdminUserEmail id={row.reviewed_by_user_id} /> ·{' '}
                <AdminTime date={row.reviewed_at} />
              </p>
              {row.review_note && <CellNote>{row.review_note}</CellNote>}
            </>
          ),
        }
      : {
          id: 'actions',
          header: t('adminZone.columns.actions'),
          cell: (row) => <ReportActions report={row} onAction={setTarget} />,
        },
  ]

  return (
    <AdminPage
      id="reports"
      title={t('adminZone.reports.title')}
      description={t('adminZone.reports.description')}
    >
      <section
        aria-label={t('adminZone.reports.title')}
        className="overflow-hidden rounded-lg border border-line bg-surface"
      >
        <AdminTabs<ReportTab>
          label={t('adminZone.columns.status')}
          value={reviewed ? 'reviewed' : 'open'}
          options={[
            { value: 'open', label: t('adminZone.reports.open'), count: open.data },
            {
              value: 'reviewed',
              label: t('adminZone.reports.reviewed'),
              count:
                dismissed.data !== undefined && actioned.data !== undefined
                  ? dismissed.data + actioned.data
                  : undefined,
            },
          ]}
          onChange={(value) => setParams(value === 'open' ? {} : { status: value })}
        />
        {query.isError ? (
          <div className="p-4">
            <AdminError
              error={query.error}
              retry={() => void query.refetch()}
              retrying={query.isFetching}
            />
          </div>
        ) : !query.data ? (
          <AdminLoading />
        ) : query.data.items.length === 0 ? (
          <AdminEmpty />
        ) : (
          <AdminTable
            caption={t('adminZone.reports.title')}
            columns={columns}
            rows={query.data.items}
            rowKey={(row) => row.id}
          />
        )}
        {query.data && query.data.total > REPORT_PAGE_SIZE && (
          <AdminPagination
            page={page}
            pageSize={REPORT_PAGE_SIZE}
            total={query.data.total}
            onChange={(value) =>
              setParams({
                ...(reviewed && { status: 'reviewed' }),
                ...(value > 1 && { page: String(value) }),
              })
            }
          />
        )}
      </section>
      <p className="type-small text-ink-muted">{t('time.astanaZone')}</p>
      <AdminActionDialog target={target} onClose={() => setTarget(null)} />
    </AdminPage>
  )
}
