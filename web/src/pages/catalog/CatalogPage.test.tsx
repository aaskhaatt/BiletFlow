import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import type { EventPage } from '@/api/generated/model'
import CatalogPage from '@/pages/catalog/CatalogPage'
import { eventListItem } from '@/test/fixtures'
import { apiUrl, server } from '@/test/msw-server'
import { renderRoutes } from '@/test/render'

const event = (id: number, title: string) => eventListItem({ id, title })

/** Answers GET /events and keeps the query of every request. */
function mockEvents(respond: (query: URLSearchParams) => EventPage) {
  const requests: URLSearchParams[] = []
  server.use(
    http.get(apiUrl('/events'), ({ request }) => {
      const query = new URL(request.url).searchParams
      requests.push(query)
      return HttpResponse.json(respond(query))
    }),
  )
  return requests
}

function renderCatalog(route = '/') {
  return renderRoutes(
    [
      { path: '/', element: <CatalogPage /> },
      { path: '/events/:eventId', element: <p>Event page</p> },
    ],
    { route },
  )
}

describe('CatalogPage', () => {
  beforeEach(() => {
    server.use(
      http.get(apiUrl('/events/categories'), () => HttpResponse.json(['Music', 'Sport'])),
      http.get(apiUrl('/events/:id/ticket-types'), () => HttpResponse.json([])),
    )
  })

  it('filters by a category from the API and returns to the first page', async () => {
    const requests = mockEvents(() => ({ items: [event(1, 'Astana Jazz Night')], total: 1 }))
    const { router } = renderCatalog('/?q=jazz&page=2')
    fireEvent.click(await screen.findByRole('button', { name: 'Music' }))
    await waitFor(() => expect(requests.at(-1)?.get('category')).toBe('Music'))
    expect(router.state.location.search).toBe('?q=jazz&category=Music')
    expect(screen.getByRole('button', { name: 'Music' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Все' }))
    await waitFor(() => expect(router.state.location.search).toBe('?q=jazz'))
  })

  it('shows the first page of events with their Astana time and venue', async () => {
    const requests = mockEvents(() => ({
      items: [event(1, 'Astana Jazz Night'), event(2, 'Almaty Tech Meetup')],
      total: 2,
    }))

    renderCatalog()

    const link = await screen.findByRole('link', { name: 'Astana Jazz Night' })
    expect(link).toHaveAttribute('href', '/events/1')
    expect(screen.getByRole('link', { name: 'Almaty Tech Meetup' })).toBeInTheDocument()
    expect(screen.getAllByText(/19:00 · Время Астаны \(UTC\+5\)/)).toHaveLength(2)
    expect(screen.getAllByText('Astana Opera, Kunayev St 1')).toHaveLength(2)
    expect(screen.getByRole('heading', { level: 1, name: 'События в Астане' })).toBeInTheDocument()
    // one page: no page links
    expect(screen.queryByRole('navigation', { name: 'Страницы каталога' })).not.toBeInTheDocument()
    expect(Object.fromEntries(requests[0])).toEqual({ limit: '6', offset: '0' })
  })

  it('searches on Enter and keeps the search in the address', async () => {
    const requests = mockEvents((query) =>
      query.get('q') === 'jazz'
        ? { items: [event(1, 'Astana Jazz Night')], total: 1 }
        : { items: [event(1, 'Astana Jazz Night'), event(2, 'Almaty Tech Meetup')], total: 2 },
    )
    const { router } = renderCatalog('/?page=2')

    await screen.findByText('Astana Jazz Night')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск событий' }), {
      target: { value: '  jazz ' },
    })
    fireEvent.submit(screen.getByRole('search'))

    expect(await screen.findByText('Найдено событий: 1')).toBeInTheDocument()
    expect(screen.queryByText('Almaty Tech Meetup')).not.toBeInTheDocument()
    // a new search starts on the first page
    expect(router.state.location.search).toBe('?q=jazz')
    expect(Object.fromEntries(requests.at(-1)!)).toEqual({ q: 'jazz', limit: '6', offset: '0' })
  })

  it('shows every event again when the search field is emptied', async () => {
    mockEvents(() => ({ items: [event(1, 'Astana Jazz Night')], total: 1 }))
    const { router } = renderCatalog('/?q=jazz')

    const field = await screen.findByRole('searchbox', { name: 'Поиск событий' })
    expect(field).toHaveValue('jazz')
    fireEvent.change(field, { target: { value: '' } })

    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('opens the page from the address and moves between pages', async () => {
    const requests = mockEvents((query) => {
      const offset = Number(query.get('offset'))
      return { items: [event(offset + 1, `Event ${offset + 1}`)], total: 17 }
    })
    const { router } = renderCatalog('/?q=jazz&page=2')

    expect(await screen.findByText('Event 7')).toBeInTheDocument()
    expect(screen.getByText('Страница 2 из 3')).toBeInTheDocument()
    expect(Object.fromEntries(requests[0])).toEqual({ q: 'jazz', limit: '6', offset: '6' })

    fireEvent.click(screen.getByRole('link', { name: 'Вперёд' }))
    expect(await screen.findByText('Event 13')).toBeInTheDocument()
    expect(screen.getByText('Страница 3 из 3')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?q=jazz&page=3')
    // the last page has no "next"
    expect(screen.queryByRole('link', { name: 'Вперёд' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Назад' }))
    expect(await screen.findByText('Event 7')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?q=jazz&page=2')
  })

  it('says when nothing is found and links back to every event', async () => {
    mockEvents(() => ({ items: [], total: 0 }))
    renderCatalog('/?q=opera')

    expect(await screen.findByText('Ничего не найдено')).toBeInTheDocument()
    expect(
      screen.getByText('По запросу «opera» событий нет. Измените запрос или сбросьте фильтры.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Показать все события' })).toHaveAttribute('href', '/')
  })

  it('says when there are no events at all', async () => {
    mockEvents(() => ({ items: [], total: 0 }))
    renderCatalog()

    expect(await screen.findByText('Событий пока нет')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Показать все события' })).not.toBeInTheDocument()
  })

  it('links an old page address back to the first page', async () => {
    mockEvents(() => ({ items: [], total: 3 }))
    renderCatalog('/?q=jazz&page=9')

    expect(await screen.findByText('На этой странице событий нет')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'К первой странице' })).toHaveAttribute(
      'href',
      '/?q=jazz',
    )
  })

  it('shows the translated error and loads again on retry', async () => {
    let fail = true
    server.use(
      http.get(apiUrl('/events'), () =>
        fail
          ? HttpResponse.json(
              { error: 'DatabaseUnavailableError', message: 'Database Unavailable', fields: null },
              { status: 503 },
            )
          : HttpResponse.json({ items: [event(1, 'Astana Jazz Night')], total: 1 }),
      ),
    )
    renderCatalog()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сервис временно недоступен. Попробуйте позже.',
    )
    expect(
      screen.getByRole('heading', { name: 'Не удалось загрузить события' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Database Unavailable/)).not.toBeInTheDocument()

    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByText('Astana Jazz Night')).toBeInTheDocument()
  })
})
