import { cn } from 'cn'
import { useTranslation } from 'react-i18next'
import { ICONS } from '@/components/icons'
import {
  getStatusSpec,
  STATUS_BADGES,
  type StatusKind,
  TONE_CLASSES,
} from '@/components/status-badges'

type StatusMessageKey = {
  [K in StatusKind]: `status.${K}.${Extract<keyof (typeof STATUS_BADGES)[K], string>}`
}[StatusKind]

type StatusBadgeProps<K extends StatusKind> = {
  /** What the status belongs to. */
  kind: K
  /**
   * The status as the API sends it ("checked_in"). The API types these as plain
   * strings, so any string is accepted: an unknown one shows its raw text in grey.
   */
  status: keyof (typeof STATUS_BADGES)[K] | (string & {})
  /**
   * md: the pill of the Figma component set (14 px). sm: the compact chip of
   * the tables and headers (13 px, radius 8).
   */
  size?: 'md' | 'sm'
  className?: string
}

/**
 * A status as color, icon and text together (Figma "Статус билета"). Plain text
 * in the page: the icon is decoration, the screen reader reads the label.
 */
export default function StatusBadge<K extends StatusKind>({
  kind,
  status,
  size = 'md',
  className,
}: StatusBadgeProps<K>) {
  const { t } = useTranslation()
  const name = String(status)
  const spec = getStatusSpec(kind, name)
  const Icon = spec ? ICONS[spec.icon] : null
  const label = spec ? t(`status.${kind}.${name}` as StatusMessageKey) : name

  return (
    <span
      data-slot="status-badge"
      data-kind={kind}
      data-status={name}
      data-known={spec ? 'true' : 'false'}
      className={cn(
        'inline-flex max-w-full items-center font-semibold',
        spec ? TONE_CLASSES[spec.tone] : TONE_CLASSES.neutral,
        size === 'md'
          ? 'gap-1.5 rounded-full px-3 py-1.5 text-[0.875rem] leading-[1.4]'
          : 'gap-1.5 rounded-sm px-2.5 py-[5px] text-[0.8125rem] leading-[1.4]',
        className,
      )}
    >
      {Icon && (
        <Icon
          aria-hidden="true"
          className={cn('shrink-0', size === 'md' ? 'size-4' : 'size-3.5')}
        />
      )}
      <span className="min-w-0 wrap-anywhere">{label}</span>
    </span>
  )
}
