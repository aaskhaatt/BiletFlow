import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'
import { Slot } from 'radix-ui'
import * as React from 'react'

// shadcn/ui Button in BiletFlow tokens. Every size is at least 44 px tall (touch target).
const buttonVariants = cva(
  "group/button type-label inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent bg-clip-padding whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: 'bg-brand text-on-dark hover:bg-brand-press active:bg-brand-press',
        outline:
          'border-line-field bg-surface text-ink hover:bg-brand-soft aria-expanded:bg-brand-soft',
        secondary: 'bg-brand-soft text-brand hover:bg-line-soft aria-expanded:bg-line-soft',
        ghost: 'text-ink hover:bg-line-soft aria-expanded:bg-line-soft',
        destructive:
          'bg-status-danger-bg text-status-danger-fg hover:bg-status-danger-fg hover:text-on-dark focus-visible:ring-destructive/30',
        link: 'text-brand underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-12 px-5',
        sm: 'h-11 px-4',
        lg: 'h-14 px-6',
        icon: 'size-11',
        'icon-lg': 'size-12',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
