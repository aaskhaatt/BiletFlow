import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { routes } from '@/app/routes'
import { formatDateShort, formatRevenue } from '@/lib/event-display'
import { apiUrl, server } from '@/test/msw-server'
import {
  apiError,
  eventOf,
  mockOrganizerApi,
  paidSalesOf,
  summaryOf,
  supportCaseOf,
} from '@/test/organizer-fixtures'
import { renderRoutes } from '@/test/render'
import { endSession, organizer, signIn, startSession } from '@/test/sign-in'

const jazz = eventOf({ id: 1, title: 'Jazz night' })
const meetup = eventOf({
  id: 2,
  title: 'Free meetup',
  start_time: '2026-12-10T18:30:00+05:00',
  end_time: '2026-12-10T20:00:00+05:00',
  capacity: 300,
  venue_name: null,
})
const live = eventOf({ id: 3, title: 'Live now', lifecycle: 'active' })
const old = eventOf({ id: 4, title: 'Old concert', lifecycle: 'completed' })
const gone = eventOf({
  id: 5,
  title: 'Cancelled show',
  status: 'cancelled',
  lifecycle: 'cancelled',
})
const draft = eventOf({ id: 6, title: 'Draft idea', status: 'draft', lifecycle: 'draft' })
const all = [jazz, meetup, live, old, gone, draft]

// Intl writes numbers and money with no-break spaces; the matchers compare plain ones
const plain = (text: string) => text.replace(/\s+/g, ' ')

const summaries = [
  summaryOf(jazz, { tickets_sold: 152, revenue: 488000, paid_sales_status: 'active' }),
  summaryOf(meetup, { tickets_sold: 12 }),
  summaryOf(live, { tickets_sold: 0 }),
  summaryOf(old, { tickets_sold: 0 }),
  summaryOf(gone),
  summaryOf(draft),
]

async function openList() {
  const result = renderRoutes(routes, { route: '/organizer' })
  await screen.findByRole('heading', { level: 1, name: 'События' })
  return result
}

