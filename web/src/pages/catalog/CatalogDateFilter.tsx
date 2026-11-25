import { Popover } from 'radix-ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import calendar from '@/assets/catalog-date.svg'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function CatalogDateFilter({
  dateFrom,
  dateTo,
  onChange,
}: {
  dateFrom: string
  dateTo: string
  onChange: (dateFrom: string, dateTo: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const filtered = Boolean(dateFrom || dateTo)

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="hidden min-h-10 items-center gap-2 rounded-full border border-line bg-surface px-3.5 type-label font-semibold hover:bg-line-soft min-[1024px]:inline-flex"
        >
          <img src={calendar} width="16" height="16" alt="" />
          {t(filtered ? 'catalog.filterDates' : 'catalog.anyDate')}
          <span aria-hidden="true">▾</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          aria-label={t('catalog.filterDates')}
          className="z-40 hidden w-72 space-y-3 rounded-md border border-line bg-surface p-4 shadow-lg min-[1024px]:block"
        >
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              const data = new FormData(event.currentTarget)
              const from = String(data.get('from') ?? '')
              const to = String(data.get('to') ?? '')
              if (from && to && from > to) {
                const end = event.currentTarget.elements.namedItem('to') as HTMLInputElement
                end.setCustomValidity(t('catalog.dateRangeError'))
                end.reportValidity()
                return
              }
              onChange(from, to)
              setOpen(false)
            }}
          >
            <label className="block space-y-1 type-label">
              <span>{t('catalog.dateFrom')}</span>
              <Input
                name="from"
                type="date"
                defaultValue={dateFrom}
                onChange={(event) => {
                  const end = event.currentTarget.form?.elements.namedItem(
                    'to',
                  ) as HTMLInputElement | null
                  end?.setCustomValidity('')
                }}
              />
            </label>
            <label className="block space-y-1 type-label">
              <span>{t('catalog.dateTo')}</span>
              <Input
                name="to"
                type="date"
                defaultValue={dateTo}
                onChange={(event) => event.currentTarget.setCustomValidity('')}
              />
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <Popover.Close asChild>
                <Button variant="ghost" size="sm" type="button" onClick={() => onChange('', '')}>
                  {t('catalog.clearDates')}
                </Button>
              </Popover.Close>
              <Button size="sm" type="submit">
                {t('catalog.applyDates')}
              </Button>
            </div>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
