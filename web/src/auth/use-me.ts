import { useQuery } from '@tanstack/react-query'
import { getMe } from '@/auth/account-api'
import { useSession } from '@/auth/session-store'

export const meQueryKey = ['/auth/me'] as const

export function useMe() {
  const { status, generation } = useSession()
  return useQuery({
    // Refreshing credentials keeps the same identity. A new sign-in starts a new cache entry.
    queryKey: [...meQueryKey, generation],
    queryFn: ({ signal }) => getMe(signal),
    enabled: status === 'authenticated',
  })
}
