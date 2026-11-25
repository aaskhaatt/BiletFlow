import { cn } from 'cn'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useApplyAsOrganizer } from '@/api/hooks/organizers'
import { errorMessageKey } from '@/api/error-codes'
import { useMe } from '@/auth/use-me'
import ErrorState from '@/components/ErrorState'
import InlineAlert from '@/components/InlineAlert'
import Skeleton from '@/components/Skeleton'
import StatusBadge from '@/components/StatusBadge'
import TextField from '@/components/TextField'
import { CheckIcon, ClockIcon, CloseIcon, TicketIcon } from '@/components/icons'
import { TONE_CLASSES } from '@/components/status-badges'
import { Button } from '@/components/ui/button'
import { applyServerFieldErrors } from '@/lib/form-errors'

// The API accepts a public name of 2 to 100 characters (or none).
const displayNameLength = { min: 2, max: 100 }

const benefits = ['tickets', 'promo', 'analytics', 'staff'] as const

const circleTones = {
  brand: 'bg-brand-soft text-brand',
  warn: 'bg-status-warn-bg text-status-warn-fg',
  danger: 'bg-status-danger-bg text-status-danger-fg',
  ok: 'bg-status-ok-bg text-status-ok-fg',
}

const stateButtonClassName = 'h-[3.25rem] w-full'

function IconCircle({
  tone,
  icon: Icon,
}: {
  tone: keyof typeof circleTones
  icon: typeof TicketIcon
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-16 shrink-0 items-center justify-center rounded-full',
        circleTones[tone],
      )}
    >
      <Icon className="size-7" />
    </span>
  )
}

/** A plain note of the design ("Плашка"): colored panel, text only. */
function Note({ tone, children }: { tone: 'info' | 'neutral'; children: ReactNode }) {
  return (
    <p className={cn('type-body w-full rounded-md px-3.5 py-3', TONE_CLASSES[tone])}>{children}</p>
  )
}

type FormValues = { displayName: string }

/** The first application, or a rejected one sent again (`resubmit`). */
function ApplicationForm({ initialName, resubmit }: { initialName: string; resubmit: boolean }) {
  const { t } = useTranslation()
  const { apply } = useApplyAsOrganizer()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: { displayName: initialName } })

  async function submit({ displayName }: FormValues) {
    const name = displayName.trim()
    try {
      await apply(name === '' ? null : name)
    } catch (error) {
      const shown = applyServerFieldErrors(error, setError, {
        message: t('validation.invalid'),
        fieldMap: { display_name: 'displayName' },
      })
      if (!shown) setError('root.server', { type: 'server', message: t(errorMessageKey(error)) })
    }
  }

  return (
    <form
      noValidate
      className="flex w-full flex-col gap-5"
      onSubmit={(event) => {
        // Enter in the field must not send the application twice
        if (isSubmitting) {
          event.preventDefault()
          return
        }
        void handleSubmit(submit)(event)
      }}
    >
      <Note tone="info">{t('organizerApplication.howItWorks')}</Note>
      <TextField
        autoComplete="organization"
        label={t('organizerApplication.displayName.label')}
        hint={t('organizerApplication.displayName.hint')}
        error={errors.displayName?.message}
        readOnly={isSubmitting}
        {...register('displayName', {
          validate: (value) => {
            const length = Array.from(value.trim()).length
            return (
              length === 0 ||
              (length >= displayNameLength.min && length <= displayNameLength.max) ||
              t('organizerApplication.displayName.length')
            )
          },
        })}
      />
      {errors.root?.server && (
        <InlineAlert tone="danger" role="alert">
          {errors.root.server.message}
        </InlineAlert>
      )}
      <Button type="submit" loading={isSubmitting} className={stateButtonClassName}>
        {t(resubmit ? 'organizerApplication.resubmit' : 'organizerApplication.submit')}
      </Button>
    </form>
  )
}