describe('organizer events list', () => {
  beforeEach(startSession)
  afterEach(endSession)

  it('shows an event with its status, date, sales and revenue', async () => {
    mockOrganizerApi({ events: all, summaries })
    await signIn(organizer)
    await openList()

    const row = (await screen.findByRole('link', { name: 'Jazz night' })).closest('tr')!
    expect(row).toHaveTextContent(formatDateShort(jazz.start_time))
    expect(row).toHaveTextContent('Astana Hall · Публичное')
    expect(within(row).getByText('Предстоит')).toBeInTheDocument()
    expect(plain(within(row).getByLabelText('Продажи').getAttribute('aria-valuetext')!)).toBe(
      '152 / 200 · 76 %',
    )
    expect(row).toHaveTextContent(plain(formatRevenue(488000)))
    expect(
      within(row)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/organizer/events/1', '/organizer/events/1'])
  })

  it('shows no revenue for an event that earned nothing, and a missing venue', async () => {
    mockOrganizerApi({ events: all, summaries })
    await signIn(organizer)
    await openList()

    const row = (await screen.findByRole('link', { name: 'Free meetup' })).closest('tr')!
    expect(row).toHaveTextContent('Площадка не указана · Публичное')
    expect(row).toHaveTextContent('12 / 300 · 4 %')
    expect(row).not.toHaveTextContent('₸')
  })

  it('sorts the events into tabs with their counts, and shows drafts apart', async () => {
    mockOrganizerApi({ events: all, summaries })
    await signIn(organizer)
    await openList()

    const tabs = await screen.findAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent?.replace(/\s+/g, ' '))).toEqual([
      'Предстоящие· 2',
      'Активные· 1',
      'Завершённые· 1',
      'Отменённые· 1',
    ])
    expect(screen.getByRole('link', { name: 'Jazz night' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Live now' })).not.toBeInTheDocument()

    fireEvent.mouseDown(tabs[3], { button: 0 })
    fireEvent.click(tabs[3])
    expect(await screen.findByRole('link', { name: 'Cancelled show' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Jazz night' })).not.toBeInTheDocument()

    const drafts = screen.getByRole('heading', { level: 2, name: 'Черновики · 1' })
    expect(drafts).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Draft idea' })).toBeInTheDocument()
  })

  it('opens the first tab that has events', async () => {
    mockOrganizerApi({ events: [old, draft], summaries: [summaryOf(old), summaryOf(draft)] })
    await signIn(organizer)
    await openList()

    expect(await screen.findByRole('link', { name: 'Old concert' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Завершённые/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('adds up tickets, revenue and the cases that wait for an answer', async () => {
    const dayAgo = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString()
    const justNow = new Date().toISOString()
    mockOrganizerApi({
      events: all,
      summaries,
      inbox: [
        supportCaseOf(1, 'open', dayAgo),
        supportCaseOf(2, 'in_progress', justNow),
        supportCaseOf(3, 'open', justNow),
        supportCaseOf(4, 'resolved', dayAgo),
      ],
    })
    await signIn(organizer)
    await openList()

    const kpi = await screen.findByText('Продано билетов')
    const cards = kpi.closest('[data-slot="events-kpi"]')!
    await waitFor(() => expect(cards).toHaveTextContent('164'))
    expect(cards).toHaveTextContent(plain(formatRevenue(488000)))
    await waitFor(() => expect(cards).toHaveTextContent('Ждут ответа больше суток: 1'))
    expect(
      within(cards as HTMLElement).getByText('Открытые обращения').parentElement,
    ).toHaveTextContent('3')
  })

  it('warns about an event with a paid ticket type whose paid sales are not active', async () => {
    mockOrganizerApi({
      events: [jazz, meetup],
      summaries: [summaryOf(jazz), summaryOf(meetup)],
      paidSales: {
        1: paidSalesOf({ event_id: 1 }, { has_paid_ticket_type: true, terms_accepted: true }),
        2: paidSalesOf({ event_id: 2 }, { has_paid_ticket_type: false }),
      },
    })
    await signIn(organizer)
    await openList()

    const banner = await screen.findByText(/Платные продажи не активированы для «Jazz night»/)
    expect(banner).toHaveTextContent('Выполнено шагов: 2 из 5')
    expect(screen.getByRole('link', { name: 'Открыть чеклист' })).toHaveAttribute(
      'href',
      '/organizer/events/1',
    )
  })

  it('says nothing about paid sales when no event has a paid ticket type', async () => {
    mockOrganizerApi({ events: [meetup], summaries: [summaryOf(meetup)] })
    await signIn(organizer)
    const { queryClient } = await openList()

    await screen.findByRole('link', { name: 'Free meetup' })
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    expect(screen.queryByText(/Платные продажи не активированы/)).not.toBeInTheDocument()
  })

  it('offers to create the first event when there are none', async () => {
    mockOrganizerApi({ events: [], summaries: [] })
    await signIn(organizer)
    await openList()

    expect(await screen.findByText('Событий пока нет')).toBeInTheDocument()
    const links = screen.getAllByRole('link', { name: '+ Создать событие' })
    expect(links[0]).toHaveAttribute('href', '/organizer/events/new')
  })

  it('shows an error with a retry button when the events cannot be read', async () => {
    let failing = true
    mockOrganizerApi({ events: all, summaries })
    server.use(
      http.get(apiUrl('/events/me'), () =>
        failing ? apiError('DatabaseUnavailableError', 503) : Response.json(all),
      ),
    )
    await signIn(organizer)
    await openList()

    const retry = await screen.findByRole('button', { name: 'Повторить' })
    failing = false
    fireEvent.click(retry)
    expect(await screen.findByRole('link', { name: 'Jazz night' })).toBeInTheDocument()
  })

  it('keeps the list and warns when only the numbers cannot be read', async () => {
    mockOrganizerApi({ events: all, summaries })
    server.use(
      http.get(apiUrl('/events/me/summary'), () => apiError('DatabaseUnavailableError', 503)),
    )
    await signIn(organizer)
    await openList()

    expect(await screen.findByRole('link', { name: 'Jazz night' })).toBeInTheDocument()
    expect(await screen.findByText(/Не удалось загрузить продажи и выручку/)).toBeInTheDocument()
  })
})
