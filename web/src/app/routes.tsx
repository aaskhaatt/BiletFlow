import { Outlet, type RouteObject } from 'react-router'
import SkipLink from '@/app/layouts/SkipLink'
import Skeleton from '@/components/Skeleton'
import NotFoundPage from '@/pages/NotFoundPage'
import RouteErrorPage from '@/pages/RouteErrorPage'

function workspaceLayout(area: 'organizer' | 'admin') {
  return async () => {
    const [{ default: WorkspaceLayout }, { RequireAuth, RequireOrganizer, RequireAdmin }] =
      await Promise.all([import('@/app/layouts/WorkspaceLayout'), import('@/auth/route-guards')])
    const WorkspaceGuard = area === 'organizer' ? RequireOrganizer : RequireAdmin
    return {
      element: (
        <RequireAuth>
          <WorkspaceGuard>
            <WorkspaceLayout area={area} />
          </WorkspaceGuard>
        </RequireAuth>
      ),
    }
  }
}

function adminList(page: keyof typeof import('@/pages/admin/AdminLists')) {
  return async () => ({ Component: (await import('@/pages/admin/AdminLists'))[page] })
}

function organizerOperations(section: 'attendees' | 'orders' | 'refunds' | 'staff') {
  return async () => {
    const { default: EventOperationsPage } = await import('@/pages/organizer/EventOperationsPage')
    return { Component: () => <EventOperationsPage section={section} /> }
  }
}

