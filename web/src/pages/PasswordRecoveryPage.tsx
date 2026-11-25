import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { errorCodeOf } from '@/api/error-codes'
import AccountLayout from '@/app/layouts/AccountLayout'
import { forgotPassword, resetPassword } from '@/auth/account-api'
import { safeReturnTo } from '@/auth/return-to'
import { sessionStore } from '@/auth/session-store'
import { isValidEmail } from '@/auth/validation'
import InlineAlert from '@/components/InlineAlert'
import TextField from '@/components/TextField'
import { Button } from '@/components/ui/button'
import { applyServerFieldErrors } from '@/lib/form-errors'

const minimumResetPasswordLength = 6

type Fields = { email: string; new_password: string }
type Mode = { kind: 'forgot' } | { kind: 'reset'; token: string | null }

function PasswordRecoveryPage({ mode }: { mode: Mode }) {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [linkRequested, setLinkRequested] = useState(false)
  const pending = useRef<AbortController | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Fields>({ defaultValues: { email: '', new_password: '' } })
  const resetting = mode.kind === 'reset'
  const titleKey = resetting ? 'auth.resetPassword' : 'auth.forgotPassword'
  const returnTo = safeReturnTo(searchParams.get('returnTo'))
  const loginUrl = returnTo ? `/login?${new URLSearchParams({ returnTo })}` : '/login'
  const needsNewLink = resetting && !mode.token

  useEffect(() => () => pending.current?.abort(), [])

  async function submit({ email, new_password }: Fields) {
    if (pending.current) return
    const controller = new AbortController()
    const { signal } = controller
    pending.current = controller
    const { generation } = sessionStore.getSnapshot()

    try {
      if (mode.kind === 'forgot') {
        await forgotPassword(email, signal)
        if (!signal.aborted) setLinkRequested(true)
      } else if (mode.token) {
        await resetPassword(mode.token, new_password)
        // The backend revokes refresh tokens. Clear the session even if the user left this route.
        if (sessionStore.getSnapshot().generation === generation) sessionStore.clearSession()
        if (!signal.aborted) {
          await navigate(loginUrl, { replace: true, state: { passwordReset: true } })
        }
      }
    } catch (error) {
      if (
        !signal.aborted &&
        !applyServerFieldErrors(error, setError, { message: t('validation.invalid') })
      ) {
        const code = errorCodeOf(error)
        setError('root.server', { type: code, message: t(`errors.${code}`) })
      }
    } finally {
      pending.current = null
    }
  }

  const serverError = errors.root?.server
  const invalidLink = needsNewLink || serverError?.type === 'InvalidAccountTokenError'

  return (
    <AccountLayout
      routeId={resetting ? 'reset-password' : 'forgot-password'}
      title={t(`${titleKey}.title`)}
      description={!invalidLink && !linkRequested ? t(`${titleKey}.description`) : undefined}
    >
      {invalidLink ? (
        <>
          <InlineAlert tone="danger" role="alert">
            {t('errors.InvalidAccountTokenError')}
          </InlineAlert>
          <Button asChild className="w-full">
            <Link to="/forgot-password">{t('auth.resetPassword.requestNewLink')}</Link>
          </Button>
        </>
      ) : linkRequested ? (
        <InlineAlert tone="ok" role="status">
          {t('auth.forgotPassword.success')}
        </InlineAlert>
      ) : (
        <form
          noValidate
          className="space-y-5"
          onSubmit={(event) => {
            if (pending.current) {
              event.preventDefault()
              return
            }
            void handleSubmit(submit)(event)
          }}
        >
          {resetting ? (
            <TextField
              type="password"
              autoComplete="new-password"
              label={t('auth.resetPassword.password')}
              hint={errors.new_password ? undefined : t('auth.resetPassword.passwordHint')}
              error={errors.new_password?.message}
              readOnly={isSubmitting}
              {...register('new_password', {
                required: t('auth.passwordRequired'),
                validate: (value) =>
                  Array.from(value).length >= minimumResetPasswordLength ||
                  t('auth.resetPassword.passwordHint'),
              })}
            />
          ) : (
            <TextField
              type="email"
              autoComplete="email"
              label={t('auth.email')}
              placeholder="name@example.kz"
              error={errors.email?.message}
              readOnly={isSubmitting}
              {...register('email', {
                required: t('auth.emailRequired'),
                setValueAs: (value: string) => value.trim(),
                validate: (value) => isValidEmail(value) || t('auth.invalidEmail'),
              })}
            />
          )}
          {serverError?.message && (
            <InlineAlert tone="danger" role="alert">
              {serverError.message}
            </InlineAlert>
          )}
          <Button type="submit" loading={isSubmitting} className="h-[3.25rem] w-full text-base">
            {t(`${titleKey}.submit`)}
          </Button>
        </form>
      )}
      <Button asChild variant="ghost" className="w-full">
        <Link to={loginUrl}>{t('auth.backToLogin')}</Link>
      </Button>
    </AccountLayout>
  )
}

export function ForgotPasswordPage() {
  return <PasswordRecoveryPage mode={{ kind: 'forgot' }} />
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  return <PasswordRecoveryPage key={token} mode={{ kind: 'reset', token }} />
}
