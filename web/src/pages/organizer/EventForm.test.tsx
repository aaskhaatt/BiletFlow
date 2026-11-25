import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { routes } from '@/app/routes'
import { apiUrl, server } from '@/test/msw-server'
import { apiError, eventOf, mockOrganizerApi, summaryOf } from '@/test/organizer-fixtures'
import { renderRoutes } from '@/test/render'
import { endSession, organizer, signIn, startSession } from '@/test/sign-in'

const saved = eventOf({ id: 7, title: 'Spring concert', status: 'draft', lifecycle: 'draft' })

async function openNew() {
  const result = renderRoutes(routes, { route: '/organizer/events/new' })
  await screen.findByRole('heading', { level: 1, name: 'Новое событие' })
  return result
}

async function openEdit(id = 1) {
  const result = renderRoutes(routes, { route: `/organizer/events/${id}/edit` })
  await screen.findByLabelText('Название события')
  return result
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

function fillRequired() {
  type('Название события', ' Spring concert ')
  type('Начало', '2026-12-01T19:00')
  type('Окончание', '2026-12-01T22:00')
}

/** The create call, recording what it was sent. */
function mockCreate(bodies: unknown[], created = saved) {
  mockOrganizerApi({ events: [created], summaries: [summaryOf(created)] })
  server.use(
    http.post(apiUrl('/events'), async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json(created)
    }),
  )
}

