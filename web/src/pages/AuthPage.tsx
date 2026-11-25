import { useEffect, useId, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import { isApiError } from '@/api/errors'
import type { UserLogin } from '@/api/generated/model'
import AccountLayout from '@/app/layouts/AccountLayout'
import { safeReturnTo } from '@/auth/return-to'
import { registerAccount, sessionStore, useSession } from '@/auth/session-store'
import { isValidEmail } from '@/auth/validation'
import InlineAlert from '@/components/InlineAlert'
import TextField from '@/components/TextField'
import { Button } from '@/components/ui/button'
import { applyServerFieldErrors } from '@/lib/form-errors'

const minimumPasswordLength = 8

function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { status } = useSession()
  const registration = mode === 'register'
  const returnTo = safeReturnTo(searchParams.get('returnTo'))
  const returnSearch = returnTo ? `?${new URLSearchParams({ returnTo })}` : ''
  const savedEmail: unknown = location.state?.registeredEmail
  const registeredEmail = !registration && typeof savedEmail === 'string' ? savedEmail : ''
  const passwordReset = !registration && location.state?.passwordReset === true
  const passwordHintId = useId()
  const pending = useRef<AbortController | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UserLogin>({ defaultValues: { email: registeredEmail, password: '' } })
  const suspended = !registration && status === 'suspended'
  const formError =
    errors.root?.server?.message ?? (suspended ? t('errors.UserSuspendedError') : undefined)

  useEffect(() => () => pending.current?.abort(), [])

  async function submit(credentials: UserLogin) {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    const { signal } = controller

    try {
      if (registration) await registerAccount(credentials, signal)

      try {
        await sessionStore.login(credentials, signal)
      } catch (error) {
        if (signal.aborted) return
        if (!registration) throw error
        // The account exists. A sign-in retry must not submit registration again.
        await navigate('/login' + returnSearch, {
          replace: true,
          state: { registeredEmail: credentials.email },
        })
        return
      }

      if (!signal.aborted) await navigate(returnTo ?? '/', { replace: true })
    } catch (error) {
      if (signal.aborted) return
      if (
        registration &&
        isApiError(error) &&
        error.status === 409 &&
        error.error === 'UserAlreadyExistsError'
      ) {
        setError(
          'email',
          { type: 'server', message: t(errorMessageKey(error)) },
          { shouldFocus: true },
        )
      } else if (!applyServerFieldErrors(error, setError, { message: t('validation.invalid') })) {
        setError('root.server', { type: 'server', message: t(errorMessageKey(error)) })
      }
    } finally {
      pending.current = null
    }
  }

  return (
    <AccountLayout
      routeId={mode}
      title={t(`auth.${mode}.title`)}
      description={t(`auth.${mode}.description`)}
    >
      {registeredEmail && <InlineAlert role="status">{t('auth.login.accountCreated')}</InlineAlert>}
      {passwordReset && (
        <InlineAlert tone="ok" role="status">
          {t('auth.resetPassword.success')}
        </InlineAlert>
      )}
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
        <div className="space-y-3.5">
          <TextField
            type="email"
            autoComplete={registration ? 'email' : 'username'}
            label={t('auth.email')}
            placeholder="name@example.kz"
            hint={registration ? t('auth.register.emailHint') : undefined}
            error={errors.email?.message}
            readOnly={isSubmitting}
            {...register('email', {
              required: t('auth.emailRequired'),
              setValueAs: (value: string) => value.trim(),
              validate: (value) => isValidEmail(value) || t('auth.invalidEmail'),
            })}
          />
          {registration && !errors.password && (
            <span id={passwordHintId} className="sr-only">
              {t('auth.register.passwordHint')}
            </span>
          )}
          <TextField
            type="password"
            autoComplete={registration ? 'new-password' : 'current-password'}
            label={t('auth.password')}
            placeholder={registration ? t('auth.register.passwordHint') : '••••••••'}
            aria-describedby={registration && !errors.password ? passwordHintId : undefined}
            error={errors.password?.message}
            readOnly={isSubmitting}
            {...register('password', {
              required: t('auth.passwordRequired'),
              validate: (value) =>
                !registration ||
                Array.from(value).length >= minimumPasswordLength ||
                t('auth.register.passwordHint'),
            })}
          />
          {!registration && (
            <Link
              to={'/forgot-password' + returnSearch}
              className="inline-block type-label text-brand hover:underline"
            >
              {t('auth.login.forgotPassword')}
            </Link>
          )}
        </div>
        {formError && (
          <InlineAlert tone="danger" role="alert">
            {formError}
          </InlineAlert>
        )}
        <Button type="submit" loading={isSubmitting} className="h-[3.25rem] w-full text-base">
          {t(`auth.${mode}.submit`)}
        </Button>
      </form>

      <p className="text-center type-label">
        <Link
          to={(registration ? '/login' : '/register') + returnSearch}
          className="text-brand hover:underline"
        >
          {t(`auth.${mode}.switch`)}
        </Link>
      </p>
    </AccountLayout>
  )
}

export function LoginPage() {
  return <AuthPage mode="login" />
}

export function RegisterPage() {
  return <AuthPage mode="register" />
}
