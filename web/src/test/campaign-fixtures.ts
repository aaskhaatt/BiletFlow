import { http, HttpResponse } from 'msw'
import type { CampaignResponse } from '@/api/generated/model'
import { apiUrl, server } from '@/test/msw-server'

/** A running campaign: 20 % off, a limit of 100 and no results yet. Pass what a test needs to differ. */
export function campaignOf(over: Partial<CampaignResponse> = {}): CampaignResponse {
  return {
    id: 4,
    event_id: 1,
    name: 'Student discount',
    code: 'STUDENT20',
    discount_type: 'percent',
    discount_value: 20,
    starts_at: null,
    ends_at: null,
    max_redemptions: 100,
    redemptions_count: 0,
    is_active: true,
    link: 'https://biletflow.test/events/1?campaign=C-abc123',
    link_opens: 0,
    ticket_type_ids: [],
    created_at: '2026-10-01T10:00:00+05:00',
    stats: { orders: 0, tickets: 0, gross: 0, discount: 0, net: 0 },
    ...over,
  }
}

/** A 1 x 1 PNG: the stand-in for the server's QR image. */
export const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6UkAAAAASUVORK5CYII=',
  ),
  (char) => char.charCodeAt(0),
)

/** The campaigns of each event, by event id, and the QR image of any campaign. */
export function mockCampaignApi(byEvent: Record<number, CampaignResponse[]>) {
  const all = Object.values(byEvent).flat()
  server.use(
    http.get(apiUrl('/events/:id/campaigns'), ({ params }) =>
      HttpResponse.json(byEvent[Number(params.id)] ?? []),
    ),
    http.get(apiUrl('/campaigns/:id/qr'), () =>
      HttpResponse.arrayBuffer(PNG.buffer, { headers: { 'Content-Type': 'image/png' } }),
    ),
    http.get(apiUrl('/campaigns/:id'), ({ params }) => {
      const found = all.find((campaign) => campaign.id === Number(params.id))
      return found
        ? HttpResponse.json(found)
        : HttpResponse.json(
            { error: 'CampaignNotFoundError', message: 'x', fields: null },
            { status: 404 },
          )
    }),
  )
}
