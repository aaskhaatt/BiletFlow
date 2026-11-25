import { type ComponentProps, useId } from 'react'
import { FieldMessage, type FormFieldProps } from '@/components/FormField'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

type CheckboxFieldProps = ComponentProps<typeof Checkbox> &
  Pick<FormFieldProps, 'label' | 'hint' | 'error'>

/**
 * A checkbox with its label on the right ("Согласен с условиями и политикой
 * возврата организатора": Golos 14/145%, text/ink-2, 10 px from the box) and a
 * hint or error under it, wired for screen readers like FormField.
 * With react-hook-form, use a Controller: checked + onCheckedChange.
 */
export default function CheckboxField({
  label,
  hint,
  error,
  id,
  'aria-describedby': describedBy,
  ...props
}: CheckboxFieldProps) {
  const autoId = useId()
  const controlId = id ?? autoId
  const messageId = `${controlId}-message`
  const describedByIds = [(error ?? hint) && messageId, describedBy].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-1.5" data-slot="checkbox-field">
      <div className="flex items-start gap-2.5">
        <Checkbox
          id={controlId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedByIds || undefined}
          {...props}
        />
        <Label
          htmlFor={controlId}
          className="text-[0.875rem] leading-[1.45] font-normal text-ink-2"
        >
          {label}
        </Label>
      </div>
      <div className="pl-7.5">
        <FieldMessage id={messageId} hint={hint} error={error} />
      </div>
    </div>
  )
}
