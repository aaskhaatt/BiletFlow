// Settings that come from the environment (.env, see .env.example).

const DEFAULT_API_URL = 'http://localhost:8000'

/** The API's base address, without a trailing slash. */
export function getApiUrl(): string {
  const value = import.meta.env.VITE_API_URL?.trim()
  return (value || DEFAULT_API_URL).replace(/\/+$/, '')
}
