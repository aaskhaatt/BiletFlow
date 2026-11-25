import { useSyncExternalStore } from 'react'
import type { RequestCredentials } from '@/api/access-token'
import { ApiError, CLIENT_ERROR_CODES, isApiError } from '@/api/errors'
import { authRefreshTokenRouter, authUserLogin } from '@/api/generated/endpoints/auth/auth'
import type { RefreshTokenResponse, UserLogin } from '@/api/generated/model'

const REFRESH_TOKEN_KEY = 'biletflow.refresh-token'

function readRefreshToken(): string | null {
  try {
    return globalThis.localStorage.getItem(REFRESH_TOKEN_KEY) || null
  } catch {
    return null
  }
}

function saveRefreshToken(token: string | null): void {
  try {
    if (token === null) globalThis.localStorage.removeItem(REFRESH_TOKEN_KEY)
    else globalThis.localStorage.setItem(REFRESH_TOKEN_KEY, token)
  } catch {
    // A session can still work in memory when browser storage is unavailable.
  }
}

function tokenExpiry(token: string): number | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    // This claim schedules refreshes. The server validates the token itself.
    const { exp } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: unknown
    }
    return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null
  } catch {
    return null
  }
}

function requireTokens(tokens: RefreshTokenResponse): RefreshTokenResponse {
  if (
    typeof tokens?.access_token !== 'string' ||
    !tokens.access_token ||
    typeof tokens.refresh_token !== 'string' ||
    !tokens.refresh_token
  ) {
    throw new ApiError({
      status: 502,
      error: CLIENT_ERROR_CODES.unknown,
      message: 'Invalid session response',
    })
  }
  return tokens
}

type SessionStatus = 'anonymous' | 'restoring' | 'authenticated' | 'expired'
type SessionSnapshot = { status: SessionStatus; refreshError: unknown }

export function createSessionStore() {
  let refreshToken = readRefreshToken()
  let accessToken: string | null = null
  let expiresAt: number | null = null
  let generation = 0
  let loginAttempt = 0
  let refreshing: Promise<string | null> | null = null
  let snapshot: SessionSnapshot = {
    status: refreshToken ? 'restoring' : 'anonymous',
    refreshError: null,
  }
  const listeners = new Set<() => void>()

  function publish(status: SessionStatus, refreshError: unknown = null) {
    if (snapshot.status === status && snapshot.refreshError === refreshError) return
    snapshot = { status, refreshError }
    listeners.forEach((listener) => listener())
  }

  function acceptTokens(tokens: RefreshTokenResponse) {
    accessToken = tokens.access_token
    expiresAt = tokenExpiry(accessToken)
    refreshToken = tokens.refresh_token
    publish('authenticated')
  }

  function clearTokens(status: 'anonymous' | 'expired') {
    generation++
    refreshing = null
    accessToken = null
    expiresAt = null
    if (readRefreshToken() === refreshToken) saveRefreshToken(null)
    refreshToken = null
    publish(status)
  }

  function getCredentials(): RequestCredentials {
    return { generation, accessToken, expiresAt, canRefresh: refreshToken !== null }
  }

  async function login(credentials: UserLogin): Promise<void> {
    const attempt = ++loginAttempt
    const tokens = requireTokens(await authUserLogin(credentials))
    if (attempt !== loginAttempt) throw new DOMException('Login was superseded', 'AbortError')
    generation++
    refreshing = null
    saveRefreshToken(tokens.refresh_token)
    acceptTokens(tokens)
  }

  function logout(): void {
    loginAttempt++
    clearTokens('anonymous')
  }

  function expire(): void {
    clearTokens('expired')
  }

  function refresh(): Promise<string | null> {
    if (refreshing) return refreshing
    if (!refreshToken) return Promise.resolve(null)

    const startedIn = generation
    const token = refreshToken
    const promise = authRefreshTokenRouter({ refresh_token: token })
      .then((tokens) => {
        if (generation !== startedIn) return null
        const next = requireTokens(tokens)
        // Another tab may have replaced the stored session while this request was running.
        if (readRefreshToken() === token) saveRefreshToken(next.refresh_token)
        acceptTokens(next)
        return next.access_token
      })
      .catch((error: unknown) => {
        if (generation !== startedIn) return null
        if (isApiError(error) && error.status === 401) expire()
        else publish(snapshot.status, error)
        throw error
      })
      .finally(() => {
        if (refreshing === promise) refreshing = null
      })

    refreshing = promise
    publish(snapshot.status)
    return promise
  }

  async function restore(): Promise<void> {
    if (snapshot.status !== 'restoring') return
    try {
      await refresh()
    } catch {
      // The refresh outcome is already in the store for the startup UI.
    }
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return {
    login,
    logout,
    restore,
    subscribe,
    getSnapshot: () => snapshot,
    getCredentials,
    refresh,
    expire,
  }
}

export const sessionStore = createSessionStore()

export function useSession(): SessionSnapshot {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot)
}
