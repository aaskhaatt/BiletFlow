import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

export type Crumb = { label: string; to?: string }

/** "← События / Название": the way back up. The last crumb is the page itself. */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  const { t } = useTranslation()

  return (
    <nav aria-label={t('organizerPage.breadcrumb')}>
      <ol className="flex flex-wrap items-center gap-x-1.5 type-label text-ink-muted">
        {items.map((item, index) => (
          <li key={index} className="flex min-w-0 items-center gap-1.5">
            {index > 0 && <span aria-hidden="true">/</span>}
            {item.to ? (
              <Link
                to={item.to}
                className="inline-flex min-h-6 items-center rounded-sm hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {index === 0 && <span aria-hidden="true">←&nbsp;</span>}
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="wrap-anywhere">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

/**
 * The frame of every page of the organizer workspace (Figma "Основная область"):
 * 40 px of space around, breadcrumb, then the title with the page's actions on
 * its right. `meta` goes under the title (status, date).
 */
export default function OrganizerPage({
  routeId,
  breadcrumb,
  title,
  meta,
  actions,
  children,
}: {
  routeId: string
  breadcrumb?: Crumb[]
  title: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      data-route-id={routeId}
      className="mx-auto flex w-full max-w-[75rem] flex-col gap-6 px-4 py-6 outline-none md:px-10 md:py-8"
    >
      {breadcrumb && <Breadcrumb items={breadcrumb} />}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 space-y-2.5">
          <h1 className="type-page-title wrap-anywhere">{title}</h1>
          {meta}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
      </header>
      {children}
    </main>
  )
}
