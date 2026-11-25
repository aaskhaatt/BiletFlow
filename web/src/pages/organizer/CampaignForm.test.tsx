import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { routes } from '@/app/routes'
import { campaignOf, mockCampaignApi } from '@/test/campaign-fixtures'
import { apiUrl, server } from '@/test/msw-server'
import { apiError, eventOf, mockOrganizerApi, ticketTypeOf } from '@/test/organizer-fixtures'
import { renderRoutes } from '@/test/render'
import { endSession, organizer, signIn, startSession } from '@/test/sign-in'

const jazz = eventOf({ id: 1, title: 'Jazz night' })
const gone = eventOf({
  id: 2,
  title: 'Cancelled show',
  status: 'cancelled',
  lifecycle: 'cancelled',
})
const types = [
  ticketTypeOf({ id: 100, name: 'Standard', price: 5000 }),
  ticketTypeOf({ id: 101, name: 'VIP', price: 15000 }),
  ticketTypeOf({ id: 102, name: 'Press', price: 0 }),
]
const created = campaignOf({ id: 4, name: 'Student discount', code: 'STUDENT20' })

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

async function openNew(route = '/organizer/campaigns/new?event=1') {
  const result = renderRoutes(routes, { route })
  await screen.findByRole('heading', { level: 1, name: 'Новая кампания' })
  // The events come after the page: until then the event field is switched off
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Событие' })).toBeEnabled())
  return result
}

/** The create call (and the PATCH after it), recording what it was sent. */
function mockSave(
  calls: { create: unknown[]; patch: unknown[] },
  {
    answer = created,
    patch = () => HttpResponse.json({ ...created, is_active: false }),
  }: { answer?: typeof created; patch?: () => Response } = {},
) {
  mockOrganizerApi({ events: [jazz, gone], ticketTypes: { 1: types } })
  mockCampaignApi({ 1: [answer] })
  server.use(
    http.post(apiUrl('/events/:id/campaigns'), async ({ request }) => {
      calls.create.push(await request.json())
      return HttpResponse.json(answer, { status: 201 })
    }),
    http.patch(apiUrl('/campaigns/:id'), async ({ request }) => {
      calls.patch.push(await request.json())
      return patch()
    }),
  )
}

