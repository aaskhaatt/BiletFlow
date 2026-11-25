import { describe, expect, it } from 'vitest'
import {
  API_ERROR_CODES_BY_STATUS,
  ERROR_CODES,
  errorCodeOf,
  errorMessageKey,
} from '@/api/error-codes'
import { ApiError } from '@/api/errors'
import { en } from '@/i18n/locales/en'
import { kk } from '@/i18n/locales/kk'
import { ru } from '@/i18n/locales/ru'

const languages = { ru, kk, en }

describe('error texts', () => {
  it('covers every error code of the API reference plus the client-made ones', () => {
    // 69 codes in docs/api-reference.md "Errors" (VALIDATION_ERROR included), 68 of them here:
    // CurrentPasswordIncorrectError waits for the screen that needs it
    expect(Object.values(API_ERROR_CODES_BY_STATUS).flat()).toHaveLength(68)
    expect(ERROR_CODES).toContain('NETWORK_ERROR')
    expect(ERROR_CODES).toContain('UNKNOWN_ERROR')
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length)
  })

  for (const [language, messages] of Object.entries(languages)) {
    it(`has a text for every code in "${language}"`, () => {
      const texts: Record<string, string | undefined> = messages.errors
      const missing = ERROR_CODES.filter((code) => !texts[code]?.trim())
      expect(missing).toEqual([])
    })
  }
})

describe('errorCodeOf', () => {
  it('keeps a known code', () => {
    const error = new ApiError({ status: 409, error: 'UserAlreadyExistsError', message: 'x' })
    expect(errorCodeOf(error)).toBe('UserAlreadyExistsError')
    expect(errorMessageKey(error)).toBe('errors.UserAlreadyExistsError')
  })

  it('turns an unknown code into UNKNOWN_ERROR, never the server message', () => {
    const error = new ApiError({ status: 418, error: 'SomethingNewError', message: 'English text' })
    expect(errorCodeOf(error)).toBe('UNKNOWN_ERROR')
  })

  it('turns a non-API failure into UNKNOWN_ERROR', () => {
    expect(errorCodeOf(new TypeError('x is undefined'))).toBe('UNKNOWN_ERROR')
  })
})
