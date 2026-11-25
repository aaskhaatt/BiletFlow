import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { routes } from '@/app/routes'
import { apiUrl, server } from '@/test/msw-server'
import { apiError } from '@/test/organizer-fixtures'
import { renderRoutes } from '@/test/render'
import { attendee, endSession, organizer, signIn, startSession } from '@/test/sign-in'
import { mockSupport, supportCase } from '@/test/support-fixtures'

function choose(label: string, option: string | RegExp) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: label }), { key: 'Enter' })
  fireEvent.keyDown(screen.getByRole('option', { name: option }), { key: 'Enter' })
}

function fill() {
  fireEvent.change(screen.getByLabelText('Тема'), { target: { value: '  Check payment  ' } })
  fireEvent.change(screen.getByLabelText('Сообщение'), {
    target: { value: '  The order is missing.  ' },
  })
}

describe('support forms and own cases', () => {
  beforeEach(startSession)
  afterEach(endSession)

  it.each([
    ['/orders/12', 'order_id=12', 'Заказ №12'],
    ['/tickets/14', 'ticket_id=14', 'Билет №14'],
  ])('links from %s and sends only the immutable context', async (start, query, label) => {
    const api = mockSupport()
    await signIn(attendee)
    const { router } = renderRoutes(routes, { route: start })
    const contact = await screen.findByRole(
      'link',
      { name: 'Связаться с поддержкой' },
      { timeout: 3000 },
    )
    expect(contact).toHaveAttribute('href', '/support/new?' + query)
    fireEvent.click(contact)
    expect(await screen.findByRole('heading', { name: 'Новое обращение' })).toBeInTheDocument()
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'О чём обращение' })).not.toBeInTheDocument()
    const submit = screen.getByRole('button', { name: 'Отправить' })
    fireEvent.click(submit)
    expect(await screen.findByLabelText('Тема')).toBeInvalid()
    expect(api.creates).toEqual([])
    choose('Категория', 'Оплата')
    fill()
    fireEvent.click(submit)
    await waitFor(() => expect(router.state.location.pathname).toBe('/support/51'))
    const [key, value] = query.split('=')
    expect(api.creates).toEqual([
      {
        kind: 'attendee',
        category: 'payment',
        subject: 'Check payment',
        message: 'The order is missing.',
        [key]: Number(value),
      },
    ])
  })

  it('chooses one of the signed-in user orders and maps server field errors', async () => {
    mockSupport()
    server.use(
      http.post(apiUrl('/support/cases'), () =>
        apiError('VALIDATION_ERROR', 422, { subject: 'English server message' }),
      ),
    )
    await signIn(attendee)
    renderRoutes(routes, { route: '/support/new' })
    await screen.findByRole('combobox', { name: 'О чём обращение' })
    choose('О чём обращение', /Заказ №12.*Jazz Festival/)
    choose('Категория', 'Оплата')
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))
    expect(await screen.findByText('Проверьте значение в этом поле')).toBeInTheDocument()
    expect(screen.getByLabelText('Тема')).toBeInvalid()
    expect(screen.queryByText('English server message')).not.toBeInTheDocument()
  })

  it('offers the catalog when a new viewer case has no context and there are no orders', async () => {
    mockSupport({ orders: [] })
    await signIn(attendee)
    renderRoutes(routes, { route: '/support/new' })
    expect(await screen.findByText(/У вас пока нет заказов/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Перейти в каталог' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('button', { name: 'Отправить' })).not.toBeInTheDocument()
  })

  it('shows viewer cases newest first and protects the platform form', async () => {
    mockSupport({
      initial: [
        supportCase({ subject: 'Older case' }),
        supportCase({
          id: 43,
          subject: 'Newer case',
          event_id: null,
          updated_at: '2026-11-26T12:00:00Z',
        }),
        supportCase({ id: 44, subject: 'Platform-only case', kind: 'platform' }),
      ],
    })
    await signIn(attendee)
    const { router } = renderRoutes(routes, { route: '/support' })
    expect(await screen.findByText('Newer case')).toBeInTheDocument()
    expect(
      within(screen.getByRole('main'))
        .getAllByRole('heading', { level: 2 })
        .map((element) => element.textContent),
    ).toEqual(['Newer case', 'Older case'])
    await router.navigate('/organizer/support/new')
    await waitFor(() => expect(router.state.location.pathname).toBe('/become-organizer'))
  })

  it('creates an organizer-only platform case with an optional owned event', async () => {
    const api = mockSupport()
    await signIn(organizer)
    const { router } = renderRoutes(routes, { route: '/organizer/support/new' })
    await screen.findByRole('radio', { name: 'Активация платных продаж' })
    fireEvent.click(screen.getByRole('radio', { name: 'Активация платных продаж' }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Событие' })).toBeEnabled())
    choose('Событие', 'Jazz Festival')
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/support/51'))
    expect(api.creates[0]).toMatchObject({ kind: 'platform', category: 'activation', event_id: 7 })
    expect(await screen.findByRole('link', { name: /Мои обращения к платформе/ })).toHaveAttribute(
      'href',
      '/organizer/support/mine',
    )
  })
})
