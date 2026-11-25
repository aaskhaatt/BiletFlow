import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { routes } from '@/app/routes'
import { renderRoutes } from '@/test/render'
import { attendee, endSession, organizer, signIn, startSession } from '@/test/sign-in'
import { mockSupport, supportCase } from '@/test/support-fixtures'

describe('support inboxes', () => {
  beforeEach(startSession)
  afterEach(endSession)

  it('uses organizer status filters and keeps the sidebar count across filters', async () => {
    const api = mockSupport({
      initial: [
        supportCase({ subject: 'Open ticket' }),
        supportCase({ id: 50, subject: 'In progress ticket', status: 'in_progress' }),
        supportCase({ id: 51, subject: 'Completed ticket', status: 'resolved' }),
      ],
    })
    await signIn(organizer)
    const { router } = renderRoutes(routes, { route: '/organizer/support' })
    await screen.findByRole('link', { name: 'Open ticket' }, { timeout: 3000 })
    const navigation = screen.getByRole('navigation', { name: 'Организатор' })
    expect(within(navigation).getByRole('link', { name: /Поддержка.*2/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Решено · 1' }))
    await waitFor(() =>
      expect(new URLSearchParams(router.state.location.search).get('status')).toBe('resolved'),
    )
    expect(await screen.findByRole('link', { name: 'Completed ticket' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open ticket' })).not.toBeInTheDocument()
    expect(api.inboxRequests.at(-1)?.searchParams.get('status')).toBe('resolved')
    expect(within(navigation).getByRole('link', { name: /Поддержка.*2/ })).toBeInTheDocument()
  })

  it('filters the admin inbox by kind and status and falls back when a user cannot be found', async () => {
    const api = mockSupport({
      initial: [
        supportCase({ subject: 'Attendee case' }),
        supportCase({
          id: 50,
          subject: 'Platform request',
          kind: 'platform',
          requester_user_id: 3,
          status: 'in_progress',
          event_id: null,
          order_id: null,
        }),
      ],
    })
    await signIn({ ...attendee, id: 4, is_platform_admin: true })
    renderRoutes(routes, { route: '/admin/support' })
    expect(
      await screen.findByText('buyer@example.test', undefined, { timeout: 3000 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Кто обратился' })).toBeInTheDocument()
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Вид' })).getByRole('button', {
        name: 'Организаторы',
      }),
    )
    expect(await screen.findByRole('link', { name: 'Platform request' })).toBeInTheDocument()
    expect(screen.getByText('Пользователь №3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'В работе · 1' }))
    await waitFor(() =>
      expect(api.inboxRequests.at(-1)?.searchParams.get('status')).toBe('in_progress'),
    )
    expect(api.inboxRequests.at(-1)?.searchParams.get('kind')).toBe('platform')
    expect(api.userRequests).toContain('3')
  })
})
