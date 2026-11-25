import { useTranslation } from 'react-i18next'
import FormField, { type FormFieldProps } from '@/components/FormField'
import { Input } from '@/components/ui/input'
import { fromEventLocalInput, toEventLocalInput } from '@/lib/event-time'

interface DateTimeFieldProps extends Pick<FormFieldProps, 'label' | 'error' | 'id'> {
  /** The moment as ISO 8601 in any offset, or null when empty. */
  value: string | null
  /**
   * Called with the moment in Astana time, always with its offset
   * ("2026-10-24T19:00:00+05:00"), or null when the field is empty or incomplete.
   */
  onChange: (value: string | null) => void
  onBlur?: () => void
  /** Help under the field. Defaults to the time zone: "Время Астаны (UTC+5)". */
  hint?: string
  /** Earliest and latest allowed moments, ISO 8601. */
  min?: string
  max?: string
  name?: string
  disabled?: boolean
  required?: boolean
  className?: string
}

/**
 * Date and time of an event ("Начало", "Окончание"), entered in Astana time
 * whatever the organizer's own time zone, and handed back with its offset
 * (see lib/event-time). The browser draws the picker in its own language.
 * With react-hook-form, use a Controller: value + onChange.
 */
export default function DateTimeField({
  label,
  error,
  id,
  value,
  onChange,
  hint,
  min,
  max,
  className,
  ...inputProps
}: DateTimeFieldProps) {
  const { t } = useTranslation()

  return (
    <FormField
      label={label}
      hint={hint ?? t('time.astanaZone')}
      error={error}
      id={id}
      className={className}
    >
      {(control) => (
        <Input
          {...control}
          {...inputProps}
          type="datetime-local"
          className="pr-3"
          value={toEventLocalInput(value)}
          min={min ? toEventLocalInput(min) : undefined}
          max={max ? toEventLocalInput(max) : undefined}
          onChange={(event) => onChange(fromEventLocalInput(event.target.value))}
        />
      )}
    </FormField>
  )
}
