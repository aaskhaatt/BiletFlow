import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useMe } from '@/auth/use-me'
import StatusBadge from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatKZT } from '@/lib/format'
import AdminActionDialog, { type AdminDialogTarget } from './AdminActionDialog'
import AdminListPage, { type AdminFilter } from './AdminListPage'
import { AdminEventName, AdminTime, AdminUserEmail, CellNote } from './AdminPage'

const eventStatuses = ['draft', 'published', 'cancelled'] as const
const orderStatuses = ['pending', 'confirmed', 'cancelled', 'refunded', 'expired'] as const
const paymentStatuses = ['succeeded', 'failed'] as const
const organizerStatuses = ['pending', 'approved', 'rejected'] as const
const rowId = (row: { id: number }) => row.id

function selectFilter(
  name: Extract<AdminFilter, { options: unknown }>['name'],
  label: string,
  options: [string, string][],
): AdminFilter {
  return { name, label, options: options.map(([value, label]) => ({ value, label })) }
}

function eventIdFilter(label: string): AdminFilter {
  return { name: 'event_id', label }
}

export function AdminUsersPage() {
  const { t } = useTranslation()
  const me = useMe()
  const [target, setTarget] = useState<AdminDialogTarget | null>(null)
  const filters = [
    selectFilter('suspended', t('adminZone.columns.status'), [
      ['false', t('status.adminUser.active')],
      ['true', t('status.adminUser.suspended')],
    ]),
  ]

  return (
    <AdminListPage
      list="users"
      searchLabel={t('adminZone.searchBy.users')}
      filters={filters}
      rowKey={rowId}
      columns={[
        {
          id: 'email',
          header: t('adminZone.columns.email'),
          cell: (row) => (
            <>
              <p className="font-semibold">{row.email}</p>
              <CellNote>{t('adminZone.number', { id: row.id })}</CellNote>
            </>
          ),
        },
        {
          id: 'role',
          header: t('adminZone.columns.role'),
          cell: (row) => t(row.is_platform_admin ? 'adminZone.platformAdmin' : 'adminZone.user'),
        },
        {
          id: 'verification',
          header: t('adminZone.columns.emailVerification'),
          cell: (row) => t(row.email_verified_at ? 'adminZone.verified' : 'adminZone.unverified'),
        },
        {
          id: 'status',
          header: t('adminZone.columns.status'),
          cell: (row) => (
            <>
              <StatusBadge
                kind="adminUser"
                status={row.suspended_at ? 'suspended' : 'active'}
                size="sm"
              />
              {row.suspended_at && row.suspension_reason && (
                <CellNote>{row.suspension_reason}</CellNote>
              )}
            </>
          ),
        },
        {
          id: 'actions',
          header: t('adminZone.columns.actions'),
          cell: (row) => {
            const self = row.id === me.data?.id
            const suspended = !!row.suspended_at
            return (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={self && !suspended}
                  aria-describedby={self && !suspended ? `self-account-${row.id}` : undefined}
                  onClick={(e) =>
                    setTarget({
                      type: suspended ? 'unsuspendUser' : 'suspendUser',
                      id: row.id,
                      label: row.email,
                      trigger: e.currentTarget,
                    })
                  }
                >
                  {t(suspended ? 'adminZone.actions.unsuspendUser.confirm' : 'adminZone.suspend')}
                </Button>
                {self && !suspended && (
                  <p id={`self-account-${row.id}`} className="mt-1 type-small text-ink-muted">
                    {t('errors.CannotSuspendSelfError')}
                  </p>
                )}
              </>
            )
          },
        },
      ]}
    >
      <AdminActionDialog target={target} onClose={() => setTarget(null)} />
    </AdminListPage>
  )
}

