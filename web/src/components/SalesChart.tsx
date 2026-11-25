import { useTranslation } from 'react-i18next'
import { cn } from 'cn'

export type SalesPoint = { date: string; label: string; value: number }

export default function SalesChart({
  title,
  points,
}: {
  title: string
  points: readonly SalesPoint[]
}) {
  const { t, i18n } = useTranslation()
  const maximum = Math.max(1, ...points.map((point) => point.value))
  const number = new Intl.NumberFormat(i18n.resolvedLanguage)

  return (
    <figure className="space-y-4 rounded-lg border border-line bg-surface p-4">
      <figcaption className="type-card-title">{title}</figcaption>
      <div aria-hidden="true" className="overflow-x-auto">
        <div className="flex min-w-min gap-2">
          {points.map((point, index) => (
            <div
              key={point.date}
              className="flex min-w-12 flex-1 flex-col gap-1 text-center type-small"
            >
              <div className="flex h-32 flex-col justify-end gap-1 border-b border-line">
                <span className="tabular-nums">{number.format(point.value)}</span>
                <div
                  className={cn(
                    'w-2/3 self-center rounded-t-sm',
                    index === points.length - 1 ? 'bg-brand' : 'bg-brand-soft',
                  )}
                  style={{ height: `${(Math.max(0, point.value) / maximum) * 75}%` }}
                />
              </div>
              <span>{point.label}</span>
            </div>
          ))}
        </div>
      </div>
      <details className="rounded-sm border border-line px-3">
        <summary className="min-h-11 cursor-pointer py-3 type-label">{t('chart.showData')}</summary>
        <table className="mb-3 w-full text-left">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-line p-2">
                {t('chart.date')}
              </th>
              <th scope="col" className="border-b border-line p-2 text-right">
                {t('chart.sales')}
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.date}>
                <th scope="row" className="p-2 font-normal">
                  <time dateTime={point.date}>{point.label}</time>
                </th>
                <td className="p-2 text-right tabular-nums">{number.format(point.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
