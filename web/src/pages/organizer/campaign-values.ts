// What the campaign form holds and how it becomes API requests. The form keeps
// every number as the text the organizer typed; these functions read it.
import type { CampaignCreate, CampaignResponse, CampaignUpdate } from '@/api/generated/model'
import { formatKZT } from '@/lib/format'

export type DiscountType = 'percent' | 'fixed'

export type FormValues = {
  name: string
  /** The chosen event's id as text; empty until one is chosen. */
  eventId: string
  discountType: DiscountType
  discountValue: string
  /** Empty means no limit. */
  maxRedemptions: string
  startsAt: string | null
  endsAt: string | null
  /** Empty: the server makes one. */
  code: string
  /** Empty: every paid ticket type of the event. */
  ticketTypeIds: number[]
  /** Only the edit form shows the switch; a new campaign starts on. */
  isActive: boolean
}

export const text = (value: string) => value.trim()
export const isWhole = (value: string) => /^\d+$/.test(text(value))

export function discountTypeOf(value: string): DiscountType {
  return value === 'fixed' ? 'fixed' : 'percent'
}

/** The form for a new campaign, or for `campaign` when it is changed. */
export function valuesOf(campaign?: CampaignResponse, eventId?: number): FormValues {
  if (!campaign) {
    return {
      name: '',
      eventId: eventId ? String(eventId) : '',
      discountType: 'percent',
      discountValue: '',
      maxRedemptions: '',
      startsAt: null,
      endsAt: null,
      code: '',
      ticketTypeIds: [],
      isActive: true,
    }
  }
  return {
    name: campaign.name,
    eventId: String(campaign.event_id),
    discountType: discountTypeOf(campaign.discount_type),
    discountValue: String(campaign.discount_value),
    maxRedemptions: campaign.max_redemptions === null ? '' : String(campaign.max_redemptions),
    startsAt: campaign.starts_at,
    endsAt: campaign.ends_at,
    code: campaign.code,
    ticketTypeIds: campaign.ticket_type_ids,
    isActive: campaign.is_active,
  }
}

/** POST /events/{id}/campaigns: what was left empty is left out, so the server fills it in. */
export function createPayload(values: FormValues): CampaignCreate {
  const code = text(values.code).toUpperCase()
  return {
    name: text(values.name),
    discount_type: values.discountType,
    discount_value: Number(values.discountValue),
    ...(code !== '' && { code }),
    ...(values.startsAt !== null && { starts_at: values.startsAt }),
    ...(values.endsAt !== null && { ends_at: values.endsAt }),
    ...(text(values.maxRedemptions) !== '' && { max_redemptions: Number(values.maxRedemptions) }),
    ticket_type_ids: values.ticketTypeIds,
  }
}

const sameMoment = (a: string | null, b: string | null) =>
  a === b || (a !== null && b !== null && Date.parse(a) === Date.parse(b))

/**
 * PATCH /campaigns/{id}: only what changed. The discount, the code and the ticket
 * types can't change, so they are never sent. null clears a date or the limit.
 */
export function changesOf(values: FormValues, campaign: CampaignResponse): CampaignUpdate {
  const data: CampaignUpdate = {}
  const name = text(values.name)
  if (name !== campaign.name) data.name = name
  if (!sameMoment(values.startsAt, campaign.starts_at)) data.starts_at = values.startsAt
  if (!sameMoment(values.endsAt, campaign.ends_at)) data.ends_at = values.endsAt
  const limit = text(values.maxRedemptions) === '' ? null : Number(values.maxRedemptions)
  if (limit !== campaign.max_redemptions) data.max_redemptions = limit
  if (values.isActive !== campaign.is_active) data.is_active = values.isActive
  return data
}

/** What a campaign is right now, for its badge. The server decides the same way at checkout. */
export type CampaignStatus = 'active' | 'scheduled' | 'inactive' | 'ended' | 'used_up'

export function campaignStatus(
  campaign: Pick<
    CampaignResponse,
    'is_active' | 'starts_at' | 'ends_at' | 'max_redemptions' | 'redemptions_count'
  >,
  now: number,
): CampaignStatus {
  if (!campaign.is_active) return 'inactive'
  if (campaign.ends_at && Date.parse(campaign.ends_at) <= now) return 'ended'
  if (campaign.starts_at && Date.parse(campaign.starts_at) > now) return 'scheduled'
  if (campaign.max_redemptions !== null && campaign.redemptions_count >= campaign.max_redemptions)
    return 'used_up'
  return 'active'
}

const NBSP = String.fromCharCode(160)

/** "20 %" or "1 000 ₸". */
export function formatDiscount(type: string, value: number): string {
  return discountTypeOf(type) === 'percent' ? `${value}${NBSP}%` : formatKZT(value)
}

// The server's own alphabet: no 0/O or 1/I/L, so a code read off a poster is typed correctly
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_PATTERN = /^[A-Z0-9-]{3,32}$/

/** A random code of 8 characters ("Сгенерировать"). The server checks that it is free. */
export function generateCode(length = 8): string {
  // Bytes above this would make the first letters of the alphabet a little more likely
  const limit = 256 - (256 % CODE_ALPHABET.length)
  let code = ''
  while (code.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && code.length < length) code += CODE_ALPHABET[byte % CODE_ALPHABET.length]
    }
  }
  return code
}
