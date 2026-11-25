import { checkSession, getRequestSession, needsAccessRefresh } from '@/api/access-token'
import { ApiError, errorFromResponse, networkError } from '@/api/errors'
import { getApiUrl } from '@/lib/env'

/**
 * Tells the generated hooks that their errors are ApiError (orval reads this).
 * orval passes the schema's error type as the parameter; we always throw ApiError.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type ErrorType<_Error> = ApiError

async function request(path: string, init: RequestInit, token: string | null): Promise<Response> {
  const headers = new Headers(init.headers)
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)

  try {
    return await fetch(`${getApiUrl()}${path}`, { ...init, headers })
  } catch (cause) {
    // A cancelled request (TanStack Query aborts on unmount) is not a network failure
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw networkError(cause)
  }
}

async function checked(response: Response): Promise<Response> {
  if (!response.ok) throw await errorFromResponse(response)
  return response
}

/** Sends authenticated requests and replays an unauthorized request at most once. */
async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const session = getRequestSession()
  const credentials = session?.getCredentials()
  let token = credentials?.accessToken ?? null

  if (
    !session ||
    !credentials ||
    path.startsWith('/auth/') ||
    new Headers(init.headers).has('Authorization')
  ) {
    return checked(await request(path, init, token))
  }

  const { generation } = credentials
  checkSession(session, generation, init.signal)
  if (needsAccessRefresh(credentials)) {
    token = await session.refresh()
    checkSession(session, generation, init.signal)
  }

  const response = await request(path, init, token)
  checkSession(session, generation, init.signal)
  const latest = session.getCredentials()
  if (response.status !== 401 || !latest.canRefresh || init.body instanceof ReadableStream) {
    return checked(response)
  }

  // A slow 401 may arrive after another request has already rotated this token.
  const replacement =
    latest.accessToken && latest.accessToken !== token
      ? latest.accessToken
      : await session.refresh()
  checkSession(session, generation, init.signal)
  if (!replacement) return checked(response)

  const retried = await request(path, init, replacement)
  checkSession(session, generation, init.signal)
  if (retried.status === 401 && session.getCredentials().accessToken === replacement) {
    session.expire()
  }
  return checked(retried)
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined
  const type = response.headers.get('Content-Type') ?? ''
  if (type.includes('application/json')) return response.json()
  if (type.startsWith('text/')) return response.text()
  return response.blob()
}

/**
 * JSON requests. Every API call goes through here, including the generated
 * client (it is orval's "mutator").
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await send(path, init)
  return (await readBody(response)) as T
}

/**
 * Multipart upload, e.g. the event cover: PUT /events/{id}/image with field "file".
 * The browser sets Content-Type with the boundary itself, so we never set it.
 */
export async function apiUpload<T>(
  path: string,
  formData: FormData,
  init: Omit<RequestInit, 'body'> = {},
): Promise<T> {
  const response = await send(path, { method: 'PUT', ...init, body: formData })
  return (await readBody(response)) as T
}

/** Binary downloads that need the token: ticket QR (PNG), ticket and order PDFs. */
export async function apiBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const response = await send(path, init)
  return response.blob()
}

/** CSV exports: the admin lists with ?format=csv. Keeps the file's UTF-8 BOM. */
export async function apiCsv(path: string, init: RequestInit = {}): Promise<Blob> {
  const separator = path.includes('?') ? '&' : '?'
  const response = await send(`${path}${separator}format=csv`, init)
  return new Blob([await response.arrayBuffer()], { type: 'text/csv;charset=utf-8' })
}
