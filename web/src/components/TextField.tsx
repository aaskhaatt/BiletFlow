import type { ComponentProps } from 'react'
import FormField, { type FormFieldProps } from '@/components/FormField'
import { Input } from '@/components/ui/input'

type TextFieldProps = ComponentProps<typeof Input> &
  Pick<FormFieldProps, 'label' | 'hint' | 'error'> & {
    /** Classes for the wrapper; className goes to the input itself. */
    fieldClassName?: string
  }

/**
 * A text input with its label and hint or error (see FormField).
 * Works with react-hook-form: {...register('email')}.
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
  return (
    <FormField
      label={label}
      hint={hint}
      error={error}
      id={id}
      describedBy={describedBy}
      className={fieldClassName}
    >
      {(control) => <Input {...control} {...props} />}
    </FormField>
  )
}
