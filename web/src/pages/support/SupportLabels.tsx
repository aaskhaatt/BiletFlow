import { useTranslation } from 'react-i18next'
import type { SupportCaseSummary } from '@/api/generated/model'
import { useSupportEventLabel, useSupportUserEmail } from '@/api/hooks/support'
import { formatEventTime } from '@/lib/format'
import { supportCategoryText, type CaseContext } from '@/pages/support/support-values'

export function SupportCategory({ category }: { category: string }) {
  const { t } = useTranslation()
  return supportCategoryText(t, category)
}

export function SupportEventTitle({ id, withTime = false }: { id: number; withTime?: boolean }) {
  const { t } = useTranslation()
  const { data } = useSupportEventLabel(id)
  return (
    <>
      {data?.title ?? t('supportCases.eventNumber', { id })}
      {withTime && data?.start_time && (
        <p className="mt-1 type-small text-ink-2">
          {formatEventTime(data.start_time, { withZone: true })}
        </p>
      )}
    </>
  )
}

export function SupportContextLabel({ context }: { context: CaseContext }) {
  const { t } = useTranslation()
  if (context.key === 'event_id') return <SupportEventTitle id={context.id} />
  return t(context.key === 'order_id' ? 'supportCases.orderNumber' : 'supportCases.ticketNumber', {
    id: context.id,
  })
}

export function SupportCaseContext({ item }: { item: SupportCaseSummary }) {
  const { t } = useTranslation()
  const { event_id: eventId, order_id: orderId, ticket_id: ticketId } = item
  const context =
    ticketId != null
      ? ({ key: 'ticket_id', id: ticketId } as const)
      : orderId != null
        ? ({ key: 'order_id', id: orderId } as const)
        : undefined
  return (
    <div className="space-y-0.5">
      {context && (
        <div className="font-semibold">
          <SupportContextLabel context={context} />
        </div>
      )}
      {eventId != null ? <SupportEventTitle id={eventId} /> : !context && t('supportCases.noEvent')}
    </div>
  )
}

export function SupportUserLabel({
  id,
  me,
  admin = false,
}: {
  id: number
  me?: number
  admin?: boolean
}) {
  const { t } = useTranslation()
  const { data } = useSupportUserEmail(id, admin && id !== me)
  return id === me ? t('supportCases.you') : (data ?? t('supportCases.userNumber', { id }))
}

export function SupportAssignee({
  id,
  me,
  admin = false,
}: {
  id: number | null
  me?: number
  admin?: boolean
}) {
  const { t } = useTranslation()
  if (id == null) return t('supportCases.unassigned')
  if (id === me) return t('supportCases.you')
  return admin ? <SupportUserLabel id={id} admin /> : t('supportCases.otherHandler')
}
