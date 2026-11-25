import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { QrIcon } from '@/components/icons'

type TicketStubProps = {
  title: string
  fields: readonly { label: string; value: string }[]
  status?: ReactNode
  qr?: ReactNode
  code?: string
}

export default function TicketStub({ title, fields, status, qr, code }: TicketStubProps) {
  const { t } = useTranslation()

  return (
    <article
      className="max-w-lg overflow-hidden rounded-xl border border-line bg-surface"
      data-slot="ticket-stub"
    >
      <div aria-hidden="true" className="h-2.5 bg-stub" />
      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="min-w-0 flex-[1_1_10rem] type-card-title wrap-anywhere">{title}</h3>
          {status}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {fields.map(({ label, value }) => (
            <div key={label} className="min-w-0 wrap-anywhere">
              <dt className="type-small text-ink-2">{label}</dt>
              <dd className="type-label">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="relative border-t border-dashed border-line-field px-4 py-5 text-center before:absolute before:top-0 before:left-0 before:size-5 before:-translate-1/2 before:rounded-full before:bg-paper after:absolute after:top-0 after:right-0 after:size-5 after:translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-paper">
        <div className="mx-auto grid aspect-square w-full max-w-44 place-items-center">
          {qr ?? (
            <div className="flex flex-col items-center gap-1 text-ink-2">
              <QrIcon aria-hidden="true" className="size-20" />
              <p className="type-small">{t('ticket.qrPlaceholder')}</p>
            </div>
          )}
        </div>
        {code && <p className="mt-2 font-semibold tracking-wide wrap-anywhere">{code}</p>}
      </div>
    </article>
  )
}
