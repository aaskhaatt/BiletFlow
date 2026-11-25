// Our names for the organizer-profile calls. Components import these, never the
// generated hooks (see events.ts for why).
import { useQueryClient } from '@tanstack/react-query'
import { isApiError } from '@/api/errors'
import { useOrganizersApplyForOrganizer } from '@/api/generated/endpoints/organizers/organizers'
import { meQueryKey } from '@/auth/use-me'

/**
 * POST /organizers/apply: a first application, or a rejected one sent again
 * (it goes back to `pending`). `displayName` is the optional public name (2-100
 * characters); null sends none.
 *
 * The promise settles after GET /auth/me has been read again, so the page that
 * calls it already shows the new status when the button stops spinning.
 */
export function useApplyAsOrganizer() {
  const queryClient = useQueryClient()
  const refreshMe = () => queryClient.invalidateQueries({ queryKey: meQueryKey })
  const { mutateAsync } = useOrganizersApplyForOrganizer({
    mutation: {
      onSuccess: refreshMe,
      // 409: the application already exists (sent from another device, or
      // approved meanwhile). The page then shows the real status.
      onError: (error) => (isApiError(error) && error.status === 409 ? refreshMe() : undefined),
    },
  })

  return {
    apply: (displayName: string | null) => mutateAsync({ data: { display_name: displayName } }),
  }
}