/*
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
        path: 'login',
        lazy: async () => ({ Component: (await import('@/pages/AuthPage')).LoginPage }),
      },
      {
        path: 'register',
        lazy: async () => ({ Component: (await import('@/pages/AuthPage')).RegisterPage }),
      },
      {
        path: 'forgot-password',
        lazy: async () => ({
          Component: (await import('@/pages/PasswordRecoveryPage')).ForgotPasswordPage,
        }),
      },
      {
        path: 'verify-email',
        lazy: async () => ({ Component: (await import('@/pages/VerifyEmailPage')).default }),
      },
      {
        path: 'reset-password',
        lazy: async () => ({
          Component: (await import('@/pages/PasswordRecoveryPage')).ResetPasswordPage,
        }),
      },
      {
        lazy: async () => ({ Component: (await import('@/app/layouts/PublicLayout')).default }),
        children: [
          // Public
          {
            index: true,
            lazy: async () => ({
              Component: (await import('@/pages/catalog/CatalogPage')).default,
            }),
          },
          {
            path: 'events/:eventId',
            lazy: async () => ({ Component: (await import('@/pages/events/EventPage')).default }),
            children: [
              {
                path: 'report',
                lazy: async () => ({
                  Component: (await import('@/pages/events/ReportEventPage')).default,
                }),
              },
            ],
          },

          {
            lazy: async () => ({ Component: (await import('@/auth/route-guards')).RequireAuth }),
            children: [
              // Attendee (signed in)
              {
                path: 'events/:eventId/checkout',
                lazy: async () => ({
                  Component: (await import('@/pages/events/CheckoutDraftPage')).default,
                }),
              },
              {
                path: 'orders/:orderId',
                lazy: async () => ({
                  Component: (await import('@/pages/attendee/OrderPage')).default,
                }),
              },
              {
                path: 'tickets/:ticketId',
                lazy: async () => ({
                  Component: (await import('@/pages/attendee/TicketPage')).default,
                }),
              },
              {
                path: 'my/tickets',
                lazy: async () => ({
                  Component: (await import('@/pages/attendee/OrderHistoryPage')).MyTicketsPage,
                }),
              },
              {
                path: 'my/orders',
                lazy: async () => ({
                  Component: (await import('@/pages/attendee/OrderHistoryPage')).MyOrdersPage,
                }),
              },
              {
                path: 'support',
                lazy: async () => ({
                  Component: (await import('@/pages/support/MySupportCasesPage'))
                    .MySupportCasesPage,
                }),
              },
              {
                path: 'support/new',
                lazy: async () => ({
                  Component: (await import('@/pages/support/SupportCaseForm')).NewSupportCasePage,
                }),
              },
              {
                path: 'become-organizer',
                lazy: async () => ({
                  Component: (await import('@/pages/BecomeOrganizerPage')).default,
                }),
              },
            ],
          },
        ],
      },

      {
        path: 'support/:caseId',
        lazy: async () => ({
          Component: (await import('@/pages/support/SupportCasePage')).default,
        }),
      },

      // Organizer
      {
        path: 'organizer',
        lazy: workspaceLayout('organizer'),
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import('@/pages/organizer/OrganizerEventsPage')).default,
            }),
          },
          {
            path: 'events/new',
            lazy: async () => ({
              Component: (await import('@/pages/organizer/EventFormPage')).NewEventPage,
            }),
          },
          {
            path: 'events/:eventId',
            lazy: async () => ({
              Component: (await import('@/pages/organizer/EventPage')).default,
            }),
          },
          {
            path: 'events/:eventId/edit',
            lazy: async () => ({
              Component: (await import('@/pages/organizer/EventFormPage')).EditEventPage,
            }),
          },
          { path: 'events/:eventId/attendees', lazy: organizerOperations('attendees') },
          { path: 'events/:eventId/orders', lazy: organizerOperations('orders') },
          { path: 'events/:eventId/refunds', lazy: organizerOperations('refunds') },
          { path: 'events/:eventId/staff', lazy: organizerOperations('staff') },
          {
            path: 'events/:eventId/history',
            lazy: async () => ({
              Component: (await import('@/pages/organizer/EventHistoryPage')).default,
            }),
          },
          {
            path: 'events/:eventId/preview',
            lazy: async () => ({
              Component: (await import('@/pages/organizer/EventPreviewPage')).default,
            }),
          },
          {
            path: 'campaigns',
            lazy: async () => ({
              Component: (await import('@/pages/organizer/CampaignsPage')).default,
            }),
          },
          {
            path: 'campaigns/new',
            lazy: async () => ({
              Component: (await import('@/pages/organizer/CampaignFormPage')).NewCampaignPage,
            }),
          },
          {
            path: 'campaigns/:campaignId',
            lazy: async () => ({
              Component: (await import('@/pages/organizer/CampaignFormPage')).EditCampaignPage,
            }),
          },
          {
            path: 'analytics',
            lazy: async () => ({
              Component: (await import('@/pages/organizer/OrganizerAnalyticsPage')).default,
            }),
          },
          {
            path: 'support',
            lazy: async () => ({
              Component: (await import('@/pages/support/SupportInboxPage')).default,
            }),
          },
          {
            path: 'support/new',
            lazy: async () => ({
              Component: (await import('@/pages/support/SupportCaseForm')).NewPlatformCasePage,
            }),
          },
          {
            path: 'support/mine',
            lazy: async () => ({
              Component: (await import('@/pages/support/MySupportCasesPage')).MyPlatformCasesPage,
            }),
          },
          {
            path: 'profile',
            lazy: async () => ({
              Component: (await import('@/pages/organizer/OrganizerProfilePage')).default,
            }),
          },
        ],
      },

      // Platform admin
      {
        path: 'admin',
        lazy: workspaceLayout('admin'),
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import('@/pages/admin/ModerationPage')).default,
            }),
          },
          {
            path: 'reports',
            lazy: async () => ({
              Component: (await import('@/pages/admin/AdminReportsPage')).default,
            }),
          },
          {
            path: 'paid-sales',
            lazy: async () => ({
              Component: (await import('@/pages/admin/AdminPaidSalesPage')).default,
            }),
          },
          { path: 'organizers', lazy: adminList('AdminOrganizersPage') },
          { path: 'users', lazy: adminList('AdminUsersPage') },
          { path: 'events', lazy: adminList('AdminEventsPage') },
          {
            path: 'events/:eventId/history',
            lazy: async () => {
              const { default: EventHistoryPage } =
                await import('@/pages/organizer/EventHistoryPage')
              return { Component: () => <EventHistoryPage admin /> }
            },
          },
          { path: 'orders', lazy: adminList('AdminOrdersPage') },
          { path: 'payments', lazy: adminList('AdminPaymentsPage') },
          { path: 'refunds', lazy: adminList('AdminRefundsPage') },
          { path: 'campaigns', lazy: adminList('AdminCampaignsPage') },
          {
            path: 'support',
            lazy: async () => {
              const { default: SupportInboxPage } = await import('@/pages/support/SupportInboxPage')
              return { Component: () => <SupportInboxPage admin /> }
            },
          },
          {
            path: 'settings',
            lazy: async () => ({
              Component: (await import('@/pages/admin/AdminSettingsPage')).default,
            }),
          },
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
