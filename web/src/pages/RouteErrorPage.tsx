import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import SkipLink from '@/app/layouts/SkipLink'

const ErrorState = lazy(() => import('@/components/ErrorState'))

export default function RouteErrorPage() {
  const { t } = useTranslation()
  const title = t('routeError.title')

  return (
    <>
      <SkipLink />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl p-6">
        <Suspense fallback={<h1 className="type-page-title">{title}</h1>}>
          <ErrorState
            heading="h1"
            title={title}
            description={t('routeError.text')}
            onRetry={() => window.location.reload()}
          />
        </Suspense>
      </main>
    </>
  )
}