describe('new event form', () => {
  beforeEach(startSession)
  afterEach(endSession)

  it('shows the cards of the design and starts as a public draft', async () => {
    mockOrganizerApi({})
    await signIn(organizer)
    await openNew()

    for (const title of [
      'Основное',
      'Обложка',
      'Дата и место',
      'Окно регистрации',
      'Доступ',
      'Политика возврата',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument()
    }
    expect(screen.getByRole('radio', { name: /Публичное/ })).toBeChecked()
    expect(screen.getByText(/Часовой пояс события: Астана \(UTC\+5\)/)).toBeInTheDocument()
    expect(
      screen.getByText(/Типы билетов можно добавить сразу после сохранения/),
    ).toBeInTheDocument()
    expect(document.querySelector('[data-slot="status-badge"]')).toHaveTextContent('Черновик')
    expect(screen.getByRole('button', { name: 'Опубликовать' })).toBeInTheDocument()
  })

  it('asks for the name and the dates before sending anything', async () => {
    const bodies: unknown[] = []
    mockCreate(bodies)
    await signIn(organizer)
    await openNew()

    click('Сохранить черновик')

    await waitFor(() => expect(screen.getByLabelText('Название события')).toBeInvalid())
    expect(screen.getByLabelText('Название события')).toHaveAccessibleDescription(
      'Введите название события',
    )
    expect(screen.getByLabelText('Начало')).toHaveAccessibleDescription(/Укажите дату и время/)
    expect(screen.getByLabelText('Окончание')).toHaveAccessibleDescription(/Укажите дату и время/)
    expect(bodies).toEqual([])
  })

  it('refuses an end before the start, a capacity that is not a whole number, and a closing before the opening', async () => {
    const bodies: unknown[] = []
    mockCreate(bodies)
    await signIn(organizer)
    await openNew()

    type('Название события', 'Spring concert')
    type('Начало', '2026-12-01T19:00')
    type('Окончание', '2026-12-01T18:00')
    type('Вместимость', '0')
    type('Начало приёма регистраций', '2026-11-30T10:00')
    type('Конец приёма регистраций', '2026-11-29T10:00')
    click('Сохранить черновик')

    await waitFor(() => expect(screen.getByLabelText('Окончание')).toBeInvalid())
    expect(screen.getByLabelText('Окончание')).toHaveAccessibleDescription(
      /Окончание должно быть позже начала/,
    )
    expect(screen.getByLabelText('Вместимость')).toHaveAccessibleDescription(
      'Введите целое число, не меньше 1',
    )
    expect(screen.getByLabelText('Конец приёма регистраций')).toHaveAccessibleDescription(
      /Конец приёма должен быть позже начала/,
    )
    expect(bodies).toEqual([])
  })

  it('saves a draft: dates with their offset, empty fields left out, then opens the event page', async () => {
    const bodies: unknown[] = []
    mockCreate(bodies)
    await signIn(organizer)
    const { router } = await openNew()

    fillRequired()
    type('Вместимость', '200')
    type('Площадка', 'Astana Hall')
    click('Сохранить черновик')

    await waitFor(() => expect(router.state.location.pathname).toBe('/organizer/events/7'))
    expect(bodies).toEqual([
      {
        title: 'Spring concert',
        start_time: '2026-12-01T19:00:00+05:00',
        end_time: '2026-12-01T22:00:00+05:00',
        visibility: 'public',
        venue_name: 'Astana Hall',
        capacity: 200,
      },
    ])
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Spring concert' }),
    ).toBeInTheDocument()
  })

  it('sends the registration window, the refund policy and the chosen access', async () => {
    const bodies: unknown[] = []
    mockCreate(bodies)
    await signIn(organizer)
    await openNew()

    fillRequired()
    type('Начало приёма регистраций', '2026-10-01T10:00')
    type('Конец приёма регистраций', '2026-12-01T18:00')
    type('Условия возврата (необязательно)', 'Возврат за 3 дня')
    fireEvent.click(screen.getByRole('radio', { name: /По ссылке/ }))
    click('Сохранить черновик')

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({
      visibility: 'unlisted',
      registration_opens_at: '2026-10-01T10:00:00+05:00',
      registration_closes_at: '2026-12-01T18:00:00+05:00',
      refund_policy: 'Возврат за 3 дня',
    })
  })

  it('offers the private option and says who can see it', async () => {
    const bodies: unknown[] = []
    mockCreate(bodies)
    await signIn(organizer)
    await openNew()

    const card = screen.getByRole('radio', { name: /Приватное/ })
    expect(card).toHaveAccessibleDescription(
      'Видно только вам. Зрители не откроют его даже по ссылке.',
    )
    fillRequired()
    fireEvent.click(card)
    click('Сохранить черновик')

    await waitFor(() => expect(bodies[0]).toMatchObject({ visibility: 'private' }))
  })

  it('counts the refund policy and refuses more than 2000 characters', async () => {
    const bodies: unknown[] = []
    mockCreate(bodies)
    await signIn(organizer)
    await openNew()

    type('Условия возврата (необязательно)', 'x'.repeat(132))
    expect(document.querySelector('[data-slot="refund-counter"]')).toHaveTextContent('132 / 2000')

    fillRequired()
    type('Условия возврата (необязательно)', 'я'.repeat(2001))
    expect(document.querySelector('[data-slot="refund-counter"]')).toHaveTextContent('2001 / 2000')
    click('Сохранить черновик')

    await waitFor(() =>
      expect(screen.getByLabelText('Условия возврата (необязательно)')).toBeInvalid(),
    )
    expect(screen.getByLabelText('Условия возврата (необязательно)')).toHaveAccessibleDescription(
      'Не больше 2000 символов',
    )
    expect(bodies).toEqual([])
  })

  it('puts the server’s field problems under the fields and keeps what was typed', async () => {
    mockOrganizerApi({})
    server.use(
      http.post(apiUrl('/events'), () =>
        apiError('VALIDATION_ERROR', 422, { start_time: 'Input should be a valid datetime' }),
      ),
    )
    await signIn(organizer)
    await openNew()

    fillRequired()
    click('Сохранить черновик')

    await waitFor(() => expect(screen.getByLabelText('Начало')).toBeInvalid())
    expect(screen.getByLabelText('Название события')).toHaveValue(' Spring concert ')
  })

  it('shows the translated error of the server under the end date', async () => {
    mockOrganizerApi({})
    server.use(http.post(apiUrl('/events'), () => apiError('InvalidEventTimeError', 400)))
    await signIn(organizer)
    await openNew()

    fillRequired()
    click('Сохранить черновик')

    await waitFor(() => expect(screen.getByLabelText('Окончание')).toBeInvalid())
    expect(screen.getByLabelText('Окончание')).toHaveAccessibleDescription(/Проверьте даты события/)
  })

  it('publishes straight away when the venue and the address are filled', async () => {
    const calls: string[] = []
    mockCreate([])
    server.use(
      http.patch(apiUrl('/events/7/publish'), () => {
        calls.push('publish')
        return HttpResponse.json({ ...saved, status: 'published', lifecycle: 'upcoming' })
      }),
    )
    await signIn(organizer)
    const { router } = await openNew()

    fillRequired()
    type('Площадка', 'Astana Hall')
    type('Адрес', 'Abay 1')
    click('Опубликовать')

    await waitFor(() => expect(router.state.location.pathname).toBe('/organizer/events/7'))
    expect(calls).toEqual(['publish'])
  })

  it('asks for the venue and the address before publishing, and creates nothing', async () => {
    const bodies: unknown[] = []
    mockCreate(bodies)
    await signIn(organizer)
    await openNew()

    fillRequired()
    click('Опубликовать')

    await waitFor(() => expect(screen.getByLabelText('Площадка')).toBeInvalid())
    expect(screen.getByLabelText('Площадка')).toHaveAccessibleDescription('Укажите площадку')
    expect(screen.getByLabelText('Адрес')).toHaveAccessibleDescription('Укажите адрес')
    expect(bodies).toEqual([])
  })

  it('keeps the saved draft and explains when publishing fails, without creating a second event', async () => {
    const bodies: unknown[] = []
    mockCreate(bodies)
    server.use(
      http.patch(apiUrl('/events/7/publish'), () => apiError('EventNotReadyToPublishError', 400)),
    )
    await signIn(organizer)
    const { router } = await openNew()

    fillRequired()
    type('Площадка', 'Astana Hall')
    type('Адрес', 'Abay 1')
    click('Опубликовать')

    await waitFor(() => expect(router.state.location.pathname).toBe('/organizer/events/7/edit'))
    expect(
      await screen.findByText(/Черновик сохранён, но опубликовать событие не удалось/),
    ).toBeInTheDocument()
    expect(bodies).toHaveLength(1)
  })

  it('opens the preview of a saved draft', async () => {
    mockCreate([])
    await signIn(organizer)
    const { router } = await openNew()

    fillRequired()
    click('Предпросмотр')

    await waitFor(() => expect(router.state.location.pathname).toBe('/organizer/events/7/preview'))
  })
})

