import { Outlet, type RouteObject } from 'react-router'
import SkipLink from '@/app/layouts/SkipLink'
import Skeleton from '@/components/Skeleton'
import NotFoundPage from '@/pages/NotFoundPage'
import PlaceholderPage from '@/pages/PlaceholderPage'
import RouteErrorPage from '@/pages/RouteErrorPage'

function workspaceLayout(area: 'organizer' | 'admin') {
  return async () => {
    const [{ default: WorkspaceLayout }, { default: SessionGate }] = await Promise.all([
      import('@/app/layouts/WorkspaceLayout'),
      import('@/auth/SessionGate'),
    ])
    return {
      element: (
        <SessionGate>
          <WorkspaceLayout area={area} />
        </SessionGate>
      ),
    }
  }
}

// A page that a later phase (W3-W12) builds. The id names the screen.
function stub(id: string) {
  return { element: <PlaceholderPage id={id} /> }
}

/*
 * Every page of the app. Guards (RequireAuth, RequireOrganizer, RequireAdmin)
 * arrive in W3.11.
 *
 * The backend puts some of these addresses in emails and QR codes, so they must
 * not change: /verify-email, /reset-password, /orders/:orderId, /events/:eventId
 * (also with ?campaign=C-...), /support/:caseId.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: (
      <>
        <SkipLink />
        <Outlet />
      </>
    ),
    hydrateFallbackElement: <Skeleton className="m-6 w-48" />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        lazy: async () => ({ Component: (await import('@/app/layouts/PublicLayout')).default }),
        children: [
          // Public
          { index: true, ...stub('catalog') },
          { path: 'events/:eventId', ...stub('event') },
          { path: 'login', ...stub('login') },
          { path: 'register', ...stub('register') },
          { path: 'forgot-password', ...stub('forgot-password') },
          { path: 'verify-email', ...stub('verify-email') },
          { path: 'reset-password', ...stub('reset-password') },

          {
            lazy: async () => ({ Component: (await import('@/auth/SessionGate')).default }),
            children: [
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
            ],
          },
        ],
      },

      // Organizer
      {
        path: 'organizer',
        lazy: workspaceLayout('organizer'),
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
        lazy: workspaceLayout('admin'),
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
      ...(import.meta.env.DEV
        ? [
            {
              path: 'dev/ui',
              hydrateFallbackElement: <Skeleton className="m-6 w-48" />,
              lazy: async () => ({ Component: (await import('@/pages/dev/DevUiPage')).default }),
            },
          ]
        : []),

      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
