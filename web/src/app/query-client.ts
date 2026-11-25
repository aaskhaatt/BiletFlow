import { QueryClient } from '@tanstack/react-query'

const MAX_RETRIES = 2

// 4xx means the request itself is wrong (or not allowed): asking again won't help.
function isClientError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('status' in error)) return false
  const status = (error as { status: unknown }).status
  return typeof status === 'number' && status >= 400 && status < 500
}

export function shouldRetry(failureCount: number, error: unknown): boolean {
  return !isClientError(error) && failureCount < MAX_RETRIES
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry },
      mutations: { retry: false },
    },
  })
}
