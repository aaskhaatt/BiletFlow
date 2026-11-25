import { setupServer } from 'msw/node'
import { getApiUrl } from '@/lib/env'

/** Mock API for unit tests. Add handlers per test with server.use(...). */
export const server = setupServer()

/** Full address of an API path, as the request layer builds it. */
export function apiUrl(path: string): string {
  return `${getApiUrl()}${path}`
}