export function AdminEventsPage() {
  const { t } = useTranslation()
  const [target, setTarget] = useState<AdminDialogTarget | null>(null)
  const filters = [
    selectFilter(
      'status',
      t('adminZone.columns.status'),
      eventStatuses.map((status) => [status, t(`status.adminEvent.${status}`)]),
    ),
    selectFilter('suspended', t('adminZone.suspensionFilter'), [
      ['true', t('status.adminEvent.suspended')],
      ['false', t('adminZone.running')],
    ]),
  ]
  return (
    <AdminListPage
      list="events"
      searchLabel={t('adminZone.searchBy.events')}
      filters={filters}
      rowKey={rowId}
      showTime
      columns={[
        {
          id: 'title',
          header: t('adminZone.columns.event'),
          cell: (row) => (
            <>
              <p className="font-semibold">{row.title}</p>
              <CellNote>{t('adminZone.number', { id: row.id })}</CellNote>
            </>
          ),
        },
        {
          id: 'organizer',
          header: t('adminZone.columns.organizer'),
          cell: (row) => row.organizer_name || '—',
        },
        { id: 'venue', header: t('adminZone.columns.venue'), cell: (row) => row.venue_name || '—' },
        {
          id: 'start',
          header: t('adminZone.columns.start'),
          cell: (row) => <AdminTime date={row.start_time} />,
        },
        {
          id: 'status',
          header: t('adminZone.columns.status'),
          cell: (row) => (
            <>
              <StatusBadge
                kind="adminEvent"
                status={row.suspended_at ? 'suspended' : row.status}
                size="sm"
              />
              {row.suspended_at && row.suspension_reason && (
                <CellNote>{row.suspension_reason}</CellNote>
              )}
            </>
          ),
        },
        {
          id: 'actions',
          header: t('adminZone.columns.actions'),
          cell: (row) => (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" asChild>
                <Link to={`/admin/events/${row.id}/history`}>{t('adminZone.history')}</Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) =>
                  setTarget({
                    type: row.suspended_at ? 'unsuspendEvent' : 'suspendEvent',
                    id: row.id,
                    label: `${row.title} · ${t('adminZone.number', { id: row.id })}`,
                    trigger: e.currentTarget,
                  })
                }
              >
                {t(row.suspended_at ? 'adminZone.reinstate' : 'adminZone.suspend')}
              </Button>
            </div>
          ),
        },
      ]}
    >
      <AdminActionDialog target={target} onClose={() => setTarget(null)} />
    </AdminListPage>
  )
}

export function AdminOrdersPage() {
  const { t } = useTranslation()
  const filters = [
    selectFilter(
      'status',
      t('adminZone.columns.status'),
      orderStatuses.map((status) => [status, t(`status.order.${status}`)]),
    ),
    eventIdFilter(t('adminZone.eventId')),
  ]
  return (
    <AdminListPage
      list="orders"
      demo
      searchLabel={t('adminZone.searchBy.orders')}
      filters={filters}
      rowKey={rowId}
      showTime
      columns={[
        {
          id: 'order',
          header: t('adminZone.columns.order'),
          cell: (row) => t('adminZone.number', { id: row.id }),
        },
        {
          id: 'event',
          header: t('adminZone.columns.event'),
          cell: (row) => <AdminEventName id={row.event_id} />,
        },
        {
          id: 'buyer',
          header: t('adminZone.columns.buyer'),
          cell: (row) => (
            <>
              <p className="font-semibold">{row.buyer_name}</p>
              <CellNote>{row.buyer_email}</CellNote>
            </>
          ),
        },
        {
          id: 'status',
          header: t('adminZone.columns.status'),
          cell: (row) => <StatusBadge kind="order" status={row.status} size="sm" />,
        },
        {
          id: 'amount',
          header: t('adminZone.columns.amount'),
          cell: (row) => (
            <>
              {formatKZT(row.total_amount)}
              {row.processing_fee > 0 && (
                <CellNote>
                  {t('adminZone.processingFee', { amount: formatKZT(row.processing_fee) })}
                </CellNote>
              )}
            </>
          ),
        },
        {
          id: 'date',
          header: t('adminZone.columns.date'),
          cell: (row) => <AdminTime date={row.created_at} />,
        },
      ]}
    />
  )
}

