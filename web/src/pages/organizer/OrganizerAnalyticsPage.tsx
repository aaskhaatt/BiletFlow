import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import type { EventResponse } from '@/api/generated/model'
import { useEventAnalytics } from '@/api/hooks/organizer-analytics'
import { useMyEvents } from '@/api/hooks/organizer-events'
import { useManagedTicketTypes } from '@/api/hooks/organizer-ticket-types'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import SelectField from '@/components/SelectField'
import TextField from '@/components/TextField'
import { Button } from '@/components/ui/button'
import { fromEventLocalInput, isCalendarDay, nextCalendarDay } from '@/lib/event-time'
import OrganizerAnalyticsReport from '@/pages/organizer/OrganizerAnalyticsReport'
import OrganizerPage from '@/pages/organizer/OrganizerPage'

function dateParam(params: URLSearchParams, name: string): string {
  const value = params.get(name) ?? ''
  return isCalendarDay(value) ? value : ''
}

function PeriodFilter({
  from,
  to,
  onApply,
}: {
  from: string
  to: string
  onApply: (from: string, to: string) => void
}) {
  const { t } = useTranslation()
  const [invalid, setInvalid] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const start = String(form.get('date_from') ?? '')
    const end = String(form.get('date_to') ?? '')
    if (
      (start && !isCalendarDay(start)) ||
      (end && !isCalendarDay(end)) ||
      (start && end && start > end)
    ) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    onApply(start, end)
  }

  return (
    <form noValidate className="space-y-2" onSubmit={submit}>
      <fieldset className="space-y-2">
        <legend className="type-label">{t('organizerAnalytics.period')}</legend>
        <div className="flex flex-wrap items-end gap-3">
          <TextField
            type="date"
            name="date_from"
            label={t('organizerAnalytics.from')}
            defaultValue={from}
            onChange={() => setInvalid(false)}
          />
          <TextField
            type="date"
            name="date_to"
            label={t('organizerAnalytics.to')}
            defaultValue={to}
            error={invalid ? t('organizerAnalytics.invalidPeriod') : undefined}
            onChange={() => setInvalid(false)}
          />
          <Button type="submit" variant="outline">
            {t('organizerAnalytics.apply')}
          </Button>
        </div>
        <p className="type-small text-ink-2">{t('time.astanaZone')}</p>
      </fieldset>
    </form>
  )
}

function EventAnalytics({ event }: { event: EventResponse }) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const from = dateParam(params, 'date_from')
  const to = dateParam(params, 'date_to')
  const end = from && to && from > to ? '' : to
  const types = useManagedTicketTypes(event.id)
  const requestedType = params.get('ticket_type_id')
  const ticketType = types.data?.find((type) => String(type.id) === requestedType)
  const analytics = useEventAnalytics(
    event.id,
    {
      date_from: from ? fromEventLocalInput(`${from}T00:00`) : undefined,
      date_to: end ? fromEventLocalInput(`${nextCalendarDay(end)}T00:00`) : undefined,
      ticket_type_id: ticketType?.id,
    },
    { query: { enabled: !requestedType || !types.isPending } },
  )

  function updateFilters(values: Record<string, string>) {
    const next = new URLSearchParams(params)
    next.set('event', String(event.id))
    for (const [name, value] of Object.entries(values)) {
      if (value) next.set(name, value)
      else next.delete(name)
    }
    setParams(next)
  }

  return (
    <>
      <div className="space-y-4 rounded-lg border border-line bg-surface p-4">
        <PeriodFilter
          key={`${from}:${end}`}
          from={from}
          to={end}
          onApply={(start, finish) => updateFilters({ date_from: start, date_to: finish })}
        />
        {types.isError ? (
          <ErrorState
            title={t('organizerAnalytics.typesError')}
            description={t(errorMessageKey(types.error))}
            onRetry={() => void types.refetch()}
            retrying={types.isFetching}
          />
        ) : (
          <SelectField
            className="max-w-sm"
            label={t('organizerAnalytics.ticketType')}
            disabled={types.isPending}
            value={ticketType ? String(ticketType.id) : 'all'}
            onValueChange={(value) =>
              updateFilters({ ticket_type_id: value === 'all' ? '' : value })
            }
            options={[
              { value: 'all', label: t('organizerAnalytics.allTypes') },
              ...(types.data ?? []).map((type) => ({ value: String(type.id), label: type.name })),
            ]}
          />
        )}
      </div>
      {analytics.isError ? (
        <ErrorState
          title={t('organizerAnalytics.loadError')}
          description={t(errorMessageKey(analytics.error))}
          onRetry={() => void analytics.refetch()}
          retrying={analytics.isFetching}
        />
      ) : analytics.data ? (
        <OrganizerAnalyticsReport
          data={analytics.data}
          event={event}
          hasPeriod={Boolean(from || end)}
          hasTicketType={Boolean(ticketType)}
        />
      ) : (
        <p role="status">{t('common.loading')}</p>
      )}
    </>
  )
}

export default function OrganizerAnalyticsPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const events = useMyEvents()
  const requested = params.get('event')
  const event = requested
    ? events.data?.find((item) => String(item.id) === requested)
    : events.data?.[0]

  return (
    <OrganizerPage routeId="organizer-analytics" title={t('nav.analytics')}>
      {events.isError ? (
        <ErrorState
          title={t('organizerAnalytics.eventsError')}
          description={t(errorMessageKey(events.error))}
          onRetry={() => void events.refetch()}
          retrying={events.isFetching}
        />
      ) : !events.data ? (
        <p role="status">{t('common.loading')}</p>
      ) : events.data.length === 0 ? (
        <EmptyState title={t('organizerAnalytics.noEvents')} />
      ) : (
        <>
          <SelectField
            className="max-w-sm"
            label={t('eventOperations.event')}
            value={event ? String(event.id) : ''}
            placeholder={t('organizerAnalytics.chooseEvent')}
            onValueChange={(value) => {
              const next = new URLSearchParams(params)
              next.set('event', value)
              next.delete('ticket_type_id')
              setParams(next)
            }}
            options={events.data.map((item) => ({ value: String(item.id), label: item.title }))}
          />
          {event && <EventAnalytics key={event.id} event={event} />}
        </>
      )}
    </OrganizerPage>
  )
}
