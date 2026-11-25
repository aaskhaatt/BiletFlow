import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { errorCodeOf, errorMessageKey } from '@/api/error-codes'
import type { CurrentUserResponse } from '@/api/generated/model'
import { resendVerification } from '@/auth/account-api'
import { sessionStore, useSession } from '@/auth/session-store'
import { meQueryKey, useMe } from '@/auth/use-me'
import InlineAlert from '@/components/InlineAlert'
import { Button } from '@/components/ui/button'

function ResendVerification({ generation }: { generation: number }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const resend = useMutation({
    mutationFn: resendVerification,
    onError: (error) => {
      if (
        errorCodeOf(error) !== 'EmailAlreadyVerifiedError' ||
        sessionStore.getSnapshot().generation !== generation
      ) {
        return
      }
      queryClient.setQueryData<CurrentUserResponse>([...meQueryKey, generation], (user) =>
        user ? { ...user, email_verified: true } : undefined,
      )
      void queryClient.invalidateQueries({ queryKey: meQueryKey })
      toast.success(t('errors.EmailAlreadyVerifiedError'))
    },
  })

  return (
    <div className="space-y-2" data-slot="email-verification-banner">
      <InlineAlert tone="warn">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p>{t('auth.verifyEmail.banner')}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-w-full whitespace-normal"
            loading={resend.isPending}
            onClick={() => resend.mutate()}
          >
            {t('auth.verifyEmail.resend')}
          </Button>
        </div>
      </InlineAlert>
      {resend.isSuccess && (
        <InlineAlert tone="ok" role="status">
          {t('auth.verifyEmail.sent')}
        </InlineAlert>
      )}
      {resend.isError && (
        <InlineAlert tone="danger" role="alert">
          {t(errorMessageKey(resend.error))}
        </InlineAlert>
      )}
    </div>
  )
}

export default function EmailVerificationBanner({ className }: { className: string }) {
  const { status, generation } = useSession()
  const me = useMe()
  if (status !== 'authenticated' || me.data?.email_verified !== false) return null

  return (
    <div className={className}>
      <ResendVerification key={generation} generation={generation} />
    </div>
  )
}
