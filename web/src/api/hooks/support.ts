import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminSearchUsers } from '@/api/generated/endpoints/admin/admin'
import { eventsGetEvent, getEventsGetEventQueryKey } from '@/api/generated/endpoints/events/events'
import {
  supportAddSupportMessage,
  supportAssignSupportCase,
  supportChangeSupportStatus,
  supportGetMySupportCases,
  supportGetSupportCase,
  supportGetSupportInbox,
  supportOpenSupportCase,
} from '@/api/generated/endpoints/support/support'
import type {
  SupportCaseSummary,
  SupportCaseCreate,
  SupportGetSupportInboxParams,
  SupportStatusUpdateStatus,
} from '@/api/generated/model'
import { useSession } from '@/auth/session-store'

const SUPPORT_POLL_MS = 10_000
const LOOKUP_STALE_MS = 5 * 60_000
const supportKey = (generation: number) => ['support-cases', generation] as const
const listsKey = (generation: number) => [...supportKey(generation), 'lists'] as const
const detailKey = (generation: number, id: number) => [...supportKey(generation), id] as const

/** Cases that still wait for their handler. Preserve the organizer sidebar count. */
const OPEN_STATUSES: ReadonlySet<string> = new Set(['open', 'in_progress'])

export function isOpenSupportCase(supportCase: SupportCaseSummary) {
  return OPEN_STATUSES.has(supportCase.status)
}

export function countOpenSupportCases(cases: SupportCaseSummary[]) {
  return cases.filter(isOpenSupportCase).length
}

export function useSupportInbox(params?: SupportGetSupportInboxParams, enabled = true) {
  const { generation } = useSession()
  return useQuery({
    queryKey: [...listsKey(generation), 'inbox', params],
    queryFn: ({ signal }) => supportGetSupportInbox(params, { signal }),
    enabled,
  })
}

export function useOpenSupportCaseCount({ enabled = true }: { enabled?: boolean } = {}) {
  const { data } = useSupportInbox(undefined, enabled)
  return data && countOpenSupportCases(data)
}

export function useMySupportCases() {
  const { generation } = useSession()
  return useQuery({
    queryKey: [...listsKey(generation), 'mine'],
    queryFn: ({ signal }) => supportGetMySupportCases({ signal }),
  })
}

export function useSupportCase(id: number, enabled: boolean) {
  const { generation } = useSession()
  return useQuery({
    queryKey: detailKey(generation, id),
    queryFn: ({ signal }) => supportGetSupportCase(id, { signal }),
    enabled,
    refetchInterval: SUPPORT_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: 'always',
  })
}

export function useOpenSupportCase() {
  const client = useQueryClient()
  const { generation } = useSession()
  return useMutation({
    mutationFn: (data: SupportCaseCreate) => supportOpenSupportCase(data),
    onSuccess: () => client.invalidateQueries({ queryKey: listsKey(generation) }),
    networkMode: 'always',
  })
}

export function useSupportCaseActions(id: number) {
  const client = useQueryClient()
  const { generation } = useSession()

  function refresh() {
    return Promise.all([
      client.invalidateQueries({ queryKey: listsKey(generation) }),
      client.invalidateQueries({ queryKey: detailKey(generation, id) }),
    ])
  }

  const send = useMutation({
    mutationFn: (body: string) => supportAddSupportMessage(id, { body }),
    onSuccess: refresh,
    networkMode: 'always',
  })
  const status = useMutation({
    mutationFn: (status: SupportStatusUpdateStatus) => supportChangeSupportStatus(id, { status }),
    onSuccess: refresh,
    networkMode: 'always',
  })
  const assignee = useMutation({
    mutationFn: (userId: number | null) => supportAssignSupportCase(id, { user_id: userId }),
    onSuccess: refresh,
    networkMode: 'always',
  })
  return { send, status, assignee }
}

export function useSupportEventLabel(id: number) {
  return useQuery({
    queryKey: getEventsGetEventQueryKey(id),
    queryFn: ({ signal }) => eventsGetEvent(id, { signal }),
    staleTime: LOOKUP_STALE_MS,
    retry: false,
  })
}

export function useSupportUserEmail(id: number, enabled: boolean) {
  const { generation } = useSession()
  return useQuery({
    queryKey: ['support-user-email', generation, id],
    queryFn: async ({ signal }) => {
      const users = await adminSearchUsers({ q: String(id) }, { signal })
      return users.items.find((user) => user.id === id)?.email ?? null
    },
    enabled,
    staleTime: LOOKUP_STALE_MS,
    retry: false,
  })
}
