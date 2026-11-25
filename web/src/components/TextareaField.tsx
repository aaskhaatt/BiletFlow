import type { ComponentProps } from 'react'
import FormField, { type FormFieldProps } from '@/components/FormField'
import { Textarea } from '@/components/ui/textarea'

type TextareaFieldProps = ComponentProps<typeof Textarea> &
  Pick<FormFieldProps, 'label' | 'hint' | 'error'> & {
    /** Classes for the wrapper; className goes to the textarea itself. */
    fieldClassName?: string
  }

/**
 * A multi-line text field ("Описание") with its label and hint or error
 * (see FormField). Works with react-hook-form: {...register('description')}.
 */
export default function TextareaField({
  label,
  hint,
  error,
  fieldClassName,
  id,
  'aria-describedby': describedBy,
  ...props
}: TextareaFieldProps) {
  return (
    <FormField
      label={label}
      hint={hint}
      error={error}
      id={id}
      describedBy={describedBy}
      className={fieldClassName}
    >
      {(control) => <Textarea {...control} {...props} />}
    </FormField>
  )
}
