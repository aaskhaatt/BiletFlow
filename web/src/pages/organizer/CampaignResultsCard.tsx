import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { CampaignResponse } from '@/api/generated/model'
import { formatRevenue } from '@/lib/event-display'

function Row({ label, hint, value }: { label: string; hint?: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="min-w-0">
        <span className="block type-label font-normal text-ink-2">{label}</span>
        {hint && <span className="block type-small text-ink-muted">{hint}</span>}
      </dt>
      <dd className="shrink-0 text-[0.9375rem] leading-[1.4] font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  )
}

/**
 * "Результаты" of a campaign (Figma "Карточка / Результаты кампании"). Without a
 * campaign (the form of a new one) every number is a dash.
 */
export default function CampaignResultsCard({ campaign }: { campaign?: CampaignResponse }) {
  const { t, i18n } = useTranslation()
  const number = new Intl.NumberFormat(i18n.resolvedLanguage)
  const dash = <span aria-label="—">—</span>

  const uses = !campaign
    ? dash
    : campaign.max_redemptions === null
      ? number.format(campaign.redemptions_count)
      : `${number.format(campaign.redemptions_count)} / ${number.format(campaign.max_redemptions)}`

  return (
    <section
      aria-labelledby="campaign-results-title"
      className="space-y-3 rounded-lg border border-line bg-surface p-6"
      data-slot="campaign-results"
    >
      <h2 id="campaign-results-title" className="type-card-title">
        {t('organizerCampaigns.results.title')}
      </h2>
      <p className="type-small text-ink-muted">
        {t(campaign ? 'organizerCampaigns.results.counted' : 'organizerCampaigns.results.later')}
      </p>
      <dl className="space-y-3">
        <Row
          label={t('organizerCampaigns.results.uses')}
          hint={t('organizerCampaigns.results.usesHint')}
          value={uses}
        />
        <Row
          label={t('organizerCampaigns.results.tickets')}
          value={campaign ? number.format(campaign.stats.tickets) : dash}
        />
        <Row
          label={t('organizerCampaigns.results.discounts')}
          value={campaign ? formatRevenue(campaign.stats.discount) : <>— ₸</>}
        />
        <Row
          label={t('organizerCampaigns.results.revenue')}
          hint={t('organizerCampaigns.results.revenueHint')}
          value={campaign ? formatRevenue(campaign.stats.gross) : <>— ₸</>}
        />
        <Row
          label={t('organizerCampaigns.results.opens')}
          hint={t('organizerCampaigns.results.opensHint')}
          value={campaign ? number.format(campaign.link_opens) : dash}
        />
      </dl>
    </section>
  )
}
