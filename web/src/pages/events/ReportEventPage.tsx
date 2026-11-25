import { cn } from 'cn'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import { CLIENT_ERROR_CODES, isApiError } from '@/api/errors'
import { useReportsReportEvent } from '@/api/generated/endpoints/reports/reports'
import { EventReportCreateReason, type EventResponse } from '@/api/generated/model'
import { useEvent } from '@/api/hooks/events'
import duplicateIcon from '@/assets/report-duplicate.svg'
import errorIcon from '@/assets/report-error.svg'
import closeIcon from '@/assets/report-close.svg'
import radioCheckedIcon from '@/assets/report-radio-checked.svg'
import radioIcon from '@/assets/report-radio.svg'
import sendingClock from '@/assets/report-sending-clock.svg'
import successIcon from '@/assets/report-success.svg'
import { RequireAuth } from '@/auth/route-guards'
import ErrorState from '@/components/ErrorState'
import PublicEventFeedback from '@/components/PublicEventFeedback'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { formatEventTime } from '@/lib/format'
import { useViewerDesktop } from '@/lib/viewer-layout'
import { parseEventId } from '@/pages/events/availability'

const reasons = Object.values(EventReportCreateReason)
const maxDetails = 2000
const actionClass = 'h-13 w-full border-0 whitespace-normal'
const backClass = '-mr-1 grid size-11 shrink-0 place-items-center rounded-sm text-xl'

export default function ReportEventPage() {
  const eventId = parseEventId(useParams().eventId)
  const { search } = useLocation()
  return (
    <RequireAuth>
      {eventId === null ? (
        <ReportNotFound />
      ) : (
        <ReportRoute key={eventId} eventId={eventId} eventPath={`/events/${eventId}${search}`} />
      )}
    </RequireAuth>
  )
}

function ReportLayout({
  to,
  sending,
  children,
}: {
  to: string
  sending?: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  const desktop = useViewerDesktop()
  const navigate = useNavigate()
  const dialogTitle = useRef<HTMLHeadingElement>(null)

  if (desktop) {
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !sending) void navigate(to, { replace: true })
        }}
      >
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto border border-line p-7 ring-0 sm:max-w-[560px]"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            dialogTitle.current?.focus()
          }}
          onEscapeKeyDown={(event) => {
            if (sending) event.preventDefault()
          }}
          onPointerDownOutside={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <div className="flex items-center justify-between gap-3">
            <DialogTitle
              ref={dialogTitle}
              tabIndex={-1}
              className="pr-0 text-[22px] font-medium wrap-anywhere"
            >
              {t('reportEvent.title')}
            </DialogTitle>
            <DialogClose asChild>
              <button
                type="button"
                disabled={sending}
                aria-label={t('common.close')}
                className="grid size-11 shrink-0 place-items-center rounded-sm hover:bg-line-soft disabled:opacity-60"
              >
                <img src={closeIcon} width="20" height="20" alt="" />
              </button>
            </DialogClose>
          </div>
          {children}
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <main
      id="main-content"
      tabIndex={-1}
      data-route-id="event-report"
      className="mx-auto flex min-h-dvh w-full max-w-180 flex-col"
    >
      <header className="flex min-h-15 items-center border-b border-line py-2 pr-4">
        {sending ? (
          <span aria-hidden="true" className={cn(backClass, 'text-ink-muted')}>
            ←
          </span>
        ) : (
          <Link
            to={to}
            aria-label={t('reportEvent.back')}
            className={cn(backClass, 'hover:bg-line-soft')}
          >
            ←
          </Link>
        )}
        <h1 className="font-display text-[1.0625rem] font-medium leading-[1.3] wrap-anywhere">
          {t('reportEvent.title')}
        </h1>
      </header>
      {children}
    </main>
  )
}

function ReportNotFound() {
  const { t } = useTranslation()
  return (
    <ReportLayout to="/">
      <div className="flex flex-1 flex-col px-4">
        <PublicEventFeedback
          icon="search"
          title={t('event.notFoundTitle')}
          description={t('event.notFoundText')}
          action={
            <Button asChild className={actionClass}>
              <Link to="/">{t('event.toCatalog')}</Link>
            </Button>
          }
        />
      </div>
    </ReportLayout>
  )
}

