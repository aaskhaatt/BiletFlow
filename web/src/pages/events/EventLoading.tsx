import { useTranslation } from 'react-i18next'
import Skeleton from '@/components/Skeleton'

export default function EventLoading() {
  const { t } = useTranslation()
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto w-full max-w-180 space-y-5 px-4 py-4"
      data-slot="event-loading"
    >
      <p role="status" className="sr-only">
        {t('common.loading')}
      </p>
      <div aria-hidden="true" className="space-y-5">
        <Skeleton className="h-50 rounded-lg" />
        <div className="space-y-2.5">
          <Skeleton className="h-7 w-19" />
          <Skeleton className="h-7.5" />
          <Skeleton className="h-7.5 w-55 max-w-full" />
        </div>
        <div className="space-y-3">
          <div className="flex gap-3">
            <Skeleton className="size-5 shrink-0 rounded-full" />
            <div className="min-w-0 space-y-1.5">
              <Skeleton className="h-4.5 w-50 max-w-full" />
              <Skeleton className="h-3.5 w-30 max-w-full" />
            </div>
          </div>
          <div className="flex gap-3">
            <Skeleton className="size-5 shrink-0 rounded-full" />
            <div className="min-w-0 space-y-1.5">
              <Skeleton className="h-4.5 w-37.5 max-w-full" />
              <Skeleton className="h-3.5 w-42.5 max-w-full" />
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5.5 w-22.5" />
          {[1, 2].map((row) => (
            <div
              key={row}
              className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4"
            >
              <div className="min-w-0 space-y-2">
                <Skeleton className="h-4.5 w-25 max-w-full" />
                <Skeleton className="w-20 max-w-full" />
                <Skeleton className="h-3 w-17.5 max-w-full" />
              </div>
              <Skeleton className="h-11 w-30 shrink-0 rounded-md" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <Skeleton className="h-5.5 w-30" />
          <Skeleton className="h-3.5" />
          <Skeleton className="h-3.5" />
          <Skeleton className="h-3.5 w-60 max-w-full" />
        </div>
      </div>
    </main>
  )
}
