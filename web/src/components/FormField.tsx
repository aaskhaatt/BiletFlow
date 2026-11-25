import { cn } from 'cn'
import { type ReactNode, useId } from 'react'
import { WarningIcon } from '@/components/icons'
import { Label } from '@/components/ui/label'

/** What a field's control needs to be wired to its label and message. */
export interface FieldControlProps {
  id: string
  'aria-invalid'?: true
  'aria-describedby'?: string
}

export interface FormFieldProps {
  /** Text above the control. Every field has one: a placeholder is not a label. */
  label: string
  /** Help under the control ("Сюда придёт билет"). */
  hint?: string
  /**
   * Translated error under the control. It replaces the hint, marks the control
   * invalid, and is read by screen readers together with the label.
   */
  error?: string
  /** The control's id; generated when left out. */
  id?: string
  /** Another description of the control, read after the hint or error. */
  describedBy?: string
  className?: string
  /** Renders the control with the props that wire it up. */
  children: (control: FieldControlProps) => ReactNode
}

/**
 * Label, control and the hint or error below it (Figma: 6 px apart), wired
 * together for screen readers: the error is the control's description
 * (aria-describedby) and the control is aria-invalid. After a failed submit,
 * focus the first invalid field (react-hook-form does it by default), so its
 * error is read at once.
 */
export default function FormField({
  label,
  hint,
  error,
  id,
  describedBy,
  className,
  children,
}: FormFieldProps) {
  const autoId = useId()
  const controlId = id ?? autoId
  const messageId = `${controlId}-message`
  const message = error ?? hint
  const describedByIds = [message && messageId, describedBy].filter(Boolean).join(' ')

  return (
    <div className={cn('flex flex-col gap-1.5', className)} data-slot="form-field">
      <Label htmlFor={controlId}>{label}</Label>
      {children({
        id: controlId,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedByIds || undefined,
      })}
      <FieldMessage id={messageId} hint={hint} error={error} />
    </div>
  )
}

/** The hint or the error under a control; nothing when there is neither. */
export function FieldMessage({ id, hint, error }: { id: string; hint?: string; error?: string }) {
  if (error) {
    return (
      <p id={id} className="type-small flex gap-1.5 text-status-danger-fg">
        <WarningIcon className="mt-px size-4 shrink-0" />
        {error}
      </p>
    )
  }
  if (hint) {
    return (
      <p id={id} className="type-small text-ink-muted">
        {hint}
      </p>
    )
  }
  return null
}
