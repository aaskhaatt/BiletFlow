// Our names for the support calls. Components import these, never the generated
// hooks (see events.ts for why).
import { useSupportGetSupportInbox } from '@/api/generated/endpoints/support/support'
import type { SupportCaseSummary, SupportGetSupportInboxParams } from '@/api/generated/model'

/**
 * The statuses of a case that still waits for its handler: new ("open") and
 * taken into work ("in_progress"). "waiting_for_customer" waits for the other
 * side and "resolved" is done, so neither counts.
 */
const OPEN_STATUSES: ReadonlySet<string> = new Set(['open', 'in_progress'])

export function isOpenSupportCase(supportCase: SupportCaseSummary) {
  return OPEN_STATUSES.has(supportCase.status)
}

export function countOpenSupportCases(cases: SupportCaseSummary[]) {
  return cases.filter(isOpenSupportCase).length
}

/**
 * GET /support/cases/inbox: the cases the signed-in organizer handles (an admin
 * gets all of them), without their messages. The answer is a plain list, not paged.
 */
export function useSupportInbox(params?: SupportGetSupportInboxParams) {
  return useSupportGetSupportInbox(params)
}

/**
 * How many cases wait for the organizer: the number on "Поддержка" in the
 * sidebar. undefined until the inbox has loaded (and when it can't be read), so
 * the sidebar then shows no number instead of a wrong one. Shares the inbox
 * request with useSupportInbox().
 */
export function useOpenSupportCaseCount({ enabled = true }: { enabled?: boolean } = {}) {
  const { data } = useSupportGetSupportInbox(undefined, {
    query: { enabled, select: countOpenSupportCases },
  })
  return data
}
