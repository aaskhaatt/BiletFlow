import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CheckboxField from '@/components/CheckboxField'
import RadioCards from '@/components/RadioCards'
import SelectField from '@/components/SelectField'
import TextareaField from '@/components/TextareaField'

// W2.4: the select, textarea, checkbox and radio cards are named by their
// labels and read their hint or error, like TextField.

describe('SelectField', () => {
  const options = [
    { value: 'concert', label: 'Концерт' },
    { value: 'lecture', label: 'Лекция' },
  ]

  it('is named by its label and shows the chosen value', () => {
    render(<SelectField label="Категория" options={options} defaultValue="lecture" />)

    expect(screen.getByRole('combobox', { name: 'Категория' })).toHaveTextContent('Лекция')
  })

  it('reads its error', () => {
    render(<SelectField label="Категория" options={options} error="Выберите категорию из списка" />)
    const select = screen.getByRole('combobox', { name: 'Категория' })

    expect(select).toBeInvalid()
    expect(select).toHaveAccessibleDescription('Выберите категорию из списка')
  })
})

describe('TextareaField', () => {
  it('is named by its label and described by its hint', () => {
    render(<TextareaField label="Описание" hint="Поддерживается простое форматирование" />)

    expect(screen.getByRole('textbox', { name: 'Описание' })).toHaveAccessibleDescription(
      'Поддерживается простое форматирование',
    )
  })
})

describe('CheckboxField', () => {
  it('is checked by a click on its label', () => {
    const onCheckedChange = vi.fn()
    render(<CheckboxField label="Согласен с условиями" onCheckedChange={onCheckedChange} />)

    fireEvent.click(screen.getByText('Согласен с условиями'))

    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(screen.getByRole('checkbox', { name: 'Согласен с условиями' })).toBeChecked()
  })

  it('reads its error', () => {
    render(<CheckboxField label="Согласен с условиями" error="Без согласия оплатить нельзя" />)
    const checkbox = screen.getByRole('checkbox', { name: 'Согласен с условиями' })

    expect(checkbox).toBeInvalid()
    expect(checkbox).toHaveAccessibleDescription('Без согласия оплатить нельзя')
  })
})

describe('RadioCards', () => {
  const options = [
    { value: 'public', title: 'Публичное · общий вход', description: 'Событие видно в каталоге' },
    { value: 'unlisted', title: 'По ссылке', description: 'Не попадает в каталог' },
  ]

  it('is a group named by its label, with each card named by its title', () => {
    render(<RadioCards label="Доступ и рассадка" options={options} defaultValue="public" />)

    expect(screen.getByRole('radiogroup', { name: 'Доступ и рассадка' })).toBeInTheDocument()
    const chosen = screen.getByRole('radio', { name: 'Публичное · общий вход' })
    expect(chosen).toBeChecked()
    expect(chosen).toHaveAccessibleDescription('Событие видно в каталоге')
    expect(screen.getByRole('radio', { name: 'По ссылке' })).not.toBeChecked()
  })

  it('chooses a card clicked anywhere on it', () => {
    const onValueChange = vi.fn()
    render(
      <RadioCards
        label="Доступ и рассадка"
        options={options}
        defaultValue="public"
        onValueChange={onValueChange}
      />,
    )

    fireEvent.click(screen.getByText('Не попадает в каталог'))

    expect(onValueChange).toHaveBeenCalledWith('unlisted')
    expect(screen.getByRole('radio', { name: 'По ссылке' })).toBeChecked()
  })
})
