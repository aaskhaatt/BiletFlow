import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form'
import { isApiError } from '@/api/errors'

interface ServerFieldErrorOptions<T extends FieldValues> {
  /**
   * Translated text to show under each field, e.g. t('validation.invalid').
   * The server's own text is English, so it is never shown.
   */
  message: string
  /** When the server's field name differs from the form's: { server_name: 'formName' }. */
  fieldMap?: Partial<Record<string, FieldPath<T>>>
}

/**
 * Puts the field problems of a 422 VALIDATION_ERROR onto the form's fields.
 * The backend names a field by the last part of its path ("email", "quantity").
 *
 * Returns true when the error was a validation error with fields (the form
 * shows them); false otherwise, so the caller shows a general error instead.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  options: ServerFieldErrorOptions<T>,
): boolean {
  if (!isApiError(error) || error.status !== 422 || !error.fields) return false

  const names = Object.keys(error.fields)
  if (names.length === 0) return false

  names.forEach((serverName, index) => {
    const name = options.fieldMap?.[serverName] ?? (serverName as FieldPath<T>)
    setError(name, { type: 'server', message: options.message }, { shouldFocus: index === 0 })
  })
  return true
}
