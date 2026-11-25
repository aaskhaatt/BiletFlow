import { cn } from 'cn'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import { useEvents } from '@/api/hooks/events'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import Skeleton from '@/components/Skeleton'
import CatalogPagination from '@/pages/catalog/CatalogPagination'
import CatalogSearch from '@/pages/catalog/CatalogSearch'
import {
  catalogPageCount,
  catalogSearch,
  hasCatalogFilters,
  readCatalogFilters,
  toEventListParams,
} from '@/pages/catalog/catalog-search'
import EventCard from '@/pages/catalog/EventCard'

const linkClass = 'inline-flex min-h-11 items-center type-label text-brand underline'

/**
 * The public event catalog (Figma "Зритель / Каталог событий"): search and
 * pages of published public events. Mobile first; on a wide screen the column
 * stays at most 720 px wide (temporary, until there is a desktop design).
 */
export default function CatalogPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = readCatalogFilters(searchParams)
  const filtered = hasCatalogFilters(filters)
  const events = useEvents(toEventListParams(filters))
  const resultsRef = useRef<HTMLDivElement>(null)

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto w-full max-w-180 space-y-4 px-4 py-4"
      data-route-id="catalog"
    >
      <h1 className="sr-only">{t('catalog.title')}</h1>

      <CatalogSearch
        value={filters.q}
        onSearch={(q) => setSearchParams(catalogSearch(searchParams, { q }))}
      />

      {/* Focused after a page link, so reading goes on from the top of the list */}
      <div
        ref={resultsRef}
        tabIndex={-1}
        aria-busy={events.isFetching}
        className="space-y-4 outline-none"
      >
        {events.isPending ? (
          <>
            <p role="status" className="sr-only">
              {t('common.loading')}
            </p>
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-36 rounded-lg" />
            ))}
          </>
        ) : events.isError ? (
          <ErrorState
            title={t('catalog.loadError')}
            description={t(errorMessageKey(events.error))}
            onRetry={() => void events.refetch()}
            retrying={events.isFetching}
          />
        ) : (
          <>
            {/* Visible while searching; screen readers hear every new result */}
            <p role="status" className={cn('type-small text-ink-2', !filtered && 'sr-only')}>
              {t('catalog.found', { total: events.data.total })}
            </p>

            {events.data.items.length > 0 ? (
              <>
                <ul
                  className={cn(
                    'space-y-4 transition-opacity',
                    events.isPlaceholderData && 'opacity-60',
                  )}
                >
                  {events.data.items.map((event) => (
                    <li key={event.id}>
                      <EventCard event={event} />
                    </li>
                  ))}
                </ul>
                <CatalogPagination
                  page={filters.page}
                  pageCount={catalogPageCount(events.data.total)}
                  hrefFor={(page) => catalogSearch(searchParams, { page })}
                  onNavigate={() => resultsRef.current?.focus()}
                />
              </>
            ) : filters.page > 1 && events.data.total > 0 ? (
              // An old link to a page that no longer exists
              <>
                <EmptyState title={t('catalog.pageEmptyTitle')} />
                <Link
                  to={{ search: catalogSearch(searchParams, { page: 1 }) }}
                  className={linkClass}
                >
                  {t('catalog.firstPage')}
                </Link>
              </>
            ) : filtered ? (
              <>
                <EmptyState
                  icon="search"
                  title={t('catalog.notFoundTitle')}
                  description={t('catalog.notFoundText')}
                />
                <Link to="/" className={linkClass}>
                  {t('catalog.showAll')}
                </Link>
              </>
            ) : (
              <EmptyState
                icon="calendar"
                title={t('catalog.emptyTitle')}
                description={t('catalog.emptyText')}
              />
            )}
          </>
        )}
      </div>
    </main>
  )
}
