import { useTranslation } from 'react-i18next'
import { Link, NavLink } from 'react-router'
import { useSession } from '@/auth/session-store'
import { useMe } from '@/auth/use-me'

const linkClassName =
  'inline-flex min-h-11 items-center rounded-md border border-brand px-3 type-label text-brand hover:bg-brand-soft aria-[current=page]:bg-brand-soft'

export default function AccountNavigation({ showSignIn = false }: { showSignIn?: boolean }) {
  const { t } = useTranslation()
  const { status } = useSession()
  const { data: me, isError } = useMe()

  if (status === 'anonymous' || status === 'expired') {
    return showSignIn ? (
      <Link to="/login" className={linkClassName}>
        {t('nav.signIn')}
      </Link>
    ) : null
  }
  if (!me || isError) return null

  const { organizerStatus, isAdmin } = me.roles
  return (
    <nav aria-label={t('nav.account')} className="flex flex-wrap items-center gap-2">
      {organizerStatus === 'none' && (
        <NavLink to="/become-organizer" className={linkClassName}>
          {t('nav.becomeOrganizer')}
        </NavLink>
      )}
      {organizerStatus === 'pending' && (
        <p role="status" className="px-1 type-label text-ink-2">
          {t('nav.organizerPending')}
        </p>
      )}
      {organizerStatus === 'approved' && (
        <NavLink to="/organizer" end className={linkClassName}>
          {t('nav.organizer')}
        </NavLink>
      )}
      {isAdmin && (
        <NavLink to="/admin" end className={linkClassName}>
          {t('nav.admin')}
        </NavLink>
      )}
    </nav>
  )
}
