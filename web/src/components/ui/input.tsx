import { cn } from 'cn'
import * as React from 'react'

// shadcn/ui Input in BiletFlow tokens: 48 px tall. On phones the text is 16 px,
// otherwise iOS zooms the page when the field gets focus.
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'type-body h-12 w-full min-w-0 rounded-md border border-line-field bg-surface px-4 text-ink transition-colors outline-none file:inline-flex file:h-8 file:border-0 file:bg-transparent file:type-label file:text-ink placeholder:text-ink-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-line-soft disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 max-md:text-base',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
