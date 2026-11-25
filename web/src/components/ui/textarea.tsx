import { cn } from 'cn'
import * as React from 'react'

// shadcn/ui Textarea in BiletFlow tokens, like Input: the Figma "Описание" field
// is 104 px tall with 14 px padding. It grows with its text and can be resized.
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'type-body flex field-sizing-content min-h-26 w-full resize-y rounded-md border border-line-field bg-surface px-3.5 py-3 text-ink transition-colors outline-none placeholder:text-ink-muted focus-visible:border-brand focus-visible:inset-ring-1 focus-visible:inset-ring-brand disabled:cursor-not-allowed disabled:bg-line-soft disabled:text-ink-muted aria-invalid:border-status-danger-fg aria-invalid:inset-ring-1 aria-invalid:inset-ring-status-danger-fg aria-invalid:focus-visible:ring-3 aria-invalid:focus-visible:ring-status-danger-fg/20 max-md:text-base',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
