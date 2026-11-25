import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { routes } from '@/app/routes'
import { renderRoutes } from '@/test/render'
import { attendee, endSession, organizer, signIn, startSession } from '@/test/sign-in'
import { mockSupport, supportCase } from '@/test/support-fixtures'

const handler = { ...organizer, id: 2, organizer: { ...organizer.organizer!, user_id: 2 } }

describe('support case chat', () => {
  beforeEach(startSession)
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    endSession()
  })

  it('renders history and author messages, then reopens after the requester replies', async () => {
    const item = supportCase({
      status: 'waiting_for_customer',
      history: [
        {
          action: 'status_changed',
          created_at: '2026-11-25T10:22:00Z',
          actor_user_id: 2,
          from_status: 'open',
          to_status: 'waiting_for_customer',
        },
      ],
    })
    item.messages.push({
      id: 2,
      author_user_id: 2,
      body: 'We need your confirmation.',
      created_at: '2026-11-25T10:23:00Z',
    })
    const api = mockSupport({ initial: [item] })
    await signIn(attendee)
    renderRoutes(routes, { route: '/support/42' })
    const log = await screen.findByRole('log', { name: 'Переписка' }, { timeout: 3000 })
    expect(within(log).getByText('Please check my order.').closest('li')).toHaveAttribute(
      'data-message-owner',
      'self',
    )
    expect(within(log).getByText('We need your confirmation.').closest('li')).toHaveAttribute(
      'data-message-owner',
      'other',
    )
    expect(within(log).getByText(/Обращение принято/)).toBeInTheDocument()
    expect(within(log).getByText(/Статус изменён/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Взять себе' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Обновить' }))
    await waitFor(() => expect(api.caseRequests.length).toBeGreaterThan(1))

    fireEvent.change(screen.getByLabelText('Написать сообщение'), {
      target: { value: '  I confirm.  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))
    expect(await within(log).findByText('I confirm.')).toBeInTheDocument()
    expect(screen.getByText('Открыто')).toBeInTheDocument()
    expect(api.writes).toContainEqual({ action: 'message', payload: { body: 'I confirm.' } })
  })

  it('polls in ten seconds, pauses while hidden, and refreshes on return', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const api = mockSupport({ initial: [supportCase()] })
    await signIn(attendee)
    renderRoutes(routes, { route: '/support/42' })
    await screen.findByRole('log', undefined, { timeout: 3000 })
    const initialCount = api.caseRequests.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9999)
    })
    expect(api.caseRequests).toHaveLength(initialCount)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    await waitFor(() => expect(api.caseRequests).toHaveLength(initialCount + 1))

    await act(async () => {
      visibility.mockReturnValue('hidden')
      window.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(20_000)
    })
    expect(api.caseRequests).toHaveLength(initialCount + 1)
    await act(async () => {
      visibility.mockReturnValue('visible')
      window.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(api.caseRequests).toHaveLength(initialCount + 2))
  })

  it('assigns to the handler, changes status, and clears the assignment', async () => {
    const api = mockSupport({ initial: [supportCase()], userId: 2 })
    await signIn(handler)
    const { container } = renderRoutes(routes, { route: '/support/42' })
    const take = await screen.findByRole('button', { name: 'Взять себе' }, { timeout: 3000 })
    expect(container.querySelector('[data-slot="organizer-layout"]')).toBeInTheDocument()
    expect(screen.getByText('Пользователь №1', { selector: 'aside p' })).toBeInTheDocument()
    fireEvent.click(take)
    const remove = await screen.findByRole('button', { name: 'Снять с себя' })
    fireEvent.click(screen.getByRole('radio', { name: 'В работе' }))
    await waitFor(() => expect(screen.getByRole('radio', { name: 'В работе' })).toBeChecked())
    await waitFor(() => expect(remove).toBeEnabled())
    fireEvent.click(remove)
    expect(await screen.findByRole('button', { name: 'Взять себе' })).toBeInTheDocument()
    expect(api.writes).toEqual([
      { action: 'assign', payload: { user_id: 2 } },
      { action: 'status', payload: { status: 'in_progress' } },
      { action: 'assign', payload: { user_id: null } },
    ])
  })

  it('requires sign-in for the exact address used in email', async () => {
    const api = mockSupport()
    const { router } = renderRoutes(routes, { route: '/support/42' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(new URLSearchParams(router.state.location.search).get('returnTo')).toBe('/support/42')
    expect(api.caseRequests).toEqual([])
  })
})
