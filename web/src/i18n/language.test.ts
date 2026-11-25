import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  detectBrowserLanguage,
  matchLanguage,
  pickInitialLanguage,
  readSavedLanguage,
  saveLanguage,
} from '@/i18n/language'

afterEach(() => vi.unstubAllGlobals())

describe('choosing the language', () => {
  it('reads the primary part of a browser language tag', () => {
    expect(matchLanguage('kk-KZ')).toBe('kk')
    expect(matchLanguage('ru_RU')).toBe('ru')
    expect(matchLanguage('EN-gb')).toBe('en')
    expect(matchLanguage('de-DE')).toBeNull()
  })

  it('takes the first browser language we have', () => {
    expect(detectBrowserLanguage(['de-DE', 'kk-KZ', 'ru'])).toBe('kk')
    expect(detectBrowserLanguage(['de', 'fr'])).toBeNull()
  })

  it('prefers the saved choice, then the browser, then Russian', () => {
    expect(pickInitialLanguage('en', ['kk-KZ'])).toBe('en')
    expect(pickInitialLanguage(null, ['kk-KZ'])).toBe('kk')
    expect(pickInitialLanguage(null, ['de-DE'])).toBe('ru')
  })
})

describe('remembering the choice', () => {
  it('saves and reads it back', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    })

    saveLanguage('kk')

    expect(readSavedLanguage()).toBe('kk')
  })

  it('keeps working when storage throws (private mode, blocked site data)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('denied', 'SecurityError')
      },
      setItem: () => {
        throw new DOMException('denied', 'SecurityError')
      },
    })

    expect(() => saveLanguage('en')).not.toThrow()
    expect(readSavedLanguage()).toBeNull()
  })

  it('ignores a stored value that is not one of our languages', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'de', setItem: () => undefined })
    expect(readSavedLanguage()).toBeNull()
  })
})
