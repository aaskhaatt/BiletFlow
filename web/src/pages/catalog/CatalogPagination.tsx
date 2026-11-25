import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

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

  return (
    <nav
      aria-label={t('catalog.pagination')}
      className="flex items-center justify-between gap-3"
      data-slot="catalog-pagination"
    >
      <div className="min-w-24">
        {page > 1 && (
          <Button asChild variant="outline" size="sm">
            <Link to={{ search: hrefFor(page - 1) }} onClick={onNavigate}>
              {t('catalog.previous')}
            </Link>
          </Button>
        )}
      </div>
      <p className="type-small text-center text-ink-2">
        {t('catalog.pageOf', { page, pages: pageCount })}
      </p>
      <div className="flex min-w-24 justify-end">
        {page < pageCount && (
          <Button asChild variant="outline" size="sm">
            <Link to={{ search: hrefFor(page + 1) }} onClick={onNavigate}>
              {t('catalog.next')}
            </Link>
          </Button>
        )}
      </div>
    </nav>
  )
}
