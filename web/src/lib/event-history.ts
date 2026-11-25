/** The kinds of entry in an event's history: the part of the action before the dot. */
export const HISTORY_TYPES = [
  'event',
  'ticket_type',
  'order',
  'ticket',
  'campaign',
  'staff',
  'paid_sales',
] as const

export type HistoryType = (typeof HISTORY_TYPES)[number]

export function isHistoryType(value: string): value is HistoryType {
  return (HISTORY_TYPES as readonly string[]).includes(value)
}
