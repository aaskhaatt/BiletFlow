import { describe, expect, it } from 'vitest'
import {
  catalogPageCount,
  catalogSearch,
  readCatalogFilters,
  toEventListParams,
} from '@/pages/catalog/catalog-search'

const read = (search: string) => readCatalogFilters(new URLSearchParams(search))

describe('readCatalogFilters', () => {
  it('reads the search, category, days and page from the address', () => {
    expect(read('?q=+jazz+&category=Music&date_from=2026-12-01&date_to=2026-12-31&page=3')).toEqual(
      { q: 'jazz', category: 'Music', dateFrom: '2026-12-01', dateTo: '2026-12-31', page: 3 },
    )
  })

  it('treats a missing or invalid value as not set', () => {
    expect(read('?page=0&date_from=2026-02-30&date_to=tomorrow')).toEqual({
      q: '',
      category: '',
      dateFrom: '',
      dateTo: '',
      page: 1,
    })
    expect(read('?page=-2').page).toBe(1)
    expect(read('?page=1.5').page).toBe(1)
    expect(read('?page=abc').page).toBe(1)
  })

  it('cuts the search to the 100 characters the API accepts', () => {
    expect(read(`?q=${'a'.repeat(150)}`).q).toHaveLength(100)
  })
})

describe('toEventListParams', () => {
  it('asks for one page of events', () => {
    expect(toEventListParams(read(''))).toEqual({ limit: 10, offset: 0 })
    expect(toEventListParams(read('?q=jazz&category=Music&page=3'))).toEqual({
      q: 'jazz',
      category: 'Music',
      limit: 10,
      offset: 20,
    })
  })

  it('sends whole days in Astana time, the last day included', () => {
    expect(toEventListParams(read('?date_from=2026-12-01&date_to=2026-12-31'))).toMatchObject({
      date_from: '2026-12-01T00:00:00+05:00',
      date_to: '2027-01-01T00:00:00+05:00',
    })
  })
})

describe('catalogSearch', () => {
  const current = new URLSearchParams('q=jazz&category=Music&page=2')

  it('returns to the first page when the search changes', () => {
    expect(catalogSearch(current, { q: 'rock' })).toBe('?q=rock&category=Music')
  })

  it('leaves out empty values and page 1', () => {
    expect(catalogSearch(current, { q: '' })).toBe('?category=Music')
    expect(catalogSearch(current, { page: 1 })).toBe('?q=jazz&category=Music')
    expect(catalogSearch(new URLSearchParams('page=2'), { page: 1 })).toBe('')
  })

  it('keeps the search and filters when the page changes', () => {
    expect(catalogSearch(current, { page: 3 })).toBe('?q=jazz&category=Music&page=3')
  })
})

describe('catalogPageCount', () => {
  it('counts pages of 10, at least one', () => {
    expect(catalogPageCount(0)).toBe(1)
    expect(catalogPageCount(10)).toBe(1)
    expect(catalogPageCount(11)).toBe(2)
    expect(catalogPageCount(25)).toBe(3)
  })
})
