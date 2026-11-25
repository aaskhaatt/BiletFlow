import {
  authForgotPassword,
  authGetMe,
  authResendVerification,
  authResetPassword,
  authVerifyEmail,
} from '@/api/generated/endpoints/auth/auth'

export function getMe(signal: AbortSignal) {
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
