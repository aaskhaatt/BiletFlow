// Developer page: every design token in one place. W2 adds the shared components here.
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useEvents } from '@/api/hooks/events'
import DemoBanner from '@/components/DemoBanner'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { getApiUrl } from '@/lib/env'
import ButtonsSection from '@/pages/dev/ButtonsSection'
import ControlsSection from '@/pages/dev/ControlsSection'
import FieldsSection from '@/pages/dev/FieldsSection'
import IconsSection from '@/pages/dev/IconsSection'
import PrimitivesSection from '@/pages/dev/PrimitivesSection'
import StatusBadgesSection from '@/pages/dev/StatusBadgesSection'

// The generated client talking to the real API
function EventsSample() {
  const events = useEvents({ limit: 3 })
  if (events.isPending) return <p className="type-body text-ink-2">GET /events …</p>
  if (events.isError) return <p className="type-body text-status-danger-fg">GET /events: error</p>

  return (
    <div className="type-body text-ink-2" data-testid="events-sample">
      <p>
        GET /events: total <span data-testid="events-total">{events.data.total}</span>, first{' '}
        {events.data.items.length}:
      </p>
      <ul className="list-disc pl-6">
        {events.data.items.map((event) => (
          <li key={event.id}>{event.title}</li>
        ))}
      </ul>
    </div>
  )
}

function BackendStatus() {
  const health = useQuery({
    queryKey: ['dev', 'health'],
    queryFn: async (): Promise<{ status: string; database: string }> => {
      const response = await fetch(`${getApiUrl()}/health`)
      return response.json()
    },
  })

  return (
    <p className="type-body text-ink-2" data-testid="backend-health">
      {getApiUrl()}/health: {health.isPending ? '…' : health.isError ? 'error' : health.data.status}
    </p>
  )
}

const swatches = [
  { figma: 'text/ink', className: 'bg-ink' },
  { figma: 'text/ink-2', className: 'bg-ink-2' },
  { figma: 'text/muted', className: 'bg-ink-muted' },
  { figma: 'text/on-dark', className: 'bg-on-dark' },
  { figma: 'bg/paper', className: 'bg-paper' },
  { figma: 'bg/surface', className: 'bg-surface' },
  { figma: 'bg/sidebar', className: 'bg-sidebar' },
  { figma: 'bg/sidebar-soft', className: 'bg-sidebar-soft' },
  { figma: 'line/default', className: 'bg-line' },
  { figma: 'line/soft', className: 'bg-line-soft' },
  { figma: 'line/field', className: 'bg-line-field' },
  { figma: 'brand/primary', className: 'bg-brand' },
  { figma: 'brand/primary-press', className: 'bg-brand-press' },
  { figma: 'brand/primary-soft', className: 'bg-brand-soft' },
  { figma: 'brand/stub', className: 'bg-stub' },
  { figma: 'status/ok-bg', className: 'bg-status-ok-bg' },
  { figma: 'status/ok-fg', className: 'bg-status-ok-fg' },
  { figma: 'status/info-bg', className: 'bg-status-info-bg' },
  { figma: 'status/info-fg', className: 'bg-status-info-fg' },
  { figma: 'status/danger-bg', className: 'bg-status-danger-bg' },
  { figma: 'status/danger-fg', className: 'bg-status-danger-fg' },
  { figma: 'status/neutral-bg', className: 'bg-status-neutral-bg' },
  { figma: 'status/neutral-fg', className: 'bg-status-neutral-fg' },
  { figma: 'status/warn-bg', className: 'bg-status-warn-bg' },
  { figma: 'status/warn-line', className: 'bg-status-warn-line' },
  { figma: 'status/warn-fg', className: 'bg-status-warn-fg' },
]

// Kazakh letters that many fonts lack: they must render in our fonts, not in a fallback.
const kazakhSample = 'Қатысушылар · Өңдеу · Іс-шара · ә ғ қ ң ө ұ ү һ і'

const textStyles = [
  { label: 'Unbounded Bold 30/120% · type-page-title', className: 'type-page-title' },
  { label: 'Unbounded Bold 26/122% · type-event-title', className: 'type-event-title' },
  { label: 'Unbounded Medium 18/130% · type-card-title', className: 'type-card-title' },
  { label: 'Golos Text Regular 15/140% · type-body', className: 'type-body' },
  { label: 'Golos Text Medium 14/140% · type-label', className: 'type-label' },
  { label: 'Golos Text Regular 13/140% · type-small', className: 'type-small' },
]

const radii = [
  { label: '8 · rounded-sm', className: 'rounded-sm' },
  { label: '12 · rounded-md', className: 'rounded-md' },
  { label: '16 · rounded-lg', className: 'rounded-lg' },
  { label: '20 · rounded-xl', className: 'rounded-xl' },
]

export default function DevUiPage() {
  const { t } = useTranslation()

  return (
    <main className="mx-auto max-w-5xl space-y-10 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="type-page-title">Design tokens</h1>
        <LanguageSwitcher />
      </header>

      <section>
        <h2 className="type-card-title">Language</h2>
        <p className="type-body" data-testid="i18n-sample">
          {t('dev.greeting')}
        </p>
      </section>

      <section>
        <h2 className="type-card-title">Backend</h2>
        <BackendStatus />
        <EventsSample />
      </section>

      <section>
        <h2 className="type-card-title">Typography</h2>
        <ul className="mt-4 space-y-4">
          {textStyles.map((style) => (
            <li key={style.className} data-text-style={style.className}>
              <div className="type-small text-ink-muted">{style.label}</div>
              <div className={style.className}>{kazakhSample}</div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="type-card-title">Colors ({swatches.length})</h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {swatches.map((swatch) => (
            <li
              key={swatch.figma}
              className="overflow-hidden rounded-md border border-line bg-surface"
              data-token={swatch.figma}
            >
              <div className={`h-14 border-b border-line ${swatch.className}`} />
              <div className="p-2 text-ink-2">{swatch.figma}</div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="type-card-title">Radii</h2>
        <ul className="mt-4 flex flex-wrap gap-4">
          {radii.map((radius) => (
            <li
              key={radius.label}
              className={`flex size-28 items-end border border-line-field bg-brand-soft p-2 text-brand ${radius.className}`}
            >
              {radius.label}
            </li>
          ))}
        </ul>
      </section>

      <IconsSection />

      <ButtonsSection />

      <FieldsSection />

      <ControlsSection />

      <StatusBadgesSection />

      <section className="max-w-lg space-y-4">
        <h2 className="type-card-title">{t('dev.demoPayment')}</h2>
        <DemoBanner />
      </section>

      <PrimitivesSection />
    </main>
  )
}
