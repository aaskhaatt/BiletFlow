import { cn } from 'cn'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import { useEvents } from '@/api/hooks/events'
import EmptyState from '@/components/EmptyState'
import PublicEventFeedback from '@/components/PublicEventFeedback'
import { Button } from '@/components/ui/button'
import CatalogDateFilter from '@/pages/catalog/CatalogDateFilter'
import CatalogLoading from '@/pages/catalog/CatalogLoading'
import CatalogPagination from '@/pages/catalog/CatalogPagination'
import CatalogSearch from '@/pages/catalog/CatalogSearch'
import CategoryFilters from '@/pages/catalog/CategoryFilters'
import {
  catalogPageCount,
  catalogSearch,
  hasCatalogFilters,
  readCatalogFilters,
  toEventListParams,
} from '@/pages/catalog/catalog-search'
import EventCard from '@/pages/catalog/EventCard'

const linkClass = 'inline-flex min-h-11 items-center type-label text-brand underline'
const feedbackAction = 'h-13 w-full whitespace-normal min-[1024px]:w-auto min-[1024px]:min-w-50'

/**
 * The public event catalog (Figma "Зритель / Каталог событий"): search and
 * pages of published public events.
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
      className="viewer-container flex flex-1 flex-col gap-4 px-4 py-4 min-[1024px]:gap-6 min-[1024px]:px-0 min-[1024px]:pt-8 min-[1024px]:pb-16"
      data-route-id="catalog"
    >
      <h1 className="sr-only min-[1024px]:not-sr-only min-[1024px]:type-page-title">
        {t('catalog.desktopTitle')}
      </h1>

      <div className="flex flex-col gap-4 min-[1024px]:flex-row min-[1024px]:flex-wrap min-[1024px]:items-center">
        <CatalogSearch
          value={filters.q}
          onSearch={(q) => setSearchParams(catalogSearch(searchParams, { q }))}
        />
        {(events.isPending || events.isError || filtered || (events.data?.total ?? 0) > 0) && (
          <CategoryFilters
            category={filters.category}
            onChange={(category) => setSearchParams(catalogSearch(searchParams, { category }))}
          >
            <CatalogDateFilter
              dateFrom={filters.dateFrom}
              dateTo={filters.dateTo}
              onChange={(dateFrom, dateTo) =>
                setSearchParams(catalogSearch(searchParams, { dateFrom, dateTo }))
              }
            />
          </CategoryFilters>
        )}
      </div>

      {/* Focused after a page link, so reading goes on from the top of the list */}
      <div
        ref={resultsRef}
        tabIndex={-1}
        aria-busy={events.isFetching}
        className="flex flex-1 flex-col gap-4 outline-none min-[1024px]:gap-6"
      >
        {events.isPending ? (
          <CatalogLoading />
        ) : events.isError ? (
          <PublicEventFeedback
            desktopCatalog
            icon="warning"
            title={t('catalog.loadError')}
            description={t(errorMessageKey(events.error))}
            action={
              <Button
                type="button"
                className={feedbackAction}
                loading={events.isFetching}
                onClick={() => void events.refetch()}
              >
                {t('common.retry')}
              </Button>
            }
          />
        ) : (
          <>
            {/* Visible while searching; screen readers hear every new result */}
            <p
              role="status"
              className={cn(
                'type-small text-ink-2',
                (!filtered || !events.data.total) && 'sr-only',
                (filtered || events.data.total > 0) &&
                  'min-[1024px]:not-sr-only min-[1024px]:text-ink-muted',
              )}
            >
              {t('catalog.found', { total: events.data.total })}
              {events.data.total > 0 && (
                <span className="hidden min-[1024px]:inline"> · {t('catalog.nearestFirst')}</span>
              )}
            </p>

            {events.data.items.length > 0 ? (
              <>
                <ul
                  className={cn(
                    'grid gap-4 transition-opacity min-[1024px]:grid-cols-3 min-[1024px]:gap-6',
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
              <PublicEventFeedback
                desktopCatalog
                icon="search"
                title={t('catalog.notFoundTitle')}
                description={
                  filters.q && filters.category
                    ? t('catalog.notFoundForCategory', {
                        query: filters.q,
                        category: filters.category,
                      })
                    : filters.q
                      ? t('catalog.notFoundForQuery', { query: filters.q })
                      : t('catalog.notFoundText')
                }
                action={
                  <Button asChild variant="outline" className={feedbackAction}>
                    <Link to="/">{t('catalog.showAll')}</Link>
                  </Button>
                }
              />
            ) : (
              <PublicEventFeedback
                desktopCatalog
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