describe('cover of a new event', () => {
  beforeEach(startSession)
  afterEach(endSession)

  const png = (name = 'cover.png', bytes = 1_300_000) =>
    new File([new Uint8Array(bytes)], name, { type: 'image/png' })
  const pick = (file: File) =>
    fireEvent.change(screen.getByLabelText('Выбрать файл', { selector: 'input' }), {
      target: { files: [file] },
    })

  it('starts as a drop zone and keeps the chosen file until the event is saved', async () => {
    mockOrganizerApi({})
    await signIn(organizer)
    await openNew()

    expect(screen.getByText('Перетащите изображение сюда')).toBeInTheDocument()
    pick(png('cover-concert.png'))

    expect(await screen.findByText('cover-concert.png')).toBeInTheDocument()
    expect(screen.getByText(/PNG · 1,2 МБ · загрузится при сохранении/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Заменить' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(await screen.findByText('Перетащите изображение сюда')).toBeInTheDocument()
  })

  it('uploads the cover once the event exists', async () => {
    const uploads: string[] = []
    mockCreate([])
    server.use(
      http.put(apiUrl('/events/7/image'), ({ request }) => {
        uploads.push(request.method)
        return HttpResponse.json({ ...saved, image_url: 'https://cdn.test/cover.png' })
      }),
    )
    await signIn(organizer)
    const { router } = await openNew()

    pick(png())
    await screen.findByText('cover.png')
    fillRequired()
    click('Сохранить черновик')

    await waitFor(() => expect(router.state.location.pathname).toBe('/organizer/events/7'))
    expect(uploads).toEqual(['PUT'])
  })

  it('goes on to the editor with a note when the cover cannot be uploaded', async () => {
    mockCreate([])
    server.use(http.put(apiUrl('/events/7/image'), () => apiError('StorageUnavailableError', 503)))
    await signIn(organizer)
    const { router } = await openNew()

    pick(png())
    await screen.findByText('cover.png')
    fillRequired()
    click('Сохранить черновик')

    await waitFor(() => expect(router.state.location.pathname).toBe('/organizer/events/7/edit'))
    expect(
      await screen.findByText(/Событие сохранено, но обложку загрузить не удалось/),
    ).toBeInTheDocument()
  })

  it('names the file and its size when it is too big, and when it is not an image', async () => {
    mockOrganizerApi({})
    await signIn(organizer)
    await openNew()

    pick(png('poster-final.png', 8_200_000))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Файл «poster-final.png» весит 7,8 МБ. Максимальный размер — 5 МБ.',
    )
    expect(screen.getByText('Перетащите другое изображение сюда')).toBeInTheDocument()

    pick(new File(['x'], 'cover.heic', { type: 'image/heic' }))
    expect(await screen.findByText(/Файл «cover.heic» — не JPEG, PNG или WebP/)).toBeInTheDocument()
  })
})

describe('edit event form', () => {
  beforeEach(startSession)
  afterEach(endSession)

  const published = eventOf({
    id: 1,
    title: 'Jazz night',
    description: 'Live jazz',
    capacity: 200,
    refund_policy: 'No refunds',
  })

  function mockEdit(event = published) {
    const patches: unknown[] = []
    mockOrganizerApi({ events: [event], summaries: [summaryOf(event)] })
    server.use(
      http.patch(apiUrl('/events/1'), async ({ request }) => {
        patches.push(await request.json())
        return HttpResponse.json(event)
      }),
    )
    return patches
  }

  it('starts from the saved values', async () => {
    mockEdit()
    await signIn(organizer)
    await openEdit()

    expect(screen.getByLabelText('Название события')).toHaveValue('Jazz night')
    expect(screen.getByLabelText('Описание')).toHaveValue('Live jazz')
    expect(screen.getByLabelText('Вместимость')).toHaveValue('200')
    expect(screen.getByLabelText('Начало')).toHaveValue('2026-12-01T19:00')
    expect(screen.getByLabelText('Площадка')).toHaveValue('Astana Hall')
    expect(screen.getByLabelText('Условия возврата (необязательно)')).toHaveValue('No refunds')
    expect(screen.getByRole('combobox', { name: 'Категория' })).toHaveTextContent('Музыка')
    expect(screen.getByRole('button', { name: 'Сохранить изменения' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Опубликовать' })).not.toBeInTheDocument()
  })

  it('shows a category that is not on the list as it is', async () => {
    mockEdit(eventOf({ id: 1, category: 'Jazz & blues' }))
    await signIn(organizer)
    await openEdit()

    expect(screen.getByRole('combobox', { name: 'Категория' })).toHaveTextContent('Jazz & blues')
  })

  it('sends only the changed field, then opens the event page', async () => {
    const patches = mockEdit()
    await signIn(organizer)
    const { router } = await openEdit()

    type('Название события', 'Jazz night 2')
    click('Сохранить изменения')

    await waitFor(() => expect(router.state.location.pathname).toBe('/organizer/events/1'))
    expect(patches).toEqual([{ title: 'Jazz night 2' }])
  })

  it('clears the optional fields with null', async () => {
    const patches = mockEdit()
    await signIn(organizer)
    await openEdit()

    type('Описание', '')
    type('Вместимость', '')
    type('Условия возврата (необязательно)', '')
    click('Сохранить изменения')

    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]).toEqual({ description: null, capacity: null, refund_policy: null })
  })

  it('sends no request at all when nothing changed', async () => {
    const patches = mockEdit()
    await signIn(organizer)
    const { router } = await openEdit()

    click('Сохранить изменения')

    await waitFor(() => expect(router.state.location.pathname).toBe('/organizer/events/1'))
    expect(patches).toEqual([])
  })

  it('does not let a published event lose its venue or address', async () => {
    const patches = mockEdit()
    await signIn(organizer)
    await openEdit()

    type('Площадка', '')
    click('Сохранить изменения')

    await waitFor(() => expect(screen.getByLabelText('Площадка')).toBeInvalid())
    expect(patches).toEqual([])
  })

  it('removes the cover of the event right away', async () => {
    const deletes: string[] = []
    const withCover = eventOf({ id: 1, image_url: 'https://cdn.test/cover.png' })
    mockEdit(withCover)
    server.use(
      http.delete(apiUrl('/events/1/image'), () => {
        deletes.push('delete')
        return HttpResponse.json({ ...withCover, image_url: null })
      }),
    )
    await signIn(organizer)
    await openEdit()

    expect(screen.getByText('Обложка загружена')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }))

    await waitFor(() => expect(deletes).toEqual(['delete']))
  })

  it('refuses a cancelled event and offers a copy instead', async () => {
    const gone = eventOf({
      id: 1,
      title: 'Cancelled show',
      status: 'cancelled',
      lifecycle: 'cancelled',
    })
    mockEdit(gone)
    await signIn(organizer)
    renderRoutes(routes, { route: '/organizer/events/1/edit' })

    expect(await screen.findByText(/Событие отменено: изменения недоступны/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Дублировать в черновик' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Название события')).not.toBeInTheDocument()
    expect(within(document.body).getByRole('link', { name: 'К событию' })).toHaveAttribute(
      'href',
      '/organizer/events/1',
    )
  })
})
