import { useTranslation } from 'react-i18next'

// Shown when a page crashes while rendering. W2.7 replaces it with the shared ErrorState.
export default function RouteErrorPage() {
  const { t } = useTranslation()

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6" role="alert">
      <h1 className="type-page-title">{t('routeError.title')}</h1>
      <p className="type-body text-ink-2">{t('routeError.text')}</p>
    </main>
  )
}
