const origin = 'https://biletflow.invalid'

/** Treat returnTo as untrusted even when the app usually writes it itself. */
export function safeReturnTo(value: string | null): string | null {
  if (!value?.startsWith('/') || value.startsWith('//')) return null

  try {
    const url = new URL(value, origin)
    const pathname = decodeURIComponent(url.pathname)
    if (
      url.origin !== origin ||
      pathname.startsWith('//') ||
      pathname.includes('\\') ||
      /^\/(?:login|register)\/*$/i.test(pathname)
    ) {
      return null
    }
    return url.pathname + url.search + url.hash
  } catch {
    return null
  }
}
