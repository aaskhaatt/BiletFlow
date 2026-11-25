import { useTranslation } from 'react-i18next'
import { WarningIcon } from '@/components/icons'

export default function DemoBanner() {
  const { t } = useTranslation()

  return (
    <p
      className="type-body flex items-start gap-2 rounded-md border border-status-warn-line bg-status-warn-bg px-4 py-3 text-status-warn-fg"
      data-slot="demo-banner"
    >
      <WarningIcon aria-hidden="true" className="size-5 shrink-0" />
      <span>{t('payment.demoBanner')}</span>
    </p>
  )
}