export function AdminPaymentsPage() {
  const { t } = useTranslation()
  const filters = [
    selectFilter(
      'status',
      t('adminZone.columns.status'),
      paymentStatuses.map((status) => [status, t(`status.adminPayment.${status}`)]),
    ),
    selectFilter('purpose', t('adminZone.columns.purpose'), [
      ['order', t('adminZone.columns.order')],
      ['activation_fee', t('adminZone.paidSales.fee')],
    ]),
    eventIdFilter(t('adminZone.eventId')),
  ]
  return (
    <AdminListPage
      list="payments"
      demo
      searchLabel={t('adminZone.searchBy.payments')}
      filters={filters}
      rowKey={rowId}
      showTime
      columns={[
        {
          id: 'payment',
          header: t('adminZone.columns.reference'),
          cell: (row) => (
            <>
              <p className="font-semibold">{row.provider_reference}</p>
              {row.is_simulated && <CellNote>{t('adminZone.simulated')}</CellNote>}
            </>
          ),
        },
        {
          id: 'event',
          header: t('adminZone.columns.event'),
          cell: (row) => <AdminEventName id={row.event_id} />,
        },
        {
          id: 'payer',
          header: t('adminZone.columns.payer'),
          cell: (row) => <AdminUserEmail id={row.payer_user_id} />,
        },
        {
          id: 'purpose',
          header: t('adminZone.columns.purpose'),
          cell: (row) => (
            <>
              {t(
                row.purpose === 'activation_fee'
                  ? 'adminZone.paidSales.fee'
                  : 'adminZone.columns.order',
              )}
              {row.order_id != null && (
                <CellNote>{t('adminZone.number', { id: row.order_id })}</CellNote>
              )}
            </>
          ),
        },
        {
          id: 'status',
          header: t('adminZone.columns.status'),
          cell: (row) => (
            <>
              <StatusBadge kind="adminPayment" status={row.status} size="sm" />
              {row.failure_reason && <CellNote>{row.failure_reason}</CellNote>}
            </>
          ),
        },
        {
          id: 'amount',
          header: t('adminZone.columns.amount'),
          cell: (row) => formatKZT(row.amount),
        },
        {
          id: 'date',
          header: t('adminZone.columns.date'),
          cell: (row) => <AdminTime date={row.created_at} />,
        },
      ]}
    />
  )
}

export function AdminRefundsPage() {
  const { t } = useTranslation()
  return (
    <AdminListPage
      list="refunds"
      demo
      searchLabel={t('adminZone.searchBy.refunds')}
      rowKey={rowId}
      filters={[eventIdFilter(t('adminZone.eventId'))]}
      showTime
      columns={[
        {
          id: 'refund',
          header: t('adminZone.columns.reference'),
          cell: (row) => (
            <>
              <p className="font-semibold">{row.provider_reference}</p>
              {row.is_simulated && <CellNote>{t('adminZone.simulated')}</CellNote>}
            </>
          ),
        },
        {
          id: 'event',
          header: t('adminZone.columns.event'),
          cell: (row) => <AdminEventName id={row.event_id} />,
        },
        {
          id: 'order',
          header: t('adminZone.columns.order'),
          cell: (row) => t('adminZone.number', { id: row.order_id }),
        },
        {
          id: 'initiator',
          header: t('adminZone.columns.initiator'),
          cell: (row) => <AdminUserEmail id={row.initiated_by_user_id} />,
        },
        { id: 'reason', header: t('adminZone.reason'), cell: (row) => row.reason || '—' },
        {
          id: 'status',
          header: t('adminZone.columns.status'),
          cell: (row) => <StatusBadge kind="adminPayment" status={row.status} size="sm" />,
        },
        {
          id: 'amount',
          header: t('adminZone.columns.amount'),
          cell: (row) => formatKZT(row.amount),
        },
        {
          id: 'date',
          header: t('adminZone.columns.date'),
          cell: (row) => <AdminTime date={row.created_at} />,
        },
      ]}
    />
  )
}

