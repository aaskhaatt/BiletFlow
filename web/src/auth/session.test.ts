import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { setRequestSession } from '@/api/access-token'
import { apiFetch } from '@/api/http'
import { createSessionStore } from '@/auth/session-store'
import { apiUrl, server } from '@/test/msw-server'

const storageKey = 'biletflow.refresh-token'
const loginDetails = { email: 'attendee@example.test', password: 'sample-password' }
const tokens = (name: string, accessToken = 'access-' + name) => ({
  access_token: accessToken,
  refresh_token: 'refresh-' + name,
  token_type: 'bearer',
})

function unauthorized(error = 'InvalidTokenError') {
  return HttpResponse.json({ error, message: 'Unauthorized' }, { status: 401 })
}

function suspended() {
  return HttpResponse.json({ error: 'UserSuspendedError', message: 'Suspended' }, { status: 403 })
}

function defer() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function connect() {
  const session = createSessionStore()
  setRequestSession(session)
  return session
}

function mockLogin(pair = tokens('old')) {
  server.use(
    http.post(apiUrl('/auth/login'), async ({ request }) => {
      expect(await request.json()).toEqual(loginDetails)
      return HttpResponse.json(pair)
    }),
  )
}

beforeEach(() => localStorage.removeItem(storageKey))
afterEach(() => setRequestSession(null))

it('logs in with JSON, sends a Bearer token, and clears both credentials on local logout', async () => {
  const session = connect()
  mockLogin()
  server.use(
    http.get(apiUrl('/auth/me'), ({ request }) =>
      HttpResponse.json({ authorization: request.headers.get('Authorization') }),
    ),
  )

  await session.login(loginDetails)

  expect(session.getSnapshot().status).toBe('authenticated')
  expect(localStorage.getItem(storageKey)).toBe('refresh-old')
  expect(Object.values({ ...localStorage })).not.toContain('access-old')
  await expect(apiFetch('/auth/me')).resolves.toEqual({ authorization: 'Bearer access-old' })

  session.clearSession()
  expect(session.getCredentials()).toMatchObject({ accessToken: null, canRefresh: false })
  expect(localStorage.getItem(storageKey)).toBeNull()
  await expect(apiFetch('/auth/me')).resolves.toEqual({ authorization: null })
})

it('restores on a reload and shares duplicate startup calls while rotating both tokens', async () => {
  localStorage.setItem(storageKey, 'refresh-old')
  const session = connect()
  const refresh = vi.fn(async ({ request }: { request: Request }) => {
    expect(await request.json()).toEqual({ refresh_token: 'refresh-old' })
    return HttpResponse.json(tokens('new'))
  })
  server.use(http.post(apiUrl('/auth/refresh'), refresh))

  expect(session.getSnapshot().status).toBe('restoring')
  expect(session.getCredentials().accessToken).toBeNull()
  await Promise.all([session.restore(), session.restore()])
  await session.restore()

  expect(refresh).toHaveBeenCalledTimes(1)
  expect(session.getSnapshot().status).toBe('authenticated')
  expect(session.getCredentials().accessToken).toBe('access-new')
  expect(localStorage.getItem(storageKey)).toBe('refresh-new')
})

it('keeps a saved session on a startup network failure and restores it when retried', async () => {
  localStorage.setItem(storageKey, 'refresh-old')
  const session = connect()
  server.use(http.post(apiUrl('/auth/refresh'), () => HttpResponse.error()))

  await session.restore()
  expect(session.getSnapshot()).toMatchObject({
    status: 'restoring',
    refreshError: { error: 'NETWORK_ERROR' },
  })
  expect(localStorage.getItem(storageKey)).toBe('refresh-old')

  server.use(http.post(apiUrl('/auth/refresh'), () => HttpResponse.json(tokens('new'))))
  await session.restore()
  expect(session.getSnapshot()).toMatchObject({ status: 'authenticated', refreshError: null })
  expect(localStorage.getItem(storageKey)).toBe('refresh-new')
})

