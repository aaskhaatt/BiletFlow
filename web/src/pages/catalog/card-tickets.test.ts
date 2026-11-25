import { describe, expect, it } from 'vitest'
import { cardTickets, LOW_STOCK_LIMIT } from '@/pages/catalog/card-tickets'

describe('cardTickets', () => {
  it('shows the lowest price, and "free" for 0', () => {
    expect(cardTickets({ min_price: 4000, tickets_remaining: 100 })).toEqual({
      price: 4000,
      free: false,
      lowStock: false,
    })
    expect(cardTickets({ min_price: 0, tickets_remaining: 100 })).toEqual({
      price: 0,
      free: true,
      lowStock: false,
    })
  })

  it('shows no price without ticket types', () => {
    expect(cardTickets({ min_price: null, tickets_remaining: null })).toEqual({
      price: null,
      free: false,
      lowStock: false,
    })
    // fields missing from an older answer behave the same
    expect(cardTickets({})).toEqual({ price: null, free: false, lowStock: false })
  })

  it('warns from 1 up to the limit of tickets left, not at 0 or above it', () => {
    const lowStock = (tickets_remaining: number | null) =>
      cardTickets({ min_price: 5000, tickets_remaining }).lowStock
    expect(LOW_STOCK_LIMIT).toBe(5)
    expect(lowStock(1)).toBe(true)
    expect(lowStock(LOW_STOCK_LIMIT)).toBe(true)
    expect(lowStock(LOW_STOCK_LIMIT + 1)).toBe(false)
    expect(lowStock(0)).toBe(false)
    expect(lowStock(null)).toBe(false)
  })
})
