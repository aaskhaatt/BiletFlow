import { cn } from 'cn'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useEventCategories } from '@/api/hooks/events'
import { Button } from '@/components/ui/button'

export default function CategoryFilters({
  category,
  onChange,
  children,
}: {
  category: string
  onChange: (category: string) => void
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const categories = useEventCategories()
  const choices = Array.from(new Set([...(categories.data ?? []), category].filter(Boolean)))

  return (
    <div className="space-y-1">
      <div role="group" aria-label={t('catalog.categories')} className="flex flex-wrap gap-2">
        {['', ...choices].map((choice) => (
          <button
            key={choice}
            type="button"
            aria-pressed={choice === category}
            className={cn(
              'min-h-11 max-w-full rounded-full border px-3 type-small font-semibold wrap-anywhere focus-visible:outline-2 focus-visible:outline-brand min-[1024px]:min-h-10 min-[1024px]:px-3.5',
              choice === category
                ? 'border-ink bg-ink text-on-dark'
                : 'border-line bg-surface text-ink hover:bg-line-soft',
            )}
            onClick={() => onChange(choice)}
          >
            {choice || t('catalog.all')}
          </button>
        ))}
        {children}
      </div>
      {categories.isError && (
        <div className="flex flex-wrap items-center gap-x-2">
          <p role="status" className="type-small text-ink-2">
            {t('catalog.categoriesError')}
          </p>
          <Button type="button" size="sm" variant="link" onClick={() => void categories.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      )}
    </div>
  )
}
