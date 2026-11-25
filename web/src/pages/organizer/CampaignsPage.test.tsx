import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { routes } from '@/app/routes'
import { formatDateShort } from '@/lib/event-display'
import { campaignOf, mockCampaignApi } from '@/test/campaign-fixtures'
import { apiUrl, server } from '@/test/msw-server'
import { apiError, eventOf, mockOrganizerApi } from '@/test/organizer-fixtures'
import { renderRoutes } from '@/test/render'
import { endSession, organizer, signIn, startSession } from '@/test/sign-in'

const jazz = eventOf({ id: 1, title: 'Jazz night' })
const meetup = eventOf({ id: 2, title: 'Free meetup' })

// Intl writes numbers with no-break spaces; the matchers compare plain ones
const plain = (text: string | null) => (text ?? '').replace(/\s+/g, ' ')

const student = campaignOf({
  id: 4,
  name: 'Student discount',
  code: 'STUDENT20',
  max_redemptions: 100,
  redemptions_count: 40,
  starts_at: '2026-10-01T00:00:00+05:00',
  ends_at: '2099-10-24T18:00:00+05:00',
  created_at: '2026-10-02T10:00:00+05:00',
})
const partner = campaignOf({
  id: 5,
  name: 'Partner flyers',
  code: 'FLYER1500',
  discount_type: 'fixed',
  discount_value: 1500,
  max_redemptions: null,
  redemptions_count: 12,
  is_active: false,
  created_at: '2026-10-05T10:00:00+05:00',
})
const old = campaignOf({
  id: 6,
  event_id: 2,
  name: 'Early birds',
  code: 'EARLY10',
  ends_at: '2026-10-20T00:00:00+05:00',
  created_at: '2026-10-03T10:00:00+05:00',
})

async function openList(route = '/organizer/campaigns') {
  const result = renderRoutes(routes, { route })
  await screen.findByRole('heading', { level: 1, name: 'Кампании' })
  return result
}

const rowOf = async (name: string) => (await screen.findByRole('link', { name })).closest('tr')!