export function AdminCampaignsPage() {
  const { t } = useTranslation()
  const filters = [
    eventIdFilter(t('adminZone.eventId')),
    selectFilter('active', t('adminZone.columns.status'), [
      ['true', t('status.campaign.active')],
      ['false', t('status.campaign.inactive')],
    ]),
  ]
  return (
    <AdminListPage
      list="campaigns"
      demo
      searchLabel={t('adminZone.searchBy.campaigns')}
      filters={filters}
      rowKey={rowId}
      showTime
      columns={[
        {
          id: 'campaign',
          header: t('adminZone.columns.campaign'),
          cell: (row) => (
            <>
              <p className="font-semibold">{row.name}</p>
              <CellNote>{row.code}</CellNote>
            </>
          ),
        },
        { id: 'event', header: t('adminZone.columns.event'), cell: (row) => row.event_title },
        {
          id: 'status',
          header: t('adminZone.columns.status'),
          cell: (row) => (
            <StatusBadge kind="campaign" status={row.is_active ? 'active' : 'inactive'} size="sm" />
          ),
        },
        {
          id: 'discount',
          header: t('adminZone.columns.discount'),
          cell: (row) =>
            row.discount_type === 'percent'
              ? `${row.discount_value}%`
              : formatKZT(row.discount_value),
        },
        {
          id: 'redemptions',
          header: t('adminZone.columns.redemptions'),
          cell: (row) =>
            row.max_redemptions == null
              ? row.redemptions_count
              : `${row.redemptions_count} / ${row.max_redemptions}`,
        },
        { id: 'orders', header: t('adminZone.lists.orders'), cell: (row) => row.orders },
        { id: 'net', header: t('adminZone.columns.net'), cell: (row) => formatKZT(row.net) },
        {
          id: 'date',
          header: t('adminZone.columns.date'),
          cell: (row) => <AdminTime date={row.created_at} />,
        },
      ]}
    />
  )
}

export function AdminOrganizersPage() {
  const { t } = useTranslation()
  const [target, setTarget] = useState<AdminDialogTarget | null>(null)
  const filters = [
    selectFilter(
      'status',
      t('adminZone.columns.status'),
      organizerStatuses.map((status) => [status, t(`status.organizerApplication.${status}`)]),
    ),
  ]
  return (
    <AdminListPage
      list="organizers"
      searchLabel={t('adminZone.searchBy.organizers')}
      filters={filters}
      rowKey={rowId}
      showTime
      columns={[
        { id: 'email', header: t('adminZone.columns.email'), cell: (row) => row.email },
        { id: 'name', header: t('adminZone.columns.name'), cell: (row) => row.display_name || '—' },
        {
          id: 'legalName',
          header: t('adminZone.columns.legalName'),
          cell: (row) => row.legal_name || '—',
        },
        {
          id: 'phone',
          header: t('adminZone.columns.phone'),
          cell: (row) => row.contact_phone || '—',
        },
        {
          id: 'identity',
          header: t('adminZone.columns.identityVerified'),
          cell: (row) => <AdminTime date={row.identity_verified_at} />,
        },
        {
          id: 'status',
          header: t('adminZone.columns.status'),
          cell: (row) => (
            <>
              <StatusBadge kind="organizerApplication" status={row.status} size="sm" />
              {row.status === 'rejected' && row.rejection_reason && (
                <CellNote>{row.rejection_reason}</CellNote>
              )}
            </>
          ),
        },
        {
          id: 'actions',
          header: t('adminZone.columns.actions'),
          cell: (row) => {
            const pending = row.status === 'pending'
            if (!pending && row.status !== 'rejected') return '—'
            const label = row.display_name ? `${row.display_name} · ${row.email}` : row.email
            return (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) =>
                    setTarget({
                      type: 'approveOrganizer',
                      id: row.user_id,
                      label,
                      trigger: e.currentTarget,
                    })
                  }
                >
                  {t('adminZone.actions.approveOrganizer.confirm')}
                </Button>
                {pending && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-status-danger-fg hover:bg-status-danger-bg"
                    onClick={(e) =>
                      setTarget({
                        type: 'rejectOrganizer',
                        id: row.user_id,
                        label,
                        trigger: e.currentTarget,
                      })
                    }
                  >
                    {t('adminZone.actions.rejectOrganizer.confirm')}
                  </Button>
                )}
              </div>
            )
          },
        },
      ]}
    >
      <AdminActionDialog target={target} onClose={() => setTarget(null)} />
    </AdminListPage>
  )
}
