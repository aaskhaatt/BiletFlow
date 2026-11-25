// Our names for the organizer-profile calls. Components import these, never the
// generated hooks (see events.ts for why).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isApiError } from '@/api/errors'
import {
  getOrganizersGetMyOrganizerProfileQueryKey,
  organizersGetMyOrganizerProfile,
  organizersSetPayoutAccount,
  organizersUpdateMyOrganizerProfile,
  organizersVerifyIdentity,
  useOrganizersApplyForOrganizer,
} from '@/api/generated/endpoints/organizers/organizers'
import type {
  IdentityVerificationRequest,
  OrganizerProfileResponse,
  OrganizerUpdateRequest,
  PayoutAccountRequest,
} from '@/api/generated/model'
import { invalidateEventQueries } from '@/api/hooks/organizer-events'
import { useSession } from '@/auth/session-store'
import { meQueryKey } from '@/auth/use-me'

const profileKey = (generation: number) =>
  [...getOrganizersGetMyOrganizerProfileQueryKey(), generation] as const

export function useOrganizerProfile() {
  const { generation, status } = useSession()
  return useQuery({
    queryKey: profileKey(generation),
    queryFn: ({ signal }) => organizersGetMyOrganizerProfile({ signal }),
    enabled: status === 'authenticated',
  })
}

export function useOrganizerProfileActions() {
  const client = useQueryClient()
  const { generation } = useSession()

  async function update(request: Promise<OrganizerProfileResponse>) {
    const profile = await request
    const queryKey = profileKey(generation)
    await client.cancelQueries({ queryKey, exact: true })
    client.setQueryData(queryKey, profile)
    void client.invalidateQueries({ queryKey: meQueryKey })
    void invalidateEventQueries(client)
    return profile
  }

  return {
    updatePublicName: (data: OrganizerUpdateRequest) =>
      update(organizersUpdateMyOrganizerProfile(data)),
    verifyIdentity: (data: IdentityVerificationRequest) => update(organizersVerifyIdentity(data)),
    setPayoutAccount: (data: PayoutAccountRequest) => update(organizersSetPayoutAccount(data)),
  }
}

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
