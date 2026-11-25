import { Outlet, type RouteObject } from 'react-router'
import DevUiPage from '@/pages/dev/DevUiPage'
import NotFoundPage from '@/pages/NotFoundPage'
import PlaceholderPage from '@/pages/PlaceholderPage'
import RouteErrorPage from '@/pages/RouteErrorPage'

// A page that a later phase (W3-W12) builds. The id names the screen.
function stub(id: string) {
  return { element: <PlaceholderPage id={id} /> }
}

/*
 * Every page of the app. Guards (RequireAuth, RequireOrganizer, RequireAdmin)
 * and the area layouts arrive in W3.11 and W2.11.
 *
 * The backend puts some of these addresses in emails and QR codes, so they must
 * not change: /verify-email, /reset-password, /orders/:orderId, /events/:eventId
 * (also with ?campaign=C-...), /support/:caseId.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Outlet />,
    errorElement: <RouteErrorPage />,
    children: [
      // Public
      { index: true, ...stub('catalog') },
      { path: 'events/:eventId', ...stub('event') },
      { path: 'login', ...stub('login') },
      { path: 'register', ...stub('register') },
      { path: 'forgot-password', ...stub('forgot-password') },
      { path: 'verify-email', ...stub('verify-email') },
      { path: 'reset-password', ...stub('reset-password') },

      // Attendee (signed in)
      { path: 'events/:eventId/checkout', ...stub('checkout') },
      { path: 'orders/:orderId', ...stub('order') },
      { path: 'tickets/:ticketId', ...stub('ticket') },
      { path: 'my/tickets', ...stub('my-tickets') },
      { path: 'my/orders', ...stub('my-orders') },
      { path: 'support', ...stub('my-support-cases') },
      { path: 'support/new', ...stub('new-support-case') },
      { path: 'support/:caseId', ...stub('support-case') },
      { path: 'become-organizer', ...stub('become-organizer') },

      // Organizer
      {
        path: 'organizer',
        children: [
          { index: true, ...stub('organizer-events') },
          { path: 'events/new', ...stub('organizer-event-new') },
          { path: 'events/:eventId', ...stub('organizer-event') },
          { path: 'events/:eventId/edit', ...stub('organizer-event-edit') },
          { path: 'events/:eventId/attendees', ...stub('organizer-event-attendees') },
          { path: 'events/:eventId/orders', ...stub('organizer-event-orders') },
          { path: 'events/:eventId/history', ...stub('organizer-event-history') },
          { path: 'campaigns', ...stub('organizer-campaigns') },
          { path: 'campaigns/new', ...stub('organizer-campaign-new') },
          { path: 'campaigns/:campaignId', ...stub('organizer-campaign') },
          { path: 'analytics', ...stub('organizer-analytics') },
          { path: 'support', ...stub('organizer-support-inbox') },
          { path: 'profile', ...stub('organizer-profile') },
        ],
      },

      // Platform admin
      {
        path: 'admin',
        children: [
          { index: true, ...stub('admin-moderation') },
          { path: 'reports', ...stub('admin-reports') },
          { path: 'paid-sales', ...stub('admin-paid-sales') },
          { path: 'organizers', ...stub('admin-organizers') },
          { path: 'users', ...stub('admin-users') },
          { path: 'events', ...stub('admin-events') },
          { path: 'events/:eventId/history', ...stub('admin-event-history') },
          { path: 'orders', ...stub('admin-orders') },
          { path: 'payments', ...stub('admin-payments') },
          { path: 'refunds', ...stub('admin-refunds') },
          { path: 'campaigns', ...stub('admin-campaigns') },
          { path: 'support', ...stub('admin-support-inbox') },
          { path: 'settings', ...stub('admin-settings') },
        ],
      },

      // Developer pages (dev server only)
      ...(import.meta.env.DEV ? [{ path: 'dev/ui', element: <DevUiPage /> }] : []),

      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
