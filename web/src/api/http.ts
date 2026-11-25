import { getAccessToken } from '@/api/access-token'
import { ApiError, errorFromResponse, networkError } from '@/api/errors'
import { getApiUrl } from '@/lib/env'

/**
 * Tells the generated hooks that their errors are ApiError (orval reads this).
 * orval passes the schema's error type as the parameter; we always throw ApiError.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type ErrorType<_Error> = ApiError

/** Sends a request: base address, Bearer token, ApiError on failure or no network. */
async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = getAccessToken()
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(`${getApiUrl()}${path}`, { ...init, headers })
  } catch (cause) {
    // A cancelled request (TanStack Query aborts on unmount) is not a network failure
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw networkError(cause)
  }

  if (!response.ok) throw await errorFromResponse(response)
  return response
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