it('clears an invalid saved refresh token during startup', async () => {
  localStorage.setItem(storageKey, 'refresh-old')
  const session = connect()
  server.use(http.post(apiUrl('/auth/refresh'), () => unauthorized('InvalidRefreshTokenError')))

  await session.restore()
  expect(session.getSnapshot().status).toBe('expired')
  expect(localStorage.getItem(storageKey)).toBeNull()
})

it('preserves the previous pair when a successful refresh response is incomplete', async () => {
  const session = connect()
  mockLogin()
  server.use(
    http.post(apiUrl('/auth/refresh'), () => HttpResponse.json({ access_token: 'unpaired' })),
  )
  await session.login(loginDetails)

  await expect(session.refresh()).rejects.toMatchObject({ error: 'UNKNOWN_ERROR' })
  expect(session.getCredentials().accessToken).toBe('access-old')
  expect(localStorage.getItem(storageKey)).toBe('refresh-old')
})

it('leaves a newer stored session alone when the old refresh token is rejected', async () => {
  localStorage.setItem(storageKey, 'refresh-old')
  const session = connect()
  server.use(http.post(apiUrl('/auth/refresh'), () => unauthorized('InvalidRefreshTokenError')))
  localStorage.setItem(storageKey, 'refresh-other-tab')

  await session.restore()
  expect(session.getSnapshot().status).toBe('expired')
  expect(localStorage.getItem(storageKey)).toBe('refresh-other-tab')
})

it('uses one rotation for three parallel 401s, including a late response from the old token', async () => {
  const session = connect()
  const allOriginalRequests = defer()
  const late401 = defer()
  const refresh = vi.fn(() => HttpResponse.json(tokens('new')))
  let originalCount = 0
  let retryCount = 0
  mockLogin()
  server.use(
    http.post(apiUrl('/auth/refresh'), refresh),
    http.get(apiUrl('/events'), async ({ request }) => {
      if (request.headers.get('Authorization') === 'Bearer access-new') {
        retryCount++
        return HttpResponse.json({ total: 0 })
      }
      expect(request.headers.get('Authorization')).toBe('Bearer access-old')
      originalCount++
      if (originalCount === 3) allOriginalRequests.resolve()
      await allOriginalRequests.promise
      if (new URL(request.url).searchParams.get('request') === '3') await late401.promise
      return unauthorized()
    }),
  )

  await session.login(loginDetails)
  const first = apiFetch('/events?request=1')
  const second = apiFetch('/events?request=2')
  const third = apiFetch('/events?request=3')
  try {
    await expect(Promise.all([first, second])).resolves.toEqual([{ total: 0 }, { total: 0 }])
  } finally {
    late401.resolve()
  }
  await expect(third).resolves.toEqual({ total: 0 })

  expect(refresh).toHaveBeenCalledTimes(1)
  expect(originalCount).toBe(3)
  expect(retryCount).toBe(3)
  expect(localStorage.getItem(storageKey)).toBe('refresh-new')
})

it('refreshes an access token with less than one minute left before sending the request', async () => {
  const session = connect()
  const soon = Math.floor(Date.now() / 1000) + 30
  const jwtPayload = btoa(JSON.stringify({ exp: soon })).replace(/=+$/, '')
  mockLogin(tokens('old', 'header.' + jwtPayload + '.signature'))
  const refresh = vi.fn(() => HttpResponse.json(tokens('new')))
  const getEvents = vi.fn(({ request }: { request: Request }) =>
    HttpResponse.json({ authorization: request.headers.get('Authorization') }),
  )
  server.use(http.post(apiUrl('/auth/refresh'), refresh), http.get(apiUrl('/events'), getEvents))
  await session.login(loginDetails)

  await expect(apiFetch('/events')).resolves.toEqual({ authorization: 'Bearer access-new' })
  expect(refresh).toHaveBeenCalledTimes(1)
  expect(getEvents).toHaveBeenCalledTimes(1)
})

