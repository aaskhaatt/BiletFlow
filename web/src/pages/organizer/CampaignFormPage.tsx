import { useTranslation } from 'react-i18next'
import { useLocation, useParams, useSearchParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import { useCampaign } from '@/api/hooks/campaigns'
import ErrorState from '@/components/ErrorState'
import Skeleton from '@/components/Skeleton'
import CampaignForm from '@/pages/organizer/CampaignForm'
import OrganizerPage from '@/pages/organizer/OrganizerPage'
import NotFoundPage from '@/pages/NotFoundPage'

/** /organizer/campaigns/new, also with ?event=ID (from the list or from the event's page) */
export function NewCampaignPage() {
  const [search] = useSearchParams()
  const eventId = Number(search.get('event'))

  return (
    <CampaignForm defaultEventId={Number.isInteger(eventId) && eventId > 0 ? eventId : undefined} />
  )
}

/** /organizer/campaigns/:campaignId */
export function EditCampaignPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const campaignId = Number(useParams().campaignId)
  const valid = Number.isInteger(campaignId) && campaignId > 0
  const campaign = useCampaign(campaignId, { enabled: valid })
  const crumbs = [{ label: t('organizerCampaigns.title'), to: '/organizer/campaigns' }]

  if (!valid) return <NotFoundPage />
  if (campaign.isError) {
    return (
      <OrganizerPage routeId="organizer-campaign" breadcrumb={crumbs} title={t('routeError.title')}>
        <ErrorState
          title={t('routeError.title')}
          description={t(errorMessageKey(campaign.error))}
          onRetry={() => void campaign.refetch()}
          retrying={campaign.isFetching}
        />
      </OrganizerPage>
    )
  }
  if (!campaign.data) {
    return (
      <OrganizerPage
        routeId="organizer-campaign"
        breadcrumb={crumbs}
        title={<Skeleton className="h-9 w-72" />}
      >
        <div role="status">
          <span className="sr-only">{t('common.loading')}</span>
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </OrganizerPage>
    )
  }

  // The form of a new campaign sends us here, with what happened on the way
  const state: unknown = location.state
  const notice =
    typeof state === 'object' && state !== null && 'notice' in state ? state.notice : undefined
  const created =
    typeof state === 'object' && state !== null && 'created' in state ? state.created : undefined

  return (
    <CampaignForm
      key={campaign.data.id}
      campaign={campaign.data}
      notice={typeof notice === 'string' ? notice : undefined}
      done={
        created === 'on'
          ? t('organizerCampaigns.form.created')
          : created === 'off'
            ? t('organizerCampaigns.form.createdOff')
            : undefined
      }
    />
  )
}