describe('campaign list', () => {
  beforeEach(startSession)
  afterEach(endSession)

  it('lists the campaigns of every event, newest first', async () => {
    mockOrganizerApi({ events: [jazz, meetup] })
    mockCampaignApi({ 1: [student, partner], 2: [old] })
    await signIn(organizer)
    await openList()

    await screen.findByRole('link', { name: 'Student discount' })
    const names = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('link')[0].textContent)
    expect(names).toEqual(['Partner flyers', 'Early birds', 'Student discount'])
    expect(screen.getByText('Время Астаны (UTC+5)')).toBeInTheDocument()
  })

  it('shows the code, the event, the discount, the uses, the period and the status of a campaign', async () => {
    mockOrganizerApi({ events: [jazz, meetup] })
    mockCampaignApi({ 1: [student, partner], 2: [old] })
    await signIn(organizer)
    await openList()

    const row = await rowOf('Student discount')
    expect(row).toHaveTextContent('STUDENT20')
    expect(within(row).getByRole('link', { name: 'Jazz night' })).toHaveAttribute(
      'href',
      '/organizer/events/1',
    )
    expect(plain(row.textContent)).toContain('20 %')
    expect(plain(within(row).getByLabelText('Использований').getAttribute('aria-valuetext'))).toBe(
      '40 / 100 · 40 %',
    )
    expect(row).toHaveTextContent(
      `с ${formatDateShort(student.starts_at!)} до ${formatDateShort(student.ends_at!)}`,
    )
    expect(within(row).getByText('Активна')).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: 'Открыть Student discount' })).toHaveAttribute(
      'href',
      '/organizer/campaigns/4',
    )
  })

  it('shows a fixed discount in tenge, no limit, and the status of a switched-off or ended campaign', async () => {
    mockOrganizerApi({ events: [jazz, meetup] })
    mockCampaignApi({ 1: [student, partner], 2: [old] })
    await signIn(organizer)
    await openList()

    const flyers = await rowOf('Partner flyers')
    expect(plain(flyers.textContent)).toContain('1 500 ₸')
    expect(plain(flyers.textContent)).toContain('12 · без лимита')
    expect(flyers).toHaveTextContent('Без ограничений')
    expect(within(flyers).getByText('Выключена')).toBeInTheDocument()

    expect(within(await rowOf('Early birds')).getByText('Закончилась')).toBeInTheDocument()
  })

  it('shows one event with ?event=, and the filter changes it', async () => {
    mockOrganizerApi({ events: [jazz, meetup] })
    mockCampaignApi({ 1: [student, partner], 2: [old] })
    await signIn(organizer)
    const { router } = await openList('/organizer/campaigns?event=2')

    expect(await screen.findByRole('link', { name: 'Early birds' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Student discount' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Событие' })).toHaveTextContent('Free meetup')
    expect(screen.getByRole('link', { name: '+ Новая кампания' })).toHaveAttribute(
      'href',
      '/organizer/campaigns/new?event=2',
    )

    // An unknown event shows everything again
    await router.navigate('/organizer/campaigns?event=99')
    expect(await screen.findByRole('link', { name: 'Student discount' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Событие' })).toHaveTextContent('Все события')
  })

  it('says there are no campaigns yet, and offers to create one', async () => {
    mockOrganizerApi({ events: [jazz] })
    mockCampaignApi({ 1: [] })
    await signIn(organizer)
    await openList()

    expect(await screen.findByText('Кампаний пока нет')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: '+ Новая кампания' })).toHaveLength(2)
  })

  it('says so when the chosen event has no campaigns', async () => {
    mockOrganizerApi({ events: [jazz, meetup] })
    mockCampaignApi({ 1: [student], 2: [] })
    await signIn(organizer)
    await openList('/organizer/campaigns?event=2')

    expect(await screen.findByText('Для этого события кампаний пока нет')).toBeInTheDocument()
  })

  it('asks for an event first when there is none', async () => {
    mockOrganizerApi({ events: [] })
    await signIn(organizer)
    await openList()

    expect(await screen.findByText('Сначала создайте событие')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Создать событие' })).toHaveAttribute(
      'href',
      '/organizer/events/new',
    )
    expect(screen.queryByRole('link', { name: '+ Новая кампания' })).not.toBeInTheDocument()
  })

  it('shows a loading state while the campaigns come', async () => {
    mockOrganizerApi({ events: [jazz] })
    server.use(http.get(apiUrl('/events/:id/campaigns'), () => new Promise(() => {})))
    await signIn(organizer)
    await openList()

    expect(await screen.findByRole('status')).toHaveTextContent('Загрузка…')
  })

  it('shows an error with a retry when the events do not load', async () => {
    mockOrganizerApi({})
    server.use(http.get(apiUrl('/events/me'), () => apiError('DatabaseUnavailableError', 503)))
    await signIn(organizer)
    await openList()

    expect(await screen.findByRole('button', { name: 'Повторить' })).toBeInTheDocument()
  })

  it('shows what loaded when the campaigns of one event do not, and retries them', async () => {
    mockOrganizerApi({ events: [jazz, meetup] })
    mockCampaignApi({ 1: [student], 2: [old] })
    let broken = true
    server.use(
      http.get(apiUrl('/events/2/campaigns'), () =>
        broken ? apiError('DatabaseUnavailableError', 503) : undefined,
      ),
    )
    await signIn(organizer)
    await openList()

    expect(await screen.findByRole('link', { name: 'Student discount' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Кампании некоторых событий загрузить не удалось.',
    )
    expect(screen.queryByRole('link', { name: 'Early birds' })).not.toBeInTheDocument()

    broken = false
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('link', { name: 'Early birds' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})
