import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { errorCodeOf } from '@/api/error-codes'
import {
  adminGetPlatformSettings,
  adminListPaidSalesActivations,
  adminReinstatePaidSales,
  adminRejectOrganizer,
  adminReviewEventReport,
  adminSearchEvents,
  adminSearchPayments,
  adminSearchUsers,
  adminSetActivationFee,
  adminSuspendEvent,
  adminSuspendPaidSales,
  adminSuspendUser,
  adminUnsuspendEvent,
  adminUnsuspendUser,
  adminSearchEventReports,
} from '@/api/generated/endpoints/admin/admin'
import { organizersApproveOrganizer } from '@/api/generated/endpoints/organizers/organizers'
import type {
  AdminCampaignRow,
  AdminOrderRow,
  AdminOrganizerRow,
  AdminPaymentRow,
  AdminRefundRow,
  AdminUserResponse,
  EventReportReview,
  EventResponse,
} from '@/api/generated/model'
import { apiFetch } from '@/api/http'
import { invalidateEventQueries } from '@/api/hooks/organizer-events'
import { useSession } from '@/auth/session-store'

export type AdminListRows = {
  users: AdminUserResponse
  events: EventResponse
  orders: AdminOrderRow
  payments: AdminPaymentRow
  refunds: AdminRefundRow
  campaigns: AdminCampaignRow
  organizers: AdminOrganizerRow
}
export type AdminListName = keyof AdminListRows

type Page<Row> = { items: Row[]; total: number }
type Read<T> = (signal: AbortSignal) => Promise<T>

export function adminListUrl(list: AdminListName, params: URLSearchParams) {
  const query = params.toString()
  return query ? `/admin/${list}?${query}` : `/admin/${list}`
}

function useAdminQuery<T>(resource: string, key: unknown, read: Read<T>, enabled = true) {
  const { generation, status } = useSession()
  return useQuery({
    queryKey: ['admin', resource, generation, key],
    queryFn: ({ signal }) => read(signal),
    enabled: status === 'authenticated' && enabled,
  })
}

export function useAdminList<Name extends AdminListName>(list: Name, params: URLSearchParams) {
  return useAdminQuery(list, params.toString(), (signal) =>
    apiFetch<Page<AdminListRows[Name]>>(adminListUrl(list, params), { signal }),
  )
}

type ReportStatus = 'open' | 'dismissed' | 'actioned'

export function useReportCount(status: ReportStatus) {
  return useAdminQuery(
    'event-reports',
    { status, limit: 1 },
    async (signal) => (await adminSearchEventReports({ status, limit: 1 }, { signal })).total,
  )
}

export const REPORT_PAGE_SIZE = 50

export function useAdminReports(reviewed: boolean, page: number) {
  return useAdminQuery('event-reports', { reviewed, page }, async (signal) => {
    const offset = (page - 1) * REPORT_PAGE_SIZE
    if (!reviewed) {
      return adminSearchEventReports(
        { status: 'open', limit: REPORT_PAGE_SIZE, offset },
        { signal },
      )
    }

    // Merge the two source lists before slicing the requested page. Read only
    // the prefix that can contribute to the page, using the API's maximum batch.
    const take = offset + REPORT_PAGE_SIZE
    async function prefix(status: 'dismissed' | 'actioned') {
      const items = []
      for (;;) {
        const result = await adminSearchEventReports(
          { status, limit: Math.min(200, take - items.length), offset: items.length },
          { signal },
        )
        items.push(...result.items)
        if (!result.items.length || items.length >= Math.min(take, result.total)) {
          return { items, total: result.total }
        }
      }
    }
    const [dismissed, actioned] = await Promise.all([prefix('dismissed'), prefix('actioned')])
    const items = [...dismissed.items, ...actioned.items].sort((a, b) => b.id - a.id)
    return { items: items.slice(offset, take), total: dismissed.total + actioned.total }
  })
}

export function useAdminPaidSales() {
  // The API returns an array without pagination. All three counts come from it.
  return useAdminQuery('paid-sales', 'all', (signal) =>
    adminListPaidSalesActivations(undefined, { signal }),
  )
}

export function useFailedPaymentCount() {
  return useAdminQuery(
    'payments',
    'failed-count',
    async (signal) => (await adminSearchPayments({ status: 'failed', limit: 1 }, { signal })).total,
  )
}

