import { useQuery } from '@tanstack/react-query'
import type { CurrentUserResponse } from '@/api/generated/model'
import { getMe } from '@/auth/account-api'
import { useSession } from '@/auth/session-store'

export const meQueryKey = ['/auth/me'] as const

function withRoles(me: CurrentUserResponse) {
  const organizerStatus = me.organizer?.status ?? 'none'
  return {
    ...me,
    roles: {
      organizerStatus,
      isAdmin: me.is_platform_admin,
      showScanner: me.is_event_staff || organizerStatus === 'approved',
    },
  }
}

export function useMe() {
  const { status, generation } = useSession()
  return useQuery({
    // Refreshing credentials keeps the same identity. A new sign-in starts a new cache entry.
    queryKey: [...meQueryKey, generation],
    queryFn: ({ signal }) => getMe(signal),
    enabled: status === 'authenticated',
    refetchOnWindowFocus: true,
    select: withRoles,
  })
}
