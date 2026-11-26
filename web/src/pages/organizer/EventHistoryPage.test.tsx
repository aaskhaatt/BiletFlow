import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryEntry } from '@/api/generated/model'
import { routes } from '@/app/routes'
import { downloadCsv } from '@/lib/csv'
import { apiUrl, server } from '@/test/msw-server'
import { apiError, eventOf, mockOrganizerApi, summaryOf } from '@/test/organizer-fixtures'
import { renderRoutes } from '@/test/render'
import { endSession, organizer, signIn, startSession } from '@/test/sign-in'

// The file itself is handed to the browser; the test reads what would be downloaded
vi.mock('@/lib/csv', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csv')>()),
  downloadCsv: vi.fn(),
}))

const done = eventOf({ id: 1, title: 'Old concert', lifecycle: 'completed' })

function entry(id: number, over: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id,
    created_at: '2026-11-15T16:40:00Z',
    action: 'order.paid',
    type: 'order',
    entity_type: 'order',
    entity_id: id,
    description: `Paid 6000 KZT for order #${id}`,
    actor_user_id: 5,
    actor_email: 'nurlan@demo.example.com',
    ...over,
  }
}

/** The history answers with `entries` page by page and records every request address. */
function mockHistory(entries: HistoryEntry[], requests: URL[] = []) {
  mockOrganizerApi({
    events: [done],
    summaries: [summaryOf(done, { tickets_sold: 98 })],
  })
  server.use(
    http.get(apiUrl('/events/1/check-in/stats'), () =>
      HttpResponse.json({
        registered: 98,
        checked_in: 84,
        not_checked_in: 14,
        cancelled: 0,
        refunded: 2,
      }),
    ),
    http.get(apiUrl('/events/1/history'), ({ request }) => {
      const url = new URL(request.url)
      requests.push(url)
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const limit = Number(url.searchParams.get('limit') ?? 50)
      return HttpResponse.json({
        items: entries.slice(offset, offset + limit),
        total: entries.length,
      })
    }),
  )
  return requests
}

async function openHistory() {
  const result = renderRoutes(routes, { route: '/organizer/events/1/history' })
  // The page is loaded lazily, so the first test in a cold, busy CI run can need more than the default second
  await screen.findByRole('heading', { level: 1, name: 'Old concert · история' }, { timeout: 5000 })
  return result
}

/** Opens a select by keyboard and picks an option (jsdom has no pointer events). */
function choose(select: string, option: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: select }), { key: 'Enter' })
  fireEvent.keyDown(screen.getByRole('option', { name: option }), { key: 'Enter' })
}