export function useAdminEvent(id: number, enabled = true) {
  return useAdminQuery(
    'events',
    { id },
    async (signal) => {
      // Search also matches the title and venue. Find the exact id, even if
      // newer matches occupy the first page.
      for (let offset = 0; ; offset += 200) {
        const { items, total } = await adminSearchEvents(
          { q: String(id), limit: 200, offset },
          { signal },
        )
        const event = items.find((item) => item.id === id)
        if (event) return event
        if (!items.length || offset + items.length >= total) return null
      }
    },
    enabled && Number.isSafeInteger(id) && id > 0,
  )
}

export function useAdminUser(id: number) {
  return useAdminQuery(
    'users',
    { id },
    async (signal) => {
      for (let offset = 0; ; offset += 200) {
        const { items, total } = await adminSearchUsers(
          { q: String(id), limit: 200, offset },
          { signal },
        )
        const user = items.find((item) => item.id === id)
        if (user) return user
        if (!items.length || offset + items.length >= total) return null
      }
    },
    id > 0,
  )
}

export function useAdminSettings() {
  return useAdminQuery('settings', null, (signal) => adminGetPlatformSettings({ signal }))
}

function refreshAdmin(client: QueryClient, ...resources: string[]) {
  return Promise.all(
    resources.map((resource) => client.invalidateQueries({ queryKey: ['admin', resource] })),
  )
}

function refreshPaidSales(client: QueryClient, eventId?: number) {
  return client.invalidateQueries({
    predicate: ({ queryKey }) =>
      typeof queryKey[0] === 'string' &&
      (eventId === undefined
        ? /^\/events\/\d+\/paid-sales$/.test(queryKey[0])
        : queryKey[0] === `/events/${eventId}/paid-sales`),
  })
}

export type AdminAction =
  | { type: 'review'; id: number; data: EventReportReview }
  | {
      type: 'suspendEvent' | 'suspendUser' | 'suspendPaidSales' | 'rejectOrganizer'
      id: number
      reason: string
    }
  | {
      type: 'unsuspendEvent' | 'unsuspendUser' | 'reinstatePaidSales' | 'approveOrganizer'
      id: number
    }

async function runAdminAction(action: AdminAction) {
  switch (action.type) {
    case 'review':
      await adminReviewEventReport(action.id, action.data)
      return
    case 'suspendEvent':
      await adminSuspendEvent(action.id, { reason: action.reason })
      return
    case 'unsuspendEvent':
      await adminUnsuspendEvent(action.id)
      return
    case 'suspendUser':
      await adminSuspendUser(action.id, { reason: action.reason })
      return
    case 'unsuspendUser':
      await adminUnsuspendUser(action.id)
      return
    case 'suspendPaidSales':
      await adminSuspendPaidSales(action.id, { reason: action.reason })
      return
    case 'reinstatePaidSales':
      await adminReinstatePaidSales(action.id)
      return
    case 'approveOrganizer':
      await organizersApproveOrganizer(action.id)
      return
    case 'rejectOrganizer':
      await adminRejectOrganizer(action.id, { reason: action.reason })
  }
}

export function useAdminAction() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: runAdminAction,
    onSuccess: async (_data, action) => {
      switch (action.type) {
        case 'review':
          await refreshAdmin(client, 'event-reports')
          break
        case 'suspendEvent':
        case 'unsuspendEvent':
          await Promise.all([
            refreshAdmin(client, 'events', 'event-reports'),
            invalidateEventQueries(client),
          ])
          break
        case 'suspendUser':
        case 'unsuspendUser':
          await refreshAdmin(client, 'users')
          break
        case 'suspendPaidSales':
        case 'reinstatePaidSales':
          await Promise.all([
            refreshAdmin(client, 'paid-sales'),
            refreshPaidSales(client, action.id),
          ])
          break
        case 'approveOrganizer':
        case 'rejectOrganizer':
          await refreshAdmin(client, 'organizers')
          break
      }
    },
    onError: (error) => {
      if (errorCodeOf(error) === 'InvalidOrganizerStatusError') {
        return refreshAdmin(client, 'organizers')
      }
    },
  })
}

export function useSaveActivationFee() {
  const client = useQueryClient()
  const { generation } = useSession()
  return useMutation({
    mutationFn: (amount: number) => adminSetActivationFee({ amount_kzt: amount }),
    onSuccess: async (settings) => {
      client.setQueryData(['admin', 'settings', generation, null], settings)
      await refreshPaidSales(client)
    },
  })
}
