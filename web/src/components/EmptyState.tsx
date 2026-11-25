import { ICONS, type IconName } from '@/components/icons'

type EmptyStateProps = {
  title: string
  description?: string
  icon?: IconName
}

export default function EmptyState({ title, description, icon }: EmptyStateProps) {
  const Icon = icon && ICONS[icon]

  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-line bg-surface p-6 text-center"
      data-slot="empty-state"
    >
      {Icon && <Icon aria-hidden="true" className="size-6 text-ink-2" />}
      <p className="type-label">{title}</p>
      {description && <p className="type-body text-ink-2">{description}</p>}
    </div>
  )
}
