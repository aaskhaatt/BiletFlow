'use client'

import { cn } from 'cn'
import { CheckIcon } from 'lucide-react'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'
import * as React from 'react'

// shadcn/ui Checkbox in BiletFlow tokens. The box is 20 px with a 4 px radius,
// as in Figma (checkout, "Согласен с условиями"); 4 px is not one of the radius
// tokens. The invisible ::after area makes the touch target 44 x 44 px.
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer relative flex size-5 shrink-0 items-center justify-center rounded-[4px] border border-line-field bg-surface transition-colors outline-none after:absolute after:-inset-3 focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-line-soft aria-invalid:border-status-danger-fg aria-invalid:inset-ring-1 aria-invalid:inset-ring-status-danger-fg data-checked:border-brand data-checked:bg-brand data-checked:text-on-dark data-checked:inset-ring-0 disabled:data-checked:border-ink-muted disabled:data-checked:bg-ink-muted',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
