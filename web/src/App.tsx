import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { toast } from 'sonner'
import { setRequestSession } from '@/api/access-token'
import { isApiError } from '@/api/errors'
import AppProviders from '@/app/AppProviders'
import { routes } from '@/app/routes'
import { safeReturnTo } from '@/auth/return-to'
import { sessionStore, useSession } from '@/auth/session-store'

setRequestSession(sessionStore)
const router = createBrowserRouter(routes)

export default function App() {
  const { t } = useTranslation()
  const { status, refreshError } = useSession()

  useEffect(() => {
    void sessionStore.restore()
  }, [])

  useEffect(() => {
    if (status !== 'expired') return
    const { pathname, search, hash } = router.state.navigation.location ?? router.state.location
    const returnTo = safeReturnTo(pathname + search + hash)
    if (!returnTo) return
    const params = new URLSearchParams({ returnTo })
    void router.navigate(`/login?${params}`, { replace: true })
  }, [status])

  useEffect(() => {
    if (
      status === 'authenticated' &&
      isApiError(refreshError) &&
      refreshError.error === 'NETWORK_ERROR'
    ) {
      toast.error(t('errors.NETWORK_ERROR'), { id: 'session-network-error' })
    }
  }, [status, refreshError, t])

  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  )
}