it('keeps both credentials when a refresh triggered by a 401 fails on the network', async () => {
  const session = connect()
  mockLogin()
  server.use(
    http.get(apiUrl('/events'), () => unauthorized()),
    http.post(apiUrl('/auth/refresh'), () => HttpResponse.error()),
  )
  await session.login(loginDetails)

  await expect(apiFetch('/events')).rejects.toMatchObject({ error: 'NETWORK_ERROR' })
  expect(session.getSnapshot()).toMatchObject({
    status: 'authenticated',
    refreshError: { error: 'NETWORK_ERROR' },
  })
  expect(session.getCredentials().accessToken).toBe('access-old')
  expect(localStorage.getItem(storageKey)).toBe('refresh-old')
})

it('skips recovery for auth endpoints and explicitly supplied Authorization', async () => {
  const session = connect()
  const refresh = vi.fn(() => HttpResponse.json(tokens('new')))
  mockLogin()
  server.use(
    http.post(apiUrl('/auth/refresh'), refresh),
    http.get(apiUrl('/auth/me'), () => unauthorized()),
    http.get(apiUrl('/events'), ({ request }) => {
      expect(request.headers.get('Authorization')).toBe('Bearer caller-token')
      return unauthorized()
    }),
  )
  await session.login(loginDetails)

  await expect(apiFetch('/auth/me')).rejects.toMatchObject({ status: 401 })
  await expect(
    apiFetch('/events', { headers: { Authorization: 'Bearer caller-token' } }),
  ).rejects.toMatchObject({ status: 401 })
  expect(refresh).not.toHaveBeenCalled()
  expect(session.getSnapshot().status).toBe('authenticated')
})

it('signs out after a second 401 without requesting another refresh', async () => {
  const session = connect()
  const refresh = vi.fn(() => HttpResponse.json(tokens('new')))
  const events = vi.fn(() => unauthorized())
  mockLogin()
  server.use(http.get(apiUrl('/events'), events), http.post(apiUrl('/auth/refresh'), refresh))
  await session.login(loginDetails)

  await expect(apiFetch('/events')).rejects.toMatchObject({ status: 401 })
  expect(refresh).toHaveBeenCalledTimes(1)
  expect(events).toHaveBeenCalledTimes(2)
  expect(session.getSnapshot().status).toBe('expired')
  expect(session.getCredentials().accessToken).toBeNull()
  expect(localStorage.getItem(storageKey)).toBeNull()
})

it('discards a delayed refresh after local logout', async () => {
  const session = connect()
  const refreshStarted = defer()
  const releaseRefresh = defer()
  mockLogin()
  server.use(
    http.post(apiUrl('/auth/refresh'), async () => {
      refreshStarted.resolve()
      await releaseRefresh.promise
      return HttpResponse.json(tokens('new'))
    }),
  )
  await session.login(loginDetails)

  const pending = session.refresh()
  await refreshStarted.promise
  session.clearSession()
  releaseRefresh.resolve()

  await expect(pending).resolves.toBeNull()
  expect(session.getSnapshot().status).toBe('anonymous')
  expect(localStorage.getItem(storageKey)).toBeNull()
})

it('does not replay an old account request with another account’s credentials', async () => {
  const session = connect()
  const requestStarted = defer()
  const releaseResponse = defer()
  const refresh = vi.fn(() => HttpResponse.json(tokens('unexpected')))
  const events = vi.fn(async () => {
    requestStarted.resolve()
    await releaseResponse.promise
    return unauthorized()
  })
  mockLogin()
  server.use(http.get(apiUrl('/events'), events), http.post(apiUrl('/auth/refresh'), refresh))
  await session.login(loginDetails)

  const pending = apiFetch('/events')
  await requestStarted.promise
  mockLogin(tokens('other'))
  await session.login(loginDetails)
  releaseResponse.resolve()

  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  expect(refresh).not.toHaveBeenCalled()
  expect(events).toHaveBeenCalledTimes(1)
  expect(localStorage.getItem(storageKey)).toBe('refresh-other')
})

