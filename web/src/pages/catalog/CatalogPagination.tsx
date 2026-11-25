import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { CATALOG_PAGE_SIZE } from '@/pages/catalog/catalog-search'

type CatalogPaginationProps = {
  page: number
  pageCount: number
  /** The address of another page, as a search string. */
  hrefFor: (page: number) => string
  /** Called on a click, before the new page has loaded. */
  onNavigate: () => void
}

/** "Назад · Страница 2 из 3 · Вперёд". Pages are links, so each one has an address. */
export default function CatalogPagination({
  page,
  pageCount,
  hrefFor,
  onNavigate,
}: CatalogPaginationProps) {
  const { t } = useTranslation()
  if (pageCount <= 1) return null
  const firstNumber = Math.max(1, Math.min(page - 1, pageCount - 3))
  const numbers = Array.from({ length: Math.min(4, pageCount) }, (_, i) => firstNumber + i)
  const previous = t('catalog.previous')
  const next = t('catalog.next')
  const caption = t('catalog.pageOf', { page, pages: pageCount })

  return (
    <nav
      aria-label={t('catalog.pagination')}
      className="min-[1024px]:mt-2"
      data-slot="catalog-pagination"
    >
      <div className="flex items-center justify-between gap-3 min-[1024px]:justify-center min-[1024px]:gap-2">
        <div className="min-w-24 min-[1024px]:min-w-0">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link to={{ search: hrefFor(page - 1) }} onClick={onNavigate}>
                <span className="hidden min-[1024px]:inline" aria-hidden="true">
                  ←
                </span>
                {previous}
              </Link>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled
              className="hidden min-[1024px]:inline-flex"
            >
              ← {previous}
            </Button>
          )}
        </div>
        <p className="type-small text-center text-ink-2 min-[1024px]:hidden">{caption}</p>
        <div className="hidden gap-2 min-[1024px]:flex">
          {numbers.map((number) => (
            <Button
              key={number}
              asChild
              variant={number === page ? 'default' : 'outline'}
              size="sm"
              className="min-w-13"
            >
              <Link
                to={{ search: hrefFor(number) }}
                onClick={onNavigate}
                aria-current={number === page ? 'page' : undefined}
              >
                {number}
              </Link>
            </Button>
          ))}
        </div>
        <div className="flex min-w-24 justify-end min-[1024px]:min-w-0">
          {page < pageCount ? (
            <Button asChild variant="outline" size="sm">
              <Link to={{ search: hrefFor(page + 1) }} onClick={onNavigate}>
                {next}
                <span className="hidden min-[1024px]:inline" aria-hidden="true">
                  →
                </span>
              </Link>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled
              className="hidden min-[1024px]:inline-flex"
            >
              {next} →
            </Button>
          )}
        </div>
      </div>
      <p className="mt-6 hidden text-center type-small text-ink-muted min-[1024px]:block">
        {caption} · {t('catalog.perPage', { count: CATALOG_PAGE_SIZE })}
      </p>
    </nav>
  )
}
