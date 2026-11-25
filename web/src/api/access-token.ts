export type RequestCredentials = {
  generation: number
  accessToken: string | null
  expiresAt: number | null
  canRefresh: boolean
}

// Provides auth to the HTTP layer without importing the store that calls it.
export type RequestSession = {
  getCredentials: () => RequestCredentials
  refresh: () => Promise<string | null>
  expire: () => void
}

let session: RequestSession | null = null

export function setRequestSession(next: RequestSession | null): void {
  session = next
}

export function getRequestSession(): RequestSession | null {
  return session
}