describe('new campaign form', () => {
  beforeEach(startSession)
  afterEach(endSession)

  it('shows the cards of the design: the settings, a QR that is not there yet, and empty results', async () => {
    mockOrganizerApi({ events: [jazz], ticketTypes: { 1: types } })
    await signIn(organizer)
    await openNew()

    expect(
      screen.getByRole('heading', { level: 2, name: 'Параметры кампании' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Промокод и QR-код для афиш, соцсетей и партнёров')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Процент' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Фиксированная сумма в ₸' })).not.toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Событие' })).toHaveTextContent('Jazz night')
    expect(screen.getByRole('heading', { level: 2, name: 'QR кампании' })).toBeInTheDocument()
    expect(screen.getByText('Не билет')).toBeInTheDocument()
    expect(screen.getByText('Это не пропуск на событие')).toBeInTheDocument()
    expect(screen.getByText('Появятся после активации кампании')).toBeInTheDocument()
    expect(screen.getByLabelText('Действует с')).toHaveAccessibleDescription('Время Астаны (UTC+5)')
    expect(screen.getByRole('button', { name: 'Сохранить выключенной' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Активировать кампанию' })).toBeInTheDocument()
  })

  it('offers the paid ticket types of the chosen event, never the free ones', async () => {
    mockOrganizerApi({ events: [jazz], ticketTypes: { 1: types } })
    await signIn(organizer)
    await openNew()

    expect(await screen.findByRole('checkbox', { name: /Standard · 5\s000\s₸/ })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /VIP · 15\s000\s₸/ })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Press/ })).not.toBeInTheDocument()
    expect(
      screen.getByText('Ничего не выбрано: скидка действует на все платные билеты события.'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: /Standard/ }))
    expect(screen.getByText(/Скидка действует только на выбранные типы/)).toBeInTheDocument()
  })

  it('warns when the event has no paid ticket type, and asks to choose an event first', async () => {
    mockOrganizerApi({ events: [jazz], ticketTypes: { 1: [types[2]] } })
    await signIn(organizer)
    await openNew('/organizer/campaigns/new')

    expect(screen.getByText('Сначала выберите событие.')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Событие' })).toHaveTextContent('Выберите событие')
  })

  it('says so when the event has no paid ticket type', async () => {
    mockOrganizerApi({ events: [jazz], ticketTypes: { 1: [types[2]] } })
    await signIn(organizer)
    await openNew()

    expect(await screen.findByText(/нет платных типов билетов/)).toBeInTheDocument()
  })

  it('offers to create an event when there is none to make a campaign for', async () => {
    mockOrganizerApi({ events: [gone] })
    await signIn(organizer)
    await openNew('/organizer/campaigns/new')

    expect(
      await screen.findByText(/Нет событий, для которых можно создать кампанию/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Создать событие' })).toHaveAttribute(
      'href',
      '/organizer/events/new',
    )
  })

  it('does not offer a cancelled event: it takes no campaign', async () => {
    mockOrganizerApi({ events: [jazz, gone] })
    await signIn(organizer)
    await openNew()

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Событие' }), { key: 'ArrowDown' })
    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(['Jazz night'])
  })

  it('checks the fields before sending anything', async () => {
    const calls = { create: [], patch: [] }
    mockSave(calls)
    await signIn(organizer)
    await openNew('/organizer/campaigns/new')

    type('Размер скидки', '150')
    type('Максимум использований', '0')
    type('Промокод', 'a!')
    type('Действует с', '2026-10-24T18:00')
    type('Действует до', '2026-10-01T00:00')
    click('Активировать кампанию')

    await waitFor(() => expect(screen.getByLabelText('Название кампании')).toBeInvalid())
    expect(screen.getByLabelText('Название кампании')).toHaveAccessibleDescription(
      'Введите название',
    )
    expect(screen.getByRole('combobox', { name: 'Событие' })).toHaveAccessibleDescription(
      'Выберите событие',
    )
    expect(screen.getByLabelText('Размер скидки')).toHaveAccessibleDescription(
      'Введите целое число от 1 до 100',
    )
    expect(screen.getByLabelText('Максимум использований')).toHaveAccessibleDescription(
      'Введите целое число, не меньше 1',
    )
    expect(screen.getByLabelText('Промокод')).toHaveAccessibleDescription(
      'От 3 до 32 символов: латинские буквы, цифры и «-»',
    )
    expect(screen.getByLabelText('Действует до')).toHaveAccessibleDescription(
      /Окончание должно быть позже начала/,
    )
    expect(calls.create).toEqual([])
  })

  it('takes a fixed amount in whole tenge', async () => {
    const calls = { create: [], patch: [] }
    mockSave(calls)
    await signIn(organizer)
    await openNew()

    fireEvent.click(screen.getByRole('radio', { name: 'Фиксированная сумма в ₸' }))
    expect(screen.getByLabelText('Размер скидки')).toHaveAccessibleDescription(
      'В тенге, целое число. Вычитается из суммы заказа',
    )
    type('Название кампании', 'Flyers')
    type('Размер скидки', '1500.5')
    click('Активировать кампанию')
    await waitFor(() => expect(screen.getByLabelText('Размер скидки')).toBeInvalid())
    expect(screen.getByLabelText('Размер скидки')).toHaveAccessibleDescription(
      'Введите целое число тенге, не меньше 1',
    )

    type('Размер скидки', '1500')
    click('Активировать кампанию')
    await waitFor(() => expect(calls.create).toHaveLength(1))
    expect(calls.create[0]).toMatchObject({ discount_type: 'fixed', discount_value: 1500 })
  })

  it('"Сгенерировать" puts an 8-character code in the field, and a code can be typed over it', async () => {
    mockOrganizerApi({ events: [jazz] })
    await signIn(organizer)
    await openNew()

    expect(screen.getByLabelText('Промокод')).toHaveAccessibleDescription(
      'Оставьте пустым: сервер создаст код из 8 символов',
    )
    click('Сгенерировать')
    const code = (screen.getByLabelText('Промокод') as HTMLInputElement).value
    expect(code).toMatch(/^[A-Z2-9]{8}$/)

    type('Промокод', 'student20')
    expect(screen.getByLabelText('Промокод')).toHaveValue('STUDENT20')
  })

  it('activates: sends the fields with the dates in Astana time, then opens the campaign with its QR', async () => {
    const calls = { create: [], patch: [] }
    mockSave(calls)
    await signIn(organizer)
    const { router } = await openNew()

    type('Название кампании', ' Student discount ')
    type('Размер скидки', '20')
    type('Максимум использований', '100')
    type('Действует с', '2026-10-01T00:00')
    type('Действует до', '2026-10-24T18:00')
    type('Промокод', 'student20')
    fireEvent.click(await screen.findByRole('checkbox', { name: /Standard/ }))
    click('Активировать кампанию')

    await waitFor(() => expect(router.state.location.pathname).toBe('/organizer/campaigns/4'))
    expect(calls.create).toEqual([
      {
        name: 'Student discount',
        discount_type: 'percent',
        discount_value: 20,
        code: 'STUDENT20',
        starts_at: '2026-10-01T00:00:00+05:00',
        ends_at: '2026-10-24T18:00:00+05:00',
        max_redemptions: 100,
        ticket_type_ids: [100],
      },
    ])
    expect(calls.patch).toEqual([])
    expect(await screen.findByText(/Кампания создана/)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Скачать PNG' })).toBeInTheDocument()
  })

  it('leaves the code out when the field is empty, so the server makes one', async () => {
    const calls = { create: [], patch: [] }
    mockSave(calls)
    await signIn(organizer)
    await openNew()

    type('Название кампании', 'Student discount')
    type('Размер скидки', '20')
    click('Активировать кампанию')

    await waitFor(() => expect(calls.create).toHaveLength(1))
    expect(calls.create[0]).toEqual({
      name: 'Student discount',
      discount_type: 'percent',
      discount_value: 20,
      ticket_type_ids: [],
    })
  })

  it('"Сохранить выключенной" creates the campaign and switches it off at once', async () => {
    const calls = { create: [], patch: [] }
    mockSave(calls)
    await signIn(organizer)
    const { router } = await openNew()

    type('Название кампании', 'Student discount')
    type('Размер скидки', '20')
    click('Сохранить выключенной')

    await waitFor(() => expect(router.state.location.pathname).toBe('/organizer/campaigns/4'))
    expect(calls.create).toHaveLength(1)
    expect(calls.patch).toEqual([{ is_active: false }])
    expect(await screen.findByText(/Кампания сохранена выключенной/)).toBeInTheDocument()
  })

  it('opens the campaign and says it is still on when it could not be switched off', async () => {
    const calls = { create: [], patch: [] }
    mockSave(calls, { patch: () => apiError('DatabaseUnavailableError', 503) })
    await signIn(organizer)
    const { router } = await openNew()

    type('Название кампании', 'Student discount')
    type('Размер скидки', '20')
    click('Сохранить выключенной')

    await waitFor(() => expect(router.state.location.pathname).toBe('/organizer/campaigns/4'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Кампания создана и пока включена: выключить её не удалось.',
    )
    expect(calls.create).toHaveLength(1)
  })

  it('puts a taken code under the code field, and creates nothing twice', async () => {
    const calls = { create: [], patch: [] }
    mockSave(calls)
    server.use(
      http.post(apiUrl('/events/:id/campaigns'), () =>
        apiError('PromoCodeAlreadyExistsError', 409),
      ),
    )
    await signIn(organizer)
    const { router } = await openNew()

    type('Название кампании', 'Student discount')
    type('Размер скидки', '20')
    type('Промокод', 'taken')
    click('Активировать кампанию')

    await waitFor(() => expect(screen.getByLabelText('Промокод')).toBeInvalid())
    expect(screen.getByLabelText('Промокод')).toHaveAccessibleDescription(
      'У этого события уже есть такой промокод.',
    )
    expect(router.state.location.pathname).toBe('/organizer/campaigns/new')
  })

  it('puts the fields of a 422 under the fields', async () => {
    const calls = { create: [], patch: [] }
    mockSave(calls)
    server.use(
      http.post(apiUrl('/events/:id/campaigns'), () =>
        apiError('VALIDATION_ERROR', 422, { discount_value: 'bad' }),
      ),
    )
    await signIn(organizer)
    await openNew()

    type('Название кампании', 'Student discount')
    type('Размер скидки', '20')
    click('Активировать кампанию')

    await waitFor(() => expect(screen.getByLabelText('Размер скидки')).toBeInvalid())
    expect(screen.getByLabelText('Размер скидки')).toHaveAccessibleDescription('Проверьте это поле')
  })

  it('shows any other error above the form', async () => {
    const calls = { create: [], patch: [] }
    mockSave(calls)
    server.use(
      http.post(apiUrl('/events/:id/campaigns'), () => apiError('InvalidEventStatusError', 409)),
    )
    await signIn(organizer)
    await openNew()

    type('Название кампании', 'Student discount')
    type('Размер скидки', '20')
    click('Активировать кампанию')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})

describe('campaign page (edit)', () => {
  beforeEach(startSession)
  afterEach(endSession)

  const running = campaignOf({
    id: 4,
    name: 'Student discount',
    code: 'STUDENT20',
    ticket_type_ids: [100],
    starts_at: '2026-10-01T00:00:00+05:00',
    ends_at: '2099-10-24T18:00:00+05:00',
    max_redemptions: 100,
    redemptions_count: 3,
    link_opens: 25,
    stats: { orders: 2, tickets: 3, gross: 15000, discount: 3000, net: 12000 },
  })

  async function openCampaign(over = {}, route = '/organizer/campaigns/4') {
    const campaign = { ...running, ...over }
    mockOrganizerApi({ events: [jazz], ticketTypes: { 1: types } })
    mockCampaignApi({ 1: [campaign] })
    await signIn(organizer)
    const result = renderRoutes(routes, { route })
    await screen.findByRole('heading', { level: 1, name: campaign.name })
    return { ...result, campaign }
  }

  it('shows the campaign: its status, code and event, and the discount, code and ticket types locked', async () => {
    await openCampaign()

    expect(document.querySelector('[data-slot="status-badge"]')).toHaveTextContent('Активна')
    expect(await screen.findByText('STUDENT20 · Jazz night')).toBeInTheDocument()
    expect(screen.getByText(/Скидку, промокод и типы билетов изменить нельзя/)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Процент' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Процент' })).toBeDisabled()
    expect(screen.getByLabelText('Размер скидки')).toHaveValue('20')
    expect(screen.getByLabelText('Размер скидки')).toBeDisabled()
    expect(screen.getByLabelText('Промокод')).toHaveValue('STUDENT20')
    expect(screen.getByLabelText('Промокод')).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Событие' })).toBeDisabled()
    expect(await screen.findByRole('checkbox', { name: /Standard/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Standard/ })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /VIP/ })).not.toBeChecked()
    expect(screen.getByLabelText('Название кампании')).toHaveValue('Student discount')
    expect(screen.getByLabelText('Максимум использований')).toHaveValue('100')
    expect(screen.getByLabelText('Действует с')).toHaveValue('2026-10-01T00:00')
    expect(screen.getByLabelText('Действует до')).toHaveValue('2099-10-24T18:00')
    expect(screen.getByRole('switch', { name: 'Кампания включена' })).toBeChecked()
    expect(screen.queryByRole('button', { name: 'Активировать кампанию' })).not.toBeInTheDocument()
  })

  it('shows the results: uses, tickets, discounts, revenue and link opens', async () => {
    await openCampaign()

    const results = screen.getByRole('region', { name: 'Результаты' })
    const row = (label: string) => within(results).getByText(label).closest('div')!
    expect(plain(row('Использований').textContent)).toContain('3 / 100')
    expect(plain(row('Продано билетов').textContent)).toContain('3')
    expect(plain(row('Сумма скидок').textContent)).toContain('3 000 ₸')
    expect(plain(row('Выручка по кампании').textContent)).toContain('15 000 ₸')
    expect(plain(row('Переходы по ссылке').textContent)).toContain('25')
  })

  it('shows the uses with no limit as a plain number, and a campaign without results as zeros', async () => {
    await openCampaign({
      max_redemptions: null,
      redemptions_count: 0,
      link_opens: 0,
      stats: { orders: 0, tickets: 0, gross: 0, discount: 0, net: 0 },
      ticket_type_ids: [],
    })

    const results = screen.getByRole('region', { name: 'Результаты' })
    expect(within(results).getByText('Использований').closest('div')).toHaveTextContent('0')
    expect(plain(within(results).getByText('Сумма скидок').closest('div')!.textContent)).toContain(
      '0 ₸',
    )
    expect(
      await screen.findByText('Ничего не выбрано: скидка действует на все платные билеты события.'),
    ).toBeInTheDocument()
  })

  it('sends only what changed, and says it is saved', async () => {
    const bodies: unknown[] = []
    await openCampaign()
    // Like the server, which answers with the change from then on
    let current = running
    server.use(
      http.patch(apiUrl('/campaigns/:id'), async ({ request }) => {
        const body = (await request.json()) as object
        bodies.push(body)
        current = { ...running, ...body, name: 'Spring offer' }
        return HttpResponse.json(current)
      }),
      http.get(apiUrl('/campaigns/4'), () => HttpResponse.json(current)),
    )

    type('Название кампании', ' Spring offer ')
    type('Максимум использований', '')
    type('Действует до', '')
    click('Сохранить изменения')

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({ name: 'Spring offer', max_redemptions: null, ends_at: null })
    expect(await screen.findByText('Изменения сохранены.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Spring offer' })).toBeInTheDocument()
  })

  it('sends nothing when nothing changed', async () => {
    const bodies: unknown[] = []
    await openCampaign()
    server.use(
      http.patch(apiUrl('/campaigns/:id'), async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(running)
      }),
    )

    click('Сохранить изменения')

    expect(await screen.findByText('Изменения сохранены.')).toBeInTheDocument()
    expect(bodies).toEqual([])
  })

  it('switches the campaign off, and the status follows', async () => {
    const bodies: unknown[] = []
    await openCampaign()
    let current = running
    server.use(
      http.patch(apiUrl('/campaigns/:id'), async ({ request }) => {
        bodies.push(await request.json())
        current = { ...running, is_active: false }
        return HttpResponse.json(current)
      }),
      http.get(apiUrl('/campaigns/4'), () => HttpResponse.json(current)),
    )

    fireEvent.click(screen.getByRole('switch', { name: 'Кампания включена' }))
    click('Сохранить изменения')

    await waitFor(() => expect(bodies).toEqual([{ is_active: false }]))
    await waitFor(() =>
      expect(document.querySelector('[data-slot="status-badge"]')).toHaveTextContent('Выключена'),
    )
    expect(
      await screen.findByText('Кампания выключена: ссылка открывает событие без скидки.'),
    ).toBeInTheDocument()
  })

  it('refuses a limit below the uses already taken, before sending it', async () => {
    const bodies: unknown[] = []
    await openCampaign()
    server.use(
      http.patch(apiUrl('/campaigns/:id'), async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(running)
      }),
    )

    type('Максимум использований', '2')
    click('Сохранить изменения')

    await waitFor(() => expect(screen.getByLabelText('Максимум использований')).toBeInvalid())
    expect(screen.getByLabelText('Максимум использований')).toHaveAccessibleDescription(
      'Лимит не может быть меньше уже взятых использований: 3',
    )
    expect(bodies).toEqual([])
  })

  it('shows the same problem under the limit when the server finds it first', async () => {
    await openCampaign()
    server.use(http.patch(apiUrl('/campaigns/:id'), () => apiError('InvalidCampaignError', 400)))

    type('Максимум использований', '50')
    click('Сохранить изменения')

    await waitFor(() => expect(screen.getByLabelText('Максимум использований')).toBeInvalid())
    expect(screen.getByLabelText('Максимум использований')).toHaveAccessibleDescription(
      'Лимит не может быть меньше уже взятых использований: 3',
    )
  })

  it('shows another error above the form', async () => {
    await openCampaign()
    server.use(
      http.patch(apiUrl('/campaigns/:id'), () => apiError('DatabaseUnavailableError', 503)),
    )

    type('Название кампании', 'Other')
    click('Сохранить изменения')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('says the campaign is not found', async () => {
    mockOrganizerApi({ events: [jazz] })
    mockCampaignApi({ 1: [] })
    await signIn(organizer)
    renderRoutes(routes, { route: '/organizer/campaigns/99' })

    expect(await screen.findByText('Кампания не найдена.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
  })

  it('opens the not-found page for an address that is not a campaign number', async () => {
    mockOrganizerApi({ events: [jazz] })
    await signIn(organizer)
    renderRoutes(routes, { route: '/organizer/campaigns/abc' })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Страница не найдена' }),
    ).toBeInTheDocument()
  })
})

// Intl writes numbers and money with no-break spaces; the matchers compare plain ones
function plain(text: string | null) {
  return (text ?? '').replace(/\s+/g, ' ')
}
