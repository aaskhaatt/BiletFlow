// Our names for the event calls. Components import these, never the generated
// hooks: the backend's operation IDs ("events-get_events") may still be renamed,
// and then only this file changes.
import {
  getEventsGetEventsQueryKey,
  useEventsGetEvents,
} from '@/api/generated/endpoints/events/events'
import type { EventsGetEventsParams } from '@/api/generated/model'

export type EventListParams = EventsGetEventsParams

/** Public catalog: GET /events → { items, total } (search, category, dates, paging). */
export function useEvents(params?: EventListParams) {
  return useEventsGetEvents(params)
}

export const eventsQueryKey = getEventsGetEventsQueryKey
