import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { EventResponse, TicketTypeWithAvailability } from '@/api/generated/model'
import { routes } from '@/app/routes'
import { apiUrl, server } from '@/test/msw-server'
import {
  apiError,
  eventOf,
  mockOrganizerApi,
  paidSalesOf,
  summaryOf,
  ticketTypeOf,
} from '@/test/organizer-fixtures'
import { renderRoutes } from '@/test/render'
import { endSession, organizer, signIn, startSession } from '@/test/sign-in'

const live = eventOf({ id: 1, title: 'Jazz night' })

async function openEvent(id = 1) {
  const result = renderRoutes(routes, { route: `/organizer/events/${id}` })
  await screen.findByRole('heading', { level: 1, name: /\S/ })
  return result
}

const actionNames = () =>
  screen
    .getAllByRole('link')
    .concat(screen.getAllByRole('button'))
    .map((item) => item.textContent?.trim())

describe('organizer event page: header and actions', () => {
  beforeEach(startSession)
  afterEach(endSession)

  it.each([
    [
      'draft',
      { status: 'draft', lifecycle: 'draft' },
      ['Предпросмотр', 'Изменить', 'Опубликовать', 'Отменить событие'],
      ['Снять с публикации', 'Дублировать в черновик'],
      'Черновик',
    ],
    [
      'upcoming',
      {},
      ['Предпросмотр', 'Изменить', 'Снять с публикации', 'Отменить событие'],
      ['Опубликовать', 'Дублировать в черновик'],
      'Предстоит',
    ],
    [
      'active',
      { lifecycle: 'active' },
      ['Предпросмотр', 'Изменить', 'Снять с публикации', 'Отменить событие'],
      ['Опубликовать'],
      'Идёт сейчас',
    ],
    [
      'completed',
      { lifecycle: 'completed' },
      ['Предпросмотр', 'Дублировать в черновик'],
      ['Изменить', 'Опубликовать', 'Снять с публикации', 'Отменить событие'],
      'Завершено',
    ],
    [
      'cancelled',
      { status: 'cancelled', lifecycle: 'cancelled', cancelled_at: '2026-11-20T15:10:00+05:00' },
      ['Предпросмотр', 'Дублировать в черновик'],
      ['Изменить', 'Опубликовать', 'Снять с публикации', 'Отменить событие'],
      'Отменено',
    ],
  ] as [string, Partial<EventResponse>, string[], string[], string][])(
    'a %s event offers the right actions and shows its status',
    async (_name, over, present, absent, badge) => {
      const event = eventOf({ id: 1, venue_name: 'Astana Hall', ...over })
      mockOrganizerApi({ events: [event], summaries: [summaryOf(event)] })
      await signIn(organizer)
      await openEvent()

      const names = actionNames()
      for (const name of present) expect(names, name).toContain(name)
      for (const name of absent) expect(names, name).not.toContain(name)
      expect(document.querySelector('[data-slot="status-badge"]')).toHaveTextContent(badge)
    },
  )

  it('describes when and where, and the visibility', async () => {
    mockOrganizerApi({ events: [live], summaries: [summaryOf(live)] })
    await signIn(organizer)
    await openEvent()

    expect(screen.getByText(/19:00–22:00 \(UTC\+5\) · Astana Hall · Публичное/)).toBeInTheDocument()
    expect(screen.getByText(/Опубликовано, продажи идут/)).toBeInTheDocument()
  })

  it('links to the other sections of the event', async () => {
    mockOrganizerApi({ events: [live], summaries: [summaryOf(live)] })
    await signIn(organizer)
    await openEvent()

    const sections = within(screen.getByRole('navigation', { name: 'Разделы события' }))
    expect(sections.getByRole('link', { name: 'Обзор' })).toHaveAttribute('aria-current', 'page')
    expect(sections.getByRole('link', { name: 'Участники и заказы' })).toHaveAttribute(
      'href',
      '/organizer/events/1/attendees',
    )
    expect(sections.getByRole('link', { name: 'История' })).toHaveAttribute(
      'href',
      '/organizer/events/1/history',
    )
    expect(sections.getByRole('link', { name: 'Аналитика' })).toHaveAttribute(
      'href',
      '/organizer/analytics?event=1',
    )
    expect(sections.getByRole('link', { name: 'Кампании' })).toHaveAttribute(
      'href',
      '/organizer/campaigns?event=1',
    )
    expect(sections.getByRole('link', { name: 'Event Admin' })).toHaveAttribute(
      'href',
      '/organizer/events/1/staff',
    )
  })

  it('shows the numbers: sold of capacity, revenue and check-ins', async () => {
    mockOrganizerApi({
      events: [live],
      summaries: [summaryOf(live, { tickets_sold: 120, revenue: 0 })],
    })
    server.use(
      http.get(apiUrl('/events/1/check-in/stats'), () =>
        HttpResponse.json({
          registered: 120,
          checked_in: 7,
          not_checked_in: 113,
          cancelled: 0,
          refunded: 0,
        }),
      ),
    )
    await signIn(organizer)
    await openEvent()

    const kpi = document.querySelector('[data-slot="event-kpi"]')!
    await waitFor(() => expect(kpi).toHaveTextContent('120 / 200'))
    expect(kpi).toHaveTextContent('60 % мест занято')
    expect(kpi).toHaveTextContent('Платные продажи ещё не активированы')
    await waitFor(() => expect(kpi).toHaveTextContent('7 / 120'))
  })

  it('disables "Снять с публикации" while tickets are sold and says why', async () => {
    mockOrganizerApi({ events: [live], summaries: [summaryOf(live, { tickets_sold: 3 })] })
    await signIn(organizer)
    await openEvent()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Снять с публикации' })).toBeDisabled(),
    )
    expect(
      screen.getByText(/снять с публикации нельзя, можно отменить событие/),
    ).toBeInTheDocument()
  })

  it('shows what a draft misses and keeps "Опубликовать" off until it has a venue and an address', async () => {
    const draft = eventOf({
      id: 1,
      status: 'draft',
      lifecycle: 'draft',
      venue_name: null,
      venue_address: null,
    })
    mockOrganizerApi({ events: [draft], summaries: [summaryOf(draft)] })
    await signIn(organizer)
    await openEvent()

    const panel = await screen.findByText('Чтобы опубликовать событие, не хватает:')
    expect(panel.closest('[data-slot="publish-requirements"]')).toHaveTextContent(
      'названия площадкиадреса',
    )
    expect(screen.getByRole('link', { name: 'Заполнить в редакторе' })).toHaveAttribute(
      'href',
      '/organizer/events/1/edit',
    )
    expect(screen.getByRole('button', { name: 'Опубликовать' })).toBeDisabled()
  })

  it('publishes a ready draft', async () => {
    let event = eventOf({ id: 1, status: 'draft', lifecycle: 'draft' })
    let published = 0
    mockOrganizerApi({ events: [event], summaries: [summaryOf(event)] })
    server.use(
      http.get(apiUrl('/events/1/manage'), () => HttpResponse.json(event)),
      http.patch(apiUrl('/events/1/publish'), () => {
        published++
        event = eventOf({ id: 1, status: 'published', lifecycle: 'upcoming' })
        return HttpResponse.json(event)
      }),
    )
    await signIn(organizer)
    await openEvent()

    fireEvent.click(await screen.findByRole('button', { name: 'Опубликовать' }))

    await waitFor(() =>
      expect(document.querySelector('[data-slot="status-badge"]')).toHaveTextContent('Предстоит'),
    )
    expect(published).toBe(1)
    expect(screen.queryByRole('button', { name: 'Опубликовать' })).not.toBeInTheDocument()
  })

  it('unpublishes after a confirmation, and suggests cancelling when tickets exist', async () => {
    let calls = 0
    mockOrganizerApi({ events: [live], summaries: [summaryOf(live)] })
    server.use(
      http.patch(apiUrl('/events/1/unpublish'), () => {
        calls++
        return apiError('EventHasTicketsError', 409)
      }),
    )
    await signIn(organizer)
    await openEvent()

    fireEvent.click(await screen.findByRole('button', { name: 'Снять с публикации' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Событие пропадёт из каталога')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Снять с публикации' }))

    expect(
      await screen.findByText(/есть проданные или забронированные билеты. Отмените событие./),
    ).toBeInTheDocument()
    expect(calls).toBe(1)
  })
})

