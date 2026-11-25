import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import AccountLayout from '@/app/layouts/AccountLayout'
import { verifyEmail } from '@/auth/account-api'
import { useSession } from '@/auth/session-store'
import { meQueryKey } from '@/auth/use-me'
import InlineAlert from '@/components/InlineAlert'
import { Button } from '@/components/ui/button'

const invalidLink = 'errors.InvalidAccountTokenError'
type Result = { attempt: number; error?: ReturnType<typeof errorMessageKey> }

function Verification({ token }: { token: string | null }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { status } = useSession()
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<Result>()
  const request = useRef<{ attempt: number; promise: Promise<Result> }>(null)

  useEffect(() => {
    if (!token) return
    // Strict Mode replays this effect. Reusing the request keeps the one-time link valid.
    if (request.current?.attempt !== attempt) {
      const promise = verifyEmail(token).then(
        () => {
          void queryClient.invalidateQueries({ queryKey: meQueryKey })
          return { attempt }
        },
        (error: unknown) => ({ attempt, error: errorMessageKey(error) }),
      )
      request.current = { attempt, promise }
    }

    let active = true
    void request.current.promise.then((next) => {
      if (active) setResult(next)
    })
    return () => {
      active = false
    }
  }, [attempt, queryClient, token])

  const current = result?.attempt === attempt ? result : undefined
  const error = token ? current?.error : invalidLink
  const signedIn = status === 'authenticated'

  return (
    <AccountLayout routeId="verify-email" title={t('auth.verifyEmail.title')}>
      {error ? (
        <InlineAlert tone="danger" role="alert">
          {t(error)}
        </InlineAlert>
      ) : (
        <InlineAlert tone={current ? 'ok' : 'info'} role="status">
          {t(current ? 'auth.verifyEmail.success' : 'auth.verifyEmail.pending')}
        </InlineAlert>
      )}
      {error && error !== invalidLink && (
        <Button type="button" className="w-full" onClick={() => setAttempt(attempt + 1)}>
          {t('common.retry')}
        </Button>
      )}
      <Button asChild variant="ghost" className="w-full">
        <Link to={signedIn ? '/' : '/login'}>
          {t(signedIn ? 'auth.continueToEvents' : 'auth.backToLogin')}
        </Link>
      </Button>
    </AccountLayout>
  )
}

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  return <Verification key={token} token={token} />
}
