import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import ErrorState from '@/components/ErrorState'
import { sessionStore, useSession } from '@/auth/session-store'

export default function SessionGate({ children }: { children?: ReactNode }) {
  const { t } = useTranslation()
  const { status, refreshError } = useSession()

  if (status !== 'restoring' && status !== 'expired') return children ?? <Outlet />

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl p-6">
      {refreshError !== null ? (
        <ErrorState
          heading="h1"
          title={t('routeError.title')}
          description={t(errorMessageKey(refreshError))}
          onRetry={() => void sessionStore.restore()}
        />
      ) : (
        <p role="status">{t('common.loading')}</p>
      )}
    </main>
  )
}
