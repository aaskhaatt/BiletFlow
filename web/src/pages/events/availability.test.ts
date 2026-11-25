import { describe, expect, it } from 'vitest'
import type { EventResponse, TicketTypeResponse } from '@/api/generated/model'
import { catalogAvailability, eventRegistration, ticketLimit } from '@/pages/events/availability'

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
const ticket: TicketTypeResponse = {
  id: 2,
  event_id: event.id,
  name: 'Standard',
  quantity: 10,
  sold_count: 7,
  price: 4000,
  sales_start: open,
  sales_end: close,
  is_hidden: false,
  max_per_order: 5,
}

describe('registration and ticket availability', () => {
  it('falls back to the event end and honors event registration dates', () => {
    expect(eventRegistration(event, now)).toBe('open')
    expect(eventRegistration(event, Date.parse(close) + 1)).toBe('closed')
    expect(eventRegistration({ ...event, registration_opens_at: close }, now)).toBe('upcoming')
    expect(eventRegistration({ ...event, registration_closes_at: open }, now)).toBe('closed')
  })

  it('caps counts by stock and per-order limits and closes unavailable ticket types', () => {
    expect(ticketLimit(ticket, now)).toBe(3)
    expect(ticketLimit({ ...ticket, max_per_order: 2 }, now)).toBe(2)
    expect(ticketLimit({ ...ticket, is_hidden: true }, now)).toBe(0)
    expect(ticketLimit({ ...ticket, sold_count: ticket.quantity }, now)).toBe(0)
    expect(ticketLimit(ticket, Date.parse(open) - 1)).toBe(0)
    expect(ticketLimit(ticket, Date.parse(close) + 1)).toBe(0)
  })

  it('calculates the catalog price and low stock from ticket types currently on sale', () => {
    const types = [ticket, { ...ticket, id: 3, price: 0, sales_start: close }]
    expect(catalogAvailability(event, types, now)).toEqual({
      price: 4000,
      lowStock: true,
      freeOnly: false,
    })
    expect(catalogAvailability(event, [...types, { ...ticket, price: 0 }], now)).toEqual({
      price: 0,
      lowStock: false,
      freeOnly: false,
    })
    expect(catalogAvailability(event, [{ ...ticket, price: 0 }], now).freeOnly).toBe(true)
    expect(catalogAvailability(event, [], now)).toEqual({
      price: null,
      lowStock: false,
      freeOnly: false,
    })
  })
})
