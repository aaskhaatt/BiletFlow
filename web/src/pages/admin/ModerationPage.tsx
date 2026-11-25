import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useAdminPaidSales, useFailedPaymentCount, useReportCount } from '@/api/hooks/admin'
import KpiCard from '@/components/KpiCard'
import Skeleton from '@/components/Skeleton'
import { AdminError, AdminPage } from './AdminPage'

export default function ModerationPage() {
  const { t } = useTranslation()
  const reports = useReportCount('open')
  const paidSales = useAdminPaidSales()
  const failed = useFailedPaymentCount()
  const failure = [reports, paidSales, failed].find((query) => query.isError)
  const cards = [
    { title: t('adminZone.moderation.reports'), value: reports.data, to: '/admin/reports' },
    {
      title: t('adminZone.moderation.pending'),
      value: paidSales.data?.filter((item) => item.status === 'pending').length,
      to: '/admin/paid-sales?status=pending',
    },
    {
      title: t('adminZone.moderation.suspended'),
      value: paidSales.data?.filter((item) => item.status === 'suspended').length,
      to: '/admin/paid-sales?status=suspended',
    },
    {
      title: t('adminZone.moderation.failed'),
      value: failed.data,
      to: '/admin/payments?status=failed',
    },
  ]

  return (
    <AdminPage id="moderation" title={t('adminZone.moderation.title')}>
      {failure && (
        <AdminError
          error={failure.error}
          retry={() => void failure.refetch()}
          retrying={failure.isFetching}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ title, value, to }) => (
          <Link
            key={to}
            to={to}
            className="group rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&>div]:h-full"
          >
            <KpiCard
              label={title}
              value={value ?? (failure ? '—' : <Skeleton className="h-8 w-12" />)}
            >
              <span className="type-small text-brand group-hover:underline">
                {t('adminZone.openSection')}
              </span>
            </KpiCard>
          </Link>
        ))}
      </div>
    </AdminPage>
  )
}
