import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { EventAnalyticsResponse } from '@/api/generated/model'
import { routes } from '@/app/routes'
import { apiUrl, server } from '@/test/msw-server'
import { eventOf, mockOrganizerApi, ticketTypeOf } from '@/test/organizer-fixtures'
import { renderRoutes } from '@/test/render'
import { endSession, organizer, signIn, startSession } from '@/test/sign-in'

function choose(label: string, option: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: label }), { key: 'Enter' })
  fireEvent.keyDown(screen.getByRole('option', { name: option }), { key: 'Enter' })
}

const completed = eventOf({
  id: 5,
  title: 'Jazz festival',
  lifecycle: 'completed',
  start_time: '2020-12-01T13:00:00Z',
  end_time: '2020-12-01T15:00:00Z',
})

const upcoming = eventOf({
  id: 6,
  title: 'New concert',
  lifecycle: 'upcoming',
  start_time: '2099-12-01T13:00:00Z',
})

const standard = ticketTypeOf({ id: 15, event_id: completed.id, name: 'Standard' })

function mockAnalytics() {
  mockOrganizerApi({
    events: [upcoming, completed],
    ticketTypes: { [completed.id]: [standard] },
  })
  const requests: URL[] = []
  server.use(
    http.get(apiUrl('/events/:eventId/analytics'), ({ request, params }) => {
      const eventId = Number(params.eventId)
      requests.push(new URL(request.url))
      const data: EventAnalyticsResponse = {
        event_id: eventId,
        currency: 'KZT',
        is_simulated: true,
        filters: { date_from: null, date_to: null, ticket_type_id: null },
        capacity: { sold: 2, capacity: 10, remaining: 7, held: 1, percent_sold: 20 },
        money: {
          gross: 10000,
          discounts: 1000,
          refunds: 1000,
          processing_fees: 270,
          net: 8730,
          paid_orders: 1,
        },
        check_in: {
          tickets: 2,
          checked_in: 1,
          absent: 1,
          percent: eventId === completed.id ? 50 : null,
        },
        sales_over_time: [{ date: '2026-12-02', orders: 1, tickets: 2, revenue: 9000 }],
        ticket_types: [
          {
            ticket_type_id: standard.id,
            name: standard.name,
            price: 5000,
            quantity: 10,
            sold: 2,
            revenue: 10000,
            held: 1,
            checked_in: 1,
          },
        ],
        campaigns:
          eventId === completed.id
            ? [
                {
                  campaign_id: 42,
                  code: 'JAZZ20',
                  name: 'Jazz campaign',
                  is_active: true,
                  link_opens: 17,
                  orders: 1,
                  tickets: 2,
                  gross: 10000,
                  discount: 1000,
                  net: 9000,
                },
              ]
            : [],
      }
      return HttpResponse.json(data)
    }),
  )
  return requests
}

describe('organizer analytics', () => {
  beforeEach(startSession)
  afterEach(endSession)

  it('opens the requested event and shows the sales, accessible daily data and attendance', async () => {
    const requests = mockAnalytics()
    await signIn(organizer)
    renderRoutes(routes, { route: '/organizer/analytics?event=5' })

    expect(await screen.findByRole('heading', { name: 'Сводка продаж' })).toBeInTheDocument()
    expect(requests[0].pathname).toBe('/events/5/analytics')
    expect(screen.getByRole('combobox', { name: 'Событие' })).toHaveTextContent('Jazz festival')
    expect(screen.getByText('2 / 10')).toBeInTheDocument()
    expect(screen.getByText(/8\s730\s₸/)).toBeInTheDocument()
    expect(document.querySelector('[data-slot="demo-banner"]')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Показать таблицу данных'))
    const daily = screen.getByRole('table', { name: 'Продажи по дням' })
    expect(within(daily).getByRole('rowheader')).toHaveTextContent('2 декабря')
    const table = screen.getByRole('table', { name: 'По типам билетов' })
    expect(within(table).getByText('Standard')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Посещаемость' })).toHaveTextContent(/50\s?%/)
    const campaignTable = screen.getByRole('table', { name: 'Кампании и промокоды' })
    const campaign = within(campaignTable).getByRole('row', { name: /Jazz campaign/ })
    expect(within(campaign).getByRole('link')).toHaveAttribute('href', '/organizer/campaigns/42')
    expect(within(campaign).getByText('JAZZ20')).toBeInTheDocument()
    expect(within(campaign).getByText('17')).toBeInTheDocument()
  })

  it('sends a whole Astana day, keeps the period on event changes and clears the old ticket type', async () => {
    const requests = mockAnalytics()
    await signIn(organizer)
    renderRoutes(routes, { route: '/organizer/analytics?event=5' })

    await screen.findByRole('heading', { name: 'Сводка продаж' })
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Тип билета' })).toBeEnabled())
    choose('Тип билета', 'Standard')
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('ticket_type_id')).toBe('15'))

    fireEvent.change(screen.getByLabelText('С даты'), { target: { value: '2026-12-31' } })
    fireEvent.change(screen.getByLabelText('По дату включительно'), {
      target: { value: '2026-12-30' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Применить период' }))
    expect(screen.getByLabelText('По дату включительно')).toBeInvalid()
    expect(requests.at(-1)?.searchParams.has('date_from')).toBe(false)

    fireEvent.change(screen.getByLabelText('По дату включительно'), {
      target: { value: '2026-12-31' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Применить период' }))
    await waitFor(() => {
      const query = requests.at(-1)?.searchParams
      expect(query?.get('date_from')).toBe('2026-12-31T00:00:00+05:00')
      expect(query?.get('date_to')).toBe('2027-01-01T00:00:00+05:00')
      expect(query?.get('ticket_type_id')).toBe('15')
    })

    choose('Событие', 'New concert')
    await waitFor(() => expect(requests.at(-1)?.pathname).toBe('/events/6/analytics'))
    expect(requests.at(-1)?.searchParams.has('ticket_type_id')).toBe(false)
    expect(requests.at(-1)?.searchParams.get('date_to')).toBe('2027-01-01T00:00:00+05:00')
    const attendance = await screen.findByRole('region', { name: 'Посещаемость' })
    expect(attendance).toHaveTextContent('Данные о посещаемости появятся в день события.')
    expect(attendance).toHaveTextContent('Доля посетивших—')
    expect(screen.getByRole('region', { name: 'Кампании и промокоды' })).toHaveTextContent(
      /пока нет/i,
    )
  })
})
