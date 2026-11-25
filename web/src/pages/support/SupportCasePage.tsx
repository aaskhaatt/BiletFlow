import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import { isApiError } from '@/api/errors'
import type { SupportCaseDetail } from '@/api/generated/model'
import { useSupportCase, useSupportCaseActions } from '@/api/hooks/support'
import PublicLayout from '@/app/layouts/PublicLayout'
import WorkspaceLayout from '@/app/layouts/WorkspaceLayout'
import { RequireAuth } from '@/auth/route-guards'
import { useMe } from '@/auth/use-me'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import InlineAlert from '@/components/InlineAlert'
import StatusBadge from '@/components/StatusBadge'
import { eventTimeZoneLabel } from '@/lib/format'
import OrganizerPage from '@/pages/organizer/OrganizerPage'
import { SupportCategory, SupportEventTitle } from '@/pages/support/SupportLabels'
import { SupportHandlerPanel, SupportThread } from '@/pages/support/SupportThread'
import SupportViewerPage from '@/pages/support/SupportViewerPage'

type Area = 'public' | 'organizer' | 'admin'

function Related({
  item,
  area,
  handler,
}: {
  item: SupportCaseDetail
  area: Area
  handler: boolean
}) {
  const { t } = useTranslation()
  if (item.event_id == null && item.order_id == null && item.ticket_id == null) return null
  const relatedLink = 'font-semibold text-brand underline underline-offset-4 wrap-anywhere'
  return (
    <section
      aria-labelledby="support-related-title"
      className="space-y-2 rounded-md border border-line bg-surface p-4"
    >
      <h2 id="support-related-title" className="type-label">
        {t('supportCases.related')}
      </h2>
      <dl className="space-y-2 type-small">
        {item.event_id != null && (
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
            <dt>{t('supportCases.event')}</dt>
            <dd>
              <Link
                className={relatedLink}
                to={
                  area === 'organizer'
                    ? `/organizer/events/${item.event_id}`
                    : `/events/${item.event_id}`
                }
              >
                <SupportEventTitle id={item.event_id} />
              </Link>
            </dd>
          </div>
        )}
        {item.order_id != null && (
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
            <dt>{t('supportCases.orders')}</dt>
            <dd>
              {handler ? (
                t('supportCases.orderNumber', { id: item.order_id })
              ) : (
                <Link className={relatedLink} to={`/orders/${item.order_id}`}>
                  {t('supportCases.orderNumber', { id: item.order_id })}
                </Link>
              )}
            </dd>
          </div>
        )}
        {item.ticket_id != null && (
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
            <dt>{t('supportCases.tickets')}</dt>
            <dd>
              {handler ? (
                t('supportCases.ticketNumber', { id: item.ticket_id })
              ) : (
                <Link className={relatedLink} to={`/tickets/${item.ticket_id}`}>
                  {t('supportCases.ticketNumber', { id: item.ticket_id })}
                </Link>
              )}
            </dd>
          </div>
        )}
      </dl>
    </section>
  )
}

function CaseRoute({ id }: { id: number }) {
  const { t } = useTranslation()
  const me = useMe()
  const query = useSupportCase(id, id > 0 && me.isSuccess)
  const actions = useSupportCaseActions(id)
  const accessDenied = isApiError(query.error) && [401, 403, 404].includes(query.error.status)
  const item = accessDenied || !me.isSuccess ? undefined : query.data
  const user = me.isSuccess ? me.data : undefined
  const handler = !!(item && user && item.requester_user_id !== user.id)
  const area: Area =
    handler && user?.roles.isAdmin
      ? 'admin'
      : handler || (item?.kind === 'platform' && user?.roles.organizerStatus === 'approved')
        ? 'organizer'
        : 'public'
  const back =
    area === 'admin'
      ? { to: '/admin/support', label: t('supportCases.adminTitle') }
      : area === 'organizer'
        ? {
            to: handler ? '/organizer/support' : '/organizer/support/mine',
            label: t(handler ? 'nav.support' : 'supportCases.platformCases'),
          }
        : { to: '/support', label: t('supportCases.myCases') }

  const error = me.isError ? me : query
  const notFound = id <= 0 || (isApiError(error.error) && error.error.status === 404)
  const content = notFound ? (
    <EmptyState title={t('errors.SupportCaseNotFoundError')} icon="chat" />
  ) : error.isError && (!item || me.isError) ? (
    <ErrorState
      title={t('supportCases.caseError')}
      description={t(errorMessageKey(error.error))}
      onRetry={() => void error.refetch()}
      retrying={error.isFetching}
    />
  ) : !item || !user ? (
    <p role="status">{t('common.loading')}</p>
  ) : (
    <div
      className={
        handler
          ? 'grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,21.25rem)]'
          : 'space-y-4'
      }
    >
      <div className="min-w-0 space-y-4">
        <Related item={item} area={area} handler={handler} />
        {query.isRefetchError && (
          <InlineAlert tone="danger" role="alert">
            {t(errorMessageKey(query.error))}
          </InlineAlert>
        )}
        <SupportThread
          key={item.id}
          item={item}
          me={user.id}
          admin={area === 'admin'}
          handler={handler}
          actions={actions}
          refreshing={query.isFetching}
          refresh={() => void query.refetch()}
        />
      </div>
      {handler && (
        <SupportHandlerPanel item={item} me={user.id} admin={area === 'admin'} actions={actions} />
      )}
    </div>
  )
  const meta = item && (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-small text-ink-2">
      <StatusBadge kind="support" status={item.status} />
      <span>{t('supportCases.caseNumber', { id: item.id })}</span>
      <span>
        <SupportCategory category={item.category} />
      </span>
      <span>{eventTimeZoneLabel()}</span>
    </div>
  )
  const title = item?.subject || t('supportCases.caseTitle')
  if (area === 'public')
    return (
      <PublicLayout>
        <SupportViewerPage routeId="support-case" title={title} meta={meta} back={back}>
          {content}
        </SupportViewerPage>
      </PublicLayout>
    )
  return (
    <WorkspaceLayout area={area}>
      <OrganizerPage routeId="support-case" title={title} meta={meta} breadcrumb={[back]}>
        {content}
      </OrganizerPage>
    </WorkspaceLayout>
  )
}

export default function SupportCasePage() {
  const raw = useParams().caseId
  const id = raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : 0
  return (
    <RequireAuth>
      <CaseRoute key={raw} id={Number.isSafeInteger(id) ? id : 0} />
    </RequireAuth>
  )
}
