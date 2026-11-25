import { cn } from 'cn'
import type { ReactNode } from 'react'
import emptyIcon from '@/assets/catalog-empty.svg'
import searchIcon from '@/assets/catalog-search.svg'
import warningIcon from '@/assets/catalog-warning.svg'

const icons = {
  calendar: emptyIcon,
  search: searchIcon,
  warning: warningIcon,
}

export default function PublicEventFeedback({
  title,
  description,
  icon,
  action,
  heading: Heading = 'h2',
  desktopCatalog = false,
}: {
  title: string
  description: string
  icon: keyof typeof icons
  action?: ReactNode
  heading?: 'h1' | 'h2'
  desktopCatalog?: boolean
}) {
  const error = icon === 'warning'
  return (
    <div
      data-slot={error ? 'error-state' : 'empty-state'}
      className={cn(
        'flex flex-1 flex-col justify-center gap-6 py-6',
        desktopCatalog &&
          'min-[1024px]:items-center min-[1024px]:justify-start min-[1024px]:gap-4 min-[1024px]:pt-16 min-[1024px]:pb-8',
      )}
    >
      <div
        role={error ? 'alert' : undefined}
        className={cn(
          'flex flex-col items-center gap-4 px-2 text-center',
          desktopCatalog && 'min-[1024px]:max-w-[560px]',
        )}
      >
        <span
          className={cn(
            'grid size-18 shrink-0 place-items-center rounded-full',
            error ? 'bg-status-danger-bg' : 'bg-brand-soft',
          )}
        >
          <img src={icons[icon]} width="32" height="32" alt="" />
        </span>
        <div className="w-full space-y-2 wrap-anywhere">
          <Heading className="font-display text-[1.375rem] leading-[1.2] font-medium">
            {title}
          </Heading>
          <p className="type-body text-ink-2">{description}</p>
        </div>
      </div>
      {action}
    </div>
  )
}
