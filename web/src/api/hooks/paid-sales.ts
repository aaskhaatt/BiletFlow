// Paid-sales activation of an event. Components import these, not the generated hooks.
import { useQueries } from '@tanstack/react-query'
import {
  getPaidSalesGetPaidSalesStatusQueryKey,
  paidSalesGetPaidSalesStatus,
  usePaidSalesGetPaidSalesStatus,
} from '@/api/generated/endpoints/paid-sales/paid-sales'
import type { ActivationChecklist } from '@/api/generated/model'

/** GET /events/{id}/paid-sales: the status and the five-step checklist. */
export function usePaidSales(eventId: number, { enabled = true }: { enabled?: boolean } = {}) {
  return usePaidSalesGetPaidSalesStatus(eventId, { query: { enabled } })
}

/** The same call for several events at once (the banner on the events list). Shares the cache with usePaidSales. */
export function usePaidSalesOfEvents(eventIds: number[]) {
  return useQueries({
    queries: eventIds.map((eventId) => ({
      queryKey: getPaidSalesGetPaidSalesStatusQueryKey(eventId),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        paidSalesGetPaidSalesStatus(eventId, { signal }),
    })),
  })
}

export const CHECKLIST_STEPS: readonly (keyof ActivationChecklist)[] = [
  'has_paid_ticket_type',
  'identity_verified',
  'fee_paid',
  'payout_account_connected',
  'terms_accepted',
]

/** How many of the five steps are done. */
export function doneChecklistSteps(checklist: ActivationChecklist): number {
  return CHECKLIST_STEPS.filter((step) => checklist[step]).length
}
