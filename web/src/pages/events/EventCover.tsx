import { cn } from 'cn'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function EventCover({
  image,
  className,
  lazy = false,
}: {
  image?: string | null
  className: string
  lazy?: boolean
}) {
  const { t } = useTranslation()
  const [broken, setBroken] = useState<string>()

  return (
    <div className={cn('grid place-items-center overflow-hidden bg-cover-placeholder', className)}>
      {image && broken !== image ? (
        <img
          alt=""
          src={image}
          className="size-full object-cover"
          loading={lazy ? 'lazy' : undefined}
          onError={() => setBroken(image)}
        />
      ) : (
        <span className="type-small text-ink-2">{t('catalog.cover')}</span>
      )}
    </div>
  )
}
