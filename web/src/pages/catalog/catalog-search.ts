// The catalog keeps its search, filters and page in the address
// (/?q=jazz&category=Music&page=2), so a search can be shared, reloaded and
// left with the Back button. These helpers turn the address into an API call.
import type { EventListParams } from '@/api/hooks/events'
import { fromEventLocalInput, isCalendarDay, nextCalendarDay } from '@/lib/event-time'

/** Events on one catalog page. */
export const CATALOG_PAGE_SIZE = 6

/** The longest search text the API accepts. */
export const SEARCH_MAX_LENGTH = 100

export type CatalogFilters = {
  /** Text in the title, description, venue or address; '' means none. */
  q: string
  /** A category exactly as GET /events/categories gives it; '' means all. */
  category: string
  /** First day, YYYY-MM-DD in Astana time; '' means none. */
  dateFrom: string
  /** Last day (included), YYYY-MM-DD in Astana time; '' means none. */
  dateTo: string
  /** 1 is the first page. */
  page: number
}

/** Reads the address. Anything invalid counts as not set. */
export function readCatalogFilters(search: URLSearchParams): CatalogFilters {
  const day = (name: string) => {
    const value = search.get(name) ?? ''
    return isCalendarDay(value) ? value : ''
  }
  const page = Number(search.get('page'))

  return {
    q: (search.get('q') ?? '').trim().slice(0, SEARCH_MAX_LENGTH),
    category: (search.get('category') ?? '').trim(),
    dateFrom: day('date_from'),
    dateTo: day('date_to'),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

/** True when the visitor narrowed the catalog down. */
export function hasCatalogFilters(filters: CatalogFilters): boolean {
  return Boolean(filters.q || filters.category || filters.dateFrom || filters.dateTo)
}

/**
 * The GET /events parameters for these filters. Days are whole days in Astana
 * time: the API's date_to means "starts before", so the last day becomes the
 * midnight that ends it.
 */
export function toEventListParams(filters: CatalogFilters): EventListParams {
  const params: EventListParams = {
    limit: CATALOG_PAGE_SIZE,
    offset: (filters.page - 1) * CATALOG_PAGE_SIZE,
  }
  if (filters.q) params.q = filters.q
  if (filters.category) params.category = filters.category
  if (filters.dateFrom) params.date_from = fromEventLocalInput(`${filters.dateFrom}T00:00`)
  if (filters.dateTo)
    params.date_to = fromEventLocalInput(`${nextCalendarDay(filters.dateTo)}T00:00`)
  return params
}

/**
 * The address after a change, as a search string ("?q=jazz" or ""). Empty
 * values and page 1 are left out. Changing the search or a filter returns to
 * the first page unless the change names a page itself.
 */
export function catalogSearch(current: URLSearchParams, change: Partial<CatalogFilters>): string {
  const next = new URLSearchParams(current)
  if (!('page' in change)) next.delete('page')

  for (const [key, value] of Object.entries(change)) {
    const name = key === 'dateFrom' ? 'date_from' : key === 'dateTo' ? 'date_to' : key
    if (value === '' || value === 1 || value === undefined) next.delete(name)
    else next.set(name, String(value))
  }

  const text = next.toString()
  return text ? `?${text}` : ''
}

/** How many pages `total` events take; at least 1. */
export function catalogPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE))
}
