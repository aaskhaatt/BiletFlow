import type { ReactNode } from 'react'

export default function AttendeePage({
  route,
  title,
  children,
}: {
  route: 'order' | 'ticket' | 'my-orders' | 'my-tickets'
  title: string
  children: ReactNode
}) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      data-route-id={route}
      className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 sm:px-6"
    >
      <h1 className="type-event-title wrap-anywhere">{title}</h1>
      {children}
    </main>
  )
}
