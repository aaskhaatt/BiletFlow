/** Error codes the client makes up itself (the server never sends these). */
export const CLIENT_ERROR_CODES = {
  /** The request never reached the server: offline, DNS, CORS, server down. */
  network: 'NETWORK_ERROR',
  /** The server answered with something that isn't our error body. */
  unknown: 'UNKNOWN_ERROR',
} as const

export type FieldErrors = Record<string, string>

/**
 * A failed API call. The backend answers every error with
 * { error, message, fields } (docs/api-reference.md, "Errors").
 *
 * Show the user the translation of `error` (see src/i18n/errors.ts), never
 * `message`: the server writes it in English, for developers.
 */
export class ApiError extends Error {
  /** HTTP status; 0 when the request never got an answer. */
  readonly status: number
  /** Machine-readable code, e.g. "UserAlreadyExistsError" or "VALIDATION_ERROR". */
  readonly error: string
  /** For 422 VALIDATION_ERROR: field name → server's (English) problem text. */
  readonly fields: FieldErrors | null

  constructor(init: {
    status: number
    error: string
    message: string
    fields?: FieldErrors | null
  }) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.error = init.error
    this.fields = init.fields ?? null
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError
}

function isErrorBody(
  value: unknown,
): value is { error: string; message?: unknown; fields?: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { error?: unknown }).error === 'string'
  )
}

function toFieldErrors(value: unknown): FieldErrors | null {
  if (typeof value !== 'object' || value === null) return null
  const fields: FieldErrors = {}
  for (const [name, problem] of Object.entries(value)) fields[name] = String(problem)
  return fields
}

/** Turns an unsuccessful response into an ApiError. */
export async function errorFromResponse(response: Response): Promise<ApiError> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // not JSON (a proxy's HTML page, an empty body): handled below
  }

  if (isErrorBody(body)) {
    return new ApiError({
      status: response.status,
      error: body.error,
      message: typeof body.message === 'string' ? body.message : response.statusText,
      fields: toFieldErrors(body.fields),
    })
  }

  // Older endpoints may still answer { "detail": "..." }
  const detail =
    typeof body === 'object' && body !== null && 'detail' in body
      ? String((body as { detail: unknown }).detail)
      : response.statusText
  return new ApiError({
    status: response.status,
    error: CLIENT_ERROR_CODES.unknown,
    message: detail,
  })
}

export function networkError(cause: unknown): ApiError {
  const error = new ApiError({
    status: 0,
    error: CLIENT_ERROR_CODES.network,
    message: cause instanceof Error ? cause.message : 'Network error',
  })
  error.cause = cause
  return error
}
