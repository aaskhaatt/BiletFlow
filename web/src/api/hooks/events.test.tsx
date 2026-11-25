import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { useTranslation } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { errorMessageKey } from '@/api/error-codes'
import { useEvent, useEvents, useTicketTypes } from '@/api/hooks/events'
import { eventListItem, eventResponse, ticketType } from '@/test/fixtures'
import { apiUrl, server } from '@/test/msw-server'
import { renderWithProviders } from '@/test/render'

// Example of a component test: the real hook, the API mocked with MSW.

function EventTitles() {
  const { t } = useTranslation()
  const events = useEvents({ limit: 2 })
  if (events.isPending) return <p>…</p>
  if (events.isError) return <p role="alert">{t(errorMessageKey(events.error))}</p>
  return (
    <section>
      <p>{events.data.total}</p>
      <ul>
        {events.data.items.map((event) => (
          <li key={event.id}>
            {event.title} · {event.organizer_name} · {event.min_price} · {event.tickets_remaining}
          </li>
        ))}
      </ul>
    </section>
  )
}

const event = (id: number, title: string) => eventListItem({ id, title })

describe('useEvents', () => {
  it('shows the events and the total from GET /events', async () => {
    let limit: string | null = null
    server.use(
      http.get(apiUrl('/events'), ({ request }) => {
        limit = new URL(request.url).searchParams.get('limit')
        return HttpResponse.json({
          items: [event(1, 'Astana Jazz Night'), event(2, 'Almaty Tech Meetup')],
          total: 7,
        })
      }),
    )

    renderWithProviders(<EventTitles />)

    // The card fields of GET /events: organizer, lowest price and tickets left
    expect(
      await screen.findByText('Astana Jazz Night · TOO Dala Events · 8000 · 217'),
    ).toBeVisible()
    expect(screen.getByText(/^Almaty Tech Meetup/)).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(limit).toBe('2')
  })

  it('shows the translated error, not the server message', async () => {
    server.use(
      http.get(apiUrl('/events'), () =>
        HttpResponse.json(
          { error: 'DatabaseUnavailableError', message: 'Database Unavailable', fields: null },
          { status: 503 },
        ),
      ),
    )

    renderWithProviders(<EventTitles />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сервис временно недоступен. Попробуйте позже.',
    )
    expect(screen.queryByText(/Database Unavailable/)).not.toBeInTheDocument()
  })
})

function TicketTypeList({ eventId }: { eventId: number }) {
  const types = useTicketTypes(eventId)
  if (!types.data) return <p>…</p>
  return (
    <ul>
      {types.data.map((type) => (
        <li key={type.id}>
          {type.name}: {type.on_sale ? 'on sale' : type.unavailable_reason}, {type.available} left,
          up to {type.max_now}
        </li>
      ))}
    </ul>
  )
}

describe('useTicketTypes', () => {
  it('returns the availability the server computed for each ticket type', async () => {
    server.use(
      http.get(apiUrl('/events/1/ticket-types'), () =>
        HttpResponse.json([
          ticketType({ id: 1, name: 'Standard', available: 190, max_now: 10 }),
          ticketType({
            id: 2,
            name: 'VIP',
            available: 0,
            max_now: 0,
            on_sale: false,
            unavailable_reason: 'sold_out',
          }),
        ]),
      ),
    )

    renderWithProviders(<TicketTypeList eventId={1} />)

    expect(await screen.findByText('Standard: on sale, 190 left, up to 10')).toBeInTheDocument()
    expect(screen.getByText('VIP: sold_out, 0 left, up to 0')).toBeInTheDocument()
  })
})

function EventStatus({ eventId }: { eventId: number }) {
  const event = useEvent(eventId)
  if (!event.data) return <p>…</p>
  return (
    <p>
      {event.data.status} {event.data.cancelled_at}
    </p>
  )
}

describe('useEvent', () => {
  it('answers a once-published cancelled event with its status and date', async () => {
    server.use(
      http.get(apiUrl('/events/1'), () =>
        HttpResponse.json(
          eventResponse({ status: 'cancelled', cancelled_at: '2026-11-20T12:00:00+05:00' }),
        ),
      ),
    )

    renderWithProviders(<EventStatus eventId={1} />)

    expect(await screen.findByText('cancelled 2026-11-20T12:00:00+05:00')).toBeInTheDocument()
  })
})
