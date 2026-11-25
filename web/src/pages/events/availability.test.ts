import { describe, expect, it } from 'vitest'
import type { EventResponse } from '@/api/generated/model'
import { eventRegistration, ticketLimit } from '@/pages/events/availability'
import { ticketType } from '@/test/fixtures'

const open = '2030-01-01T00:00:00Z'
const close = '2030-01-02T00:00:00Z'
const now = Date.parse('2030-01-01T12:00:00Z')
const event: EventResponse = {
  id: 1,
  organizer_id: 1,
  title: 'Event',
  description: null,
  start_time: open,
  end_time: close,
  status: 'published',
  visibility: 'public',
  lifecycle: 'active',
}
describe('registration and ticket availability', () => {
  it('falls back to the event end and honors event registration dates', () => {
    expect(eventRegistration(event, now)).toBe('open')
    expect(eventRegistration(event, Date.parse(close) + 1)).toBe('closed')
    expect(eventRegistration({ ...event, registration_opens_at: close }, now)).toBe('upcoming')
    expect(eventRegistration({ ...event, registration_closes_at: open }, now)).toBe('closed')
  })

  it('uses the API availability and per-order limit even when the ticket has more unsold stock', () => {
    const ticket = ticketType({ available: 3, max_now: 2 })
    expect(ticketLimit(ticket)).toBe(2)
    expect(ticketLimit({ ...ticket, available: 1 })).toBe(1)
    expect(ticketLimit({ ...ticket, available: 0 })).toBe(0)
    expect(ticketLimit({ ...ticket, max_now: 0 })).toBe(0)
    expect(ticketLimit({ ...ticket, on_sale: false })).toBe(0)
    expect(ticketLimit({ ...ticket, is_hidden: true })).toBe(0)
  })
})
