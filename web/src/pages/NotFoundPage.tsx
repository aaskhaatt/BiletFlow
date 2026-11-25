import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

export default function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-3xl space-y-4 p-6"
      data-route-id="not-found"
    >
      <h1 className="type-page-title">{t('notFound.title')}</h1>
      <p className="type-body text-ink-2">{t('notFound.text')}</p>
      <Link to="/" className="type-label text-brand underline">
        {t('common.toHome')}
      </Link>
    </main>
  )
}