describe('organizer event page: cancelling', () => {
  beforeEach(startSession)
  afterEach(endSession)

  function mockImpact() {
    server.use(
      http.get(apiUrl('/events/1/sales'), () =>
        HttpResponse.json({
          event_id: 1,
          currency: 'KZT',
          is_simulated: true,
          gross_sales: 0,
          processing_fees: 0,
          refunds: 0,
          discounts: 0,
          estimated_payout: 0,
          paid_orders: 2,
          ticket_types: [],
        }),
      ),
      http.get(apiUrl('/events/1/orders'), ({ request }) => {
        const status = new URL(request.url).searchParams.get('status')
        return HttpResponse.json({ items: [], total: status === 'confirmed' ? 5 : 1 })
      }),
    )
  }

  it('says what will happen to every kind of order before cancelling', async () => {
    mockOrganizerApi({ events: [live], summaries: [summaryOf(live)] })
    mockImpact()
    await signIn(organizer)
    await openEvent()

    fireEvent.click(await screen.findByRole('button', { name: 'Отменить событие' }))
    const dialog = await screen.findByRole('alertdialog')

    await waitFor(() => expect(dialog).toHaveTextContent('2 · вернём деньги'))
    expect(dialog).toHaveTextContent('3 · отменим')
    expect(dialog).toHaveTextContent('Неоплаченные брони1')
    expect(dialog).toHaveTextContent('Действие необратимо')
    expect(dialog).toHaveTextContent('Демо-режим')
  })

  it('cancels the event and shows it as cancelled', async () => {
    let event = live
    let calls = 0
    mockOrganizerApi({ events: [live], summaries: [summaryOf(live)] })
    mockImpact()
    server.use(
      http.get(apiUrl('/events/1/manage'), () => HttpResponse.json(event)),
      http.patch(apiUrl('/events/1/cancel'), () => {
        calls++
        event = eventOf({
          id: 1,
          status: 'cancelled',
          lifecycle: 'cancelled',
          cancelled_at: '2026-11-20T15:10:00+05:00',
        })
        return HttpResponse.json(event)
      }),
    )
    await signIn(organizer)
    await openEvent()

    fireEvent.click(await screen.findByRole('button', { name: 'Отменить событие' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отменить событие' }))

    await waitFor(() =>
      expect(document.querySelector('[data-slot="status-badge"]')).toHaveTextContent('Отменено'),
    )
    expect(calls).toBe(1)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByText(/Отменено 20 ноября в 15:10 \(UTC\+5\)/)).toBeInTheDocument()
  })

  it('keeps the dialog open and explains when the event has already ended', async () => {
    mockOrganizerApi({ events: [live], summaries: [summaryOf(live)] })
    mockImpact()
    server.use(
      http.patch(apiUrl('/events/1/cancel'), () => apiError('EventAlreadyEndedError', 409)),
    )
    await signIn(organizer)
    await openEvent()

    fireEvent.click(await screen.findByRole('button', { name: 'Отменить событие' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отменить событие' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Событие уже закончилось, отменить его нельзя.',
    )
  })

  it('leaves the event alone when the organizer keeps it', async () => {
    mockOrganizerApi({ events: [live], summaries: [summaryOf(live)] })
    mockImpact()
    await signIn(organizer)
    await openEvent()

    fireEvent.click(await screen.findByRole('button', { name: 'Отменить событие' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Не отменять' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })
})

const standard = ticketTypeOf({
  id: 100,
  name: 'Standard',
  price: 5000,
  quantity: 180,
  sold_count: 0,
})
const vip = ticketTypeOf({
  id: 101,
  name: 'VIP',
  price: 15000,
  quantity: 20,
  is_hidden: true,
  on_sale: false,
  unavailable_reason: 'hidden',
})
const pending = ticketTypeOf({
  id: 102,
  name: 'Paid early',
  price: 9000,
  quantity: 50,
  on_sale: false,
  unavailable_reason: 'paid_sales_inactive',
})

describe('organizer event page: ticket types', () => {
  beforeEach(startSession)
  afterEach(endSession)

  function mockTypes(types: TicketTypeWithAvailability[]) {
    mockOrganizerApi({
      events: [live],
      summaries: [summaryOf(live)],
      ticketTypes: { 1: types },
      paidSales: {
        1: paidSalesOf({ event_id: 1 }, { has_paid_ticket_type: true, terms_accepted: true }),
      },
    })
  }

  it('lists every type with its price, sales, window and status', async () => {
    mockTypes([standard, vip, pending])
    await signIn(organizer)
    await openEvent()

    const rowsOf = () => Array.from(document.querySelectorAll('[data-slot="ticket-type-row"]'))
    await waitFor(() => expect(rowsOf()).toHaveLength(3))
    const rows = rowsOf()
    expect(rows[0]).toHaveTextContent('Standard')
    expect(rows[0]).toHaveTextContent('продано 0 из 180')
    expect(rows[0]).toHaveTextContent('Продаётся')
    expect(rows[0]).toHaveTextContent('Продажи: 1 окт, 10:00 — 1 дек, 18:00 (UTC+5)')
    expect(rows[1]).toHaveTextContent('Скрыт')
    expect(rows[2]).toHaveTextContent('Ждёт активации')
    expect(screen.getByText('Сумма по типам: 250 мест из 200')).toBeInTheDocument()
  })

  it('hides and shows a type with the underscore addresses kept out of sight', async () => {
    const calls: string[] = []
    mockTypes([standard, vip])
    server.use(
      http.patch(apiUrl('/ticket_types/100/hide'), () => {
        calls.push('hide 100')
        return HttpResponse.json({ ...standard, is_hidden: true })
      }),
      http.patch(apiUrl('/ticket_types/101/unhide'), () => {
        calls.push('unhide 101')
        return HttpResponse.json({ ...vip, is_hidden: false })
      }),
    )
    await signIn(organizer)
    await openEvent()

    fireEvent.click(await screen.findByRole('button', { name: 'Скрыть Standard' }))
    await waitFor(() => expect(calls).toEqual(['hide 100']))
    fireEvent.click(screen.getByRole('button', { name: 'Показать VIP' }))
    await waitFor(() => expect(calls).toEqual(['hide 100', 'unhide 101']))
  })

  it('creates a ticket type and sends the price in whole tenge, the dates with their offset', async () => {
    const bodies: unknown[] = []
    mockTypes([standard])
    server.use(
      http.post(apiUrl('/events/1/ticket-type'), async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(ticketTypeOf({ id: 103, name: 'Student' }), { status: 201 })
      }),
    )
    await signIn(organizer)
    await openEvent()

    fireEvent.click(await screen.findByRole('button', { name: '+ Добавить тип билета' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Название'), { target: { value: ' Student ' } })
    fireEvent.change(within(dialog).getByLabelText('Цена, ₸'), { target: { value: '2500' } })
    fireEvent.change(within(dialog).getByLabelText('Количество'), { target: { value: '40' } })
    fireEvent.change(within(dialog).getByLabelText('Продажи с'), {
      target: { value: '2026-10-01T10:00' },
    })
    fireEvent.change(within(dialog).getByLabelText('Продажи до'), {
      target: { value: '2026-12-01T18:00' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({
      name: 'Student',
      price: 2500,
      quantity: 40,
      sales_start: '2026-10-01T10:00:00+05:00',
      sales_end: '2026-12-01T18:00:00+05:00',
      max_per_order: 10,
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('checks the form before sending anything', async () => {
    let posts = 0
    mockTypes([])
    server.use(
      http.post(apiUrl('/events/1/ticket-type'), () => {
        posts++
        return HttpResponse.json({})
      }),
    )
    await signIn(organizer)
    await openEvent()

    fireEvent.click(await screen.findByRole('button', { name: '+ Добавить тип билета' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Цена, ₸'), { target: { value: '12,5' } })
    fireEvent.change(within(dialog).getByLabelText('Количество'), { target: { value: '0' } })
    fireEvent.change(within(dialog).getByLabelText('Продажи до'), {
      target: { value: '2020-01-01T10:00' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(within(dialog).getByLabelText('Название')).toBeInvalid())
    expect(within(dialog).getByLabelText('Цена, ₸')).toHaveAccessibleDescription(
      'Введите целое число, не меньше 0',
    )
    expect(within(dialog).getByLabelText('Количество')).toHaveAccessibleDescription(
      'Введите целое число, не меньше 1',
    )
    expect(within(dialog).getByLabelText('Продажи до')).toHaveAccessibleDescription(
      'Окончание продаж должно быть позже начала',
    )
    expect(posts).toBe(0)
  })

  it('changes only what changed, and explains a quantity below the sold tickets', async () => {
    const bodies: unknown[] = []
    const sold = ticketTypeOf({
      id: 100,
      name: 'Standard',
      price: 5000,
      quantity: 180,
      sold_count: 30,
      description: 'Main hall',
    })
    mockTypes([sold])
    server.use(
      http.patch(apiUrl('/ticket-types/100'), async ({ request }) => {
        bodies.push(await request.json())
        return bodies.length === 1
          ? apiError('QuantityBelowSoldError', 409)
          : HttpResponse.json(sold)
      }),
    )
    await signIn(organizer)
    await openEvent()

    fireEvent.click(await screen.findByRole('button', { name: 'Изменить Standard' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Название')).toHaveValue('Standard')
    expect(within(dialog).getByLabelText('Количество')).toHaveAccessibleDescription(
      'Уже продано: 30',
    )

    fireEvent.change(within(dialog).getByLabelText('Цена, ₸'), { target: { value: '6000' } })
    fireEvent.change(within(dialog).getByLabelText('Описание (необязательно)'), {
      target: { value: '' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({ price: 6000, description: null })

    // the server refuses a quantity under the sold tickets: shown under the field
    await waitFor(() => expect(within(dialog).getByLabelText('Количество')).toBeInvalid())
    expect(within(dialog).getByLabelText('Количество')).toHaveAccessibleDescription(
      'Количество не может быть меньше уже проданных билетов.',
    )
  })

  it('hides a type from the dialog and refuses a quantity under the sold tickets before sending', async () => {
    const calls: string[] = []
    const sold = ticketTypeOf({ id: 100, name: 'Standard', quantity: 180, sold_count: 30 })
    mockTypes([sold])
    server.use(
      http.patch(apiUrl('/ticket-types/100'), () => {
        calls.push('patch')
        return HttpResponse.json(sold)
      }),
      http.patch(apiUrl('/ticket_types/100/hide'), () => {
        calls.push('hide')
        return HttpResponse.json({ ...sold, is_hidden: true })
      }),
    )
    await signIn(organizer)
    await openEvent()

    fireEvent.click(await screen.findByRole('button', { name: 'Изменить Standard' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Количество'), { target: { value: '10' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(within(dialog).getByLabelText('Количество')).toBeInvalid())
    expect(calls).toEqual([])

    fireEvent.change(within(dialog).getByLabelText('Количество'), { target: { value: '180' } })
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Скрыть тип' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(calls).toEqual(['hide']))
  })

  it('does not let anyone change the ticket types of a cancelled event', async () => {
    const gone = eventOf({ id: 1, status: 'cancelled', lifecycle: 'cancelled' })
    mockOrganizerApi({
      events: [gone],
      summaries: [summaryOf(gone)],
      ticketTypes: { 1: [standard] },
    })
    await signIn(organizer)
    await openEvent()

    expect(await screen.findByText(/типы билетов изменить нельзя/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Добавить тип билета' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Изменить Standard' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Скрыть Standard' })).toBeDisabled()
  })

  it('shows how far the paid sales activation has got', async () => {
    mockTypes([pending])
    await signIn(organizer)
    await openEvent()

    const card = (await screen.findByRole('heading', { name: 'Платные продажи' })).closest(
      'section',
    )!
    await waitFor(() => expect(card).toHaveTextContent('Выполнено шагов: 2 из 5'))
    expect(within(card).getAllByRole('listitem')).toHaveLength(5)
    expect(within(card).getByText(/Создан платный тип билета/)).toHaveTextContent('выполнено')
    expect(within(card).getByText(/Оплата сбора за активацию/)).toHaveTextContent('не выполнено')
  })
})

describe('organizer event page: duplicating', () => {
  beforeEach(startSession)
  afterEach(endSession)

  it('duplicates a finished event into a draft and opens the copy', async () => {
    const old = eventOf({ id: 1, title: 'Old concert', lifecycle: 'completed' })
    const copy = eventOf({
      id: 9,
      title: 'Old concert (copy)',
      status: 'draft',
      lifecycle: 'draft',
    })
    const bodies: unknown[] = []
    mockOrganizerApi({ events: [old, copy], summaries: [summaryOf(old), summaryOf(copy)] })
    server.use(
      http.post(apiUrl('/events/1/duplicate'), async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(copy, { status: 201 })
      }),
    )
    await signIn(organizer)
    const { router } = await openEvent()

    fireEvent.click(await screen.findByRole('button', { name: 'Дублировать в черновик' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Заказы, билеты, платежи, чек-ины и обращения не переносятся.')
    fireEvent.change(within(dialog).getByLabelText('Название копии (необязательно)'), {
      target: { value: 'Spring concert' },
    })
    fireEvent.change(within(dialog).getByLabelText('Новое начало (необязательно)'), {
      target: { value: '2027-03-01T19:00' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Создать копию' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/organizer/events/9'))
    expect(bodies).toEqual([{ title: 'Spring concert', start_time: '2027-03-01T19:00:00+05:00' }])
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Old concert (copy)' }),
    ).toBeInTheDocument()
  })

  it('sends nothing when the organizer fills nothing', async () => {
    const old = eventOf({ id: 1, lifecycle: 'completed' })
    const bodies: unknown[] = []
    mockOrganizerApi({ events: [old, eventOf({ id: 9 })], summaries: [summaryOf(old)] })
    server.use(
      http.post(apiUrl('/events/1/duplicate'), async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(eventOf({ id: 9 }), { status: 201 })
      }),
    )
    await signIn(organizer)
    await openEvent()

    fireEvent.click(await screen.findByRole('button', { name: 'Дублировать в черновик' }))
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Создать копию' }),
    )

    await waitFor(() => expect(bodies).toEqual([{}]))
  })
})

describe('organizer event page: errors', () => {
  beforeEach(startSession)
  afterEach(endSession)

  it('says so when the event does not exist or is not the organizer’s', async () => {
    mockOrganizerApi({ events: [], summaries: [] })
    await signIn(organizer)
    renderRoutes(routes, { route: '/organizer/events/77' })

    expect(await screen.findByText('Событие не найдено или недоступно.')).toBeInTheDocument()
    expect(
      within(screen.getByRole('navigation', { name: 'Путь по разделам' })).getByRole('link', {
        name: /События/,
      }),
    ).toHaveAttribute('href', '/organizer')
  })
})
