// Which language to show (DECISIONS.md, T7): the user's saved choice, otherwise the
// browser's language if we have it, otherwise Russian.

export const LANGUAGES = ['kk', 'ru', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

export const FALLBACK_LANGUAGE: Language = 'ru'

/** Each language's name in itself, for the switcher. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  kk: 'Қазақша',
  ru: 'Русский',
  en: 'English',
}

const STORAGE_KEY = 'biletflow.language'

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

/** "kk-KZ" → "kk"; null when we don't have the language. */
export function matchLanguage(tag: string | null | undefined): Language | null {
  const primary = tag?.toLowerCase().split(/[-_]/)[0]
  return isLanguage(primary) ? primary : null
}

export function detectBrowserLanguage(tags: readonly string[]): Language | null {
  for (const tag of tags) {
    const language = matchLanguage(tag)
    if (language) return language
  }
  return null
}

// Storage can be missing or throw (private mode, blocked site data): then the
// choice simply isn't remembered.
export function readSavedLanguage(): Language | null {
  try {
    const value = globalThis.localStorage.getItem(STORAGE_KEY)
    return isLanguage(value) ? value : null
  } catch {
    return null
  }
}

export function saveLanguage(language: Language): void {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // not remembered, still switched for this visit
  }
}

export function pickInitialLanguage(
  saved: Language | null = readSavedLanguage(),
  browserTags: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages,
): Language {
  return saved ?? detectBrowserLanguage(browserTags) ?? FALLBACK_LANGUAGE
}
