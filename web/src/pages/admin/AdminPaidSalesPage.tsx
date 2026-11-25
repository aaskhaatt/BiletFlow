import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import type { ActivationRecord } from '@/api/generated/model'
import { useAdminPaidSales } from '@/api/hooks/admin'
import type { TableColumn } from '@/components/ResponsiveTable'
import StatusBadge from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatKZT } from '@/lib/format'
import AdminActionDialog, { type AdminDialogTarget } from './AdminActionDialog'
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
  AdminPage,
  AdminTable,
  AdminTabs,
  AdminTime,
  CellNote,
} from './AdminPage'

const STATUSES = ['all', 'pending', 'active', 'suspended'] as const
type PaidSalesTab = (typeof STATUSES)[number]

export default function AdminPaidSalesPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const tab = STATUSES.find((value) => value === params.get('status')) ?? 'all'
  const query = useAdminPaidSales()
  const [target, setTarget] = useState<AdminDialogTarget | null>(null)
  const rows = query.data?.filter((row) => tab === 'all' || row.status === tab) ?? []

  const columns: TableColumn<ActivationRecord>[] = [
    {
      id: 'event',
      header: t('adminZone.columns.event'),
      cell: (row) => (
        <>
          <p className="font-semibold">{row.event_title}</p>
          <CellNote>{t('adminZone.number', { id: row.event_id })}</CellNote>
        </>
      ),
    },
    {
      id: 'status',
      header: t('adminZone.columns.status'),
      cell: (row) => <StatusBadge kind="paidSales" status={row.status} />,
    },
    {
      id: 'fee',
      header: t('adminZone.paidSales.fee'),
      cell: (row) => (
        <>
          <p className="font-semibold">
            {row.fee_amount == null ? '—' : formatKZT(row.fee_amount)}
          </p>
          <CellNote>
            {row.fee_paid_at ? (
              <AdminTime date={row.fee_paid_at} />
            ) : (
              t('adminZone.paidSales.unpaid')
            )}
          </CellNote>
        </>
      ),
    },
    {
      id: 'activated',
      header: t('adminZone.paidSales.activated'),
      cell: (row) => <AdminTime date={row.activated_at} />,
    },
    {
      id: 'suspended',
      header: t('adminZone.paidSales.suspended'),
      cell: (row) => (
        <>
          <AdminTime date={row.suspended_at} />
          {row.suspension_reason && <CellNote>{row.suspension_reason}</CellNote>}
        </>
      ),
    },
    {
      id: 'actions',
      header: t('adminZone.columns.actions'),
      cell: (row) => {
        if (row.status !== 'active' && row.status !== 'suspended') {
          return <CellNote>{t('adminZone.paidSales.waiting')}</CellNote>
        }
        const active = row.status === 'active'
        return (
          <Button
            type="button"
            variant="outline"
            className={
              active
                ? 'border-status-danger-fg text-status-danger-fg hover:bg-status-danger-bg'
                : undefined
            }
            onClick={(e) =>
              setTarget({
                type: active ? 'suspendPaidSales' : 'reinstatePaidSales',
                id: row.event_id,
                trigger: e.currentTarget,
                label: `${row.event_title} · ${t('adminZone.number', { id: row.event_id })}`,
              })
            }
          >
            {t(active ? 'adminZone.suspend' : 'adminZone.reinstate')}
          </Button>
        )
      },
    },
  ]

  return (
    <AdminPage
      id="paid-sales"
      title={t('adminZone.paidSales.title')}
      description={t('adminZone.paidSales.description')}
    >
      <section
        aria-label={t('adminZone.paidSales.title')}
        className="overflow-hidden rounded-lg border border-line bg-surface"
      >
        <AdminTabs<PaidSalesTab>
          label={t('adminZone.columns.status')}
          value={tab}
          options={STATUSES.map((value) => ({
            value,
            label: value === 'all' ? t('adminZone.all') : t(`status.paidSales.${value}`),
            count: query.data?.filter((row) => value === 'all' || row.status === value).length,
          }))}
          onChange={(value) => setParams(value === 'all' ? {} : { status: value })}
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
        ) : rows.length === 0 ? (
          <AdminEmpty filtered={tab !== 'all'} />
        ) : (
          <AdminTable
            caption={t('adminZone.paidSales.title')}
            columns={columns}
            rows={rows}
            rowKey={(row) => row.event_id}
          />
        )}
      </section>
      <p className="type-small text-ink-muted">{t('time.astanaZone')}</p>
      <AdminActionDialog target={target} onClose={() => setTarget(null)} />
    </AdminPage>
  )
}
