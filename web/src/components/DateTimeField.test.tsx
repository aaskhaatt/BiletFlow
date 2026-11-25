import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Controller, useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import DateTimeField from '@/components/DateTimeField'
import i18n from '@/i18n'

describe('DateTimeField', () => {
  it('shows the API moment in Astana time', () => {
    render(<DateTimeField label="Начало" value="2026-10-24T14:00:00Z" onChange={() => {}} />)

    expect(screen.getByLabelText('Начало')).toHaveValue('2026-10-24T19:00')
  })

  it('hands back what was typed with the Astana offset', () => {
    const onChange = vi.fn()
    render(<DateTimeField label="Начало" value={null} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Начало'), { target: { value: '2026-10-24T21:30' } })

    expect(onChange).toHaveBeenLastCalledWith('2026-10-24T21:30:00+05:00')
  })

  it('hands back null when the field is cleared', () => {
    const onChange = vi.fn()
    render(<DateTimeField label="Начало" value="2026-10-24T14:00:00Z" onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Начало'), { target: { value: '' } })

    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('says the time zone under the field, in the current language', async () => {
    const { rerender } = render(<DateTimeField label="Начало" value={null} onChange={() => {}} />)
    expect(screen.getByLabelText('Начало')).toHaveAccessibleDescription('Время Астаны (UTC+5)')

    await i18n.changeLanguage('kk')
    rerender(<DateTimeField label="Басталуы" value={null} onChange={() => {}} />)

    expect(screen.getByLabelText('Басталуы')).toHaveAccessibleDescription('Астана уақыты (UTC+5)')
  })

  it('shows an error instead of the zone, read by screen readers', () => {
    render(
      <DateTimeField
        label="Окончание"
        value={null}
        onChange={() => {}}
        error="Окончание должно быть позже начала"
      />,
    )
    const field = screen.getByLabelText('Окончание')

    expect(field).toBeInvalid()
    expect(field).toHaveAccessibleDescription('Окончание должно быть позже начала')
  })
})

function EventForm({ onSubmit }: { onSubmit: (data: { start: string | null }) => void }) {
  const { control, handleSubmit } = useForm<{ start: string | null }>({
    defaultValues: { start: null },
  })
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Controller
        control={control}
        name="start"
        render={({ field }) => (
          <DateTimeField
            label="Начало"
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
      <button type="submit">Сохранить</button>
    </form>
  )
}

describe('DateTimeField in a react-hook-form form', () => {
  it('submits the time with its offset, never without', async () => {
    const onSubmit = vi.fn()
    render(<EventForm onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText('Начало'), { target: { value: '2026-10-24T19:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
    expect(onSubmit.mock.calls[0][0]).toEqual({ start: '2026-10-24T19:00:00+05:00' })
  })
})