function Introduction() {
  const { t } = useTranslation()
  return (
    <>
      <IconCircle tone="brand" icon={TicketIcon} />
      <h1 className="type-event-title">{t('organizerApplication.title')}</h1>
      <p className="type-body text-ink-2">{t('organizerApplication.intro')}</p>
      <ul className="flex w-full flex-col gap-2.5">
        {benefits.map((benefit) => (
          <li key={benefit} className="type-body flex items-center gap-2.5">
            <CheckIcon aria-hidden="true" className="size-5 shrink-0 text-status-ok-fg" />
            {t(`organizerApplication.benefits.${benefit}`)}
          </li>
        ))}
      </ul>
    </>
  )
}

function Pending() {
  const { t } = useTranslation()
  return (
    <>
      <IconCircle tone="warn" icon={ClockIcon} />
      <StatusBadge kind="organizerApplication" status="pending" />
      <h1 className="type-event-title">{t('organizerApplication.pending.title')}</h1>
      <p className="type-body text-ink-2">{t('organizerApplication.pending.description')}</p>
      <Note tone="neutral">{t('organizerApplication.pending.note')}</Note>
      <Button asChild variant="outline" className={stateButtonClassName}>
        <Link to="/">{t('organizerApplication.pending.toCatalog')}</Link>
      </Button>
    </>
  )
}

function Rejected({ reason, displayName }: { reason: string | null; displayName: string }) {
  const { t } = useTranslation()
  return (
    <>
      <IconCircle tone="danger" icon={CloseIcon} />
      <StatusBadge kind="organizerApplication" status="rejected" />
      <h1 className="type-event-title">{t('organizerApplication.rejected.title')}</h1>
      <p className="type-body text-ink-2">{t('organizerApplication.rejected.description')}</p>
      {reason && (
        <div className="w-full">
          <InlineAlert tone="danger">
            <p className="font-semibold">{t('organizerApplication.rejected.reason')}</p>
            <p className="mt-1 whitespace-pre-line">{reason}</p>
          </InlineAlert>
        </div>
      )}
      <ApplicationForm initialName={displayName} resubmit />
    </>
  )
}

function Approved() {
  const { t } = useTranslation()
  return (
    <>
      <IconCircle tone="ok" icon={CheckIcon} />
      <StatusBadge kind="organizerApplication" status="approved" />
      <h1 className="type-event-title">{t('organizerApplication.approved.title')}</h1>
      <p className="type-body text-ink-2">{t('organizerApplication.approved.description')}</p>
      <Button asChild className={stateButtonClassName}>
        <Link to="/organizer">{t('organizerApplication.approved.open')}</Link>
      </Button>
    </>
  )
}

/**
 * /become-organizer (Figma G6). One page for every state of the application:
 * none → the form, pending → "under review", rejected → the reason and "apply
 * again", approved → a way into the workspace. GET /auth/me decides, and it is
 * read again when the tab gets focus, so an approval shows up on this page.
 */
export default function BecomeOrganizerPage() {
  const { t } = useTranslation()
  const me = useMe()
  const organizer = me.data?.organizer

  let card: ReactNode
  if (me.data) {
    switch (me.data.roles.organizerStatus) {
      case 'pending':
        card = <Pending />
        break
      case 'rejected':
        card = (
          <Rejected
            reason={organizer?.rejection_reason ?? null}
            displayName={organizer?.display_name ?? ''}
          />
        )
        break
      case 'approved':
        card = <Approved />
        break
      default:
        card = (
          <>
            <Introduction />
            <ApplicationForm initialName="" resubmit={false} />
          </>
        )
    }
  } else if (me.isError) {
    card = (
      <div className="w-full">
        <ErrorState
          heading="h1"
          title={t('routeError.title')}
          description={t(errorMessageKey(me.error))}
          onRetry={() => void me.refetch()}
          retrying={me.isFetching}
        />
      </div>
    )
  } else {
    card = (
      <div role="status" className="w-full space-y-3">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      data-route-id="become-organizer"
      className="mx-auto w-full max-w-[40rem] px-4 py-8 md:py-16"
    >
      <div
        className="flex flex-col items-start gap-5 rounded-lg border border-line bg-surface p-6 sm:p-10"
        data-slot="become-organizer-card"
      >
        {card}
      </div>
    </main>
  )
}
