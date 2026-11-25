import { cn } from 'cn'
import * as React from 'react'

// shadcn/ui Input in BiletFlow tokens, as in the Figma "Поле ввода": 48 px tall,
// 14 px side padding, radius 12, a 1 px line/field border. Focus and error draw
// a 2 px border (brand / danger) inside the box, so nothing moves. On phones the
// text is 16 px, otherwise iOS zooms the page when the field gets focus.
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'type-body h-12 w-full min-w-0 rounded-md border border-line-field bg-surface px-3.5 text-ink transition-colors outline-none file:inline-flex file:h-8 file:border-0 file:bg-transparent file:type-label file:text-ink placeholder:text-ink-muted focus-visible:border-brand focus-visible:inset-ring-1 focus-visible:inset-ring-brand disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-line-soft disabled:text-ink-muted aria-invalid:border-status-danger-fg aria-invalid:inset-ring-1 aria-invalid:inset-ring-status-danger-fg aria-invalid:focus-visible:ring-3 aria-invalid:focus-visible:ring-status-danger-fg/20 max-md:text-base',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
