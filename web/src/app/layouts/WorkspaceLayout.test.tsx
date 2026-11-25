import { act, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CurrentUserResponse, SupportCaseSummary } from '@/api/generated/model'
import { routes } from '@/app/routes'
import i18n from '@/i18n'
import { apiUrl, server } from '@/test/msw-server'
import { mockOrganizerApi } from '@/test/organizer-fixtures'
import { renderRoutes } from '@/test/render'
import { attendee, endSession, organizer, signIn, startSession } from '@/test/sign-in'

function inboxOf(...statuses: string[]): SupportCaseSummary[] {
  return statuses.map((status, index) => ({
    id: index + 1,
    kind: 'attendee',
    category: 'other',
    subject: 'Question',
    status,
    requester_user_id: 2,
    event_id: 3,
    order_id: null,
    ticket_id: null,
    assigned_user_id: null,
    created_at: '2026-11-20T10:00:00Z',
    updated_at: '2026-11-20T10:00:00Z',
  }))
}

/** The inbox answers with `statuses`; the returned counter says how often it was asked. */
function mockInbox(...statuses: string[]) {
  const asked = { count: 0 }
  // The events list under the menu asks for its own data
  mockOrganizerApi({})
  server.use(
    http.get(apiUrl('/support/cases/inbox'), () => {
      asked.count++
      return HttpResponse.json(inboxOf(...statuses))
    }),
  )
  return asked
}

async function openOrganizer(route = '/organizer') {
  const result = renderRoutes(routes, { route })
  const menu = await screen.findByRole('navigation', { name: 'Организатор' })
  return { ...result, menu }
}

const named = (name: string): CurrentUserResponse => ({
  ...organizer,
  organizer: { ...organizer.organizer!, display_name: name },
})

describe('organizer shell', () => {
  beforeEach(startSession)
  afterEach(endSession)

  it('lists the five sections in the sidebar and marks the current one', async () => {
    mockInbox()
    await signIn(organizer)
    const { menu } = await openOrganizer('/organizer')

    const links = within(menu).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      'События',
      'Кампании',
      'Аналитика',
      'Поддержка',
      'Профиль и выплаты',
    ])
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/organizer',
      '/organizer/campaigns',
      '/organizer/analytics',
      '/organizer/support',
      '/organizer/profile',
    ])
    expect(within(menu).getByRole('link', { name: 'События' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(menu).getByRole('link', { name: 'Кампании' })).not.toHaveAttribute('aria-current')
  })

  it('keeps "События" marked on the pages of one event', async () => {
    mockInbox()
    await signIn(organizer)
    const { menu } = await openOrganizer('/organizer/events/new')

    expect(within(menu).getByRole('link', { name: 'События' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('marks the section of the current address, not "События", on a nested page', async () => {
    mockInbox()
    await signIn(organizer)
    const { menu } = await openOrganizer('/organizer/analytics')

    expect(within(menu).getByRole('link', { name: 'Аналитика' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(menu).getByRole('link', { name: 'События' })).not.toHaveAttribute('aria-current')
  })

  it('shows the public name, the role and the language under the menu', async () => {
    mockInbox()
    await signIn(named('Almaty Jazz Club'))
    const { container } = await openOrganizer()

    const card = container.querySelector('[data-slot="workspace-account"]')
    expect(card).toHaveTextContent('Almaty Jazz Club')
    expect(card).toHaveTextContent('Организатор · RU')

    await act(() => i18n.changeLanguage('en'))
    expect(card).toHaveTextContent('Organizer · EN')
  })

  it('shows the email when the organizer has no public name', async () => {
    mockInbox()
    await signIn(organizer)
    const { container } = await openOrganizer()

    expect(container.querySelector('[data-slot="workspace-account"]')).toHaveTextContent(
      organizer.email,
    )
  })
})

describe('support badge in the sidebar', () => {
  beforeEach(startSession)
  afterEach(endSession)

  it('counts the cases that wait for the organizer', async () => {
    mockInbox('open', 'in_progress', 'waiting_for_customer', 'resolved', 'open')
    await signIn(organizer)
    const { menu } = await openOrganizer()

    const link = await within(menu).findByRole('link', {
      name: 'Поддержка, открытых обращений: 3',
    })
    // the number itself is for the eyes only: the screen reader gets the sentence
    expect(within(link).getByText('3')).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows no number when nothing waits', async () => {
    const asked = mockInbox('resolved', 'waiting_for_customer')
    await signIn(organizer)
    const { menu, queryClient } = await openOrganizer()

    await waitFor(() => expect(asked.count).toBe(1))
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    expect(within(menu).getByRole('link', { name: 'Поддержка' })).toHaveTextContent(/^Поддержка$/)
  })

  it('shows no number, and no error, when the inbox cannot be read', async () => {
    let asked = 0
    mockOrganizerApi({})
    server.use(
      http.get(apiUrl('/support/cases/inbox'), () => {
        asked++
        return HttpResponse.json(
          { error: 'DatabaseUnavailableError', message: 'down', fields: null },
          { status: 503 },
        )
      }),
    )
    await signIn(organizer)
    const { menu, queryClient } = await openOrganizer()

    await waitFor(() => expect(asked).toBe(1))
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    expect(within(menu).getByRole('link', { name: 'Поддержка' })).toHaveTextContent(/^Поддержка$/)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('is left out of the admin area, which does not ask for the inbox', async () => {
    const asked = mockInbox('open')
    await signIn({ ...attendee, is_platform_admin: true })
    const { container, queryClient } = renderRoutes(routes, { route: '/admin' })
    const menu = await screen.findByRole('navigation', { name: 'Администрирование' })

    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    expect(within(menu).getByRole('link', { name: 'Поддержка' })).toHaveTextContent(/^Поддержка$/)
    expect(container.querySelector('[data-slot="workspace-account"]')).toBeNull()
    expect(asked.count).toBe(0)
  })
})
