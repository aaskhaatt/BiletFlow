import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import InlineAlert from '@/components/InlineAlert'
import Skeleton from '@/components/Skeleton'

export default function FeedbackSection() {
  const { t } = useTranslation()
  const [recovered, setRecovered] = useState(false)

  return (
    <section className="space-y-4" aria-labelledby="feedback-title">
      <h2 className="type-card-title" id="feedback-title">
        {t('dev.feedback.title')}
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
          <h3 className="type-label">{t('dev.feedback.loading')}</h3>
          <div className="space-y-2" role="status">
            <span className="sr-only">{t('common.loading')}</span>
            <Skeleton className="h-16" />
            <Skeleton className="w-2/3" />
            <Skeleton className="w-1/2" />
          </div>
        </div>
        <EmptyState
          title={t('dev.feedback.emptyTitle')}
          description={t('dev.feedback.emptyDescription')}
          icon="calendar"
        />
        <div>
          {recovered ? (
            <InlineAlert tone="ok" role="status">
              {t('dev.feedback.recovered')}
            </InlineAlert>
          ) : (
            <ErrorState
              heading="h3"
              title={t('dev.feedback.loadError')}
              description={t('errors.NETWORK_ERROR')}
              onRetry={() => setRecovered(true)}
            />
          )}
        </div>
        <div className="space-y-2">
          <h3 className="type-label">{t('dev.feedback.alerts')}</h3>
          <InlineAlert>{t('time.astanaZone')}</InlineAlert>
          <InlineAlert tone="ok">{t('dev.feedback.recovered')}</InlineAlert>
          <InlineAlert tone="warn">{t('dev.feedback.warning')}</InlineAlert>
          <InlineAlert tone="danger">{t('errors.NETWORK_ERROR')}</InlineAlert>
        </div>
      </div>
    </section>
  )
}
