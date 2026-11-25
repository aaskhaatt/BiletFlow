import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { routes } from '@/app/routes'
import { renderRoutes } from '@/test/render'

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

describe('routes', () => {
  it.each(pages)('%s opens the "%s" page', async (address, page) => {
    const { container } = renderRoutes(routes, { route: address })
    await screen.findByRole('heading', { level: 1 })
    expect(container.querySelector('[data-route-id]')).toHaveAttribute('data-route-id', page)
  })

  it('shows the translated 404 page for an unknown address', async () => {
    renderRoutes(routes, { route: '/no/such/page' })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Страница не найдена' }),
    ).toBeInTheDocument()
  })
})
