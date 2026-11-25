// Our names for the event calls. Components import these, never the generated
// hooks: the backend's operation IDs ("events-get_events") may still be renamed,
// and then only this file changes.
import { keepPreviousData } from '@tanstack/react-query'
import {
  getEventsGetEventsQueryKey,
  useEventsGetEvents,
} from '@/api/generated/endpoints/events/events'
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
