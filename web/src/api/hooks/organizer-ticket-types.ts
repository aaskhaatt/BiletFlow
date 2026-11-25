// The organizer's calls on ticket types. The backend's addresses are uneven
// ("/events/{id}/ticket-type" is singular, "/ticket_types/{id}/hide" has an
// underscore): that stays inside the generated client, nobody else spells them.
import {
  useTicketTypesCreateTicketTypeRouter,
  useTicketTypesGetTicketTypesForOrganizer,
  useTicketTypesHideTicketTypeRouter,
  useTicketTypesUnhideTicketTypeRouter,
  useTicketTypesUpdateTicketTypeRouter,
} from '@/api/generated/endpoints/ticket-types/ticket-types'
import { useQueryClient } from '@tanstack/react-query'
import { invalidateEventQueries } from '@/api/hooks/organizer-events'

function useRefreshEvents() {
  const queryClient = useQueryClient()
  return () => invalidateEventQueries(queryClient)
}

/** GET /events/{id}/ticket-types/manage: every type, hidden ones and drafts included. */
export function useManagedTicketTypes(eventId: number) {
  return useTicketTypesGetTicketTypesForOrganizer(eventId)
}

export function useCreateTicketType() {
  const refresh = useRefreshEvents()
  return useTicketTypesCreateTicketTypeRouter({ mutation: { onSuccess: refresh } })
}

/** PATCH /ticket-types/{id}: send only what changed; null clears the description. */
export function useUpdateTicketType() {
  const refresh = useRefreshEvents()
  return useTicketTypesUpdateTicketTypeRouter({ mutation: { onSuccess: refresh } })
}

export function useHideTicketType() {
  const refresh = useRefreshEvents()
  return useTicketTypesHideTicketTypeRouter({ mutation: { onSuccess: refresh } })
}

export function useUnhideTicketType() {
  const refresh = useRefreshEvents()
  return useTicketTypesUnhideTicketTypeRouter({ mutation: { onSuccess: refresh } })
}
