import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { routes } from '@/app/routes'
import { eventOf, mockOrganizerApi, summaryOf, ticketTypeOf } from '@/test/organizer-fixtures'
import { renderRoutes } from '@/test/render'
import { endSession, organizer, signIn, startSession } from '@/test/sign-in'

async function openPreview(id = 1) {
  renderRoutes(routes, { route: `/organizer/events/${id}/preview` })
  await screen.findByRole('heading', { level: 1, name: /\S/ })
}

describe('event preview', () => {
  beforeEach(startSession)
  afterEach(endSession)

  it('shows a draft the way attendees will see it, without its hidden ticket types', async () => {
    const draft = eventOf({
      id: 1,
      title: 'Spring concert',
      status: 'draft',
      lifecycle: 'draft',
      description: 'First paragraph.\n\nSecond one.',
      refund_policy: 'Refund up to 3 days before.',
      category: 'Music',
    })
    mockOrganizerApi({
      events: [draft],
      summaries: [summaryOf(draft)],
      ticketTypes: {
        1: [
          ticketTypeOf({ id: 1, name: 'Standard', price: 5000 }),
          ticketTypeOf({ id: 2, name: 'Secret VIP', is_hidden: true }),
        ],
      },
    })
    await signIn(organizer)
    await openPreview()

    expect(screen.getByText(/Событие не опубликовано: его видите только вы/)).toBeInTheDocument()
    expect(screen.getByText('Музыка')).toBeInTheDocument()
    expect(screen.getByText(/First paragraph\./)).toBeInTheDocument()
    expect(screen.getByText(/Вт, 1 декабря · 19:00–22:00 \(UTC\+5\)/)).toBeInTheDocument()
    expect(screen.getByText('Astana Hall, Abay 1')).toBeInTheDocument()
    expect(screen.getByText('Refund up to 3 days before.')).toBeInTheDocument()
    const tickets = (await screen.findByRole('heading', { name: 'Билеты' })).closest('section')!
    expect(await within(tickets).findByText('Standard')).toBeInTheDocument()
    expect(within(tickets).queryByText('Secret VIP')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Изменить' })).toHaveAttribute(
      'href',
      '/organizer/events/1/edit',
    )
  })

  it.each([
    ['private', { visibility: 'private' }, /Приватное событие: зрители его не увидят/],
    ['unlisted', { visibility: 'unlisted' }, /Событие по ссылке/],
    ['cancelled', { status: 'cancelled', lifecycle: 'cancelled' }, /Событие отменено/],
  ])('says what a %s event looks like to attendees', async (_name, over, note) => {
    const event = eventOf({ id: 1, ...over })
    mockOrganizerApi({ events: [event], summaries: [summaryOf(event)] })
    await signIn(organizer)
    await openPreview()

    expect(screen.getByText(note)).toBeInTheDocument()
  })

  it('says so when the event is not there', async () => {
    mockOrganizerApi({ events: [], summaries: [] })
    await signIn(organizer)
    renderRoutes(routes, { route: '/organizer/events/9/preview' })

    expect(await screen.findByText('Событие не найдено или недоступно.')).toBeInTheDocument()
  })
})
