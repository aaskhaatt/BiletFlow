// Our names for the event calls. Components import these, never the generated
// hooks: the backend's operation IDs ("events-get_events") may still be renamed,
// and then only this file changes.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { campaignsOpenCampaignLink } from '@/api/generated/endpoints/campaigns/campaigns'
import {
  eventsGetEvent,
  eventsGetEventCategories,
  getEventsGetEventCategoriesQueryKey,
  getEventsGetEventQueryKey,
  getEventsGetEventsQueryKey,
  useEventsGetEvents,
} from '@/api/generated/endpoints/events/events'
import {
  getTicketTypesGetTicketTypesByEventIdQueryKey,
  ticketTypesGetTicketTypesByEventId,
} from '@/api/generated/endpoints/ticket-types/ticket-types'
import type { EventsGetEventsParams } from '@/api/generated/model'

export type EventListParams = EventsGetEventsParams

/**
 * Public catalog: GET /events → { items, total } (search, category, dates, paging).
 * While another page or search loads, the previous result stays on screen
 * (`isPlaceholderData` is true meanwhile) instead of a blank list.
 */
export function useEvents(params?: EventListParams) {
  return useEventsGetEvents(params, { query: { placeholderData: keepPreviousData } })
}

export const eventsQueryKey = getEventsGetEventsQueryKey

export function useEventCategories() {
  return useQuery({
    queryKey: getEventsGetEventCategoriesQueryKey(),
    queryFn: ({ signal }) => eventsGetEventCategories({ signal }),
    staleTime: 5 * 60_000,
  })
}

export function useEvent(eventId: number) {
  return useQuery({
    queryKey: getEventsGetEventQueryKey(eventId),
    queryFn: ({ signal }) => eventsGetEvent(eventId, { signal }),
  })
}

export function useTicketTypes(eventId: number) {
  return useQuery({
    queryKey: getTicketTypesGetTicketTypesByEventIdQueryKey(eventId),
    queryFn: ({ signal }) => ticketTypesGetTicketTypesByEventId(eventId, { signal }),
  })
}

export function useCampaignLink(token: string) {
  return useQuery({
    queryKey: ['campaign-link', token],
    // Opening a link is counted by the server. Keep one request for this visit.
    queryFn: () => campaignsOpenCampaignLink(token),
    enabled: /^[\w-]{1,200}$/.test(token),
    staleTime: Infinity,
    retry: false,
  })
}
