import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation } from 'react-router'
import { useOpenSupportCaseCount } from '@/api/hooks/support'
import AccountNavigation from '@/app/layouts/AccountNavigation'
import EmailVerificationBanner from '@/auth/EmailVerificationBanner'
import { useMe } from '@/auth/use-me'
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

/**
 * Which section of the menu the address belongs to. The home of each workspace is only
 * itself, except that the pages of one event (/organizer/events/...) belong to "События".
 */
function isCurrent(pathname: string, to: string): boolean {
  if (to === '/organizer') return pathname === to || pathname.startsWith('/organizer/events')
  if (to === '/admin') return pathname === to
  return pathname === to || pathname.startsWith(`${to}/`)
}

export function WorkspaceNavigation({
  area,
  supportCount,
}: {
  area: Workspace
  /** Open cases, shown on "Поддержка" of the organizer menu. No number when 0 or unknown. */
  supportCount?: number
}) {
  const { t, i18n } = useTranslation()
  const links = area === 'organizer' ? organizerLinks : adminLinks
  const { pathname } = useLocation()

  return (
    <nav
      aria-label={t(area === 'organizer' ? 'nav.organizer' : 'nav.admin')}
      className="workspace-navigation flex min-w-0 gap-1 overflow-x-auto p-2 md:flex-col md:overflow-visible md:p-0"
    >
      {links.map(({ to, message }) => (
        <Link
          key={to}
          to={to}
          aria-current={isCurrent(pathname, to) ? 'page' : undefined}
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 type-body text-on-dark hover:bg-sidebar-soft focus-visible:outline-stub aria-[current=page]:bg-brand aria-[current=page]:font-semibold aria-[current=page]:hover:bg-brand-press"
        >
          {t(message)}
          {area === 'organizer' && message === 'nav.support' && !!supportCount && (
            <>
              <span
                aria-hidden="true"
                className="ml-auto rounded-full bg-stub px-2 py-0.5 type-small font-semibold text-ink"
              >
                {new Intl.NumberFormat(i18n.resolvedLanguage).format(supportCount)}
              </span>
              {/* the comma keeps the name and the count apart when read aloud */}
              <span className="sr-only">{`, ${t('nav.supportOpen', { count: supportCount })}`}</span>
            </>
          )}
        </Link>
      ))}
    </nav>
  )
}

/** Who is signed in, under the menu of the organizer sidebar (Figma "Пользователь"). */
function OrganizerCard() {
  const { t, i18n } = useTranslation()
  const { data: me } = useMe()
  const name = me?.organizer?.display_name || me?.email
  if (!name) return null

  return (
    <div
      className="hidden flex-col gap-0.5 rounded-md bg-sidebar-soft p-3 md:flex"
      data-slot="workspace-account"
    >
      {/* an email may wrap after the "@", never in the middle of the domain */}
      <p className="type-label font-semibold wrap-anywhere">
        {name.split('@').map((part, index) =>
          index === 0 ? (
            part
          ) : (
            <Fragment key={index}>
              @<wbr />
              {part}
            </Fragment>
          ),
        )}
      </p>
      <p className="type-small text-line">
        {t('nav.organizer')} · {(i18n.resolvedLanguage ?? 'ru').toUpperCase()}
      </p>
    </div>
  )
}

export default function WorkspaceLayout({ area }: { area: Workspace }) {
  const { t } = useTranslation()
  const supportCount = useOpenSupportCaseCount({ enabled: area === 'organizer' })

  return (
    <div
      className="grid min-h-dvh grid-rows-[auto_1fr] md:grid-cols-[15.5rem_minmax(0,1fr)] md:grid-rows-1"
      data-slot={`${area}-layout`}
    >
      <div className="min-w-0 bg-sidebar text-on-dark">
        {/* stays in view while a long page scrolls */}
        <div className="flex flex-col md:sticky md:top-0 md:h-dvh md:gap-7 md:overflow-y-auto md:px-4 md:py-6">
          <div className="px-4 pt-3 md:p-0">
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
          {area === 'organizer' && <OrganizerCard />}
        </div>
      </div>
      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-end gap-2 border-b border-line bg-surface px-4 py-2">
          <AccountNavigation />
          <LanguageSwitcher />
        </header>
        <EmailVerificationBanner className="mx-auto mt-3 max-w-6xl px-4" />
        <Outlet />
      </div>
    </div>
  )
}
