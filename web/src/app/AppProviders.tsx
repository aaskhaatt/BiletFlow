import { QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useState, type ReactNode } from 'react'
import { createQueryClient } from '@/app/query-client'
import { Toaster } from '@/components/ui/sonner'

// Loaded only by the dev server: production builds don't contain the devtools.
const QueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/react-query-devtools').then((module) => ({
        default: module.ReactQueryDevtools,
      })),
    )
  : () => null

export default function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
      <Suspense>
        <QueryDevtools buttonPosition="bottom-left" />
      </Suspense>
    </QueryClientProvider>
  )
}
