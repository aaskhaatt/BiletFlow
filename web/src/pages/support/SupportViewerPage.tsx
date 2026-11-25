import type { ReactNode } from 'react'
import { Link } from 'react-router'

export default function SupportViewerPage({
  routeId,
  title,
  back,
  meta,
  children,
}: {
  routeId: string
  title: string
  back: { to: string; label: string }
  meta?: ReactNode
  children: ReactNode
}) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      data-route-id={routeId}
      className="mx-auto w-full max-w-4xl"
    >
      <header className="space-y-2 border-b border-line px-4 py-2 sm:border-0 sm:px-6 sm:pt-6">
        <div className="flex items-center gap-2">
          <Link
            to={back.to}
            aria-label={back.label}
            className="-ml-2 grid size-11 shrink-0 place-items-center rounded-sm text-xl hover:bg-line-soft"
          >
            <span aria-hidden="true">←</span>
          </Link>
          <h1 className="type-card-title min-w-0 wrap-anywhere sm:type-page-title">{title}</h1>
        </div>
        {meta}
      </header>
      <div className="space-y-4 px-4 py-4 sm:px-6">{children}</div>
    </main>
  )
}
