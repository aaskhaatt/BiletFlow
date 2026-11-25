import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import Countdown from '@/components/Countdown'

afterEach(() => vi.useRealTimers())

it('recomputes remaining time from the deadline after a suspended tab wakes', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-25T06:00:00Z'))
  render(<Countdown expiresAt="2026-11-25T06:01:00Z" />)

  expect(screen.getByRole('timer')).toHaveTextContent('01:00')
  act(() => vi.advanceTimersByTime(2000))
  expect(screen.getByRole('timer')).toHaveTextContent('00:58')

  vi.setSystemTime(new Date('2026-11-25T06:03:00Z'))
  fireEvent(document, new Event('visibilitychange'))
  expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Срок брони истёк.')
})
