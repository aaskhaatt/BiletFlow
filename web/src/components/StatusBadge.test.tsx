import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StatusBadge from '@/components/StatusBadge'
import { STATUS_BADGES, STATUS_KINDS } from '@/components/status-badges'
import i18n from '@/i18n'
import { en } from '@/i18n/locales/en'
import { kk } from '@/i18n/locales/kk'
import { ru } from '@/i18n/locales/ru'

describe('StatusBadge', () => {
  it.each(Object.entries({ ru, kk, en }))(
    'renders distinct, translated labels and decorative icons in %s',
    async (language, messages) => {
      await i18n.changeLanguage(language)

      const { container } = render(
        <>
          {STATUS_KINDS.flatMap((kind) =>
            Object.keys(STATUS_BADGES[kind]).map((status) => (
              <StatusBadge key={`${kind}.${status}`} kind={kind} status={status} />
            )),
          )}
        </>,
      )

      for (const kind of STATUS_KINDS) {
        const translations: Record<string, string> = messages.status[kind]
        const labels = Object.keys(STATUS_BADGES[kind]).map((status) => {
          const badge = container.querySelector(`[data-kind="${kind}"][data-status="${status}"]`)
          expect(translations[status]?.trim(), `${kind}.${status}`).toBeTruthy()
          expect(badge).toHaveTextContent(translations[status])
          expect(badge?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
          return badge?.textContent
        })

        expect(new Set(labels).size, kind).toBe(labels.length)
      }
    },
  )

  it.each(['unknown_status', 'constructor'])(
    'shows an unknown status (%s) in neutral colors',
    (status) => {
      render(<StatusBadge kind="order" status={status} />)

      const badge = screen.getByText(status).closest('[data-slot="status-badge"]')
      expect(badge).toHaveAttribute('data-known', 'false')
      expect(badge).toHaveClass('bg-status-neutral-bg', 'text-status-neutral-fg')
      expect(badge?.querySelector('svg')).toBeNull()
    },
  )
})
