import { useLocation, useParams } from 'react-router'

// Stand-in for a page that a later phase builds. Shows which route matched.
export default function PlaceholderPage({ id }: { id: string }) {
  const params = useParams()
  const location = useLocation()

  return (
    <main className="mx-auto max-w-3xl space-y-3 p-6" data-route-id={id}>
      <p className="type-small text-ink-muted">Placeholder</p>
      <h1 className="type-page-title">{id}</h1>
      <p className="type-body text-ink-2">
        {location.pathname}
        {location.search}
      </p>
      {Object.keys(params).length > 0 && (
        <pre className="type-small rounded-md border border-line bg-surface p-3 text-ink-2">
          {JSON.stringify(params, null, 2)}
        </pre>
      )}
    </main>
  )
}
