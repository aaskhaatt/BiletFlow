import { cn } from 'cn'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import type { ActivationChecklist, PayFeeRequestSimulateOutcome } from '@/api/generated/model'
import {
  CHECKLIST_STEPS,
  doneChecklistSteps,
  usePaidSales,
  usePaidSalesActions,
} from '@/api/hooks/paid-sales'
import ConfirmDialog from '@/components/ConfirmDialog'
import DemoBanner from '@/components/DemoBanner'
import ErrorState from '@/components/ErrorState'
import { CheckIcon } from '@/components/icons'
import InlineAlert from '@/components/InlineAlert'
import Skeleton from '@/components/Skeleton'
import { Button } from '@/components/ui/button'
import { formatKZT } from '@/lib/format'

const outcomes = [
  ['success', 'attendee.paymentSuccess'],
  ['failure', 'attendee.paymentFailure'],
] as const

export default function PaidSalesCard({
  eventId,
  locked = false,
}: {
  eventId: number
  locked?: boolean
}) {
  const { t } = useTranslation()
  const { hash } = useLocation()
  const paidSales = usePaidSales(eventId)
  const { acceptTerms, payFee, activate } = usePaidSalesActions(eventId)
  const [feeOpen, setFeeOpen] = useState(false)
  const [outcome, setOutcome] = useState<PayFeeRequestSimulateOutcome>('success')
  const [error, setError] = useState<unknown>(null)
  const inFlight = useRef(false)
  const section = useRef<HTMLElement>(null)
  const loaded = !!paidSales.data
  const busy = acceptTerms.isPending || payFee.isPending || activate.isPending

  useEffect(() => {
    if (hash === '#paid-sales' && loaded) {
      section.current?.focus({ preventScroll: true })
      section.current?.scrollIntoView?.()
    }
  }, [hash, loaded])

  if (paidSales.isError && !paidSales.data) {
    return (
      <section
        id="paid-sales"
        className="rounded-lg border border-line bg-surface p-5"
        data-slot="paid-sales-card"
      >
        <ErrorState
          title={t('paidSalesCard.title')}
          description={t(errorMessageKey(paidSales.error))}
          onRetry={() => void paidSales.refetch()}
          retrying={paidSales.isFetching}
        />
      </section>
    )
  }
  if (!paidSales.data) {
    return (
      <div role="status" className="space-y-3 rounded-lg border border-line bg-surface p-5">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  const { status, checklist, fee_amount, can_activate, suspension_reason } = paidSales.data
  const active = status === 'active'
  const suspended = status === 'suspended'
  const canManage = !locked && !active && !suspended
  const done = doneChecklistSteps(checklist)
  const fee = formatKZT(fee_amount)
  const profile = `/organizer/profile?event=${eventId}`

  async function perform(action: () => Promise<unknown>) {
    if (!canManage || inFlight.current) return
    inFlight.current = true
    setError(null)
    try {
      await action()
    } catch (error) {
      setError(error)
    } finally {
      inFlight.current = false
    }
  }

  function stepAction(step: keyof ActivationChecklist) {
    if (!canManage || checklist[step]) return null
    const linkClass =
      'inline-flex min-h-11 items-center type-small font-semibold text-ink underline underline-offset-4'
    switch (step) {
      case 'has_paid_ticket_type':
        return (
          <a className={linkClass} href="#ticket-types-title">
            {t('paidSalesCard.actions.ticketTypes')}
          </a>
        )
      case 'identity_verified':
        return (
          <Link className={linkClass} to={profile + '#identity'}>
            {t('paidSalesCard.actions.identity')}
          </Link>
        )
      case 'payout_account_connected':
        return (
          <Link className={linkClass} to={profile + '#payout'}>
            {t('paidSalesCard.actions.payout')}
          </Link>
        )
      case 'terms_accepted':
        return (
          <ConfirmDialog
            trigger={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                loading={acceptTerms.isPending}
              >
                {t('paidSalesCard.actions.readTerms')}
              </Button>
            }
            title={t('paidSalesCard.termsTitle')}
            description={t('paidSalesCard.termsDescription')}
            confirmLabel={t('paidSalesCard.actions.acceptTerms')}
            onConfirm={() => void perform(() => acceptTerms.mutateAsync())}
          />
        )
      case 'fee_paid':
        return (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            aria-expanded={feeOpen}
            aria-controls={feeOpen ? 'paid-sales-fee' : undefined}
            onClick={() => setFeeOpen(!feeOpen)}
          >
            {t('paidSalesCard.actions.showFee', { fee })}
          </Button>
        )
    }
  }

  return (
    <section
      id="paid-sales"
      ref={section}
      tabIndex={-1}
      aria-labelledby="paid-sales-title"
      className={cn(
        'min-w-0 scroll-mt-6 space-y-4 rounded-lg border p-5',
        active
          ? 'border-line bg-surface'
          : suspended
            ? 'border-status-danger-fg/30 bg-status-danger-bg text-status-danger-fg'
            : 'border-status-warn-line bg-status-warn-bg text-status-warn-fg',
      )}
      data-slot="paid-sales-card"
      data-status={status}
    >
      <h2 id="paid-sales-title" className="type-card-title">
        {t('paidSalesCard.title')}
      </h2>
      <p className="type-label wrap-anywhere" role="status">
        {active
          ? t('paidSalesCard.active')
          : suspended
            ? suspension_reason
              ? t('paidSalesCard.suspended', { reason: suspension_reason })
              : t('paidSalesCard.suspendedWithoutReason')
            : t('paidSalesCard.inactive', { done, total: CHECKLIST_STEPS.length })}
      </p>
      <ol className="space-y-3">
        {CHECKLIST_STEPS.map((step) => {
          const action = stepAction(step)
          return (
            <li key={step} className="flex items-start gap-2.5 type-label font-normal">
              {checklist[step] ? (
                <CheckIcon
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-status-ok-fg"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="mt-1 size-3.5 shrink-0 rounded-full border-2 border-current"
                />
              )}
              <div className="min-w-0 space-y-1">
                <span className={cn(!checklist[step] && 'font-medium')}>
                  {t(`paidSalesCard.steps.${step}`)}
                  <span className="sr-only">
                    {checklist[step]
                      ? `, ${t('paidSalesCard.done')}`
                      : `, ${t('paidSalesCard.todo')}`}
                  </span>
                </span>
                {action && <div>{action}</div>}
              </div>
            </li>
          )
        })}
      </ol>
      {canManage && feeOpen && !checklist.fee_paid && (
        <div
          id="paid-sales-fee"
          className="space-y-3 rounded-md border border-line bg-surface p-3 text-ink"
        >
          <DemoBanner />
          <fieldset className="space-y-1" disabled={busy}>
            <legend className="type-label">{t('attendee.testCard')}</legend>
            {outcomes.map(([value, label]) => (
              <label key={value} className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name={`activation-fee-${eventId}`}
                  value={value}
                  checked={outcome === value}
                  onChange={() => setOutcome(value)}
                  className="size-5 accent-brand"
                />
                {t(label)}
              </label>
            ))}
          </fieldset>
          <Button
            type="button"
            className="max-w-full whitespace-normal"
            disabled={busy}
            loading={payFee.isPending}
            onClick={() => {
              if (!checklist.fee_paid)
                void perform(() => payFee.mutateAsync({ simulate_outcome: outcome }))
            }}
          >
            {t('paidSalesCard.actions.payFee', { fee })}
          </Button>
        </div>
      )}
      {error != null && (
        <InlineAlert tone="danger" role="alert">
          {t(errorMessageKey(error))}
        </InlineAlert>
      )}
      {canManage && (
        <Button
          type="button"
          className="max-w-full whitespace-normal"
          disabled={!can_activate || busy}
          loading={activate.isPending}
          onClick={() => {
            if (can_activate) void perform(() => activate.mutateAsync())
          }}
        >
          {t('paidSalesCard.actions.activate')}
        </Button>
      )}
    </section>
  )
}
