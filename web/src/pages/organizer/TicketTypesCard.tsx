import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/api/error-codes'
import type { EventResponse, TicketTypeWithAvailability } from '@/api/generated/model'
import {
  useHideTicketType,
  useManagedTicketTypes,
  useUnhideTicketType,
} from '@/api/hooks/organizer-ticket-types'
import ErrorState from '@/components/ErrorState'
import InlineAlert from '@/components/InlineAlert'
import Skeleton from '@/components/Skeleton'
import StatusBadge from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatDateShort } from '@/lib/event-display'
import { ticketTypeStatus } from '@/lib/event-state'
import { formatKZT } from '@/lib/format'
import TicketTypeDialog from '@/pages/organizer/TicketTypeDialog'

const linkButton =
  'type-label text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:text-ink-muted disabled:no-underline'

function TicketTypeRow({
  event,
  type,
  locked,
  onEdit,
}: {
  event: EventResponse
  type: TicketTypeWithAvailability
  locked: boolean
  onEdit: () => void
}) {
  const { t, i18n } = useTranslation()
  const hide = useHideTicketType()
  const unhide = useUnhideTicketType()
  const [error, setError] = useState<unknown>()
  const busy = hide.isPending || unhide.isPending
  const number = new Intl.NumberFormat(i18n.resolvedLanguage)

  async function toggle() {
    setError(undefined)
    try {
      await (type.is_hidden ? unhide : hide).mutateAsync({ ticketTypeId: type.id })
    } catch (failure) {
      setError(failure)
    }
  }

  return (
    <li className="space-y-2 rounded-md bg-paper px-4 py-3.5" data-slot="ticket-type-row">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-[14rem] flex-1 space-y-1">
          <p className="text-[0.9375rem] leading-[1.4] font-semibold wrap-anywhere">{type.name}</p>
          <p className="type-small text-ink-2">
            {t('ticketTypes.soldOf', {
              price: formatKZT(type.price),
              sold: number.format(type.sold_count),
              total: number.format(type.quantity),
            })}
          </p>
          <progress
            aria-label={type.name}
            aria-valuetext={`${type.sold_count} / ${type.quantity}`}
            value={type.sold_count}
            max={type.quantity}
            className="block h-1.5 w-56 max-w-full overflow-hidden rounded-full border-0 bg-line-soft accent-brand [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-line-soft [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-brand"
          />
          <p className="type-small text-ink-muted">
            {t('ticketTypes.window', {
              from: formatDateShort(type.sales_start),
              to: formatDateShort(type.sales_end),
            })}
          </p>
        </div>
        <StatusBadge kind="ticketType" status={ticketTypeStatus(type, event)} />
        <div className="flex items-center gap-3.5">
          <button type="button" className={linkButton} disabled={locked} onClick={onEdit}>
            {t('ticketTypes.edit')} <span className="sr-only">{type.name}</span>
          </button>
          <button
            type="button"
            className={linkButton}
            disabled={locked || busy}
            onClick={() => void toggle()}
          >
            {t(type.is_hidden ? 'ticketTypes.show' : 'ticketTypes.hide')}{' '}
            <span className="sr-only">{type.name}</span>
          </button>
        </div>
      </div>
      {error !== undefined && (
        <InlineAlert tone="danger" role="alert">
          {t(errorMessageKey(error))}
        </InlineAlert>
      )}
    </li>
  )
}

/**
 * "Типы билетов" of the event page (Figma G7): every type with what is sold, its
 * sales window and status, and the ways to add, change, hide and show one.
 * A cancelled event's types can't be changed (the API refuses).
 */
export default function TicketTypesCard({ event }: { event: EventResponse }) {
  const { t, i18n } = useTranslation()
  const types = useManagedTicketTypes(event.id)
  const [dialog, setDialog] = useState<{ type?: TicketTypeWithAvailability } | null>(null)
  const locked = event.status === 'cancelled'
  const total = types.data?.reduce((sum, type) => sum + type.quantity, 0) ?? 0
  const number = new Intl.NumberFormat(i18n.resolvedLanguage)

  return (
    <section
      aria-labelledby="ticket-types-title"
      className="space-y-3 rounded-lg border border-line bg-surface p-5"
      data-slot="ticket-types-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h2 id="ticket-types-title" className="type-card-title">
            {t('ticketTypes.title')}
          </h2>
          {types.data && types.data.length > 0 && (
            <p className="type-small text-ink-muted">
              {event.capacity
                ? t('ticketTypes.sumOfCapacity', {
                    sum: number.format(total),
                    capacity: number.format(event.capacity),
                  })
                : t('ticketTypes.sum', { sum: number.format(total) })}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="dashed"
          size="sm"
          disabled={locked}
          onClick={() => setDialog({})}
        >
          {t('ticketTypes.add')}
        </Button>
      </div>

      {locked && <InlineAlert tone="info">{t('ticketTypes.locked')}</InlineAlert>}

      {types.isError ? (
        <ErrorState
          title={t('routeError.title')}
          description={t(errorMessageKey(types.error))}
          onRetry={() => void types.refetch()}
          retrying={types.isFetching}
        />
      ) : !types.data ? (
        <div role="status" className="space-y-3">
          <span className="sr-only">{t('common.loading')}</span>
          <Skeleton className="h-24 rounded-md" />
          <Skeleton className="h-24 rounded-md" />
        </div>
      ) : types.data.length === 0 ? (
        <p className="rounded-md bg-paper px-4 py-6 text-center text-ink-2">
          {t('ticketTypes.empty')}
        </p>
      ) : (
        <>
          <ul className="space-y-3">
            {types.data.map((type) => (
              <TicketTypeRow
                key={type.id}
                event={event}
                type={type}
                locked={locked}
                onEdit={() => setDialog({ type })}
              />
            ))}
          </ul>
          <p className="type-small text-ink-muted">{t('ticketTypes.hiddenNote')}</p>
        </>
      )}

      {dialog && (
        <TicketTypeDialog event={event} type={dialog.type} onClose={() => setDialog(null)} />
      )}
    </section>
  )
}
