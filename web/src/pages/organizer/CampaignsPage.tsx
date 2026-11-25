import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import { useEventsCampaigns, type CampaignRow } from '@/api/hooks/campaigns'
import { useMyEvents } from '@/api/hooks/organizer-events'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import InlineAlert from '@/components/InlineAlert'
import ProgressBar from '@/components/ProgressBar'
import ResponsiveTable, { type TableColumn } from '@/components/ResponsiveTable'
import SelectField from '@/components/SelectField'
import Skeleton from '@/components/Skeleton'
import StatusBadge from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatDateShort } from '@/lib/event-display'
import { campaignStatus, formatDiscount } from '@/pages/organizer/campaign-values'
import OrganizerPage from '@/pages/organizer/OrganizerPage'

const ALL = 'all'

function ListSkeleton() {
  const { t } = useTranslation()

  return (
    <div role="status" className="space-y-4">
      <span className="sr-only">{t('common.loading')}</span>
      <Skeleton className="h-16 w-72 rounded-md" />
      <Skeleton className="h-64 rounded-lg" />
    </div>
  )
}

function Period({ campaign }: { campaign: CampaignRow['campaign'] }) {
  const { t } = useTranslation()
  const { starts_at: from, ends_at: until } = campaign

  if (!from && !until)
    return <span className="type-body">{t('organizerCampaigns.table.always')}</span>
  return (
    <p className="type-body">
      {[
        from && t('organizerCampaigns.table.from', { date: formatDateShort(from) }),
        until && t('organizerCampaigns.table.until', { date: formatDateShort(until) }),
      ]
        .filter(Boolean)
        .join(' ')}
    </p>
  )
}

function CampaignsTable({
  rows,
  titles,
  caption,
}: {
  rows: CampaignRow[]
  titles: Map<number, string>
  caption: string
}) {
  const { t, i18n } = useTranslation()
  const [now] = useState(() => Date.now())
  const number = new Intl.NumberFormat(i18n.resolvedLanguage)
  const link = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

  const columns: TableColumn<CampaignRow>[] = [
    {
      id: 'campaign',
      header: t('organizerCampaigns.table.campaign'),
      cell: ({ campaign }) => (
        <div className="min-w-0 space-y-0.5">
          <Link
            to={`/organizer/campaigns/${campaign.id}`}
            className={`type-body font-semibold hover:underline ${link}`}
          >
            {campaign.name}
          </Link>
          <p className="type-small font-semibold tracking-[0.0625rem] text-ink-muted">
            {campaign.code}
          </p>
        </div>
      ),
    },
    {
      id: 'event',
      header: t('organizerCampaigns.table.event'),
      cell: ({ eventId }) => (
        <Link to={`/organizer/events/${eventId}`} className={`type-body hover:underline ${link}`}>
          {titles.get(eventId) ?? `№${eventId}`}
        </Link>
      ),
    },
    {
      id: 'discount',
      header: t('organizerCampaigns.table.discount'),
      cell: ({ campaign }) => (
        <span className="type-body font-medium tabular-nums">
          {formatDiscount(campaign.discount_type, campaign.discount_value)}
        </span>
      ),
    },
    {
      id: 'usage',
      header: t('organizerCampaigns.table.usage'),
      cell: ({ campaign }) =>
        campaign.max_redemptions === null ? (
          <p className="type-label tabular-nums">
            {number.format(campaign.redemptions_count)} · {t('organizerCampaigns.table.noLimit')}
          </p>
        ) : (
          <ProgressBar
            label={t('organizerCampaigns.table.usage')}
            value={campaign.redemptions_count}
            max={campaign.max_redemptions}
          />
        ),
    },
    {
      id: 'period',
      header: t('organizerCampaigns.table.period'),
      cell: ({ campaign }) => <Period campaign={campaign} />,
    },
    {
      id: 'status',
      header: t('organizerCampaigns.table.status'),
      cell: ({ campaign }) => (
        <StatusBadge kind="campaign" status={campaignStatus(campaign, now)} size="sm" />
      ),
    },
    {
      id: 'open',
      header: t('organizerCampaigns.table.actions'),
      cell: ({ campaign }) => (
        <Link
          to={`/organizer/campaigns/${campaign.id}`}
          className={`type-label text-brand hover:underline ${link}`}
        >
          {t('organizerCampaigns.table.open')} <span className="sr-only">{campaign.name}</span>
        </Link>
      ),
    },
  ]

  return (
    <ResponsiveTable
      caption={caption}
      columns={columns}
      rows={rows}
      rowKey={({ campaign }) => campaign.id}
    />
  )
}

