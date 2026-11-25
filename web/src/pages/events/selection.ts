import type { TicketTypeWithAvailability } from '@/api/generated/model'
import { ticketLimit } from '@/pages/events/availability'

export type Selection = Record<number, number>
type DraftItem = { ticket_type_id: number; quantity: number }

export type CheckoutDraft = {
  items: DraftItem[]
  promo_code: string | null
  campaign: string
}

const key = (eventId: number) => `biletflow.checkout.${eventId}`
const fallback = new Map<number, CheckoutDraft>()

/** The draft belongs to this tab and survives sign-in, navigation and a reload. */
export function readCheckoutDraft(eventId: number): CheckoutDraft | undefined {
  try {
    const raw = sessionStorage.getItem(key(eventId))
    if (!raw) return fallback.get(eventId)
    const draft = JSON.parse(raw) as CheckoutDraft | null
    if (!draft || !Array.isArray(draft.items)) return
    return {
      items: draft.items.filter(
        (item) =>
          item &&
          Number.isSafeInteger(item.ticket_type_id) &&
          item.ticket_type_id > 0 &&
          Number.isSafeInteger(item.quantity) &&
          item.quantity > 0,
      ),
      promo_code: typeof draft.promo_code === 'string' ? draft.promo_code : null,
      campaign: typeof draft.campaign === 'string' ? draft.campaign : '',
    }
  } catch {
    return fallback.get(eventId)
  }
}

export function saveCheckoutDraft(eventId: number, draft: CheckoutDraft) {
  fallback.set(eventId, draft)
  try {
    sessionStorage.setItem(key(eventId), JSON.stringify(draft))
  } catch {
    // The in-memory draft still survives navigation in this tab.
  }
}

export function selectedQuantities(draft: CheckoutDraft | undefined): Selection {
  return Object.fromEntries(
    draft?.items.map(({ ticket_type_id, quantity }) => [ticket_type_id, quantity]) ?? [],
  )
}

export function summarizeTickets(tickets: TicketTypeWithAvailability[], selection: Selection) {
  const items: DraftItem[] = []
  let count = 0
  let subtotal = 0

  for (const ticket of tickets) {
    const quantity = Math.min(selection[ticket.id] ?? 0, ticketLimit(ticket))
    if (quantity <= 0) continue
    items.push({ ticket_type_id: ticket.id, quantity })
    count += quantity
    subtotal += quantity * ticket.price
  }
  return { items, count, subtotal }
}
