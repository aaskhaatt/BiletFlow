import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, Outlet, useLocation } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import { isApiError } from '@/api/errors'
import { loginPathFor } from '@/auth/return-to'
import { sessionStore, useSession } from '@/auth/session-store'
import { useMe } from '@/auth/use-me'
import ErrorState from '@/components/ErrorState'

type GateFailure = { error: unknown; retry: () => void; retrying?: boolean }

function GateFeedback({ failure }: { failure?: GateFailure }) {
  const { t } = useTranslation()

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl p-6">
      {failure ? (
        <ErrorState
          heading="h1"
          title={t('routeError.title')}
          description={t(errorMessageKey(failure.error))}
          onRetry={failure.retry}
          retrying={failure.retrying}
        />
      ) : (
        <p role="status">{t('common.loading')}</p>
      )}
    </main>
  )
}

function AccessPage({
  id,
  title,
  description,
}: {
  id: string
  title: string
  description?: string
}) {
  const { t } = useTranslation()
  return (
    <main
      id="main-content"
      tabIndex={-1}
      data-route-id={id}
      className="mx-auto max-w-3xl space-y-4 p-6"
    >
      <h1 className="type-page-title">{title}</h1>
      {description && <p className="type-body text-ink-2">{description}</p>}
      <Link to="/" className="inline-flex min-h-11 items-center type-label text-brand underline">
        {t('common.toHome')}
      </Link>
    </main>
  )
}

export function RequireAuth({ children }: { children?: ReactNode }) {
  const { status, refreshError } = useSession()
  const { pathname, search, hash } = useLocation()
  if (status === 'restoring') {
    const failure =
      refreshError === null
        ? undefined
        : { error: refreshError, retry: () => void sessionStore.restore() }
    return <GateFeedback failure={failure} />
  }
  if (status !== 'authenticated') {
    return <Navigate replace to={loginPathFor(pathname + search + hash) ?? '/login'} />
  }
  return children ?? <Outlet />
}

function RequireWorkspace({
  area,
  children,
}: {
  area: 'organizer' | 'admin'
  children: ReactNode
}) {
  const { t } = useTranslation()
  const { generation } = useSession()
  const me = useMe()
  const invalidSession = isApiError(me.error) && me.error.status === 401

  useEffect(() => {
    if (invalidSession && sessionStore.getSnapshot().generation === generation) {
      sessionStore.expire()
    }
  }, [generation, invalidSession])

  if (invalidSession) return <GateFeedback />
  if (me.isError) {
    return (
      <GateFeedback
        failure={{ error: me.error, retry: () => void me.refetch(), retrying: me.isFetching }}
      />
    )
  }
  if (!me.data) return <GateFeedback />

  const { organizerStatus, isAdmin } = me.data.roles
  if (area === 'admin') {
    return isAdmin ? (
      children
    ) : (
      <AccessPage
        id="admin-access-denied"
        title={t('nav.admin')}
        description={t('errors.PlatformAdminRequiredError')}
      />
    )
  }
  if (organizerStatus === 'none') return <Navigate replace to="/become-organizer" />
  if (organizerStatus !== 'approved') {
    // Keep the deep link so the workspace can open when the profile reports approval.
    return <AccessPage id="organizer-pending" title={t('nav.organizerPending')} />
  }
  return children
}

export function RequireOrganizer({ children }: { children: ReactNode }) {
  return <RequireWorkspace area="organizer">{children}</RequireWorkspace>
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  return <RequireWorkspace area="admin">{children}</RequireWorkspace>
}

export function BecomeOrganizerPage() {
  const { t } = useTranslation()
  return <AccessPage id="become-organizer" title={t('nav.becomeOrganizer')} />
}
