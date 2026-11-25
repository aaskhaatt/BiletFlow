import { cn } from 'cn'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import type { SupportCaseSummary, SupportGetSupportInboxKind } from '@/api/generated/model'
import { useMyEvents } from '@/api/hooks/organizer-events'
import { useMySupportCases, useSupportInbox } from '@/api/hooks/support'
import { useMe } from '@/auth/use-me'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import ResponsiveTable, { type TableColumn } from '@/components/ResponsiveTable'
import StatusBadge from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { eventTimeZoneLabel, formatEventTime } from '@/lib/format'
import OrganizerPage from '@/pages/organizer/OrganizerPage'
import {
  SupportAssignee,
  SupportCaseContext,
  SupportCategory,
  SupportUserLabel,
} from '@/pages/support/SupportLabels'
import { supportStatuses } from '@/pages/support/support-values'

function PlatformLinks() {
  const { t, i18n } = useTranslation()
  const platformCases = useMySupportCases().data?.filter((item) => item.kind === 'platform')
  const count = platformCases?.length
  return (
    <>
      <Button asChild variant="link">
        <Link to="/organizer/support/mine">
          {t('supportCases.platformCases')}
          {count ? ` · ${new Intl.NumberFormat(i18n.resolvedLanguage).format(count)}` : ''}
        </Link>
      </Button>
      <Button asChild variant="outline">
        <Link to="/organizer/support/new">{t('supportCases.writePlatform')}</Link>
      </Button>
    </>
  )
}

