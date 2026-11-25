import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { setRequestSession } from '@/api/access-token'
import { routes } from '@/app/routes'
import { sessionStore } from '@/auth/session-store'
import { apiUrl, server } from '@/test/msw-server'
import { renderRoutes } from '@/test/render'

// The pages that are built already load data: answer with empty lists
beforeEach(() => {
  server.use(
    http.get(apiUrl('/events'), () => HttpResponse.json({ items: [], total: 0 })),
    http.get(apiUrl('/events/categories'), () => HttpResponse.json([])),
    http.get(apiUrl('/events/3'), () =>
      HttpResponse.json({
        id: 3,
        title: 'Event fixture',
        category: 'Music',
        status: 'published',
        start_time: '2030-11-25T12:00:00Z',
        end_time: '2030-11-25T14:00:00Z',
        lifecycle: 'upcoming',
        visibility: 'public',
      }),
    ),
    http.get(apiUrl('/events/3/ticket-types'), () => HttpResponse.json([])),
    http.get(apiUrl('/campaign-links/C-abc'), () =>
      HttpResponse.json({ event_id: 3, promo_code: null }),
    ),
  )
})

// Each address opens its page (W1.7). The ones the backend puts in emails and
// QR codes are listed first: they must never break.
const pages: [address: string, page: string][] = [
  ['/verify-email?token=abc', 'verify-email'],
  ['/reset-password?token=abc', 'reset-password'],
  ['/orders/12', 'order'],
  ['/events/3', 'event'],
  ['/events/3?campaign=C-abc', 'event'],
  ['/support/5', 'support-case'],
  ['/', 'catalog'],
  ['/login', 'login'],
  ['/register', 'register'],
  ['/forgot-password', 'forgot-password'],
  ['/events/3/checkout', 'checkout'],
  ['/tickets/9', 'ticket'],
  ['/my/tickets', 'my-tickets'],
  ['/my/orders', 'my-orders'],
  ['/support', 'my-support-cases'],
  ['/support/new', 'new-support-case'],
  ['/become-organizer', 'become-organizer'],
  ['/organizer', 'organizer-events'],
  ['/organizer/events/new', 'organizer-event-new'],
  ['/organizer/events/3', 'organizer-event'],
  ['/organizer/events/3/edit', 'organizer-event-edit'],
  ['/organizer/events/3/attendees', 'organizer-event-attendees'],
  ['/organizer/events/3/orders', 'organizer-event-orders'],
  ['/organizer/events/3/history', 'organizer-event-history'],
  ['/organizer/campaigns', 'organizer-campaigns'],
  ['/organizer/campaigns/new', 'organizer-campaign-new'],
  ['/organizer/campaigns/4', 'organizer-campaign'],
  ['/organizer/analytics', 'organizer-analytics'],
  ['/organizer/support', 'organizer-support-inbox'],
  ['/organizer/profile', 'organizer-profile'],
  ['/admin', 'admin-moderation'],
  ['/admin/reports', 'admin-reports'],
  ['/admin/paid-sales', 'admin-paid-sales'],
  ['/admin/organizers', 'admin-organizers'],
  ['/admin/users', 'admin-users'],
  ['/admin/events', 'admin-events'],
  ['/admin/events/3/history', 'admin-event-history'],
  ['/admin/orders', 'admin-orders'],
  ['/admin/payments?status=failed', 'admin-payments'],
  ['/admin/refunds', 'admin-refunds'],
  ['/admin/campaigns', 'admin-campaigns'],
  ['/admin/support', 'admin-support-inbox'],
  ['/admin/settings', 'admin-settings'],
]

const publicPages = new Set([
  'verify-email',
  'reset-password',
  'event',
  'catalog',
  'login',
  'register',
  'forgot-password',
])

describe('routes', () => {
  beforeEach(() => {
    sessionStore.clearSession()
    setRequestSession(sessionStore)
  })

  it.each(pages)('%s opens the "%s" page', async (address, page) => {
    if (page === 'verify-email') {
      server.use(
        http.post(apiUrl('/auth/verify-email'), () => HttpResponse.json({ message: 'Verified' })),
      )
    }
    if (!publicPages.has(page)) {
      const email = 'tester@example.test'
      server.use(
        http.post(apiUrl('/auth/login'), () =>
          HttpResponse.json({
            access_token: 'test-access',
            refresh_token: 'test-refresh',
            token_type: 'bearer',
          }),
        ),
        http.get(apiUrl('/auth/me'), () =>
          HttpResponse.json({
            id: 1,
            email,
            email_verified: true,
            is_platform_admin: true,
            is_event_staff: false,
            organizer: { id: 10, user_id: 1, status: 'approved' },
          }),
        ),
      )
      await sessionStore.login({ email, password: 'test-password' })
    }
    const { container } = renderRoutes(routes, { route: address })
    await screen.findByRole('heading', { level: 1 })
    if (page === 'verify-email') {
      await screen.findByText('Ваша почта подтверждена.')
    }
    expect(container.querySelector('[data-route-id]')).toHaveAttribute('data-route-id', page)
  })

  it('shows the translated 404 page for an unknown address', async () => {
    renderRoutes(routes, { route: '/no/such/page' })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Страница не найдена' }),
    ).toBeInTheDocument()
  })

  it('shows the shared error and retry button when a route fails', async () => {
    renderRoutes([
      {
        ...routes[0],
        loader: () => {
          throw new Error('Test route failure')
        },
      },
    ])

    expect(await screen.findByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Что-то пошло не так' }),
    ).toBeInTheDocument()
  })
})
