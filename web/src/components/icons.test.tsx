import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ICONS } from '@/components/icons'

// The icons of the Figma frame "Иконки (24 px, stroke 2)", in its order (W2.1)
const FIGMA_ICONS = [
  'calendar',
  'pin',
  'ticket',
  'qr',
  'search',
  'user',
  'check',
  'close',
  'clock',
  'refund',
  'download',
  'chat',
  'chart',
  'promo',
  'warning',
  'settings',
]

describe('icons', () => {
  it('has every icon of the Figma frame, and nothing else', () => {
    expect(Object.keys(ICONS)).toEqual(FIGMA_ICONS)
  })

  it.each(Object.entries(ICONS))(
    '"%s" is 24 px, stroke 2 with round ends, in the text color',
    (_name, Icon) => {
      const { container } = render(<Icon />)
      const svg = container.querySelector('svg')

      expect(svg).toHaveAttribute('width', '24')
      expect(svg).toHaveAttribute('height', '24')
      expect(svg).toHaveAttribute('stroke-width', '2')
      expect(svg).toHaveAttribute('stroke-linecap', 'round')
      expect(svg).toHaveAttribute('stroke-linejoin', 'round')
      expect(svg).toHaveAttribute('stroke', 'currentColor')
    },
  )

  it('is hidden from screen readers unless it has a label', () => {
    const { container, getByRole } = render(
      <>
        <ICONS.warning />
        <ICONS.close aria-label="Закрыть" role="img" />
      </>,
    )

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(getByRole('img', { name: 'Закрыть' })).toBeInTheDocument()
  })

  it('gives every name its own drawing', () => {
    expect(new Set(Object.values(ICONS)).size).toBe(FIGMA_ICONS.length)
  })
})
