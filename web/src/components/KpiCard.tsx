import type { ReactNode } from 'react'

export default function KpiCard({
  label,
  value,
  children,
}: {
  label: string
  value: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
      <dl className="space-y-1">
        <dt className="type-label text-ink-2">{label}</dt>
        <dd className="type-event-title wrap-anywhere tabular-nums">{value}</dd>
      </dl>
      {children}
    </div>
  )
}
