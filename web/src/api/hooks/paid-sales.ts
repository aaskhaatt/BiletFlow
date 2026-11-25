// Paid-sales activation of an event. Components import these, not the generated hooks.
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorCodeOf } from '@/api/error-codes'
import {
  getPaidSalesGetPaidSalesStatusQueryKey,
  paidSalesAcceptPaidSalesTerms,
  paidSalesActivatePaidSales,
  paidSalesGetPaidSalesStatus,
  paidSalesPayActivationFee,
} from '@/api/generated/endpoints/paid-sales/paid-sales'
import type {
  ActivationChecklist,
  PaidSalesStatusResponse,
  PayFeeRequest,
} from '@/api/generated/model'
import { invalidateEventQueries } from '@/api/hooks/organizer-events'
import { useSession } from '@/auth/session-store'

const paidSalesKey = (eventId: number, generation: number) =>
  [...getPaidSalesGetPaidSalesStatusQueryKey(eventId), generation] as const

/** GET /events/{id}/paid-sales: the status and the five-step checklist. */
export function usePaidSales(eventId: number, { enabled = true }: { enabled?: boolean } = {}) {
  const { generation, status } = useSession()
  return useQuery({
    queryKey: paidSalesKey(eventId, generation),
    queryFn: ({ signal }) => paidSalesGetPaidSalesStatus(eventId, { signal }),
    enabled: enabled && status === 'authenticated',
  })
}

/** The same call for several events at once (the banner on the events list). Shares the cache with usePaidSales. */
export function usePaidSalesOfEvents(eventIds: number[]) {
  const { generation, status } = useSession()
  return useQueries({
    queries: eventIds.map((eventId) => ({
      queryKey: paidSalesKey(eventId, generation),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        paidSalesGetPaidSalesStatus(eventId, { signal }),
      enabled: status === 'authenticated',
    })),
  })
}

export function usePaidSalesActions(eventId: number) {
  const { generation } = useSession()
  const client = useQueryClient()
  const queryKey = paidSalesKey(eventId, generation)
  const refresh = () => client.invalidateQueries({ queryKey, exact: true })
  async function setStatus(status: PaidSalesStatusResponse) {
    await client.cancelQueries({ queryKey, exact: true })
    client.setQueryData(queryKey, status)
  }

  const acceptTerms = useMutation({
    mutationFn: () => paidSalesAcceptPaidSalesTerms(eventId),
    networkMode: 'always',
    onSuccess: setStatus,
  })
  const payFee = useMutation({
    mutationFn: (data: PayFeeRequest) => paidSalesPayActivationFee(eventId, data),
    networkMode: 'always',
    onSuccess: refresh,
    onError: (error) =>
      errorCodeOf(error) === 'ActivationFeeAlreadyPaidError' ? refresh() : undefined,
  })
  const activate = useMutation({
    mutationFn: () => paidSalesActivatePaidSales(eventId),
    networkMode: 'always',
    onSuccess: async (status) => {
      await setStatus(status)
      void invalidateEventQueries(client)
    },
    onError: (error) => {
      const code = errorCodeOf(error)
      if (code === 'InvalidActivationStatusError' || code === 'ActivationRequirementsNotMetError') {
        return refresh()
      }
    },
  })

  return { acceptTerms, payFee, activate }
}

export const CHECKLIST_STEPS: readonly (keyof ActivationChecklist)[] = [
  'has_paid_ticket_type',
  'identity_verified',
  'payout_account_connected',
  'terms_accepted',
  'fee_paid',
]

/** How many of the five steps are done. */
export function doneChecklistSteps(checklist: ActivationChecklist): number {
  return CHECKLIST_STEPS.filter((step) => checklist[step]).length
}
