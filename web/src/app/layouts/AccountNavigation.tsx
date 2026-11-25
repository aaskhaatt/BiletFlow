import { useMutation } from '@tanstack/react-query'
import { Popover } from 'radix-ui'
import { useTranslation } from 'react-i18next'
import { Link, NavLink } from 'react-router'
import { toast } from 'sonner'
import accountIcon from '@/assets/viewer-account.svg'
import { sessionStore, useSession } from '@/auth/session-store'
import { useMe } from '@/auth/use-me'
import { Button } from '@/components/ui/button'

const linkClassName =
  'inline-flex min-h-11 items-center rounded-md border border-brand px-3 type-label text-brand hover:bg-brand-soft aria-[current=page]:bg-brand-soft'

export default function AccountNavigation({
  showSignIn = false,
  desktopViewer = false,
}: {
  showSignIn?: boolean
  desktopViewer?: boolean
}) {
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
      <Link
        to="/login"
        className={
          desktopViewer
            ? 'inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-3 type-label hover:bg-line-soft'
            : linkClassName
        }
      >
        {desktopViewer && <img src={accountIcon} width="20" height="20" alt="" />}
        {t('nav.signIn')}
      </Link>
    ) : null
  }
  const roles = isError ? undefined : me?.roles
  const actions = (
    <>
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
    </>
  )
  if (desktopViewer) {
    return (
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={me?.email ? `${t('nav.account')} · ${me.email}` : t('nav.account')}
            className="inline-flex min-h-10 max-w-56 items-center gap-2 rounded-md border border-line bg-surface px-3 type-label hover:bg-line-soft"
          >
            <img src={accountIcon} width="20" height="20" alt="" className="shrink-0" />
            <span className="min-w-0 truncate">{me?.email || t('nav.account')}</span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={8}
            className="z-40 w-64 rounded-md border border-line bg-surface p-3 shadow-lg"
          >
            <nav aria-label={t('nav.account')} className="flex flex-col items-start gap-2">
              <Popover.Close asChild>
                <NavLink to="/my/tickets" className={linkClassName}>
                  {t('nav.tickets')}
                </NavLink>
              </Popover.Close>
              {actions}
            </nav>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    )
  }
  return (
    <nav aria-label={t('nav.account')} className="flex flex-wrap items-center gap-2">
      {actions}
    </nav>
  )
}
