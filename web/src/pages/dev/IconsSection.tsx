import { useTranslation } from 'react-i18next'
import { ClockIcon, ICONS, type IconName, TicketIcon, WarningIcon } from '@/components/icons'

// W2.1: the icon set under its Figma names, and icons taking the color of their text.
export default function IconsSection() {
  const { t } = useTranslation()
  const names = Object.keys(ICONS) as IconName[]

  return (
    <section className="space-y-4" data-testid="icons">
      <h2 className="type-card-title">Icons ({names.length})</h2>
      <p className="type-body text-ink-2">{t('dev.iconsNote')}</p>

      <ul className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {names.map((name) => {
          const Icon = ICONS[name]
          return (
            <li
              key={name}
              className="flex flex-col items-center gap-2 rounded-md border border-line-soft bg-surface px-1 py-3 text-ink"
              data-icon={name}
            >
              <Icon />
              <span className="type-small text-ink-2">{name}</span>
            </li>
          )
        })}
      </ul>

      <ul className="type-body space-y-2">
        <li className="flex items-center gap-2 text-ink-2">
          <ClockIcon className="shrink-0" />
          {t('time.astanaZone')}
        </li>
        <li className="flex items-center gap-2 text-status-ok-fg">
          <TicketIcon className="shrink-0" />
          {t('money.free')}
        </li>
        <li className="flex items-center gap-2 text-status-danger-fg">
          <WarningIcon className="shrink-0" />
          {t('errors.PaymentFailedError')}
        </li>
      </ul>
    </section>
  )
}
