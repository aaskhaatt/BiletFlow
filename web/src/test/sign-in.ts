import { http, HttpResponse } from 'msw'
import { setRequestSession } from '@/api/access-token'
import type { CurrentUserResponse } from '@/api/generated/model'
import { sessionStore } from '@/auth/session-store'
import { apiUrl, server } from '@/test/msw-server'

/** A signed-in user without an organizer profile. Spread it and change what a test needs. */
export const attendee: CurrentUserResponse = {
  id: 1,
  email: 'tester@example.test',
  email_verified: true,
  is_platform_admin: false,
  is_event_staff: false,
  organizer: null,
}

/** An approved organizer. */
export const organizer: CurrentUserResponse = {
  ...attendee,
  organizer: { id: 10, user_id: 1, status: 'approved', display_name: null, rejection_reason: null },
}

/** Call in beforeEach: the request layer then uses the session store, as in the app. */
export function startSession() {
  sessionStore.clearSession()
  setRequestSession(sessionStore)
}

/** Call in afterEach. */
export function endSession() {
  sessionStore.clearSession()
  setRequestSession(null)
}

/**
 * Signs a user in: POST /auth/login succeeds and GET /auth/me answers with
 * `profile()`, so a test can change the answer while it runs.
 */
export async function signIn(profile: CurrentUserResponse | (() => CurrentUserResponse)) {
  const current = typeof profile === 'function' ? profile : () => profile
  server.use(
    http.post(apiUrl('/auth/login'), () =>
      HttpResponse.json({
        access_token: 'test-access',
        refresh_token: 'test-refresh',
        token_type: 'bearer',
      }),
    ),
    http.get(apiUrl('/auth/me'), () => HttpResponse.json(current())),
  )
  await sessionStore.login({ email: current().email, password: 'test-password' })
}
