import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '@/components/ui/button'
import i18n from '@/i18n'

describe('Button', () => {
  it('calls onClick when pressed', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Оплатить</Button>)

    fireEvent.click(screen.getByRole('button', { name: 'Оплатить' }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('ignores presses while loading, and says so to screen readers', () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Оплатить
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Оплатить, Загрузка…' })

    fireEvent.click(button)
    fireEvent.click(button)

    expect(onClick).not.toHaveBeenCalled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveAttribute('aria-disabled', 'true')
  })

  it('does not submit its form a second time while loading', () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())
    const { rerender } = render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Оплатить</Button>
      </form>,
    )
    fireEvent.click(screen.getByRole('button'))
    rerender(
      <form onSubmit={onSubmit}>
        <Button type="submit" loading>
          Оплатить
        </Button>
      </form>,
    )

    fireEvent.click(screen.getByRole('button'))

    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('keeps the label visible while loading', () => {
    render(<Button loading>Оплатить</Button>)

    expect(screen.getByText('Оплатить')).toBeVisible()
  })

  it('reads "loading" in the current language', async () => {
    await i18n.changeLanguage('kk')
    render(<Button loading>Төлеу</Button>)

    expect(screen.getByRole('button', { name: 'Төлеу, Жүктелуде…' })).toBeInTheDocument()
  })

  it('cannot be pressed when disabled ("Распродано")', () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Распродано
      </Button>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Распродано' }))

    expect(onClick).not.toHaveBeenCalled()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('can be a link that looks like a button', () => {
    render(
      <Button asChild variant="outline">
        <a href="/tickets/9">PDF</a>
      </Button>,
    )

    expect(screen.getByRole('link', { name: 'PDF' })).toHaveAttribute('data-variant', 'outline')
  })
})
