import { useTranslation } from 'react-i18next'
import Skeleton from '@/components/Skeleton'
import { CATALOG_PAGE_SIZE } from '@/pages/catalog/catalog-search'

export default function CatalogLoading() {
  const { t } = useTranslation()
  return (
    <div
      data-slot="catalog-loading"
      className="grid gap-3.5 min-[1024px]:grid-cols-3 min-[1024px]:gap-6"
    >
      <p
        role="status"
        className="sr-only min-[1024px]:not-sr-only min-[1024px]:col-span-3 min-[1024px]:type-label min-[1024px]:text-ink-muted"
      >
        {t('catalog.loading')}
      </p>
      {Array.from({ length: CATALOG_PAGE_SIZE }, (_, card) => (
        <div
          key={card}
          aria-hidden="true"
          className="overflow-hidden rounded-lg border border-line bg-surface nth-[n+5]:hidden min-[1024px]:nth-[n+5]:block"
        >
          <Skeleton className="h-30 rounded-none min-[1024px]:h-50" />
          <div className="space-y-2.5 px-4 pt-3.5 pb-4">
            <Skeleton className="h-5.5 w-18" />
            <Skeleton className="h-5.5" />
            <Skeleton className="w-52.5 max-w-full" />
            <Skeleton className="h-3.5 w-35 max-w-full" />
            <div className="flex justify-between gap-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-22" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
