import type { EventResponse } from '@/api/generated/model'

function calendarText(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replace(/\r\n|\n|\r/g, '\\n')
    .replace(/[;,]/g, '\\$&')
}

function utc(value: string | Date) {
  return new Date(value).toISOString().replace(/[-:]|\.\d{3}/g, '')
}

export function downloadEventCalendar(event: EventResponse) {
  const location = [event.venue_name, event.venue_address].filter(Boolean).join(', ')
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BiletFlow//Events//EN',
    'BEGIN:VEVENT',
    `UID:event-${event.id}@biletflow`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(event.start_time)}`,
    `DTEND:${utc(event.end_time)}`,
    `SUMMARY:${calendarText(event.title)}`,
    `LOCATION:${calendarText(location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `biletflow-event-${event.id}.ics`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
