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

const REFRESH_MARGIN_MS = 60_000

export function needsAccessRefresh(credentials: RequestCredentials): boolean {
  const { accessToken, expiresAt, canRefresh } = credentials
  return (
    canRefresh &&
    (accessToken === null || (expiresAt !== null && expiresAt - Date.now() < REFRESH_MARGIN_MS))
  )
}

export function checkSession(
  session: RequestSession,
  generation: number,
  signal?: AbortSignal | null,
): void {
  signal?.throwIfAborted()
  if (session.getCredentials().generation !== generation) {
    throw new DOMException('The session changed', 'AbortError')
  }
}

let session: RequestSession | null = null

export function setRequestSession(next: RequestSession | null): void {
  session = next
}

export function getRequestSession(): RequestSession | null {
  return session
}
