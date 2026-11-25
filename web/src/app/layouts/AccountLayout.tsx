import type { ReactNode } from 'react'
import { Link } from 'react-router'

export default function AccountLayout({
  routeId,
  title,
  description,
  children,
}: {
  routeId: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-[390px] space-y-5 px-6 pt-12 pb-8"
      data-route-id={routeId}
    >
      <Link to="/" className="block w-fit font-display text-[1.375rem] leading-tight font-bold">
        BiletFlow
      </Link>
      <header className="space-y-2">
        <h1 className="type-event-title">{title}</h1>
        {description && <p className="type-body leading-normal text-ink-2">{description}</p>}
      </header>
      {children}
    </main>
  )
}
