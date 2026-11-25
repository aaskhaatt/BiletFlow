import { useTranslation } from 'react-i18next'

export default function ProgressBar({
  label,
  value,
  max,
}: {
  label: string
  value: number
  max: number
}) {
  const { i18n } = useTranslation()
  const total = Number.isFinite(max) && max > 0 ? max : 0
  const current = Number.isFinite(value) ? Math.min(total, Math.max(0, value)) : 0
  const ratio = total ? current / total : 0
  const number = new Intl.NumberFormat(i18n.resolvedLanguage)
  const percentage = new Intl.NumberFormat(i18n.resolvedLanguage, { style: 'percent' }).format(
    ratio,
  )
  const text = `${number.format(current)} / ${number.format(total)} · ${percentage}`

  return (
    <div className="space-y-1" data-slot="capacity-progress">
      <p className="type-small text-ink-2 tabular-nums" aria-hidden="true">
        {text}
      </p>
      <progress
        aria-label={label}
        aria-valuetext={text}
        value={current}
        max={total || 1}
        className="block h-2 w-full overflow-hidden rounded-full border-0 bg-line accent-brand [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-brand"
      />
    </div>
  )
}
