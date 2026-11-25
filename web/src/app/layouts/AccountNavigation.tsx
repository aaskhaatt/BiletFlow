import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, NavLink } from 'react-router'
import { toast } from 'sonner'
import { sessionStore, useSession } from '@/auth/session-store'
import { useMe } from '@/auth/use-me'
import { Button } from '@/components/ui/button'

const linkClassName =
  'inline-flex min-h-11 items-center rounded-md border border-brand px-3 type-label text-brand hover:bg-brand-soft aria-[current=page]:bg-brand-soft'

export default function AccountNavigation({ showSignIn = false }: { showSignIn?: boolean }) {
  const { t } = useTranslation()
  const { status } = useSession()
  const { data: me, isError } = useMe()
  const signOut = useMutation({
    mutationFn: sessionStore.signOut,
    onError: () => {
      if (sessionStore.getSnapshot().status === 'anonymous') {
        toast.error(t('auth.signOutUnconfirmed'), { id: 'sign-out-unconfirmed' })
      }
    },
  })

  if (status === 'restoring') return null
  if (status !== 'authenticated') {
    return showSignIn ? (
      <Link to="/login" className={linkClassName}>
        {t('nav.signIn')}
      </Link>
    ) : null
  }
  const roles = isError ? undefined : me?.roles
  return (
    <nav aria-label={t('nav.account')} className="flex flex-wrap items-center gap-2">
      {roles?.organizerStatus === 'none' && (
        <NavLink to="/become-organizer" className={linkClassName}>
          {t('nav.becomeOrganizer')}
        </NavLink>
      )}
      {roles?.organizerStatus === 'pending' && (
        <p role="status" className="px-1 type-label text-ink-2">
          {t('nav.organizerPending')}
        </p>
      )}
      {roles?.organizerStatus === 'rejected' && (
        <NavLink to="/become-organizer" className={linkClassName}>
          {t('nav.organizerRejected')}
        </NavLink>
      )}
      {roles?.organizerStatus === 'approved' && (
        <NavLink to="/organizer" end className={linkClassName}>
          {t('nav.organizer')}
        </NavLink>
      )}
      {roles?.isAdmin && (
        <NavLink to="/admin" end className={linkClassName}>
          {t('nav.admin')}
        </NavLink>
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        loading={signOut.isPending}
        onClick={() => signOut.mutate()}
      >
        {t('nav.signOut')}
      </Button>
    </nav>
  )
}
