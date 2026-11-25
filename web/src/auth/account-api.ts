import { checkSession, getRequestSession, needsAccessRefresh } from '@/api/access-token'
import {
  authForgotPassword,
  authGetMe,
  authResendVerification,
  authResetPassword,
  authVerifyEmail,
} from '@/api/generated/endpoints/auth/auth'

export async function getMe(signal: AbortSignal) {
  signal.throwIfAborted()
  const session = getRequestSession()
  if (session) {
    const credentials = session.getCredentials()
    // The profile is also read after an idle tab returns to the foreground.
    if (needsAccessRefresh(credentials)) {
      await session.refresh()
      checkSession(session, credentials.generation, signal)
    }
  }
  return authGetMe({ signal })
}

export function verifyEmail(token: string) {
  return authVerifyEmail({ token })
}

export function resendVerification() {
  return authResendVerification()
}

export function forgotPassword(email: string, signal: AbortSignal) {
  return authForgotPassword({ email }, { signal })
}

export function resetPassword(token: string, newPassword: string) {
  return authResetPassword({ token, new_password: newPassword })
}
