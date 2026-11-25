import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { OrganizerEventSummary } from '@/api/generated/model'
import { CHECKLIST_STEPS, doneChecklistSteps, usePaidSalesOfEvents } from '@/api/hooks/paid-sales'
import InlineAlert from '@/components/InlineAlert'
import { Button } from '@/components/ui/button'

/** Events that may still wait for activation: not over, not active, not suspended. */
function candidates(summaries: OrganizerEventSummary[]): OrganizerEventSummary[] {
  return summaries
    .filter(
      (event) =>
        ['draft', 'upcoming', 'active'].includes(event.lifecycle) &&
        ['not_started', 'pending'].includes(event.paid_sales_status),
    )
    .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time))
    .slice(0, 5)
}

/**
 * The yellow banner of the events list: an event with a paid ticket type whose
 * paid sales are not active yet, and how many of the five steps are done. An event
 * with free tickets only never shows up (its checklist has no paid ticket type).
 * Says nothing when there is nothing to activate, or while the answers are unknown.
 */
export default function PaidSalesBanner({ summaries }: { summaries: OrganizerEventSummary[] }) {
  const { t } = useTranslation()
  const events = candidates(summaries)
  const checklists = usePaidSalesOfEvents(events.map((event) => event.event_id))

  const index = checklists.findIndex(
    ({ data }) => data?.checklist.has_paid_ticket_type && data.status !== 'active',
  )
  const waiting = events[index]
  const status = checklists[index]?.data
  if (!waiting || !status) return null

  return (
    <InlineAlert tone="warn">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-slot="paid-sales-banner">
        <p className="min-w-0 flex-1 font-medium">
          {t('organizerEvents.banner.text', {
            title: waiting.title,
            done: doneChecklistSteps(status.checklist),
            total: CHECKLIST_STEPS.length,
          })}
        </p>
        <Button asChild size="sm" className="bg-ink hover:bg-ink/90">
          <Link to={`/organizer/events/${waiting.event_id}#paid-sales`}>
            {t('organizerEvents.banner.open')}
          </Link>
        </Button>
      </div>
    </InlineAlert>
  )
}