export default function SupportInboxPage({ admin = false }: { admin?: boolean }) {
  const { t, i18n } = useTranslation()
  const { data: me } = useMe()
  const [filters, setFilters] = useSearchParams()
  const selectedKind = filters.get('kind')
  const kind: SupportGetSupportInboxKind | undefined =
    admin && (selectedKind === 'attendee' || selectedKind === 'platform') ? selectedKind : undefined
  const status = supportStatuses.find((value) => value === filters.get('status'))
  const baseParams = kind ? { kind } : undefined
  const base = useSupportInbox(baseParams)
  const filtered = useSupportInbox({ ...baseParams, status }, Boolean(status))
  const inbox = status ? filtered : base
  const restrictToOwned = !admin && !!me?.roles.isAdmin
  const owned = useMyEvents(undefined, restrictToOwned)
  const visibleInOrganizer = (item: SupportCaseSummary) =>
    admin ||
    (item.kind === 'attendee' &&
      (!restrictToOwned || owned.data?.some((event) => event.id === item.event_id)))
  const counts = base.data?.filter(visibleInOrganizer)
  const items = inbox.data
    ?.filter(visibleInOrganizer)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at) || b.id - a.id)
  const number = new Intl.NumberFormat(i18n.resolvedLanguage)

  function choose(name: 'kind' | 'status', value?: string) {
    const next = new URLSearchParams(filters)
    if (value) next.set(name, value)
    else next.delete(name)
    setFilters(next)
  }

  const columns: TableColumn<SupportCaseSummary>[] = [
    {
      id: 'subject',
      header: t('supportCases.subject'),
      cell: (item) => (
        <>
          <Link
            to={`/support/${item.id}`}
            className="font-semibold hover:text-brand hover:underline"
          >
            {item.subject}
          </Link>
          <p className="type-small text-ink-muted">
            {t('supportCases.caseNumber', { id: item.id })} ·{' '}
            {admin ? (
              <SupportCategory category={item.category} />
            ) : (
              <SupportUserLabel id={item.requester_user_id} />
            )}
          </p>
        </>
      ),
    },
    ...(admin
      ? [
          {
            id: 'requester',
            header: t('supportCases.who'),
            cell: (item: SupportCaseSummary) => (
              <div className="space-y-0.5">
                <span
                  className={cn(
                    'w-fit rounded-sm px-2 py-0.5 type-small font-semibold',
                    item.kind === 'platform' ? 'bg-brand-soft text-brand' : 'bg-line-soft text-ink',
                  )}
                >
                  {t(
                    item.kind === 'platform'
                      ? 'supportCases.platformLabel'
                      : 'supportCases.attendeeLabel',
                  )}
                </span>
                <p className="type-small">
                  <SupportUserLabel id={item.requester_user_id} admin />
                </p>
              </div>
            ),
          },
        ]
      : []),
    {
      id: 'context',
      header: t('supportCases.related'),
      cell: (item) => <SupportCaseContext item={item} />,
    },
    ...(!admin
      ? [
          {
            id: 'category',
            header: t('supportCases.category'),
            cell: (item: SupportCaseSummary) => <SupportCategory category={item.category} />,
          },
        ]
      : []),
    {
      id: 'status',
      header: t('supportCases.status'),
      cell: (item) => <StatusBadge kind="support" status={item.status} />,
    },
    {
      id: 'assignee',
      header: t('supportCases.assignee'),
      cell: (item) => <SupportAssignee id={item.assigned_user_id} me={me?.id} admin={admin} />,
    },
    {
      id: 'updated',
      header: t('supportCases.updated'),
      cell: (item) => formatEventTime(item.updated_at),
    },
  ]

  const title = t(admin ? 'supportCases.adminTitle' : 'nav.support')
  const error = restrictToOwned && owned.isError ? owned : inbox
  return (
    <OrganizerPage
      routeId={admin ? 'admin-support-inbox' : 'organizer-support-inbox'}
      title={title}
      actions={!admin && <PlatformLinks />}
    >
      <p className="type-body text-ink-2">
        {t(admin ? 'supportCases.adminIntro' : 'supportCases.inboxIntro')}
      </p>
      {admin && (
        <div
          role="group"
          aria-label={t('supportCases.kind')}
          className="flex flex-wrap gap-1 self-start rounded-md border border-line bg-surface p-1"
        >
          {(
            [
              [undefined, t('supportCases.all')],
              ['attendee', t('supportCases.attendeeKind')],
              ['platform', t('supportCases.platformKind')],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={label}
              type="button"
              size="sm"
              variant={kind === value ? 'default' : 'ghost'}
              aria-pressed={kind === value}
              onClick={() => choose('kind', value)}
            >
              {label}
            </Button>
          ))}
        </div>
      )}
      <div className="min-w-0 rounded-lg border border-line bg-surface">
        <div
          role="group"
          aria-label={t('supportCases.status')}
          className="flex flex-wrap gap-1 border-b border-line px-3 pt-2"
        >
          {[undefined, ...supportStatuses].map((value) => {
            const count = value
              ? counts?.filter((item) => item.status === value).length
              : counts?.length
            const label = value ? t(`status.support.${value}`) : t('supportCases.all')
            return (
              <button
                key={value ?? 'all'}
                type="button"
                aria-pressed={value === status}
                onClick={() => choose('status', value)}
                className={cn(
                  'min-h-11 rounded-t-sm border-b-2 px-3 type-label hover:bg-line-soft focus-visible:outline-2 focus-visible:outline-brand',
                  value === status ? 'border-brand text-ink' : 'border-transparent text-ink-2',
                )}
              >
                {label}
                {count !== undefined ? ` · ${number.format(count)}` : ''}
              </button>
            )
          })}
        </div>
        {error.isError ? (
          <div className="p-4">
            <ErrorState
              title={t('supportCases.listError')}
              description={t(errorMessageKey(error.error))}
              onRetry={() => void error.refetch()}
              retrying={error.isFetching}
            />
          </div>
        ) : !items || (restrictToOwned && !owned.data) ? (
          <p role="status" className="p-4">
            {t('common.loading')}
          </p>
        ) : items.length ? (
          <ResponsiveTable
            caption={title}
            rows={items}
            columns={columns}
            rowKey={(item) => item.id}
          />
        ) : (
          <div className="p-4">
            <EmptyState
              icon="chat"
              title={t(status || kind ? 'supportCases.emptyFilter' : 'supportCases.empty')}
            />
          </div>
        )}
      </div>
      {items?.length ? <p className="type-small text-ink-2">{eventTimeZoneLabel()}</p> : null}
    </OrganizerPage>
  )
}
