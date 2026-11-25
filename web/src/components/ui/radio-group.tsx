import { cn } from 'cn'
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import * as React from 'react'

// shadcn/ui RadioGroup in BiletFlow tokens. The circle is 18 px as in Figma
// ("Доступ и рассадка"): white with a line/field border, solid brand when chosen.
function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn('grid w-full gap-2.5', className)}
      {...props}
    />
  )
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        'peer relative flex aspect-square size-4.5 shrink-0 rounded-full border border-line-field bg-surface outline-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-line-soft aria-invalid:border-status-danger-fg data-checked:border-brand data-checked:bg-brand disabled:data-checked:border-ink-muted disabled:data-checked:bg-ink-muted',
        className,
      )}
      {...props}
    />
  )
}

export { RadioGroup, RadioGroupItem }
