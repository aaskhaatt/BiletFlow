import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'

/** A query client for one test: no retries, so a mocked error shows at once. */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

/** Renders a component with the app's providers (query client, router). */
export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  return renderRoutes([{ path: '*', element: ui }], { route })
}

/** Renders a route table at an address, like the app does in the browser. */
export function renderRoutes(routes: RouteObject[], { route = '/' }: { route?: string } = {}) {
  const queryClient = createTestQueryClient()
  const router = createMemoryRouter(routes, { initialEntries: [route] })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...result, router, queryClient }
}
