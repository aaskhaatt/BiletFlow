import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { createBrowserRouter, matchPath, RouterProvider } from 'react-router'
import { toast } from 'sonner'
import { setRequestSession } from '@/api/access-token'
import { isApiError } from '@/api/errors'
import AppProviders from '@/app/AppProviders'
import { routes } from '@/app/routes'
import { loginPathFor } from '@/auth/return-to'
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
    if (status !== 'expired' && status !== 'suspended') return
    const { pathname, search, hash } = router.state.navigation.location ?? router.state.location
    const loginPath = loginPathFor(pathname + search + hash)
    if (loginPath) void router.navigate(loginPath, { replace: true })
    else if (status === 'suspended' && !matchPath('/login', pathname)) {
      void router.navigate('/login', { replace: true })
    }
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
