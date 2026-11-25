import i18n from '@/i18n'
import { FALLBACK_LANGUAGE, isLanguage, type Language } from '@/i18n/language'

/** Events happen in Kazakhstan: their times are always shown in Astana time (UTC+5). */
export const EVENT_TIME_ZONE = 'Asia/Almaty'

const LOCALES: Record<Language, string> = { kk: 'kk-KZ', ru: 'ru-RU', en: 'en-GB' }

// A no-break space keeps "5 000" and "₸" on one line
const NBSP = ' '

function currentLanguage(): Language {
  return isLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : FALLBACK_LANGUAGE
}

/**
 * Money is a whole number of KZT: 5000 → "5 000 ₸" (ru, kk) or "5,000 ₸" (en);
 * 0 → "Бесплатно" / "Тегін" / "Free".
 */
export function formatKZT(amount: number, language: Language = currentLanguage()): string {
  if (amount === 0) return i18n.t('money.free', { lng: language })
  const number = new Intl.NumberFormat(LOCALES[language], { maximumFractionDigits: 0 }).format(
    amount,
  )
  return `${number}${NBSP}₸`
}

/** "Время Астаны (UTC+5)" in the given language. */
export function eventTimeZoneLabel(language: Language = currentLanguage()): string {
  return i18n.t('time.astanaZone', { lng: language })
}

/**
 * Date and time of an event in Astana time, whatever the viewer's own time zone:
 * "2026-11-30T19:30:00Z" → "1 декабря 2026 г. в 00:30".
 * With `withZone`, the zone label follows: "… · Время Астаны (UTC+5)".
 */
export function formatEventTime(
  iso: string,
  options: { language?: Language; withZone?: boolean; compact?: boolean } = {},
): string {
  const language = options.language ?? currentLanguage()
  const text = new Intl.DateTimeFormat(LOCALES[language], {
    timeZone: EVENT_TIME_ZONE,
    weekday: options.compact ? 'short' : undefined,
    day: 'numeric',
    month: 'long',
    year: options.compact ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
  return options.withZone ? `${text} · ${eventTimeZoneLabel(language)}` : text
}

/**
 * A calendar day in Astana time, without the year: "2026-10-20T12:00:00+05:00" →
 * "20 октября" (ru), "20 қазан" (kk), "20 October" (en).
 */
export function formatEventDay(iso: string, language: Language = currentLanguage()): string {
  return new Intl.DateTimeFormat(LOCALES[language], {
    timeZone: EVENT_TIME_ZONE,
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso))
}

export function formatEventTimeRange(start: string, end: string): string {
  return new Intl.DateTimeFormat(LOCALES[currentLanguage()], {
    timeZone: EVENT_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).formatRange(new Date(start), new Date(end))
}