/**
 * /organizer/campaigns (Figma G8 has no frame yet: built from the events table).
 * The campaigns of all my events in one list, newest first; "?event=ID" or the
 * filter shows one event's.
 */
export default function CampaignsPage() {
  const { t } = useTranslation()
  const [search, setSearch] = useSearchParams()
  const events = useMyEvents()
  const eventList = events.data ?? []
  const campaigns = useEventsCampaigns(eventList.map((event) => event.id))

  const wanted = Number(search.get('event'))
  const selected = eventList.some((event) => event.id === wanted) ? wanted : undefined
  const titles = new Map(eventList.map((event) => [event.id, event.title]))
  const rows = campaigns.rows.filter((row) => selected === undefined || row.eventId === selected)

  const create = (
    <Button asChild>
      <Link
        to={selected ? `/organizer/campaigns/new?event=${selected}` : '/organizer/campaigns/new'}
      >
        {t('organizerCampaigns.create')}
      </Link>
    </Button>
  )

  let content
  if (events.isError) {
    content = (
      <ErrorState
        title={t('routeError.title')}
        description={t(errorMessageKey(events.error))}
        onRetry={() => void events.refetch()}
        retrying={events.isFetching}
      />
    )
  } else if (!events.data || (eventList.length > 0 && campaigns.pending)) {
    content = <ListSkeleton />
  } else if (eventList.length === 0) {
    content = (
      <div className="space-y-4">
        <EmptyState
          icon="calendar"
          title={t('organizerCampaigns.empty.noEventsTitle')}
          description={t('organizerCampaigns.empty.noEventsDescription')}
        />
        <div className="flex justify-center">
          <Button asChild>
            <Link to="/organizer/events/new">{t('organizerEvents.create')}</Link>
          </Button>
        </div>
      </div>
    )
  } else if (campaigns.failed === eventList.length) {
    content = (
      <ErrorState
        title={t('organizerCampaigns.loadFailed')}
        description={t(errorMessageKey(campaigns.error))}
        onRetry={() => void campaigns.refetch()}
        retrying={campaigns.fetching}
      />
    )
  } else {
    content = (
      <>
        {campaigns.failed > 0 && (
          <InlineAlert tone="warn" role="alert">
            {t('organizerCampaigns.someFailed')}{' '}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => void campaigns.refetch()}
            >
              {t('common.retry')}
            </Button>
          </InlineAlert>
        )}
        <SelectField
          className="max-w-sm"
          label={t('organizerCampaigns.filter.label')}
          options={[
            { value: ALL, label: t('organizerCampaigns.filter.all') },
            ...eventList.map((event) => ({ value: String(event.id), label: event.title })),
          ]}
          value={selected === undefined ? ALL : String(selected)}
          onValueChange={(value) =>
            setSearch(value === ALL ? {} : { event: value }, { replace: true })
          }
        />
        {rows.length === 0 ? (
          <div className="space-y-4">
            <EmptyState
              icon="promo"
              title={t(
                selected === undefined
                  ? 'organizerCampaigns.empty.title'
                  : 'organizerCampaigns.empty.filteredTitle',
              )}
              description={t('organizerCampaigns.empty.description')}
            />
            <div className="flex justify-center">{create}</div>
          </div>
        ) : (
          <section className="space-y-2">
            <div className="overflow-hidden rounded-lg border border-line bg-surface">
              <CampaignsTable
                rows={rows}
                titles={titles}
                caption={t('organizerCampaigns.table.caption')}
              />
            </div>
            <p className="type-small text-ink-muted">{t('time.astanaZone')}</p>
          </section>
        )}
      </>
    )
  }

  return (
    <OrganizerPage
      routeId="organizer-campaigns"
      title={t('organizerCampaigns.title')}
      meta={<p className="type-body text-ink-2">{t('organizerCampaigns.subtitle')}</p>}
      actions={eventList.length > 0 ? create : undefined}
    >
      {content}
    </OrganizerPage>
  )
}
