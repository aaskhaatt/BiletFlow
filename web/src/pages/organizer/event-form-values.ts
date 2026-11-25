import type { EventCreate, EventResponse, EventUpdate } from '@/api/generated/model'

export type Visibility = 'public' | 'unlisted' | 'private'
export const VISIBILITIES: readonly Visibility[] = ['public', 'unlisted', 'private']

export type FormValues = {
  title: string
  description: string
  category: string
  capacity: string
  start: string | null
  end: string | null
  venueName: string
  venueAddress: string
  registrationOpens: string | null
  registrationCloses: string | null
  visibility: Visibility
  refundPolicy: string
}

/** Where to go once the event is saved. */
export type After = 'event' | 'preview' | 'publish'

export const length = (text: string) => Array.from(text).length
export const text = (value: string | null | undefined) => value?.trim() ?? ''
const sameMoment = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? null) === (b ?? null) || (!!a && !!b && Date.parse(a) === Date.parse(b))

export function visibilityOf(value: string): Visibility {
  return value === 'unlisted' || value === 'private' ? value : 'public'
}

export function valuesOf(event?: EventResponse): FormValues {
  return {
    title: event?.title ?? '',
    description: event?.description ?? '',
    category: event?.category ?? '',
    capacity: event?.capacity ? String(event.capacity) : '',
    start: event?.start_time ?? null,
    end: event?.end_time ?? null,
    venueName: event?.venue_name ?? '',
    venueAddress: event?.venue_address ?? '',
    registrationOpens: event?.registration_opens_at ?? null,
    registrationCloses: event?.registration_closes_at ?? null,
    visibility: event ? visibilityOf(event.visibility) : 'public',
    refundPolicy: event?.refund_policy ?? '',
  }
}

/** A new event: what is empty is left out, the dates carry their offset. */
export function createPayload(values: FormValues): EventCreate {
  return {
    title: values.title.trim(),
    start_time: values.start!,
    end_time: values.end!,
    visibility: values.visibility,
    ...(text(values.description) && { description: text(values.description) }),
    ...(values.category && { category: values.category }),
    ...(text(values.venueName) && { venue_name: text(values.venueName) }),
    ...(text(values.venueAddress) && { venue_address: text(values.venueAddress) }),
    ...(text(values.capacity) && { capacity: Number(values.capacity) }),
    ...(values.registrationOpens && { registration_opens_at: values.registrationOpens }),
    ...(values.registrationCloses && { registration_closes_at: values.registrationCloses }),
    ...(text(values.refundPolicy) && { refund_policy: text(values.refundPolicy) }),
  }
}

/**
 * What changed, and only that. An optional field the organizer emptied is sent as null
 * (the API clears it); the title, the times and the visibility are never null.
 */
export function changesOf(values: FormValues, event: EventResponse): EventUpdate {
  const data: EventUpdate = {}
  if (values.title.trim() !== event.title) data.title = values.title.trim()
  if (text(values.description) !== text(event.description))
    data.description = text(values.description) || null
  if (!sameMoment(values.start, event.start_time)) data.start_time = values.start
  if (!sameMoment(values.end, event.end_time)) data.end_time = values.end
  if (values.category !== (event.category ?? '')) data.category = values.category || null
  if (text(values.venueName) !== text(event.venue_name))
    data.venue_name = text(values.venueName) || null
  if (text(values.venueAddress) !== text(event.venue_address))
    data.venue_address = text(values.venueAddress) || null
  if (text(values.capacity) !== (event.capacity ? String(event.capacity) : '')) {
    data.capacity = text(values.capacity) ? Number(values.capacity) : null
  }
  if (values.visibility !== visibilityOf(event.visibility)) data.visibility = values.visibility
  if (!sameMoment(values.registrationOpens, event.registration_opens_at))
    data.registration_opens_at = values.registrationOpens
  if (!sameMoment(values.registrationCloses, event.registration_closes_at))
    data.registration_closes_at = values.registrationCloses
  if (text(values.refundPolicy) !== text(event.refund_policy))
    data.refund_policy = text(values.refundPolicy) || null
  return data
}
