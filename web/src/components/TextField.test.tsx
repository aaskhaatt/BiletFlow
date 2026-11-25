import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { describe, expect, it } from 'vitest'
import TextField from '@/components/TextField'

describe('TextField', () => {
  it('is named by its label and described by its hint', () => {
    render(<TextField label="Email" hint="Сюда придёт билет" />)
    const field = screen.getByRole('textbox', { name: 'Email' })

    expect(field).toHaveAccessibleDescription('Сюда придёт билет')
    expect(field).toBeValid()
  })

  it('reads the error, not the hint, when there is one', () => {
    render(<TextField label="Email" hint="Сюда придёт билет" error="Проверьте адрес" />)
    const field = screen.getByRole('textbox', { name: 'Email' })

    expect(field).toBeInvalid()
    expect(field).toHaveAccessibleDescription('Проверьте адрес')
    expect(screen.queryByText('Сюда придёт билет')).not.toBeInTheDocument()
  })

  it('shows an icon next to the error, hidden from screen readers', () => {
    render(<TextField label="Email" error="Проверьте адрес" />)
    const message = screen.getByText('Проверьте адрес')

    expect(message.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('has no description when there is no hint or error', () => {
    render(<TextField label="Имя и фамилия" />)

    expect(screen.getByRole('textbox', { name: 'Имя и фамилия' })).not.toHaveAttribute(
      'aria-describedby',
    )
  })

  it('keeps a description passed from outside', () => {
    render(
      <>
        <p id="rules">Латиница и цифры</p>
        <TextField label="Промокод" hint="Необязательно" aria-describedby="rules" />
      </>,
    )

    expect(screen.getByRole('textbox', { name: 'Промокод' })).toHaveAccessibleDescription(
      'Необязательно Латиница и цифры',
    )
  })

  it('gives two fields on one page their own ids', () => {
    render(
      <>
        <TextField label="Email" error="Проверьте адрес" />
        <TextField label="Пароль" error="Пароль слишком короткий" />
      </>,
    )

    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAccessibleDescription(
      'Проверьте адрес',
    )
    expect(screen.getByRole('textbox', { name: 'Пароль' })).toHaveAccessibleDescription(
      'Пароль слишком короткий',
    )
  })
})

function PasswordForm() {
  const { register, handleSubmit, formState } = useForm<{ password: string }>()
  return (
    <form noValidate onSubmit={handleSubmit(() => undefined)}>
      <TextField
        label="Пароль"
        error={formState.errors.password && 'Пароль слишком короткий'}
        {...register('password', { minLength: 8 })}
      />
      <button type="submit">Проверить</button>
    </form>
  )
}

describe('TextField in a react-hook-form form', () => {
  it('after a failed submit, focuses the field, whose error is then read', async () => {
    render(<PasswordForm />)
    const field = screen.getByRole('textbox', { name: 'Пароль' })

    fireEvent.change(field, { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }))

    await waitFor(() => expect(field).toHaveFocus())
    expect(field).toBeInvalid()
    expect(field).toHaveAccessibleDescription('Пароль слишком короткий')
  })

  it('clears the error once the value is fixed', async () => {
    render(<PasswordForm />)
    const field = screen.getByRole('textbox', { name: 'Пароль' })
    fireEvent.change(field, { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }))
    await waitFor(() => expect(field).toBeInvalid())

    fireEvent.change(field, { target: { value: 'long enough' } })

    await waitFor(() => expect(field).toBeValid())
    expect(field).not.toHaveAttribute('aria-describedby')
  })
})
