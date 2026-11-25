// The organizer's calls on events. Components import these, never the generated
// hooks (see events.ts for why). Every change refreshes what the pages show: the
// organizer's lists and numbers, the event itself, its ticket types, its history
// and the public catalog.
import { keepPreviousData, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  eventsGetEventHistory,
  useEventsCancelEvent,
  useEventsCreateEvent,
  useEventsDeleteEventImage,
  useEventsDuplicateEvent,
  useEventsGetEventForOwner,
  useEventsGetEventHistory,
  useEventsGetMyEventSummaries,
  useEventsGetMyEvents,
  useEventsPublishEvent,
  useEventsUnpublishEvent,
  useEventsUpdateEvent,
  useEventsUploadEventImage,
} from '@/api/generated/endpoints/events/events'
import type {
  EventResponse,
  EventsGetEventHistoryParams,
  HistoryEntry,
  EventsGetMyEventsParams,
} from '@/api/generated/model'

export type HistoryParams = EventsGetEventHistoryParams

/** Every cached answer under /events (lists, one event, ticket types, paid sales, history). */
export function invalidateEventQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: ({ queryKey }) =>
      typeof queryKey[0] === 'string' && queryKey[0].startsWith('/events'),
  })
}

function useRefreshEvents() {
  const queryClient = useQueryClient()
  // Returned from onSuccess: the mutation stays busy until the pages are fresh
  return () => invalidateEventQueries(queryClient)
}

/** GET /events/me: my events with their details. Optional filter by lifecycle. */
export function useMyEvents(params?: EventsGetMyEventsParams, enabled = true) {
  return useEventsGetMyEvents(params, { query: { enabled } })
}

/** GET /events/me/summary: tickets sold, revenue and paid-sales status per event. */
export function useMyEventSummaries(enabled = true) {
  return useEventsGetMyEventSummaries({ query: { enabled } })
}

/** GET /events/{id}/manage: one of my events in any status (drafts and private too). */
export function useManagedEvent(eventId: number, { enabled = true }: { enabled?: boolean } = {}) {
  return useEventsGetEventForOwner(eventId, { query: { enabled } })
}

/** GET /events/{id}/history, paged; the previous page stays on screen while the next loads. */
export function useEventHistory(eventId: number, params: HistoryParams) {
  return useEventsGetEventHistory(eventId, params, { query: { placeholderData: keepPreviousData } })
}

/** The most the API gives in one answer. */
const HISTORY_PAGE_SIZE = 200

/** Every entry of the history that matches the filters (all pages), oldest page last, as the API orders them. */
export async function fetchWholeHistory(
  eventId: number,
  filters: Omit<HistoryParams, 'limit' | 'offset'>,
): Promise<HistoryEntry[]> {
  const entries: HistoryEntry[] = []
  for (;;) {
    const page = await eventsGetEventHistory(eventId, {
      ...filters,
      limit: HISTORY_PAGE_SIZE,
      offset: entries.length,
    })
    entries.push(...page.items)
    if (page.items.length === 0 || entries.length >= page.total) return entries
  }
}

export function useCreateEvent() {
  const refresh = useRefreshEvents()
  return useEventsCreateEvent({ mutation: { onSuccess: refresh } })
}

/** PATCH /events/{id}: send only what changed; null clears an optional field. */
export function useUpdateEvent() {
  const refresh = useRefreshEvents()
  return useEventsUpdateEvent({ mutation: { onSuccess: refresh } })
}

export function usePublishEvent() {
  const refresh = useRefreshEvents()
  return useEventsPublishEvent({ mutation: { onSuccess: refresh } })
}

/** Only while no tickets are sold or held (409 EventHasTicketsError otherwise). */
export function useUnpublishEvent() {
  const refresh = useRefreshEvents()
  return useEventsUnpublishEvent({ mutation: { onSuccess: refresh } })
}

/** Refunds paid orders and cancels the rest. Can't be undone. */
export function useCancelEvent() {
  const refresh = useRefreshEvents()
  return useEventsCancelEvent({ mutation: { onSuccess: refresh } })
}

/** A new draft with the same details and ticket types. */
export function useDuplicateEvent() {
  const refresh = useRefreshEvents()
  return useEventsDuplicateEvent({ mutation: { onSuccess: refresh } })
}

/** PUT /events/{id}/image: multipart, field "file" (the browser sets Content-Type itself). */
export function useUploadEventImage() {
  const refresh = useRefreshEvents()
  return useEventsUploadEventImage({ mutation: { onSuccess: refresh } })
}

export function useDeleteEventImage() {
  const refresh = useRefreshEvents()
  return useEventsDeleteEventImage({ mutation: { onSuccess: refresh } })
}

export type { EventResponse }
