// How the organizer's pages write an event's dates and money. Times are always
// Astana time (UTC+5), whatever the viewer's own time zone (see event-time.ts).
import i18n from '@/i18n'
import { FALLBACK_LANGUAGE, isLanguage, type Language } from '@/i18n/language'
import { EVENT_TIME_ZONE, formatKZT } from '@/lib/format'

const LOCALES: Record<Language, string> = { kk: 'kk-KZ', ru: 'ru-RU', en: 'en-GB' }

function locale(): string {
  const language = isLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : FALLBACK_LANGUAGE
  return LOCALES[language]
}

const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1)

function part(iso: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale(), { timeZone: EVENT_TIME_ZONE, ...options }).format(
    new Date(iso),
  )
}

/** The calendar day in Astana, for comparing two moments: "2026-10-24". */
function astanaDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: EVENT_TIME_ZONE }).format(new Date(iso))
}

/** "19:00" */
export function formatClock(iso: string): string {
  return part(iso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
}

/** "24 окт, 19:00": a row of a table. */
export function formatDateShort(iso: string): string {
  return `${part(iso, { day: 'numeric', month: 'short' }).replace('.', '')}, ${formatClock(iso)}`
}

/** "Сб, 24 октября": the day of an event. */
export function formatDay(iso: string): string {
  return capitalize(part(iso, { weekday: 'short', day: 'numeric', month: 'long' }))
}

/**
 * When an event happens, in Astana time. One day: "Сб, 24 октября · 19:00–22:00
 * (UTC+5)". Over midnight: "24 окт, 19:00 — 25 окт, 02:00 (UTC+5)".
 */
export function formatEventSpan(startIso: string, endIso: string): string {
  const zone = '(UTC+5)'
  if (astanaDay(startIso) === astanaDay(endIso)) {
    return `${formatDay(startIso)} · ${formatClock(startIso)}–${formatClock(endIso)} ${zone}`
  }
  return `${formatDateShort(startIso)} — ${formatDateShort(endIso)} ${zone}`
}

/** "15.11, 21:40": the time of a row of the history. */
export function formatLogTime(iso: string): string {
  return `${part(iso, { day: '2-digit', month: '2-digit' })}, ${formatClock(iso)}`
}

/** "12 сентября 2026 г." style date with the time: "20 октября в 15:10 (UTC+5)". */
export function formatMoment(iso: string): string {
  const day = part(iso, { day: 'numeric', month: 'long' })
  return i18n.t('time.atMoment', { day, time: formatClock(iso) })
}

/** Money earned: 0 is "0 ₸" (formatKZT writes "Бесплатно" for 0, which is for prices). */
export function formatRevenue(amount: number): string {
  return amount === 0 ? '0\u00a0₸' : formatKZT(amount)
}