function ReportRoute({ eventId, eventPath }: { eventId: number; eventPath: string }) {
  const { t } = useTranslation()
  const event = useEvent(eventId)
  if (isApiError(event.error) && event.error.status === 404) return <ReportNotFound />
  if (event.data) return <ReportForm event={event.data} eventPath={eventPath} />

  return (
    <ReportLayout to={eventPath}>
      <div className="p-4">
        {event.isError ? (
          <ErrorState
            title={t('event.loadError')}
            description={t(errorMessageKey(event.error))}
            onRetry={() => void event.refetch()}
            retrying={event.isFetching}
          />
        ) : (
          <p role="status">{t('common.loading')}</p>
        )}
      </div>
    </ReportLayout>
  )
}

function ReportForm({ event, eventPath }: { event: EventResponse; eventPath: string }) {
  const { t } = useTranslation()
  const desktop = useViewerDesktop()
  const [reason, setReason] = useState<EventReportCreateReason>()
  const [details, setDetails] = useState('')
  const inFlight = useRef(false)
  const report = useReportsReportEvent({ mutation: { retry: false, networkMode: 'always' } })
  const { error, isError, isPending, isSuccess } = report
  const duplicate =
    isApiError(error) && error.status === 409 && error.error === 'EventAlreadyReportedError'
  const networkError = isApiError(error) && error.error === CLIENT_ERROR_CODES.network

  async function submit(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault()
    if (!reason || inFlight.current) return
    inFlight.current = true
    try {
      await report.mutateAsync({
        eventId: event.id,
        data: { reason, details: details.trim() || null },
      })
    } catch {
      // The mutation exposes the error while the inputs stay filled for a retry.
    } finally {
      inFlight.current = false
    }
  }

  if (isSuccess || duplicate) {
    return (
      <ReportLayout to={eventPath}>
        <ReportResult
          success={isSuccess}
          title={event.title}
          eventPath={eventPath}
          desktop={desktop}
        />
      </ReportLayout>
    )
  }

  return (
    <ReportLayout to={eventPath} sending={isPending}>
      <form
        className="space-y-5 px-4 pt-4 pb-6 min-[1024px]:p-0"
        onSubmit={(formEvent) => void submit(formEvent)}
      >
        {isError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-md bg-status-danger-bg px-3.5 py-3 text-sm leading-[1.4] text-status-danger-fg"
          >
            <img src={errorIcon} width="20" height="20" alt="" className="shrink-0" />
            <div className="min-w-0 space-y-1 wrap-anywhere">
              <p className="font-semibold">{t('reportEvent.sendError')}</p>
              <p>{networkError ? t('reportEvent.networkError') : t(errorMessageKey(error))}</p>
            </div>
          </div>
        )}
        <div className="space-y-0.5 rounded-md border border-line bg-surface p-3.5 wrap-anywhere min-[1024px]:space-y-0 min-[1024px]:border-0 min-[1024px]:p-0 min-[1024px]:text-ink-muted">
          <p className="type-body font-semibold min-[1024px]:inline min-[1024px]:font-normal">
            {event.title}
          </p>
          <span aria-hidden="true" className="hidden min-[1024px]:inline">
            {' '}
            ·{' '}
          </span>
          <p className="type-small text-ink-muted min-[1024px]:inline min-[1024px]:type-body">
            <time dateTime={event.start_time}>
              {formatEventTime(event.start_time, { compact: true })} (UTC+5)
            </time>
            {event.venue_name && ` · ${event.venue_name}`}
          </p>
        </div>
        <p className="text-sm leading-[1.4] text-ink-2">{t('reportEvent.review')}</p>
        <fieldset disabled={isPending} className="min-w-0 space-y-2">
          <legend className="mb-2 type-body font-semibold">
            {t('reportEvent.reason')}{' '}
            <span className="ml-1 type-small text-ink-muted">{t('reportEvent.required')}</span>
          </legend>
          {reasons.map((value) => (
            <label
              key={value}
              className={cn(
                'flex min-h-12 items-center gap-3 rounded-md border px-3.5 py-3 type-body font-medium has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand min-[1024px]:min-h-11 min-[1024px]:py-2.5',
                reason === value
                  ? 'border-brand bg-brand-soft inset-ring-1 inset-ring-brand font-semibold'
                  : 'border-line bg-surface',
                isPending ? 'text-ink-2' : 'cursor-pointer',
              )}
            >
              <input
                type="radio"
                name="reason"
                value={value}
                checked={reason === value}
                required
                className="sr-only"
                onChange={() => setReason(value)}
              />
              <img
                src={reason === value ? radioCheckedIcon : radioIcon}
                width="18"
                height="18"
                alt=""
                className="shrink-0"
              />
              <span className="min-w-0 wrap-anywhere">{t(`reportEvent.reasons.${value}`)}</span>
            </label>
          ))}
        </fieldset>
        <div className="space-y-1.5">
          <label htmlFor="report-details" className="block type-body font-semibold">
            {t('reportEvent.details')}{' '}
            <span className="ml-1 type-small text-ink-muted">{t('reportEvent.optional')}</span>
          </label>
          <Textarea
            id="report-details"
            aria-describedby="report-details-limit"
            value={details}
            readOnly={isPending}
            placeholder={t('reportEvent.detailsPlaceholder')}
            className="min-h-33 resize-none read-only:bg-paper read-only:text-ink-2 max-md:text-[0.9375rem] min-[1024px]:min-h-28"
            onChange={(change) =>
              setDetails(Array.from(change.target.value).slice(0, maxDetails).join(''))
            }
          />
          <div className="flex flex-wrap justify-between gap-x-2 type-small text-ink-muted">
            <span id="report-details-limit">
              {t('reportEvent.detailsLimit', { max: maxDetails })}
            </span>
            <span className="tabular-nums">
              {Array.from(details).length} / {maxDetails}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2 min-[1024px]:gap-4">
          {isPending && (
            <p
              role="status"
              className="order-2 flex items-center justify-center gap-2 text-center type-small text-ink-muted min-[1024px]:order-none min-[1024px]:justify-end"
            >
              <img src={sendingClock} width="16" height="16" alt="" className="shrink-0" />
              {t('reportEvent.sendingHint')}
            </p>
          )}
          <div className="contents min-[1024px]:flex min-[1024px]:flex-wrap min-[1024px]:items-center min-[1024px]:justify-end min-[1024px]:gap-2.5">
            {!reason && (
              <p className="order-2 text-center type-small text-ink-muted min-[1024px]:order-none">
                {t(desktop ? 'reportEvent.chooseReasonShort' : 'reportEvent.chooseReason')}
              </p>
            )}
            {desktop ? (
              <DialogClose asChild>
                <Button variant="outline" type="button" disabled={isPending}>
                  {t('reportEvent.cancelDialog')}
                </Button>
              </DialogClose>
            ) : isPending ? (
              <Button type="button" disabled className="order-3 h-11 w-full whitespace-normal">
                {t('reportEvent.cancel')}
              </Button>
            ) : (
              <Button asChild variant="ghost" className="order-3 h-11 w-full whitespace-normal">
                <Link to={eventPath}>{t('reportEvent.cancel')}</Link>
              </Button>
            )}
            <Button
              type="submit"
              disabled={!reason || isPending}
              className={cn(
                actionClass,
                'order-1 min-[1024px]:order-none min-[1024px]:h-12 min-[1024px]:w-auto',
              )}
            >
              {isPending
                ? t('reportEvent.sending')
                : isError
                  ? t('reportEvent.retry')
                  : t('reportEvent.submit')}
            </Button>
          </div>
        </div>
      </form>
    </ReportLayout>
  )
}

