import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DownloadIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'

function Sample({ name, children }: { name: string; children: ReactNode }) {
  return (
    <li className="flex flex-col items-start gap-1">
      {children}
      <span className="type-small text-ink-muted">{name}</span>
    </li>
  )
}

// W2.2: every button variant and state of the Figma design system.
export default function ButtonsSection() {
  const { t } = useTranslation()
  const [paying, setPaying] = useState(false)
  const timer = useRef<number>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  function pay() {
    setPaying(true)
    timer.current = window.setTimeout(() => setPaying(false), 2000)
  }

  return (
    <section className="space-y-6" data-testid="buttons">
      <h2 className="type-card-title">Buttons</h2>

      <ul className="flex flex-wrap items-start gap-x-3 gap-y-4">
        <Sample name="default">
          <Button>{t('dev.buttons.buy')}</Button>
        </Sample>
        <Sample name="outline">
          <Button variant="outline">
            <DownloadIcon />
            {t('dev.buttons.downloadPdf')}
          </Button>
        </Sample>
        <Sample name="ghost">
          <Button variant="ghost">{t('common.cancel')}</Button>
        </Sample>
        <Sample name="disabled">
          <Button disabled>{t('dev.buttons.soldOut')}</Button>
        </Sample>
        <Sample name="dashed">
          <Button variant="dashed">{t('dev.buttons.addTicketType')}</Button>
        </Sample>
        <Sample name="destructive">
          <Button variant="destructive">{t('dev.buttons.confirmRefund')}</Button>
        </Sample>
        <Sample name="link">
          <Button variant="link">{t('dev.buttons.details')}</Button>
        </Sample>
        <Sample name="loading">
          <Button loading>{t('dev.buttons.pay')}</Button>
        </Sample>
        <Sample name="outline · loading">
          <Button variant="outline" loading>
            {t('dev.buttons.downloadPdf')}
          </Button>
        </Sample>
      </ul>

      <ul className="flex flex-wrap items-start gap-3">
        <Sample name="sm · 44">
          <Button size="sm">{t('dev.buttons.buy')}</Button>
        </Sample>
        <Sample name="default · 48">
          <Button>{t('dev.buttons.buy')}</Button>
        </Sample>
        <Sample name="lg · 56">
          <Button size="lg">{t('dev.buttons.buy')}</Button>
        </Sample>
      </ul>

      <div className="max-w-sm space-y-3">
        <p className="type-body text-ink-2">{t('dev.buttons.loadingNote')}</p>
        <Button size="lg" className="w-full" loading={paying} onClick={pay}>
          {t('dev.buttons.pay')}
        </Button>
        <Button variant="dashed" size="sm" className="w-full">
          {t('dev.buttons.addTicketType')}
        </Button>
      </div>
    </section>
  )
}
