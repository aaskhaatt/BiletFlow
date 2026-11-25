import { cn } from 'cn'
import { type ComponentProps, useId } from 'react'
import { WarningIcon } from '@/components/icons'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type TextFieldProps = ComponentProps<typeof Input> & {
  /** Text above the field. Every field has one: a placeholder is not a label. */
  label: string
  /** Help under the field ("Сюда придёт билет"). */
  hint?: string
  /**
   * Translated error under the field. It replaces the hint, marks the field
   * invalid, and is read by screen readers together with the label.
   */
  error?: string
  /** Classes for the wrapper; className goes to the input itself. */
  fieldClassName?: string
}

/**
 * Label, input and the hint or error below it, wired together for screen
 * readers: the error is the field's description (aria-describedby) and the
 * field is aria-invalid. Works with react-hook-form: {...register('email')}.
 * After a failed submit, focus the first invalid field (react-hook-form does it
 * by default), so its error is read at once.
 */
export default function TextField({
  label,
  hint,
  error,
  fieldClassName,
  id,
  'aria-describedby': describedBy,
  ...props
}: TextFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const messageId = `${inputId}-message`
  const message = error ?? hint

  return (
    <div className={cn('flex flex-col gap-1.5', fieldClassName)} data-slot="text-field">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [message && messageId, describedBy].filter(Boolean).join(' ') || undefined
        }
        {...props}
      />
      {error ? (
        <p id={messageId} className="type-small flex gap-1.5 text-status-danger-fg">
          <WarningIcon className="mt-px size-4 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="type-small text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
