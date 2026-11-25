import { afterEach, describe, expect, it, vi } from 'vitest'
import { fromEventLocalInput, toEventLocalInput } from '@/lib/event-time'

// TZ is the browser's own time zone in these tests
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('fromEventLocalInput: what the form sends', () => {
  it('reads the field as Astana time and adds the offset', () => {
    expect(fromEventLocalInput('2026-10-24T19:00')).toBe('2026-10-24T19:00:00+05:00')
    expect(fromEventLocalInput('2026-10-24T19:00:30')).toBe('2026-10-24T19:00:30+05:00')
  })

  it('means the right moment: 19:00 in Astana is 14:00 UTC', () => {
    expect(Date.parse(fromEventLocalInput('2026-10-24T19:00')!)).toBe(Date.UTC(2026, 9, 24, 14, 0))
  })

  it('gives nothing, rather than a time without an offset, for an empty or incomplete field', () => {
    expect(fromEventLocalInput('')).toBeNull()
    expect(fromEventLocalInput('2026-10-24')).toBeNull()
    expect(fromEventLocalInput('2026-10-24T19')).toBeNull()
    expect(fromEventLocalInput('24.10.2026, 19:00')).toBeNull()
  })
})

describe('toEventLocalInput: what the field shows', () => {
  it('shows a moment from the API in Astana time, whatever offset it came with', () => {
    expect(toEventLocalInput('2026-10-24T14:00:00Z')).toBe('2026-10-24T19:00')
    expect(toEventLocalInput('2026-10-24T19:00:00+05:00')).toBe('2026-10-24T19:00')
    expect(toEventLocalInput('2026-10-24T20:00:00+06:00')).toBe('2026-10-24T19:00')
  })

  it('moves to the next day after midnight in Astana', () => {
    expect(toEventLocalInput('2026-11-30T19:30:00Z')).toBe('2026-12-01T00:30')
  })

  it('shows an empty field for no value', () => {
    expect(toEventLocalInput(null)).toBe('')
    expect(toEventLocalInput('')).toBe('')
    expect(toEventLocalInput('not a date')).toBe('')
  })

  it('round-trips: what is shown is sent back unchanged', () => {
    const sent = fromEventLocalInput(toEventLocalInput('2026-10-24T14:00:00Z'))
    expect(sent).toBe('2026-10-24T19:00:00+05:00')
  })
})

describe('the organizer’s own time zone', () => {
  it.each(['America/New_York', 'Europe/Moscow', 'Asia/Tokyo', 'UTC'])(
    'changes nothing in %s',
    (zone) => {
      vi.stubEnv('TZ', zone)

      expect(toEventLocalInput('2026-10-24T14:00:00Z')).toBe('2026-10-24T19:00')
      expect(fromEventLocalInput('2026-10-24T19:00')).toBe('2026-10-24T19:00:00+05:00')
    },
  )

  it('really runs in another zone in the test above', () => {
    vi.stubEnv('TZ', 'America/New_York')
    const newYork = new Date(2026, 9, 24).getTimezoneOffset()
    vi.stubEnv('TZ', 'Asia/Tokyo')
    const tokyo = new Date(2026, 9, 24).getTimezoneOffset()

    expect(newYork).not.toBe(tokyo)
  })
})
