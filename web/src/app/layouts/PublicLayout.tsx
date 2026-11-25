import { cn } from 'cn'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet } from 'react-router'
import AccountNavigation from '@/app/layouts/AccountNavigation'
import EmailVerificationBanner from '@/auth/EmailVerificationBanner'
import { useSession } from '@/auth/session-store'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { CalendarIcon, TicketIcon, UserIcon } from '@/components/icons'

const attendeeLinks = [
  { to: '/', message: 'nav.events', Icon: CalendarIcon },
  { to: '/my/tickets', message: 'nav.tickets', Icon: TicketIcon },
  { to: '/my/orders', message: 'nav.orders', Icon: UserIcon },
] as const

export default function PublicLayout() {
  const { t } = useTranslation()
  const { status } = useSession()

  return (
    <div className="min-h-dvh pb-20 md:pb-0" data-slot="public-layout">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <Link
            to="/"
            className="mr-auto inline-flex min-h-11 items-center font-display font-bold text-brand"
          >
            BiletFlow
          </Link>
          <nav
            aria-label={t('nav.attendee')}
            data-slot="bottom-navigation"
            className={cn(
              'fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-line bg-surface px-2 pb-[env(safe-area-inset-bottom)] md:static md:gap-1 md:border-0 md:px-0 md:pb-0',
              status === 'authenticated' ? 'md:flex' : 'md:hidden',
            )}
          >
            {attendeeLinks.map(({ to, message, Icon }) => (
              <NavLink
                key={to}
                to={to}
                end
                className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-sm px-1 text-center type-small wrap-anywhere text-ink-2 hover:bg-line-soft aria-[current=page]:font-semibold aria-[current=page]:text-brand md:min-h-11 md:flex-row md:px-2 md:type-label"
              >
                <Icon aria-hidden="true" className="size-5 shrink-0" />
                {t(message)}
              </NavLink>
            ))}
          </nav>
          <LanguageSwitcher />
          <AccountNavigation showSignIn />
        </div>
      </header>
      <EmailVerificationBanner className="mx-auto mt-3 max-w-6xl px-4" />
      <Outlet />
    </div>
  )
}
