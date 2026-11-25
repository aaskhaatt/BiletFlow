import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'
import { Slot } from 'radix-ui'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

// shadcn/ui Button in BiletFlow tokens, as in the Figma design system ("Кнопка"):
// Golos Text SemiBold 15/140%, radius 12, 22 px side padding. Every size is at
// least 44 px tall (touch target). Disabled buttons ("Распродано") get the grey
// fill of the design instead of transparency.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent bg-clip-padding text-[0.9375rem] leading-[1.4] font-semibold whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none aria-busy:cursor-progress aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        // "основная"
        default:
          'bg-brand text-on-dark hover:bg-brand-press active:bg-brand-press disabled:bg-line disabled:text-ink-muted',
        // "с контуром" ("вторичная" in Figma)
        outline:
          'border-ink bg-surface text-ink hover:bg-line-soft aria-expanded:bg-line-soft disabled:border-transparent disabled:bg-line disabled:text-ink-muted',
        // "текстовая"
        ghost: 'text-brand hover:bg-brand-soft aria-expanded:bg-brand-soft disabled:text-ink-muted',
        // "+ Добавить": adds a row, such as a ticket type
        dashed:
          'border-dashed border-ink bg-surface text-ink hover:bg-line-soft disabled:border-line-field disabled:bg-line disabled:text-ink-muted',
        // irreversible actions: "Подтвердить возврат"
        destructive:
          'bg-status-danger-fg text-on-dark hover:bg-status-danger-fg/90 focus-visible:ring-destructive/30 disabled:bg-line disabled:text-ink-muted',
        link: 'text-brand underline-offset-4 hover:underline disabled:text-ink-muted',
      },
      size: {
        // 44 px: organizer toolbars and forms, 14 px text
        sm: 'h-11 px-4 text-[0.875rem]',
        default: 'h-12 px-5.5',
        // 56 px: the main action on a phone ("Оплатить")
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

/**
 * `loading`: shows a spinner, keeps the label and the variant's colors, and
 * ignores clicks (a form is not submitted twice). Screen readers hear
 * "Оплатить, Загрузка…".
 */
function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  loading = false,
  onClick,
  children,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    loading?: boolean
  }) {
  const { t } = useTranslation()
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
      aria-busy={loading || undefined}
      aria-disabled={loading || props['aria-disabled']}
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        if (loading) {
          event.preventDefault()
          return
        }
        onClick?.(event)
      }}
    >
      {loading && (
        <span
          aria-hidden="true"
          data-slot="button-spinner"
          className="size-5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      )}
      <Slot.Slottable>{children}</Slot.Slottable>
      {/* the comma keeps the label and "loading" apart when read aloud */}
      {loading && <span className="sr-only">{`, ${t('common.loading')}`}</span>}
    </Comp>
  )
}

export { Button, buttonVariants }
