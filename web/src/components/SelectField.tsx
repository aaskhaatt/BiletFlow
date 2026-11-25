import FormField, { type FormFieldProps } from '@/components/FormField'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface SelectOption {
  value: string
  label: string
}

interface SelectFieldProps extends Pick<FormFieldProps, 'label' | 'hint' | 'error' | 'id'> {
  options: SelectOption[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  onBlur?: () => void
  /** Shown while nothing is chosen ("Выберите категорию"). */
  placeholder?: string
  /** For a plain HTML form: the value is sent under this name. */
  name?: string
  disabled?: boolean
  required?: boolean
  className?: string
}

/**
 * A list to pick one value from ("Категория"), with its label and hint or error
 * (see FormField). With react-hook-form, use a Controller: value + onValueChange.
 */
export default function SelectField({
  label,
  hint,
  error,
  id,
  options,
  placeholder,
  onBlur,
  className,
  ...selectProps
}: SelectFieldProps) {
  return (
    <FormField label={label} hint={hint} error={error} id={id} className={className}>
      {(control) => (
        <Select {...selectProps}>
          <SelectTrigger {...control} className="w-full" onBlur={onBlur}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent position="popper">
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  )
}
