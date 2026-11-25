import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import { useMySupportCases } from '@/api/hooks/support'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import StatusBadge from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatEventTime } from '@/lib/format'
import OrganizerPage from '@/pages/organizer/OrganizerPage'
import { SupportCaseContext, SupportCategory } from '@/pages/support/SupportLabels'
import SupportViewerPage from '@/pages/support/SupportViewerPage'

function Cases({ platform = false }: { platform?: boolean }) {
  const { t } = useTranslation()
  const query = useMySupportCases()
  const items = query.data
    ?.filter((item) => item.kind === (platform ? 'platform' : 'attendee'))
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at) || b.id - a.id)
  return (
    <>
      <p className="type-body text-ink-2">{t('supportCases.listIntro')}</p>
      <Button asChild variant="outline" className="w-full sm:w-fit">
        <Link to={platform ? '/organizer/support/new' : '/support/new'}>
          {t('supportCases.newCase')}
        </Link>
      </Button>
      {query.isError ? (
        <ErrorState
          title={t('supportCases.listError')}
          description={t(errorMessageKey(query.error))}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : !items ? (
        <p role="status">{t('common.loading')}</p>
      ) : !items.length ? (
        <EmptyState title={t('supportCases.empty')} icon="chat" />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={`/support/${item.id}`}
                className="block space-y-2 rounded-lg border border-line bg-surface p-4 hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
              >
                <h2 className="type-card-title wrap-anywhere">{item.subject}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge kind="support" status={item.status} />
                  <span className="type-label text-ink-2">
                    <SupportCategory category={item.category} />
                  </span>
                </div>
                <div className="type-small text-ink-2">
                  <SupportCaseContext item={item} />
                </div>
                <p className="type-small text-ink-muted">
                  {t('supportCases.caseNumber', { id: item.id })} ·{' '}
                  {t('supportCases.updatedAt', {
                    date: formatEventTime(item.updated_at, { withZone: true }),
                  })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function MySupportCasesPage() {
  const { t } = useTranslation()
  return (
    <SupportViewerPage
      routeId="my-support-cases"
      title={t('supportCases.myCases')}
      back={{ to: '/', label: t('nav.events') }}
    >
      <Cases />
    </SupportViewerPage>
  )
}

export function MyPlatformCasesPage() {
  const { t } = useTranslation()
  return (
    <OrganizerPage
      routeId="organizer-my-support-cases"
      title={t('supportCases.platformCases')}
      breadcrumb={[{ to: '/organizer/support', label: t('nav.support') }]}
    >
      <Cases platform />
    </OrganizerPage>
  )
}
