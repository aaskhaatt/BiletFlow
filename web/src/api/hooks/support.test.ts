import { describe, expect, it } from 'vitest'
import type { SupportCaseSummary } from '@/api/generated/model'
import { countOpenSupportCases } from '@/api/hooks/support'

function supportCase(id: number, status: string): SupportCaseSummary {
  return {
    id,
    kind: 'attendee',
    category: 'other',
    subject: 'Question',
    status,
    requester_user_id: 2,
    event_id: 3,
    order_id: null,
    ticket_id: null,
    assigned_user_id: null,
    created_at: '2026-11-20T10:00:00Z',
    updated_at: '2026-11-20T10:00:00Z',
  }
}

describe('countOpenSupportCases', () => {
  it('counts the cases that wait for the handler: new and in progress', () => {
    const cases = [
      supportCase(1, 'open'),
      supportCase(2, 'in_progress'),
      supportCase(3, 'waiting_for_customer'),
      supportCase(4, 'resolved'),
      supportCase(5, 'open'),
    ]

    expect(countOpenSupportCases(cases)).toBe(3)
  })

  it('counts nothing for an empty inbox or a status it does not know', () => {
    expect(countOpenSupportCases([])).toBe(0)
    expect(countOpenSupportCases([supportCase(1, 'archived')])).toBe(0)
  })
})
