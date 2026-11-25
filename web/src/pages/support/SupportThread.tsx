import { cn } from 'cn'
import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/api/error-codes'
import type {
  SupportCaseDetail,
  SupportCaseHistoryEntry,
  SupportMessageResponse,
} from '@/api/generated/model'
import { useSupportCaseActions } from '@/api/hooks/support'
import InlineAlert from '@/components/InlineAlert'
import StatusBadge from '@/components/StatusBadge'
import TextareaField from '@/components/TextareaField'
import { Button } from '@/components/ui/button'
import { formatClock } from '@/lib/event-display'
import { formatEventTime } from '@/lib/format'
import { SupportAssignee, SupportUserLabel } from '@/pages/support/SupportLabels'
import {
  MAX_MESSAGE,
  supportCategoryText,
  supportStatuses,
  type SupportStatus,
} from '@/pages/support/support-values'

type TimelineEntry =
  | { type: 'created'; date: string; key: string }
  | { type: 'message'; date: string; key: string; message: SupportMessageResponse }
  | { type: 'history'; date: string; key: string; history: SupportCaseHistoryEntry }

function timeline(item: SupportCaseDetail): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    { type: 'created', date: item.created_at, key: 'created' },
    ...item.messages.map((message) => ({
      type: 'message' as const,
      date: message.created_at,
      key: `message-${message.id}`,
      message,
    })),
    ...item.history.map((history, index) => ({
      type: 'history' as const,
      date: history.created_at,
      key: `history-${history.created_at}-${index}`,
      history,
    })),
  ]
  return entries.sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
}

function HistoryLine({
  history,
  me,
  admin,
}: {
  history: SupportCaseHistoryEntry
  me: number
  admin: boolean
}) {
  const { t } = useTranslation()
  if (history.action === 'status_changed') {
    const status = (value?: string | null) => supportStatuses.find((item) => item === value)
    const from = status(history.from_status)
    const to = status(history.to_status)
    return t('supportCases.statusChange', {
      from: from ? t(`status.support.${from}`) : '—',
      to: to ? t(`status.support.${to}`) : '—',
    })
  }
  if (history.assigned_user_id == null) return t('supportCases.unassignment')
  return (
    <>
      {t('supportCases.assignment')} ·{' '}
      <SupportAssignee id={history.assigned_user_id} me={me} admin={admin} />
    </>
  )
}

function CaseTime({ date }: { date: string }) {
  return (
    <time dateTime={date} title={formatEventTime(date, { withZone: true })}>
      {formatClock(date)}
    </time>
  )
}

type Actions = ReturnType<typeof useSupportCaseActions>

