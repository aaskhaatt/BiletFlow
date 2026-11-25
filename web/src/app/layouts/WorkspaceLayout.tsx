import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet } from 'react-router'
import LanguageSwitcher from '@/components/LanguageSwitcher'

const organizerLinks = [
  { to: '/organizer', message: 'nav.events' },
  { to: '/organizer/campaigns', message: 'nav.campaigns' },
  { to: '/organizer/analytics', message: 'nav.analytics' },
  { to: '/organizer/support', message: 'nav.support' },
  { to: '/organizer/profile', message: 'nav.profile' },
] as const

const adminLinks = [
  { to: '/admin', message: 'nav.moderation' },
  { to: '/admin/reports', message: 'nav.reports' },
  { to: '/admin/paid-sales', message: 'nav.paidSales' },
  { to: '/admin/organizers', message: 'nav.organizers' },
  { to: '/admin/users', message: 'nav.users' },
  { to: '/admin/events', message: 'nav.events' },
  { to: '/admin/orders', message: 'nav.orders' },
  { to: '/admin/payments', message: 'nav.payments' },
  { to: '/admin/refunds', message: 'nav.refunds' },
  { to: '/admin/campaigns', message: 'nav.campaigns' },
  { to: '/admin/support', message: 'nav.support' },
  { to: '/admin/settings', message: 'nav.settings' },
] as const

type Workspace = 'organizer' | 'admin'

export function WorkspaceNavigation({
  area,
  supportCount,
}: {
  area: Workspace
  supportCount?: number
}) {
  const { t, i18n } = useTranslation()
  const links = area === 'organizer' ? organizerLinks : adminLinks

  return (
    <nav
      aria-label={t(area === 'organizer' ? 'nav.organizer' : 'nav.admin')}
      className="workspace-navigation flex min-w-0 gap-1 overflow-x-auto p-2 md:flex-col"
    >
      {links.map(({ to, message }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/organizer' || to === '/admin'}
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 type-label text-on-dark hover:bg-sidebar-soft focus-visible:outline-stub aria-[current=page]:bg-brand aria-[current=page]:font-semibold aria-[current=page]:hover:bg-brand-press"
        >
          {t(message)}
          {area === 'organizer' && message === 'nav.support' && supportCount !== undefined && (
            <span className="rounded-full bg-stub px-2 py-0.5 md:ml-auto type-small font-semibold text-ink">
              {new Intl.NumberFormat(i18n.resolvedLanguage).format(supportCount)}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export default function WorkspaceLayout({
  area,
  supportCount,
}: {
  area: Workspace
  supportCount?: number
}) {
  const { t } = useTranslation()

  return (
    <div
      className="grid min-h-dvh grid-rows-[auto_1fr] md:grid-cols-[15.5rem_minmax(0,1fr)] md:grid-rows-1"
      data-slot={`${area}-layout`}
    >
      <div className="min-w-0 bg-sidebar text-on-dark">
        <div className="px-4 pt-3 md:pb-3">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center font-display text-xl font-bold text-on-dark focus-visible:outline-stub"
          >
            BiletFlow
          </Link>
          {area === 'admin' && (
            <p className="w-fit rounded-sm bg-stub px-2 py-0.5 type-small font-semibold text-ink">
              {t('nav.admin')}
            </p>
          )}
        </div>
        <WorkspaceNavigation area={area} supportCount={supportCount} />
      </div>
      <div className="min-w-0">
        <header className="flex justify-end border-b border-line bg-surface px-4 py-2">
          <LanguageSwitcher />
        </header>
        <Outlet />
      </div>
    </div>
  )
}
