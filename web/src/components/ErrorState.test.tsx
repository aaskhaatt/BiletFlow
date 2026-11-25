import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import ErrorState from '@/components/ErrorState'

it('exposes the error and retries without submitting a surrounding form', () => {
  const retry = vi.fn()
  const submit = vi.fn()
  render(
    <form onSubmit={submit}>
      <ErrorState
        title="Не удалось загрузить события"
        description="Проверьте подключение"
        onRetry={retry}
      />
    </form>,
  )

  const error = screen.getByRole('alert')
  expect(within(error).getByRole('heading')).toHaveTextContent('Не удалось загрузить события')
  expect(error).toHaveTextContent('Проверьте подключение')

  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
  expect(retry).toHaveBeenCalledOnce()
  expect(submit).not.toHaveBeenCalled()
})

it('prevents another retry while the request is in progress', () => {
  const retry = vi.fn()
  render(<ErrorState title="Не удалось загрузить события" onRetry={retry} retrying />)

  const button = screen.getByRole('button', { name: /Повторить/ })
  expect(button).toHaveAttribute('aria-busy', 'true')
  fireEvent.click(button)
  expect(retry).not.toHaveBeenCalled()
})
