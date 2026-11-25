import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/api/error-codes'
import { apiBlob } from '@/api/http'
import InlineAlert from '@/components/InlineAlert'
import { Button } from '@/components/ui/button'

export default function PdfButton({
  path,
  filename,
  label,
  enabled,
}: {
  path: string
  filename: string
  label: string
  enabled: boolean
}) {
  const { t } = useTranslation()
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function openPdf() {
    if (!enabled || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    // Open in the click handler so the browser can allow the PDF tab.
    const tab = window.open('about:blank', '_blank')
    if (tab) tab.opener = null
    try {
      const blob = await apiBlob(path)
      const url = URL.createObjectURL(blob)
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      if (tab && !tab.closed) {
        tab.location.replace(url)
      } else {
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        link.click()
      }
    } catch (error) {
      tab?.close()
      setError(error)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        loading={busy}
        disabled={!enabled}
        onClick={() => void openPdf()}
      >
        {label}
      </Button>
      {!enabled && <p className="type-small text-ink-2">{t('errors.TicketNotPrintableError')}</p>}
      {error != null && (
        <InlineAlert tone="danger" role="alert">
          {t(errorMessageKey(error))}
        </InlineAlert>
      )}
    </div>
  )
}
