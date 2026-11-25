import { cn } from 'cn'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/api/error-codes'
import type { ActivationChecklist } from '@/api/generated/model'
import { CHECKLIST_STEPS, doneChecklistSteps, usePaidSales } from '@/api/hooks/paid-sales'
import { CheckIcon } from '@/components/icons'
import Skeleton from '@/components/Skeleton'

/**
 * "Платные продажи" of the event page: the five steps of the activation and how many
 * are done. A read-only view here; each step gets its action in the activation tasks.
 */
export default function PaidSalesCard({ eventId }: { eventId: number }) {
  const { t } = useTranslation()
  const paidSales = usePaidSales(eventId)

  if (paidSales.isError) {
    return (
      <section className="rounded-lg border border-line bg-surface p-5" data-slot="paid-sales-card">
        <h2 className="type-card-title">{t('paidSalesCard.title')}</h2>
        <p className="mt-2 type-small text-ink-2">{t(errorMessageKey(paidSales.error))}</p>
      </section>
    )
  }
  if (!paidSales.data) {
    return (
      <div role="status" className="space-y-3 rounded-lg border border-line bg-surface p-5">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24" />
      </div>
    )
  }

  const { status, checklist } = paidSales.data
  const active = status === 'active'
  const suspended = status === 'suspended'
  const done = doneChecklistSteps(checklist)

  return (
    <section
      aria-labelledby="paid-sales-title"
      className={cn(
        'space-y-3.5 rounded-lg border p-5',
        active
          ? 'border-line bg-surface'
          : 'border-status-warn-line bg-status-warn-bg text-status-warn-fg',
      )}
      data-slot="paid-sales-card"
      data-status={status}
    >
      <h2 id="paid-sales-title" className="type-card-title">
        {t('paidSalesCard.title')}
      </h2>
      <p className="type-label">
        {active
          ? t('paidSalesCard.active')
          : suspended
            ? t('paidSalesCard.suspended', { reason: paidSales.data.suspension_reason ?? '—' })
            : t('paidSalesCard.inactive', { done, total: CHECKLIST_STEPS.length })}
      </p>
      <ol className="space-y-2.5">
        {CHECKLIST_STEPS.map((step: keyof ActivationChecklist) => (
          <li key={step} className="flex items-start gap-2.5 type-label font-normal">
            {checklist[step] ? (
              <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-status-ok-fg" />
            ) : (
              <span
                aria-hidden="true"
                className="mt-1 size-3.5 shrink-0 rounded-full border-2 border-current"
              />
            )}
            <span className={cn(!checklist[step] && 'font-medium')}>
              {t(`paidSalesCard.steps.${step}`)}
              <span className="sr-only">
                {checklist[step] ? `, ${t('paidSalesCard.done')}` : `, ${t('paidSalesCard.todo')}`}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
