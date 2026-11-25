import { createFormControl } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import { applyServerFieldErrors } from '@/lib/form-errors'

interface RegisterForm {
  email: string
  password: string
}

const validationError = (fields: Record<string, string>) =>
  new ApiError({ status: 422, error: 'VALIDATION_ERROR', message: 'Invalid data', fields })

describe('applyServerFieldErrors', () => {
  it('turns {"email": "..."} into an error on the email field', () => {
    const form = createFormControl<RegisterForm>()

    const applied = applyServerFieldErrors(
      validationError({ email: 'value is not a valid email address' }),
      form.setError,
      { message: 'Проверьте это поле' },
    )

    expect(applied).toBe(true)
    expect(form.control._formState.errors.email).toMatchObject({
      type: 'server',
      message: 'Проверьте это поле',
    })
    expect(form.control._formState.errors.password).toBeUndefined()
  })

  it('never shows the server text', () => {
    const setError = vi.fn()
    applyServerFieldErrors(
      validationError({ password: 'String should have at least 6 characters' }),
      setError,
      {
        message: 'Минимум 6 символов',
      },
    )
    expect(JSON.stringify(setError.mock.calls)).not.toContain('String should')
  })

  it('maps a server field name onto a differently named form field and focuses the first', () => {
    const setError = vi.fn()

    applyServerFieldErrors(
      validationError({ new_password: 'too short', token: 'missing' }),
      setError,
      {
        message: 'x',
        fieldMap: { new_password: 'password' },
      },
    )

    expect(setError).toHaveBeenNthCalledWith(
      1,
      'password',
      { type: 'server', message: 'x' },
      { shouldFocus: true },
    )
    expect(setError).toHaveBeenNthCalledWith(
      2,
      'token',
      { type: 'server', message: 'x' },
      { shouldFocus: false },
    )
  })

  it('leaves other errors to the caller', () => {
    const setError = vi.fn()
    const conflict = new ApiError({ status: 409, error: 'UserAlreadyExistsError', message: 'x' })

    expect(applyServerFieldErrors(conflict, setError, { message: 'x' })).toBe(false)
    expect(applyServerFieldErrors(new Error('boom'), setError, { message: 'x' })).toBe(false)
    expect(setError).not.toHaveBeenCalled()
  })
})
