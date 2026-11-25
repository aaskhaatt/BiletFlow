import { describe, expect, it } from 'vitest'
import { formatEventDay, formatEventTime, formatKZT } from '@/lib/format'

const NBSP = ' '

describe('formatKZT', () => {
  it('shows 0 as "free" in each language', () => {
    expect(formatKZT(0, 'ru')).toBe('Бесплатно')
    expect(formatKZT(0, 'kk')).toBe('Тегін')
    expect(formatKZT(0, 'en')).toBe('Free')
  })

  it('groups thousands and adds the tenge sign', () => {
    expect(formatKZT(5000, 'ru')).toBe(`5${NBSP}000${NBSP}₸`)
    expect(formatKZT(1_250_000, 'kk')).toBe(`1${NBSP}250${NBSP}000${NBSP}₸`)
    expect(formatKZT(1_250_000, 'en')).toBe(`1,250,000${NBSP}₸`)
  })

  it('keeps small prices whole', () => {
    expect(formatKZT(500, 'ru')).toBe(`500${NBSP}₸`)
  })
})

describe('formatEventTime', () => {
  it('shows Astana time (UTC+5), not the viewer’s zone', () => {
    // 19:00 in Astana, sent by the API with its offset
    expect(formatEventTime('2026-12-01T19:00:00+05:00', { language: 'ru' })).toBe(
      '1 декабря 2026 г. в 19:00',
    )
  })

  it('moves to the next day when UTC is still on the day before midnight', () => {
    // 19:30 UTC on 30 November is 00:30 on 1 December in Astana
    expect(formatEventTime('2026-11-30T19:30:00Z', { language: 'ru' })).toBe(
      '1 декабря 2026 г. в 00:30',
    )
    expect(formatEventTime('2026-11-30T19:30:00Z', { language: 'en' })).toBe(
      '1 December 2026 at 00:30',
    )
    expect(formatEventTime('2026-11-30T19:30:00Z', { language: 'kk' })).toContain('1 желтоқсан')
  })

  it('can add the zone label', () => {
    expect(formatEventTime('2026-11-30T19:30:00Z', { language: 'ru', withZone: true })).toBe(
      '1 декабря 2026 г. в 00:30 · Время Астаны (UTC+5)',
    )
    expect(formatEventTime('2026-11-30T19:30:00Z', { language: 'kk', withZone: true })).toMatch(
      /00:30 · Астана уақыты \(UTC\+5\)$/,
    )
  })
})

describe('formatEventDay', () => {
  it('names the day in each language, without the year', () => {
    expect(formatEventDay('2026-10-20T12:00:00+05:00', 'ru')).toBe('20 октября')
    expect(formatEventDay('2026-10-20T12:00:00+05:00', 'kk')).toBe('20 қазан')
    expect(formatEventDay('2026-10-20T12:00:00+05:00', 'en')).toBe('20 October')
  })

  it('uses the day in Astana, not in UTC', () => {
    // 22:30 UTC on 19 October is 03:30 on 20 October in Astana
    expect(formatEventDay('2026-10-19T22:30:00Z', 'ru')).toBe('20 октября')
  })
})
