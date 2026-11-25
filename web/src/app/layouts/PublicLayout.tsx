import { cn } from 'cn'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useMatch } from 'react-router'
import AccountNavigation from '@/app/layouts/AccountNavigation'
import EmailVerificationBanner from '@/auth/EmailVerificationBanner'
import { useSession } from '@/auth/session-store'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { CalendarIcon, TicketIcon, UserIcon } from '@/components/icons'
import { useViewerDesktop } from '@/lib/viewer-layout'

const attendeeLinks = [
  { to: '/', message: 'nav.events', Icon: CalendarIcon },
  { to: '/my/tickets', message: 'nav.tickets', Icon: TicketIcon },
  { to: '/my/orders', message: 'nav.orders', Icon: UserIcon },
] as const

export default function PublicLayout() {
  const { t } = useTranslation()
  const { status } = useSession()
  const report = useMatch('/events/:eventId/report') !== null
  const eventDetails = useMatch('/events/:eventId') !== null || report
  const catalog = useMatch('/') !== null
  const publicEvents = catalog || eventDetails
  const wide = useViewerDesktop() && publicEvents

  return (
    <div
      className={cn(
        'min-h-dvh',
        publicEvents && 'flex flex-col',
        !eventDetails && (catalog ? 'pb-20 min-[1024px]:pb-0' : 'pb-20 md:pb-0'),
      )}
      data-slot="public-layout"
    >
      <header
        className={cn(
          'border-b border-line',
          publicEvents ? 'bg-paper' : 'bg-surface',
          report && 'hidden min-[1024px]:block',
        )}
      >
        <div
          className={cn(
            'mx-auto flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2',
            publicEvents
              ? 'viewer-container min-[1024px]:gap-6 min-[1024px]:px-0 min-[1024px]:py-4'
              : 'max-w-6xl',
          )}
        >
          <Link
            to="/"
            className={cn(
              'mr-auto inline-flex min-h-11 items-center font-display font-bold',
              publicEvents ? 'text-lg text-ink min-[1024px]:text-[22px]' : 'text-brand',
            )}
          >
            BiletFlow
          </Link>
          {wide ? (
            <nav aria-label={t('nav.attendee')} className="flex items-center gap-6 font-semibold">
              <NavLink
                to="/"
                end
                className={cn('py-2 hover:text-brand', publicEvents && 'text-brand')}
              >
                {t('catalog.catalogNav')}
              </NavLink>
              <NavLink to="/my/orders" className="py-2 hover:text-brand">
                {t('catalog.ordersNav')}
              </NavLink>
            </nav>
          ) : (
            <nav
              aria-label={t('nav.attendee')}
              data-slot="bottom-navigation"
              className={cn(
                'fixed inset-x-0 bottom-0 z-30 grid-cols-3 border-t border-line bg-surface px-2 pb-[env(safe-area-inset-bottom)]',
                eventDetails ? 'hidden' : 'grid',
                !publicEvents && 'md:static md:gap-1 md:border-0 md:px-0 md:pb-0',
                !publicEvents && (status === 'authenticated' ? 'md:flex' : 'md:hidden'),
              )}
            >
              {attendeeLinks.map(({ to, message, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end
                  className={cn(
                    'flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-sm px-1 text-center type-small wrap-anywhere text-ink-2 hover:bg-line-soft aria-[current=page]:font-semibold aria-[current=page]:text-brand',
                    !publicEvents && 'md:min-h-11 md:flex-row md:px-2 md:type-label',
                  )}
                >
                  <Icon aria-hidden="true" className="size-5 shrink-0" />
                  {t(message)}
                </NavLink>
              ))}
            </nav>
          )}
          <LanguageSwitcher />
          <AccountNavigation showSignIn desktopViewer={wide} />
        </div>
      </header>
      <EmailVerificationBanner
        className={cn('mx-auto mt-3 max-w-6xl px-4', report && 'hidden min-[1024px]:block')}
      />
      <Outlet />
    </div>
  )
}
