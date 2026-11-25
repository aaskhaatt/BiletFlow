import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import TextField from '@/components/TextField'
import { Button } from '@/components/ui/button'

// A real form: the error appears after "Check", and focus moves to the field,
// so a screen reader reads the label and the error together.
function PasswordForm() {
  const { t } = useTranslation()
  const { register, handleSubmit, formState } = useForm<{ password: string }>()

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={handleSubmit(() => undefined)}
      data-testid="fields-form"
    >
      <p className="type-body text-ink-2">{t('dev.fields.formNote')}</p>
      <TextField
        type="password"
        autoComplete="new-password"
        label={t('dev.fields.password')}
        placeholder={t('dev.fields.passwordPlaceholder')}
        error={formState.errors.password && t('dev.fields.passwordTooShort')}
        {...register('password', { minLength: 8, required: true })}
      />
      <Button type="submit" variant="outline" className="self-start">
        {t('dev.fields.check')}
      </Button>
    </form>
  )
}

// W2.3: the text field in every state of the Figma design system.
export default function FieldsSection() {
  const { t } = useTranslation()

  return (
    <section className="space-y-6" data-testid="fields">
      <h2 className="type-card-title">Fields</h2>

      <div className="grid gap-6 sm:grid-cols-2">
        <TextField label={t('dev.fields.name')} placeholder={t('dev.fields.namePlaceholder')} />
        <TextField
          type="email"
          label={t('dev.fields.email')}
          hint={t('dev.fields.emailHint')}
          defaultValue="aigerim@example.kz"
        />
        <TextField
          type="email"
          label={t('dev.fields.email')}
          hint={t('dev.fields.emailHint')}
          error={t('dev.fields.emailError')}
          defaultValue="aigerim@example"
        />
        <TextField label={t('dev.fields.disabled')} defaultValue="BF-2026-0042" disabled />
      </div>

      <div className="max-w-sm">
        <PasswordForm />
      </div>
    </section>
  )
}
