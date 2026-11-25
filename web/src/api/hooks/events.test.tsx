import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { useTranslation } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { errorMessageKey } from '@/api/error-codes'
import { useEvents } from '@/api/hooks/events'
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
          <li key={event.id}>{event.title}</li>
        ))}
      </ul>
    </section>
  )
}

const event = (id: number, title: string) => ({
  id,
  organizer_id: 1,
  title,
  description: null,
  start_time: '2026-12-01T19:00:00+05:00',
  end_time: '2026-12-01T22:00:00+05:00',
  status: 'published',
  visibility: 'public',
  lifecycle: 'upcoming',
})

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

    expect(await screen.findByText('Astana Jazz Night')).toBeInTheDocument()
    expect(screen.getByText('Almaty Tech Meetup')).toBeInTheDocument()
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
