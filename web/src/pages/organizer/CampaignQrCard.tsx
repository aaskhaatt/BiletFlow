import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { errorMessageKey } from '@/api/error-codes'
import type { CampaignResponse } from '@/api/generated/model'
import { useCampaignQr } from '@/api/hooks/campaigns'
import ErrorState from '@/components/ErrorState'
import InlineAlert from '@/components/InlineAlert'
import Skeleton from '@/components/Skeleton'
import { Button } from '@/components/ui/button'
import { campaignStatus } from '@/pages/organizer/campaign-values'

/** "Не билет": the QR of a campaign opens a page, it never lets anyone in. */
function Frame({ children }: { children: ReactNode }) {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby="campaign-qr-title"
      className="space-y-3.5 rounded-lg border border-line bg-surface p-6"
      data-slot="campaign-qr"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="campaign-qr-title" className="type-card-title">
          {t('organizerCampaigns.qr.title')}
        </h2>
        <span className="rounded-sm bg-brand-soft px-2.5 py-1 type-small font-semibold text-brand-press">
          {t('organizerCampaigns.qr.notTicket')}
        </span>
      </div>
      {children}
    </section>
  )
}

function NotATicket() {
  const { t } = useTranslation()

  return (
    <InlineAlert tone="warn">
      <p className="font-semibold">{t('organizerCampaigns.qr.warningTitle')}</p>
      <p className="mt-1.5 type-small">{t('organizerCampaigns.qr.warningText')}</p>
    </InlineAlert>
  )
}

/** The QR block of a campaign that doesn't exist yet (the form of a new one). */
export function CampaignQrPlaceholder() {
  const { t } = useTranslation()

  return (
    <Frame>
      <div className="flex flex-col items-center gap-3 rounded-md border-2 border-dashed border-brand bg-brand-soft p-5 text-center">
        <p className="type-label font-medium text-brand-press">
          {t('organizerCampaigns.qr.placeholder')}
        </p>
      </div>
      <NotATicket />
    </Frame>
  )
}

function QrImage({ blob, alt }: { blob: Blob; alt: string }) {
  const image = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const element = image.current
    if (!element) return
    const url = URL.createObjectURL(blob)
    element.src = url
    return () => {
      element.removeAttribute('src')
      URL.revokeObjectURL(url)
    }
  }, [blob])

  return (
    <img
      ref={image}
      alt={alt}
      className="mx-auto block aspect-square w-full max-w-64 rounded-sm bg-surface object-contain"
    />
  )
}

/**
 * The QR of a campaign (Figma "Карточка / Campaign QR"): the PNG as the server draws
 * it (orange frame, "NOT AN ENTRY TICKET"), the link inside it, and what an organizer
 * does with it: download the PNG or copy the link. "Для печати (PDF)" is not here
 * (W9.5): the API has no PDF for campaigns.
 */
export default function CampaignQrCard({ campaign }: { campaign: CampaignResponse }) {
  const { t } = useTranslation()
  const qr = useCampaignQr(campaign.id)
  const [now] = useState(() => Date.now())
  const status = campaignStatus(campaign, now)

  function download(blob: Blob) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `campaign-${campaign.code}-qr.png`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(campaign.link)
      toast.success(t('organizerCampaigns.qr.copied'))
    } catch {
      toast.error(t('organizerCampaigns.qr.copyFailed'))
    }
  }

  return (
    <Frame>
      <div className="space-y-3 rounded-md border-2 border-dashed border-brand bg-brand-soft p-5">
        {qr.isError ? (
          <ErrorState
            title={t('organizerCampaigns.qr.error')}
            description={t(errorMessageKey(qr.error))}
            onRetry={() => void qr.refetch()}
            retrying={qr.isFetching}
            heading="h3"
          />
        ) : qr.data ? (
          <QrImage blob={qr.data} alt={t('organizerCampaigns.qr.alt', { name: campaign.name })} />
        ) : (
          <div role="status" className="mx-auto w-full max-w-64">
            <span className="sr-only">{t('common.loading')}</span>
            <Skeleton className="aspect-square w-full rounded-sm" />
          </div>
        )}
        <p className="type-small font-medium break-all text-brand-press select-all">
          {campaign.link}
        </p>
      </div>
      {status !== 'active' && (
        <InlineAlert tone="info">{t(`organizerCampaigns.qr.notActive.${status}`)}</InlineAlert>
      )}
      <NotATicket />
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Button
          type="button"
          size="sm"
          disabled={!qr.data}
          onClick={() => qr.data && download(qr.data)}
        >
          {t('organizerCampaigns.qr.download')}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          {t('organizerCampaigns.qr.copy')}
        </Button>
      </div>
    </Frame>
  )
}
