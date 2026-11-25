import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/api/error-codes'
import { useAdminSettings, useSaveActivationFee } from '@/api/hooks/admin'
import InlineAlert from '@/components/InlineAlert'
import TextField from '@/components/TextField'
import { Button } from '@/components/ui/button'
import { applyServerFieldErrors } from '@/lib/form-errors'
import { AdminError, AdminLoading, AdminPage } from './AdminPage'

function ActivationFeeForm({ amount }: { amount: number }) {
  const { t } = useTranslation()
  const save = useSaveActivationFee()
  const { formState, handleSubmit, register, reset, setError } = useForm({
    defaultValues: { amount_kzt: String(amount) },
  })
  const busy = save.isPending || formState.isSubmitting
  const field = register('amount_kzt', {
    validate: (value) =>
      (/^\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value))) ||
      t('adminZone.settings.invalidAmount'),
  })

  const submit = handleSubmit(async ({ amount_kzt }) => {
    save.reset()
    try {
      const settings = await save.mutateAsync(Number(amount_kzt))
      reset({ amount_kzt: String(settings.activation_fee_kzt) })
    } catch (error) {
      if (applyServerFieldErrors(error, setError, { message: t(errorMessageKey(error)) }))
        save.reset()
    }
  })

  return (
    <form
      noValidate
      onSubmit={submit}
      className="max-w-xl space-y-4 rounded-lg border border-line bg-surface p-6"
    >
      <h2 className="type-card-title">{t('adminZone.paidSales.fee')}</h2>
      <TextField
        {...field}
        label={t('adminZone.settings.amount')}
        inputMode="numeric"
        hint={t('adminZone.settings.hint')}
        disabled={busy}
        error={formState.errors.amount_kzt?.message}
        onChange={(event) => {
          void field.onChange(event)
          if (save.isSuccess || save.isError) save.reset()
        }}
      />
      {save.isSuccess && (
        <InlineAlert tone="ok" role="status">
          {t('adminZone.settings.saved')}
        </InlineAlert>
      )}
      {save.isError && (
        <InlineAlert tone="danger" role="alert">
          {t(errorMessageKey(save.error))}
        </InlineAlert>
      )}
      <Button type="submit" loading={busy} disabled={busy}>
        {t('adminZone.settings.save')}
      </Button>
    </form>
  )
}

export default function AdminSettingsPage() {
  const { t } = useTranslation()
  const settings = useAdminSettings()
  return (
    <AdminPage id="settings" title={t('adminZone.settings.title')}>
      {settings.isError ? (
        <AdminError
          error={settings.error}
          retry={() => void settings.refetch()}
          retrying={settings.isFetching}
        />
      ) : !settings.data ? (
        <AdminLoading />
      ) : (
        <ActivationFeeForm amount={settings.data.activation_fee_kzt} />
      )}
    </AdminPage>
  )
}
