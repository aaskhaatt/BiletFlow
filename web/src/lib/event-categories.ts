import i18n from '@/i18n'
import { type Language } from '@/i18n/language'

/**
 * The categories an organizer can pick. The value is what the API stores and
 * filters by, always in English; the name for the screen is translated
 * (texts under `categories` in the locale files).
 */
export const EVENT_CATEGORIES = [
  'Music',
  'Technology',
  'Festival',
  'Sport',
  'Lecture',
  'Art',
  'Theatre',
  'Business',
  'Education',
  'Family',
  'Food',
  'Other',
] as const

export type EventCategory = (typeof EVENT_CATEGORIES)[number]

/** The listed category a stored value stands for (the API compares without case), or undefined. */
export function knownCategory(category: string | null | undefined): EventCategory | undefined {
  const wanted = category?.trim().toLowerCase()
  return wanted ? EVENT_CATEGORIES.find((known) => known.toLowerCase() === wanted) : undefined
}

/**
 * The name of a category to show: translated when it is on the list, the stored
 * text as it is when it isn't (an older or foreign value), empty for none.
 */
export function categoryLabel(
  category: string | null | undefined,
  language: Language = i18n.language as Language,
): string {
  const known = knownCategory(category)
  if (known) return i18n.t(`categories.${known}`, { lng: language })
  return category?.trim() ?? ''
}

/** The list for a select: value to send, name to show. */
export function categoryOptions(): { value: EventCategory; label: string }[] {
  return EVENT_CATEGORIES.map((value) => ({ value, label: categoryLabel(value) }))
}
