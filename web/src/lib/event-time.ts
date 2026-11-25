// Event times are entered and shown in Astana time (UTC+5), whatever the
// organizer's own time zone. Kazakhstan has one zone, UTC+5, with no summer
// time (since March 2024), so the offset is a constant.
//
// The API reads a time without an offset ("2026-10-24T19:00") as UTC, which
// would move the event by 5 hours: every time we send carries "+05:00".

export const EVENT_UTC_OFFSET = '+05:00'
const OFFSET_MS = 5 * 60 * 60 * 1000

/**
 * A moment from the API, in any offset, as the value of an
 * <input type="datetime-local"> in Astana time:
 * "2026-10-24T14:00:00Z" → "2026-10-24T19:00". Empty or invalid → "".
 */
export function toEventLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  return new Date(ms + OFFSET_MS).toISOString().slice(0, 16)
}

/**
 * The value of an <input type="datetime-local">, read as Astana time, as the
 * API wants it: "2026-10-24T19:00" → "2026-10-24T19:00:00+05:00".
 * Empty or incomplete → null. The result always has an offset.
 */
export function fromEventLocalInput(local: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/.exec(local)
  if (!match) return null
  const iso = `${match[1]}T${match[2]}:${match[3] ?? '00'}${EVENT_UTC_OFFSET}`
  return Number.isNaN(Date.parse(iso)) ? null : iso
}
