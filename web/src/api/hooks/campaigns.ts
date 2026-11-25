// The organizer's calls on campaigns (promo codes and their QR links). Components
// import these, never the generated hooks (see events.ts for why).
import { useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  campaignsGetEventCampaigns,
  getCampaignsGetCampaignQueryKey,
  getCampaignsGetEventCampaignsQueryKey,
  useCampaignsCreateCampaign,
  useCampaignsGetCampaign,
  useCampaignsUpdateCampaign,
} from '@/api/generated/endpoints/campaigns/campaigns'
import { useTicketTypesGetTicketTypesForOrganizer } from '@/api/generated/endpoints/ticket-types/ticket-types'
import type { CampaignResponse } from '@/api/generated/model'
import { apiBlob } from '@/api/http'
import { useSession } from '@/auth/session-store'

/**
 * Every cached answer a campaign change can make stale: the lists under /events
 * (campaigns of an event, analytics, history) and the campaigns themselves.
 */
function refreshCampaigns(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: ({ queryKey }) =>
      typeof queryKey[0] === 'string' &&
      (queryKey[0].startsWith('/events') || queryKey[0].startsWith('/campaigns')),
  })
}

/** One campaign with the event it belongs to, as a row of the list. */
export type CampaignRow = { eventId: number; campaign: CampaignResponse }

/**
 * GET /events/{id}/campaigns for each event, as one list of campaigns, newest first.
 * `failed` counts the events whose campaigns could not be loaded.
 */
export function useEventsCampaigns(eventIds: readonly number[]) {
  return useQueries({
    queries: eventIds.map((eventId) => ({
      queryKey: getCampaignsGetEventCampaignsQueryKey(eventId),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        campaignsGetEventCampaigns(eventId, { signal }),
    })),
    combine: (results) => {
      const rows: CampaignRow[] = results.flatMap((result, index) =>
        (result.data ?? []).map((campaign) => ({ eventId: eventIds[index], campaign })),
      )
      rows.sort((a, b) => Date.parse(b.campaign.created_at) - Date.parse(a.campaign.created_at))
      return {
        rows,
        pending: results.some((result) => result.isPending),
        failed: results.filter((result) => result.isError).length,
        error: results.find((result) => result.isError)?.error,
        fetching: results.some((result) => result.isFetching),
        refetch: () => Promise.all(results.map((result) => result.refetch())),
      }
    },
  })
}

/** GET /campaigns/{id} */
export function useCampaign(campaignId: number, { enabled = true }: { enabled?: boolean } = {}) {
  return useCampaignsGetCampaign(campaignId, { query: { enabled } })
}

/** POST /events/{id}/campaigns: the code left out is made by the server (8 characters). */
export function useCreateCampaign() {
  const queryClient = useQueryClient()
  return useCampaignsCreateCampaign({
    mutation: { onSuccess: () => refreshCampaigns(queryClient) },
  })
}

/**
 * PATCH /campaigns/{id}: only the name, the dates, the limit and is_active change;
 * null clears a date or the limit. The answer replaces the cached campaign at once.
 */
export function useUpdateCampaign() {
  const queryClient = useQueryClient()
  return useCampaignsUpdateCampaign({
    mutation: {
      onSuccess: (campaign) => {
        queryClient.setQueryData(getCampaignsGetCampaignQueryKey(campaign.id), campaign)
        return refreshCampaigns(queryClient)
      },
    },
  })
}

/** GET /campaigns/{id}/qr: the PNG with the orange frame and "NOT AN ENTRY TICKET". */
export function useCampaignQr(campaignId: number) {
  const { generation } = useSession()
  return useQuery({
    queryKey: ['campaign-qr', generation, campaignId],
    queryFn: ({ signal }) => apiBlob(`/campaigns/${campaignId}/qr`, { signal }),
    staleTime: Infinity,
    gcTime: 0,
  })
}

/** GET /events/{id}/ticket-types/manage: the types a campaign can be limited to. */
export function useCampaignTicketTypes(eventId: number, { enabled }: { enabled: boolean }) {
  return useTicketTypesGetTicketTypesForOrganizer(eventId, { query: { enabled } })
}