function ReportResult({
  success,
  title,
  eventPath,
  desktop,
}: {
  success: boolean
  title: string
  eventPath: string
  desktop: boolean
}) {
  const { t } = useTranslation()
  return (
    <section className="flex flex-1 flex-col justify-center gap-6 px-4 pt-6 pb-16 text-center min-[1024px]:gap-7 min-[1024px]:p-0 min-[1024px]:pt-2">
      <div className="flex flex-col items-center gap-4 px-2 wrap-anywhere">
        <span
          className={cn(
            'grid size-18 place-items-center rounded-full',
            success ? 'bg-status-ok-bg' : 'bg-status-info-bg',
          )}
        >
          <img src={success ? successIcon : duplicateIcon} width="32" height="32" alt="" />
        </span>
        <div className="space-y-2">
          <h2
            ref={(heading) => heading?.focus()}
            tabIndex={-1}
            className="font-display text-xl font-medium leading-[1.3]"
          >
            {success ? t('reportEvent.success') : t('reportEvent.duplicateTitle')}
          </h2>
          <p className="type-body text-ink-2">
            {success ? t('reportEvent.successText', { title }) : t('reportEvent.duplicateText')}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <Button asChild className={cn(actionClass, 'min-[1024px]:w-auto')}>
          <Link to={eventPath} replace={desktop}>
            {t('event.backToEvent')}
          </Link>
        </Button>
        {success && !desktop && (
          <Button asChild variant="ghost" className="h-11 w-full whitespace-normal">
            <Link to="/">{t('event.toCatalog')}</Link>
          </Button>
        )}
      </div>
    </section>
  )
}