describe('event history', () => {
  beforeEach(startSession)
  afterEach(endSession)

  it('shows the event, its numbers and the way back to the list', async () => {
    mockHistory([entry(1)])
    await signIn(organizer)
    await openHistory()

    expect(await screen.findByText(/Продано билетов: 98 · Чек-инов: 84/)).toBeInTheDocument()
    expect(document.querySelector('[data-slot="status-badge"]')).toHaveTextContent('Завершено')
    const crumbs = within(screen.getByRole('navigation', { name: 'Путь по разделам' }))
    expect(crumbs.getByRole('link', { name: /События/ })).toHaveAttribute('href', '/organizer')
    expect(crumbs.getByRole('link', { name: 'Завершённые' })).toBeInTheDocument()
    expect(crumbs.getByRole('link', { name: 'Old concert' })).toHaveAttribute(
      'href',
      '/organizer/events/1',
    )
    expect(screen.getByRole('button', { name: 'Дублировать в черновик' })).toBeInTheDocument()
  })

  it('lists the entries with their time in Astana, a coloured action and who did it', async () => {
    mockHistory([
      entry(1),
      entry(2, {
        action: 'order.refunded',
        description: 'Refunded 5000 KZT for order #2',
        actor_email: 'organizer@demo.example.com',
      }),
      entry(3, {
        action: 'event.completed',
        type: 'event',
        description: 'Event finished',
        actor_email: null,
      }),
      entry(4, { action: 'brand.new', type: 'weird', description: 'Something new' }),
    ])
    await signIn(organizer)
    await openHistory()

    const rowsOf = () => Array.from(document.querySelectorAll('[data-slot="history-list"] > li'))
    await waitFor(() => expect(rowsOf()).toHaveLength(4))
    const rows = rowsOf()
    expect(rows[0]).toHaveTextContent('15.11, 21:40')
    expect(rows[0]).toHaveTextContent('Оплата')
    expect(rows[0]).toHaveTextContent('Paid 6000 KZT for order #1')
    expect(rows[0]).toHaveTextContent('nurlan@demo.example.com')
    expect(rows[1]).toHaveTextContent('Возврат')
    expect(rows[1].querySelector('[data-action="order.refunded"]')).toHaveClass(
      'bg-status-danger-bg',
    )
    // done automatically: no person
    expect(rows[2]).toHaveTextContent('система')
    expect(rows[2]).toHaveTextContent('Событие')
    // an action the app doesn't know: its raw name
    expect(rows[3]).toHaveTextContent('brand.new')
  })

  it('asks the API for what the filters say', async () => {
    const requests = mockHistory([entry(1)])
    await signIn(organizer)
    await openHistory()
    await screen.findByText('Paid 6000 KZT for order #1')
    expect(requests.at(-1)!.searchParams.get('type')).toBeNull()

    choose('Раздел', 'Заказы')
    await waitFor(() => expect(requests.at(-1)!.searchParams.get('type')).toBe('order'))

    fireEvent.change(screen.getByLabelText('Точное действие'), {
      target: { value: ' order.refunded ' },
    })
    await waitFor(() => expect(requests.at(-1)!.searchParams.get('action')).toBe('order.refunded'))

    choose('Период', 'Последние 7 дней')
    await waitFor(() =>
      expect(requests.at(-1)!.searchParams.get('date_from')).toMatch(/^20\d\d-\d\d-\d\dT/),
    )

    choose('Период', 'Свой период')
    fireEvent.change(screen.getByLabelText('С даты'), { target: { value: '2026-11-01' } })
    fireEvent.change(screen.getByLabelText('По дату'), { target: { value: '2026-11-15' } })
    await waitFor(() => {
      const last = requests.at(-1)!.searchParams
      expect(last.get('date_from')).toBe('2026-11-01T00:00:00+05:00')
      expect(last.get('date_to')).toBe('2026-11-15T23:59:59+05:00')
      expect(last.get('type')).toBe('order')
      expect(last.get('offset')).toBe('0')
    })
  })

  it('pages through a long log', async () => {
    const requests = mockHistory(Array.from({ length: 45 }, (_, index) => entry(index + 1)))
    await signIn(organizer)
    await openHistory()

    expect(await screen.findByText('1–20 из 45')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Назад' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }))

    expect(await screen.findByText('21–40 из 45')).toBeInTheDocument()
    expect(requests.at(-1)!.searchParams.get('offset')).toBe('20')
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }))
    expect(await screen.findByText('41–45 из 45')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Дальше' })).toBeDisabled()
  })

  it('says so when no entry matches, and offers a retry when the log cannot be read', async () => {
    mockHistory([])
    await signIn(organizer)
    await openHistory()
    expect(await screen.findByText('По этим условиям записей нет.')).toBeInTheDocument()
  })

  it('shows an error with a retry button', async () => {
    let failing = true
    mockHistory([entry(1)])
    server.use(
      http.get(apiUrl('/events/1/history'), () =>
        failing
          ? apiError('DatabaseUnavailableError', 503)
          : HttpResponse.json({ items: [entry(1)], total: 1 }),
      ),
    )
    await signIn(organizer)
    await openHistory()

    const retry = await screen.findByRole('button', { name: 'Повторить' })
    failing = false
    fireEvent.click(retry)
    expect(await screen.findByText('Paid 6000 KZT for order #1')).toBeInTheDocument()
  })
})

describe('event history export', () => {
  beforeEach(() => {
    startSession()
    vi.mocked(downloadCsv).mockClear()
  })
  afterEach(endSession)

  it('exports every entry that matches, page after page, as a CSV that is safe to open', async () => {
    const entries = Array.from({ length: 250 }, (_, index) => entry(index + 1))
    entries[1] = entry(2, { description: '=HYPERLINK("http://x","click")', actor_email: null })
    const requests = mockHistory(entries)
    await signIn(organizer)
    await openHistory()
    await screen.findByText('Paid 6000 KZT for order #1')
    requests.length = 0

    choose('Раздел', 'Заказы')
    await waitFor(() => expect(requests.at(-1)!.searchParams.get('type')).toBe('order'))
    requests.length = 0
    fireEvent.click(screen.getByRole('button', { name: 'Выгрузить журнал' }))

    await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1))
    const [filename, csv] = vi.mocked(downloadCsv).mock.calls[0]
    expect(filename).toBe('event-1-history.csv')
    // 250 entries in two requests of up to 200, with the filter in both
    const exportRequests = requests.filter((url) => url.searchParams.get('limit') === '200')
    expect(exportRequests.map((url) => url.searchParams.get('offset'))).toEqual(['0', '200'])
    expect(exportRequests.every((url) => url.searchParams.get('type') === 'order')).toBe(true)

    const lines = csv.split('\r\n')
    expect(csv.startsWith('﻿Дата и время (UTC+5),Раздел,Действие,Описание,Кто')).toBe(true)
    expect(lines).toHaveLength(1 + 250 + 1)
    expect(lines[1]).toBe(
      '2026-11-15 21:40,order,order.paid,Paid 6000 KZT for order #1,nurlan@demo.example.com',
    )
    // a formula in a description stays text; no person is "система"
    expect(lines[2]).toBe(
      `2026-11-15 21:40,order,order.paid,"'=HYPERLINK(""http://x"",""click"")",система`,
    )
  })

  it('says so when the export fails', async () => {
    mockHistory([entry(1)])
    await signIn(organizer)
    await openHistory()
    await screen.findByText('Paid 6000 KZT for order #1')
    server.use(
      http.get(apiUrl('/events/1/history'), () => apiError('DatabaseUnavailableError', 503)),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Выгрузить журнал' }))

    expect(await screen.findByText(/Не удалось выгрузить журнал/)).toBeInTheDocument()
    expect(downloadCsv).not.toHaveBeenCalled()
  })
})