export function SupportThread({
  item,
  me,
  admin,
  handler,
  actions,
  refreshing,
  refresh,
}: {
  item: SupportCaseDetail
  me: number
  admin: boolean
  handler: boolean
  actions: Actions
  refreshing: boolean
  refresh: () => void
}) {
  const { t, i18n } = useTranslation()
  const [body, setBody] = useState('')
  const [validation, setValidation] = useState('')
  const busy = useRef(false)
  const end = useRef<HTMLLIElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const messageLength = Array.from(body).length
  const number = new Intl.NumberFormat(i18n.resolvedLanguage)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    actions.send.reset()
    const value = body.trim()
    const count = Array.from(value).length
    if (!count || count > MAX_MESSAGE) {
      setValidation(
        t(count ? 'supportCases.limited' : 'supportCases.required', { count: MAX_MESSAGE }),
      )
      input.current?.focus()
      return
    }
    setValidation('')
    busy.current = true
    try {
      await actions.send.mutateAsync(value)
      setBody('')
      end.current?.scrollIntoView?.({ block: 'nearest' })
    } catch {
      // The mutation retains the API error for the feedback below the input.
    } finally {
      busy.current = false
    }
  }

  return (
    <section
      aria-labelledby="support-thread-title"
      className="min-w-0 space-y-0 rounded-lg border border-line bg-surface"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <h2 id="support-thread-title" className="type-card-title">
          {t('supportCases.conversation')}
        </h2>
        <Button type="button" variant="link" size="sm" loading={refreshing} onClick={refresh}>
          {t('supportCases.refresh')}
        </Button>
      </header>
      <div role="log" aria-label={t('supportCases.conversation')}>
        <ol
          tabIndex={0}
          className="max-h-[min(60vh,36rem)] min-h-48 space-y-4 overflow-y-auto p-4 outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-brand sm:p-5"
        >
          {timeline(item).map((entry) => {
            if (entry.type === 'created')
              return (
                <li key={entry.key} className="text-center type-small text-ink-2">
                  {t('supportCases.created', { category: supportCategoryText(t, item.category) })} ·{' '}
                  <CaseTime date={entry.date} />
                </li>
              )
            if (entry.type === 'history')
              return (
                <li key={entry.key} className="text-center type-small text-ink-2">
                  <HistoryLine history={entry.history} me={me} admin={admin} /> ·{' '}
                  <CaseTime date={entry.date} />
                </li>
              )
            const { message } = entry
            const mine = message.author_user_id === me
            const requester = message.author_user_id === item.requester_user_id
            return (
              <li
                key={entry.key}
                className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}
                data-message-owner={mine ? 'self' : 'other'}
              >
                <p className="type-small font-semibold text-ink-2">
                  {mine ? (
                    t('supportCases.you')
                  ) : requester ? (
                    <SupportUserLabel id={item.requester_user_id} admin={admin} />
                  ) : (
                    t(
                      message.author_user_id === null
                        ? 'supportCases.system'
                        : item.kind === 'platform'
                          ? 'supportCases.platformSupport'
                          : 'supportCases.organizerSupport',
                    )
                  )}
                </p>
                <p
                  className={cn(
                    'max-w-[85%] rounded-lg px-3.5 py-3 type-body whitespace-pre-wrap wrap-anywhere sm:max-w-[75%]',
                    mine ? 'bg-brand text-on-dark' : 'border border-line bg-paper',
                  )}
                >
                  {message.body}
                </p>
                <p className="type-small text-ink-muted">
                  <CaseTime date={entry.date} />
                </p>
              </li>
            )
          })}
          <li ref={end} aria-hidden="true" />
        </ol>
      </div>
      <form
        onSubmit={(event) => void submit(event)}
        noValidate
        className="space-y-2 border-t border-line p-4 sm:p-5"
      >
        <div className="flex items-end gap-2 sm:gap-3">
          <TextareaField
            ref={input}
            label={t('supportCases.reply')}
            value={body}
            required
            error={validation || undefined}
            readOnly={actions.send.isPending}
            placeholder={t('supportCases.reply')}
            fieldClassName="min-w-0 flex-1"
            className={handler ? 'min-h-24' : 'min-h-14'}
            onChange={(event) => {
              setBody(event.target.value)
              setValidation('')
              actions.send.reset()
            }}
          />
          <Button type="submit" loading={actions.send.isPending} className="shrink-0">
            {t('supportCases.send')}
          </Button>
        </div>
        <div className="flex flex-wrap justify-between gap-2 type-small text-ink-muted">
          <p>{t('supportCases.replyHint')}</p>
          <p aria-hidden="true">
            {number.format(messageLength)} / {number.format(MAX_MESSAGE)}
          </p>
        </div>
        {actions.send.isError && (
          <InlineAlert tone="danger" role="alert">
            {t(errorMessageKey(actions.send.error))}
          </InlineAlert>
        )}
      </form>
    </section>
  )
}

export function SupportHandlerPanel({
  item,
  me,
  admin,
  actions,
}: {
  item: SupportCaseDetail
  me: number
  admin: boolean
  actions: Actions
}) {
  const { t } = useTranslation()
  const busy = actions.assignee.isPending || actions.status.isPending
  const mine = item.assigned_user_id === me
  const error = actions.status.error ?? actions.assignee.error
  function changeStatus(status: SupportStatus) {
    if (busy || item.status === status) return
    actions.assignee.reset()
    actions.status.mutate(status)
  }
  function assign() {
    if (busy) return
    actions.status.reset()
    actions.assignee.mutate(mine ? null : me)
  }
  return (
    <aside className="space-y-4">
      {error != null && (
        <InlineAlert tone="danger" role="alert">
          {t(errorMessageKey(error))}
        </InlineAlert>
      )}
      <section className="space-y-3 rounded-lg border border-line bg-surface p-4 sm:p-5">
        <fieldset disabled={busy} className="space-y-2">
          <legend className="type-card-title">{t('supportCases.status')}</legend>
          {supportStatuses.map((status) => (
            <label
              key={status}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-2 hover:bg-line-soft',
                item.status === status && 'bg-brand-soft',
              )}
            >
              <input
                type="radio"
                name="case-status"
                value={status}
                checked={item.status === status}
                onChange={() => changeStatus(status)}
                className="size-4 accent-brand"
              />
              <StatusBadge kind="support" status={status} />
            </label>
          ))}
        </fieldset>
        <p className="type-small text-ink-2">{t('supportCases.statusHelp')}</p>
      </section>
      <section className="space-y-3 rounded-lg border border-line bg-surface p-4 sm:p-5">
        <h2 className="type-card-title">{t('supportCases.assignee')}</h2>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="type-label wrap-anywhere">
            <SupportAssignee id={item.assigned_user_id} me={me} admin={admin} />
          </p>
          <Button type="button" variant="link" size="sm" disabled={busy} onClick={assign}>
            {t(mine ? 'supportCases.unassignMe' : 'supportCases.assignMe')}
          </Button>
        </div>
        <p className="type-small text-ink-2">{t('supportCases.assigneeHelp')}</p>
      </section>
      <section className="space-y-3 rounded-lg border border-line bg-surface p-4 sm:p-5">
        <h2 className="type-card-title">{t('supportCases.requester')}</h2>
        <p className="type-label wrap-anywhere">
          <SupportUserLabel id={item.requester_user_id} admin={admin} />
        </p>
      </section>
    </aside>
  )
}