it.each(['/events', '/auth/me'])('ends the browser session on suspension from %s', async (path) => {
  const session = connect()
  mockLogin()
  server.use(http.get(apiUrl(path), suspended))
  await session.login(loginDetails)

  await expect(apiFetch(path)).rejects.toMatchObject({ status: 403, error: 'UserSuspendedError' })
  expect(session.getSnapshot().status).toBe('suspended')
  expect(session.getCredentials()).toMatchObject({ accessToken: null, canRefresh: false })
  expect(localStorage.getItem(storageKey)).toBeNull()
})

it('clears a suspended session during startup restoration', async () => {
  localStorage.setItem(storageKey, 'refresh-old')
  const session = connect()
  server.use(http.post(apiUrl('/auth/refresh'), suspended))

  await session.restore()

  expect(session.getSnapshot()).toMatchObject({ status: 'suspended', refreshError: null })
  expect(localStorage.getItem(storageKey)).toBeNull()
})

it('ignores a late suspension response from a previous account', async () => {
  const session = connect()
  const started = defer()
  const reply = defer()
  mockLogin()
  server.use(
    http.get(apiUrl('/auth/me'), async () => {
      started.resolve()
      await reply.promise
      return suspended()
    }),
  )
  await session.login(loginDetails)
  const oldProfile = apiFetch('/auth/me')
  await started.promise
  mockLogin(tokens('new-account'))
  await session.login(loginDetails)
  reply.resolve()

  await expect(oldProfile).rejects.toMatchObject({ error: 'UserSuspendedError' })
  expect(session.getSnapshot().status).toBe('authenticated')
  expect(localStorage.getItem(storageKey)).toBe('refresh-new-account')
})

it('waits for a pending rotation, then revokes the latest token once before clearing it', async () => {
  const session = connect()
  const refreshStarted = defer()
  const finishRefresh = defer()
  const logoutStarted = defer()
  const finishLogout = defer()
  mockLogin()
  const logout = vi.fn(async ({ request }: { request: Request }) => {
    expect(await request.json()).toEqual({ refresh_token: 'refresh-new' })
    logoutStarted.resolve()
    await finishLogout.promise
    return HttpResponse.json({ message: 'Logged out' })
  })
  server.use(
    http.post(apiUrl('/auth/refresh'), async () => {
      refreshStarted.resolve()
      await finishRefresh.promise
      return HttpResponse.json(tokens('new'))
    }),
    http.post(apiUrl('/auth/logout'), logout),
  )
  await session.login(loginDetails)

  const pendingRefresh = session.refresh()
  await refreshStarted.promise
  const pendingLogout = session.signOut()
  expect(session.signOut()).toBe(pendingLogout)
  expect(logout).not.toHaveBeenCalled()
  finishRefresh.resolve()
  await pendingRefresh
  await logoutStarted.promise
  try {
    expect(localStorage.getItem(storageKey)).toBe('refresh-new')
    await expect(session.refresh()).resolves.toBeNull()
  } finally {
    finishLogout.resolve()
  }
  await pendingLogout

  expect(logout).toHaveBeenCalledTimes(1)
  expect(session.getSnapshot().status).toBe('anonymous')
  expect(session.getCredentials()).toMatchObject({ accessToken: null, canRefresh: false })
  expect(localStorage.getItem(storageKey)).toBeNull()
})

it('clears local credentials when the logout request cannot reach the server', async () => {
  const session = connect()
  mockLogin()
  server.use(http.post(apiUrl('/auth/logout'), () => HttpResponse.error()))
  await session.login(loginDetails)

  await expect(session.signOut()).rejects.toMatchObject({ error: 'NETWORK_ERROR' })
  expect(session.getSnapshot().status).toBe('anonymous')
  expect(session.getCredentials()).toMatchObject({ accessToken: null, canRefresh: false })
  expect(localStorage.getItem(storageKey)).toBeNull()
})
