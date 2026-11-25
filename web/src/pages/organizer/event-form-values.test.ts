import { describe, expect, it } from 'vitest'
import { eventOf } from '@/test/organizer-fixtures'
import {
  changesOf,
  createPayload,
  valuesOf,
  type FormValues,
} from '@/pages/organizer/event-form-values'

const event = eventOf({
  title: 'Jazz night',
  description: 'Live jazz',
  category: 'Music',
  capacity: 200,
  venue_name: 'Astana Hall',
  venue_address: 'Abay 1',
  refund_policy: 'No refunds',
  registration_opens_at: '2026-10-01T10:00:00+05:00',
})

describe('changesOf', () => {
  it('is empty when nothing changed, even if the same moment is written in another offset', () => {
    const values: FormValues = { ...valuesOf(event), start: '2026-12-01T14:00:00Z' }
    expect(changesOf(values, event)).toEqual({})
  })

  it('sends only the fields that changed', () => {
    const values = {
      ...valuesOf(event),
      title: ' New name ',
      capacity: '250',
      visibility: 'unlisted' as const,
    }
    expect(changesOf(values, event)).toEqual({
      title: 'New name',
      capacity: 250,
      visibility: 'unlisted',
    })
  })

  it('sends null for an optional field the organizer emptied, never for the required ones', () => {
    const values: FormValues = {
      ...valuesOf(event),
      description: '  ',
      category: '',
      capacity: '',
      venueName: '',
      venueAddress: '',
      registrationOpens: null,
      refundPolicy: '',
    }
    expect(changesOf(values, event)).toEqual({
      description: null,
      category: null,
      capacity: null,
      venue_name: null,
      venue_address: null,
      registration_opens_at: null,
      refund_policy: null,
    })
  })

  it('sends dates with their offset and the moved ones only', () => {
    const values: FormValues = {
      ...valuesOf(event),
      end: '2026-12-01T23:00:00+05:00',
      registrationCloses: '2026-11-30T18:00:00+05:00',
    }
    expect(changesOf(values, event)).toEqual({
      end_time: '2026-12-01T23:00:00+05:00',
      registration_closes_at: '2026-11-30T18:00:00+05:00',
    })
  })
})

describe('createPayload', () => {
  it('leaves out what is empty and trims the text', () => {
    const values: FormValues = {
      ...valuesOf(),
      title: ' Jazz ',
      start: '2026-12-01T19:00:00+05:00',
      end: '2026-12-01T22:00:00+05:00',
      capacity: ' 150 ',
    }
    expect(createPayload(values)).toEqual({
      title: 'Jazz',
      start_time: '2026-12-01T19:00:00+05:00',
      end_time: '2026-12-01T22:00:00+05:00',
      visibility: 'public',
      capacity: 150,
    })
  })
})
