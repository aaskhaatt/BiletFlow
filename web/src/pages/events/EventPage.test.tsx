import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { TicketTypeWithAvailabilityUnavailableReason } from '@/api/generated/model'
import EventPage from '@/pages/events/EventPage'
import TicketChoices from '@/pages/events/TicketChoices'
import { eventResponse, ticketType } from '@/test/fixtures'
import { apiUrl, server } from '@/test/msw-server'
import { renderRoutes, renderWithProviders } from '@/test/render'

function renderEvent() {
  return renderRoutes([{ path: '/events/:eventId', element: <EventPage /> }], {
    route: '/events/1',
  })
}

/** The cancellation notice (the ticket list has its own "loading" status line). */
async function findNotice() {
  const notice = (await screen.findByText(/^(Событие отменено|Event cancelled)$/)).closest(
    '[data-slot="event-cancelled-notice"]',
  )
  if (!(notice instanceof HTMLElement)) throw new Error('No cancellation notice')
  return notice
}

function mockEvent(event = eventResponse()) {
  server.use(http.get(apiUrl('/events/1'), () => HttpResponse.json(event)))
}

function mockTicketTypes(types = [ticketType()]) {
  server.use(http.get(apiUrl('/events/1/ticket-types'), () => HttpResponse.json(types)))
}

describe('EventPage of a published event', () => {
  it('shows the date, the venue and the ticket choice', async () => {
    mockEvent()
    mockTicketTypes()

    renderEvent()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Astana Jazz Night' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Время Астаны (UTC+5)')).toHaveLength(1)
    expect(screen.getByText('Astana Opera')).toBeInTheDocument()
    expect(screen.getByText('Kunayev St 1')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Добавить билет «Standard»' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'К оформлению' })).toBeInTheDocument()
    expect(screen.queryByText('Событие отменено')).not.toBeInTheDocument()
  })

  it('keeps hidden ticket types off the public page', async () => {
    mockEvent()
    mockTicketTypes([
      ticketType(),
      ticketType({
        id: 2,
        name: 'Private offer',
        is_hidden: true,
        on_sale: false,
        max_now: 0,
        unavailable_reason: 'hidden',
      }),
    ])

    renderEvent()

    expect(await screen.findByRole('heading', { name: 'Standard' })).toBeInTheDocument()
    expect(screen.queryByText('Private offer')).not.toBeInTheDocument()
  })
})

describe('ticket availability reasons', () => {
  const reasons: Array<[NonNullable<TicketTypeWithAvailabilityUnavailableReason>, RegExp]> = [
    ['registration_closed', /^Регистрация закрыта$/],
    ['hidden', /^Этот тип билета скрыт\.$/],
    ['not_started', /^Начало продаж .+UTC\+5/],
    ['ended', /^Продажа завершена\.$/],
    ['paid_sales_inactive', /^Платные продажи для этого события ещё не активированы\.$/],
    ['sold_out', /^Распродано$/],
  ]

  it.each(reasons)('shows %s and disables selection', (reason, message) => {
    const ticket = ticketType({ on_sale: false, max_now: 0, unavailable_reason: reason })
    renderWithProviders(
      <TicketChoices
        tickets={[ticket]}
        selected={{ [ticket.id]: 5 }}
        canChoose
        registration="open"
        onChange={() => {}}
      />,
    )

    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('EventPage of a cancelled event', () => {
  const cancelled = eventResponse({
    status: 'cancelled',
    lifecycle: 'cancelled',
    cancelled_at: '2026-10-20T12:00:00+05:00',
  })
  const closedTicket = (id: number, name: string, price: number) =>
    ticketType({
      id,
      name,
      price,
      available: 0,
      max_now: 0,
      on_sale: false,
      unavailable_reason: 'ended',
    })

  it('shows the notice with the cancellation day instead of the ticket choice', async () => {
    mockEvent(cancelled)
    mockTicketTypes([
      closedTicket(1, 'Standard', 8000),
      closedTicket(2, 'Free entry', 0),
      ticketType({ id: 3, name: 'Hidden', is_hidden: true }),
    ])

    renderEvent()

    const notice = await findNotice()
    expect(within(notice).getByText('Событие отменено')).toBeInTheDocument()
    expect(notice).toHaveTextContent(
      'Организатор отменил событие 20 октября. Оплаченные заказы возвращены автоматически, бесплатные регистрации отменены, билеты недействительны.',
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Astana Jazz Night' })).toBeInTheDocument()
    // The status is color, icon and text: the badge carries its own text
    expect(screen.getByText('Отменено')).toBeInTheDocument()

    const tickets = within(await screen.findByRole('list'))
    expect(tickets.getAllByRole('listitem')).toHaveLength(2)
    expect(tickets.getByText('Standard')).toBeInTheDocument()
    expect(tickets.getByText(/^8\s000\s₸$/)).toBeInTheDocument()
    expect(tickets.getByText('Бесплатно')).toBeInTheDocument()
    expect(tickets.getAllByText('Продажа закрыта')).toHaveLength(2)
    expect(tickets.queryByText('Hidden')).not.toBeInTheDocument()

    expect(screen.queryByRole('button', { name: /Добавить билет/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'К оформлению' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Смотреть другие события' })).toHaveAttribute(
      'href',
      '/',
    )
    expect(screen.getByRole('link', { name: 'Мои заказы' })).toHaveAttribute('href', '/my/orders')
  })

  it('leaves the day out when the server sends no cancellation date', async () => {
    mockEvent({ ...cancelled, cancelled_at: null })
    mockTicketTypes([])

    renderEvent()

    expect(await findNotice()).toHaveTextContent('Организатор отменил событие. Оплаченные заказы')
  })

  it('is shown in the chosen language', async () => {
    const { default: i18n } = await import('@/i18n')
    await i18n.changeLanguage('en')
    mockEvent(cancelled)
    mockTicketTypes([closedTicket(1, 'Standard', 8000)])

    renderEvent()

    expect(await findNotice()).toHaveTextContent(
      'The organizer cancelled this event on 20 October.',
    )
    expect(await screen.findByText('Sales closed')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse other events' })).toBeInTheDocument()
  })

  it('still says "not found" when the server answers 404', async () => {
    server.use(
      http.get(apiUrl('/events/1'), () =>
        HttpResponse.json(
          { error: 'EventNotFoundError', message: 'Event Not Found', fields: null },
          { status: 404 },
        ),
      ),
    )

    renderEvent()

    expect(await screen.findByRole('heading', { name: 'Событие не найдено' })).toBeInTheDocument()
    expect(screen.queryByText('Событие отменено')).not.toBeInTheDocument()
  })
})
