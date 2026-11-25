import { describe, expect, it } from 'vitest'
import { campaignOf } from '@/test/campaign-fixtures'
import {
  campaignStatus,
  changesOf,
  CODE_PATTERN,
  createPayload,
  formatDiscount,
  generateCode,
  valuesOf,
  type FormValues,
} from '@/pages/organizer/campaign-values'

const filled: FormValues = {
  ...valuesOf(undefined, 1),
  name: ' Student discount ',
  discountValue: '20',
}

describe('createPayload', () => {
  it('leaves out what is empty, so the server makes the code and sets no limit or dates', () => {
    expect(createPayload(filled)).toEqual({
      name: 'Student discount',
      discount_type: 'percent',
      discount_value: 20,
      ticket_type_ids: [],
    })
  })

  it('sends the code in capitals, the limit, the dates with their offset and the ticket types', () => {
    expect(
      createPayload({
        ...filled,
        discountType: 'fixed',
        discountValue: '1500',
        code: ' student-20 ',
        maxRedemptions: '50',
        startsAt: '2026-10-01T00:00:00+05:00',
        endsAt: '2026-10-24T18:00:00+05:00',
        ticketTypeIds: [100, 101],
      }),
    ).toEqual({
      name: 'Student discount',
      discount_type: 'fixed',
      discount_value: 1500,
      code: 'STUDENT-20',
      max_redemptions: 50,
      starts_at: '2026-10-01T00:00:00+05:00',
      ends_at: '2026-10-24T18:00:00+05:00',
      ticket_type_ids: [100, 101],
    })
  })
})

describe('changesOf', () => {
  const campaign = campaignOf({
    starts_at: '2026-10-01T00:00:00+05:00',
    ends_at: '2026-10-24T13:00:00Z',
    max_redemptions: 100,
    redemptions_count: 3,
  })

  it('sends nothing when nothing changed, even when the API writes a moment in another offset', () => {
    expect(changesOf(valuesOf(campaign), campaign)).toEqual({})
    expect(
      changesOf({ ...valuesOf(campaign), endsAt: '2026-10-24T18:00:00+05:00' }, campaign),
    ).toEqual({})
  })

  it('sends only the fields that changed, and null where the organizer cleared one', () => {
    expect(
      changesOf(
        {
          ...valuesOf(campaign),
          name: ' New name ',
          startsAt: null,
          maxRedemptions: '',
          isActive: false,
        },
        campaign,
      ),
    ).toEqual({ name: 'New name', starts_at: null, max_redemptions: null, is_active: false })
  })

  it('never sends the discount, the code or the ticket types', () => {
    const data = changesOf(
      { ...valuesOf(campaign), discountValue: '50', code: 'OTHER', ticketTypeIds: [1] },
      campaign,
    )
    expect(data).toEqual({})
  })
})

describe('campaignStatus', () => {
  const now = Date.parse('2026-10-10T12:00:00+05:00')

  it.each([
    ['is switched off', { is_active: false }, 'inactive'],
    ['has ended', { ends_at: '2026-10-10T11:00:00+05:00' }, 'ended'],
    ['ends this very moment', { ends_at: '2026-10-10T12:00:00+05:00' }, 'ended'],
    ['has not started', { starts_at: '2026-10-11T00:00:00+05:00' }, 'scheduled'],
    ['reached its limit', { max_redemptions: 5, redemptions_count: 5 }, 'used_up'],
    [
      'is running',
      { starts_at: '2026-10-01T00:00:00+05:00', ends_at: '2026-10-24T00:00:00+05:00' },
      'active',
    ],
    ['is running without a limit', { max_redemptions: null, redemptions_count: 900 }, 'active'],
  ] as const)('a campaign that %s is "%s"', (_name, over, status) => {
    expect(campaignStatus(campaignOf(over), now)).toBe(status)
  })

  it('says "switched off" before anything else', () => {
    expect(
      campaignStatus(campaignOf({ is_active: false, ends_at: '2026-10-01T00:00:00+05:00' }), now),
    ).toBe('inactive')
  })
})

describe('generateCode', () => {
  it('makes 8 characters the server accepts, without the look-alikes 0 O 1 I L', () => {
    const codes = Array.from({ length: 200 }, () => generateCode())
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-9]{8}$/)
      expect(code).not.toMatch(/[OIL]/)
      expect(CODE_PATTERN.test(code)).toBe(true)
    }
    expect(new Set(codes).size).toBeGreaterThan(190)
  })
})

describe('formatDiscount', () => {
  it('writes a percent and whole tenge', () => {
    expect(formatDiscount('percent', 20)).toBe('20 %')
    expect(formatDiscount('fixed', 1500)).toBe('1 500 ₸')
  })
})
