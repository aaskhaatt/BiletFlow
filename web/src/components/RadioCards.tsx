import { cn } from 'cn'
import { useId } from 'react'
import { FieldMessage, type FormFieldProps } from '@/components/FormField'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

export interface RadioCardOption {
  value: string
  /** "Публичное · общий вход" */
  title: string
  /** "Событие видно в каталоге, места не назначаются" */
  description?: string
  disabled?: boolean
}

interface RadioCardsProps extends Pick<FormFieldProps, 'label' | 'hint' | 'error'> {
  options: RadioCardOption[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** For a plain HTML form: the value is sent under this name. */
  name?: string
  disabled?: boolean
  required?: boolean
  className?: string
}

/**
 * One choice out of a few, each a card with a title and a line of explanation
 * (Figma: "Доступ и рассадка"). The chosen card has a 2 px brand border on
 * brand/primary-soft. Arrow keys move between cards; screen readers hear the
 * group label, the card title, and its explanation.
 * With react-hook-form, use a Controller: value + onValueChange.
 */
export default function RadioCards({
  label,
  hint,
  error,
  options,
  className,
  ...groupProps
}: RadioCardsProps) {
  const id = useId()
  const labelId = `${id}-label`
  const messageId = `${id}-message`

  return (
    <div className={cn('flex flex-col gap-1.5', className)} data-slot="radio-cards">
      <span id={labelId} className="type-label text-ink">
        {label}
      </span>
      <RadioGroup
        aria-labelledby={labelId}
        aria-describedby={error || hint ? messageId : undefined}
        aria-invalid={error ? true : undefined}
        {...groupProps}
      >
        {options.map((option) => {
          const itemId = `${id}-${option.value}`
          return (
            <label
              key={option.value}
              htmlFor={itemId}
              className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-surface px-3.5 py-3 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/40 has-disabled:cursor-not-allowed has-disabled:bg-line-soft has-[[data-state=checked]]:border-brand has-[[data-state=checked]]:bg-brand-soft has-[[data-state=checked]]:inset-ring-1 has-[[data-state=checked]]:inset-ring-brand"
            >
              <RadioGroupItem
                id={itemId}
                value={option.value}
                disabled={option.disabled}
                aria-labelledby={`${itemId}-title`}
                aria-describedby={option.description ? `${itemId}-description` : undefined}
                className="mt-px"
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span
                  id={`${itemId}-title`}
                  className="text-[0.9375rem] leading-[1.4] font-semibold text-ink"
                >
                  {option.title}
                </span>
                {option.description && (
                  <span id={`${itemId}-description`} className="type-small text-ink-2">
                    {option.description}
                  </span>
                )}
              </span>
            </label>
          )
        })}
      </RadioGroup>
      <FieldMessage id={messageId} hint={hint} error={error} />
    </div>
  )
}
