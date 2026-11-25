import { useTranslation } from 'react-i18next'
import InlineAlert from '@/components/InlineAlert'
import { Button } from '@/components/ui/button'

type ErrorStateProps = {
  title: string
  description?: string
  onRetry: () => void
  retrying?: boolean
  heading?: 'h1' | 'h2' | 'h3'
}

export default function ErrorState({
  title,
  description,
  onRetry,
  retrying = false,
  heading: Heading = 'h2',
}: ErrorStateProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3" data-slot="error-state">
      <InlineAlert tone="danger" role="alert">
        <Heading className="font-semibold">{title}</Heading>
        {description && <p className="mt-1">{description}</p>}
      </InlineAlert>
      <Button type="button" variant="outline" size="sm" loading={retrying} onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  )
}
