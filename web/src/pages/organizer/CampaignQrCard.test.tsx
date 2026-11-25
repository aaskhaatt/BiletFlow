import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { campaignOf, mockCampaignApi } from '@/test/campaign-fixtures'
import CampaignQrCard, { CampaignQrPlaceholder } from '@/pages/organizer/CampaignQrCard'
import { apiUrl, server } from '@/test/msw-server'
import { apiError } from '@/test/organizer-fixtures'
import { renderWithProviders } from '@/test/render'
import { endSession, startSession } from '@/test/sign-in'

const campaign = campaignOf({ id: 4, name: 'Student discount', code: 'STUDENT20' })

describe('campaign QR card', () => {
  const created: Blob[] = []
  const revoked: string[] = []

  beforeEach(() => {
    startSession()
    created.length = 0
    revoked.length = 0
    URL.createObjectURL = (blob) => {
      created.push(blob as Blob)
      return `blob:qr-${created.length}`
    }
    URL.revokeObjectURL = (url) => void revoked.push(url)
  })
  afterEach(() => {
    endSession()
    vi.restoreAllMocks()
  })

  it('shows the QR image the server draws, with the link inside it and the not-a-ticket warning', async () => {
    mockCampaignApi({ 1: [campaign] })
    renderWithProviders(<CampaignQrCard campaign={campaign} />)

    expect(screen.getByRole('status')).toHaveTextContent('Загрузка…')
    const image = await screen.findByRole('img', { name: 'QR-код кампании «Student discount»' })
    await waitFor(() => expect(image).toHaveAttribute('src', 'blob:qr-1'))
    expect(created[0].type).toBe('image/png')
    expect(screen.getByText(campaign.link)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'QR кампании' })).toBeInTheDocument()
    expect(screen.getByText('Не билет')).toBeInTheDocument()
    expect(screen.getByText('Это не пропуск на событие')).toBeInTheDocument()
    // W9.5: the API has no PDF of a campaign, so there is no such button
    expect(screen.queryByRole('button', { name: /PDF/ })).not.toBeInTheDocument()
  })

  it('lets go of the image address when the card goes away', async () => {
    mockCampaignApi({ 1: [campaign] })
    const { unmount } = renderWithProviders(<CampaignQrCard campaign={campaign} />)
    const image = await screen.findByRole('img')
    await waitFor(() => expect(image).toHaveAttribute('src', 'blob:qr-1'))

    unmount()

    expect(revoked).toContain('blob:qr-1')
  })

  it('downloads the PNG under a name with the code', async () => {
    mockCampaignApi({ 1: [campaign] })
    const clicks: { download: string; href: string }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push({ download: this.download, href: this.href })
    })
    renderWithProviders(<CampaignQrCard campaign={campaign} />)

    const button = screen.getByRole('button', { name: 'Скачать PNG' })
    expect(button).toBeDisabled()
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)

    expect(clicks).toEqual([{ download: 'campaign-STUDENT20-qr.png', href: 'blob:qr-2' }])
    expect(created[1].type).toBe('image/png')
  })

  it('copies the link', async () => {
    mockCampaignApi({ 1: [campaign] })
    const copied: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text: string) => Promise.resolve(void copied.push(text)) },
    })
    renderWithProviders(<CampaignQrCard campaign={campaign} />)

    fireEvent.click(screen.getByRole('button', { name: 'Скопировать ссылку' }))

    await waitFor(() => expect(copied).toEqual([campaign.link]))
  })

  it('says it could not load the QR code, keeps the download off, and tries again', async () => {
    mockCampaignApi({ 1: [campaign] })
    let broken = true
    server.use(
      http.get(apiUrl('/campaigns/4/qr'), () =>
        broken ? apiError('DatabaseUnavailableError', 503) : undefined,
      ),
    )
    renderWithProviders(<CampaignQrCard campaign={campaign} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить QR-код')
    expect(screen.getByRole('button', { name: 'Скачать PNG' })).toBeDisabled()

    broken = false
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('img')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Скачать PNG' })).toBeEnabled()
  })

  it.each([
    [
      'is switched off',
      { is_active: false },
      'Кампания выключена: ссылка открывает событие без скидки.',
    ],
    [
      'has ended',
      { ends_at: '2026-10-01T00:00:00+05:00' },
      'Кампания закончилась: ссылка открывает событие без скидки.',
    ],
    [
      'reached its limit',
      { max_redemptions: 5, redemptions_count: 5 },
      'Лимит использований исчерпан: ссылка открывает событие без скидки.',
    ],
  ] as const)('says the link gives no discount when the campaign %s', async (_name, over, note) => {
    mockCampaignApi({ 1: [campaign] })
    renderWithProviders(<CampaignQrCard campaign={{ ...campaign, ...over }} />)

    expect(await screen.findByText(note)).toBeInTheDocument()
  })

  it('says nothing of the kind while the campaign runs', async () => {
    mockCampaignApi({ 1: [campaign] })
    renderWithProviders(<CampaignQrCard campaign={campaign} />)
    await screen.findByRole('img')

    expect(screen.queryByText(/ссылка открывает событие без скидки/)).not.toBeInTheDocument()
  })
})

describe('campaign QR placeholder', () => {
  it('stands in for the QR of a campaign that is not created yet', () => {
    renderWithProviders(<CampaignQrPlaceholder />)

    expect(screen.getByText('QR-код появится после создания кампании')).toBeInTheDocument()
    expect(screen.getByText('Это не пропуск на событие')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
