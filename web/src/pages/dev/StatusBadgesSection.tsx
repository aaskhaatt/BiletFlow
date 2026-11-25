import { useTranslation } from 'react-i18next'
import StatusBadge from '@/components/StatusBadge'
import { STATUS_BADGES, STATUS_KINDS } from '@/components/status-badges'

export default function StatusBadgesSection() {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby="status-badges-title"
      className="space-y-4"
      data-testid="status-badges"
    >
      <h2 className="type-card-title" id="status-badges-title">
        {t('dev.statusBadges.title')}
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        {STATUS_KINDS.map((kind) => (
          <div
            key={kind}
            className="min-w-0 space-y-3 rounded-md border border-line bg-surface p-4"
          >
            <h3 className="type-label">{t(`dev.statusBadges.${kind}`)}</h3>
            <ul className="flex flex-wrap gap-2">
              {Object.keys(STATUS_BADGES[kind]).map((status) => (
                <li key={status} className="max-w-full">
                  <StatusBadge kind={kind} status={status} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <div className="space-y-1">
          <p className="type-small text-ink-2">{t('dev.statusBadges.compact')}</p>
          <StatusBadge kind="ticket" status="valid" size="sm" />
        </div>
        <div className="space-y-1">
          <p className="type-small text-ink-2">{t('dev.statusBadges.unknown')}</p>
          <StatusBadge kind="order" status="unknown_status" />
        </div>
      </div>
    </section>
  )
}
