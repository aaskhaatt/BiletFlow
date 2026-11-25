import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useForm, type DefaultValues, type FieldValues } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useSearchParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import type {
  IdentityVerificationRequest,
  OrganizerProfileResponse,
  PayoutAccountRequest,
} from '@/api/generated/model'
import { useOrganizerProfile, useOrganizerProfileActions } from '@/api/hooks/organizers'
import ErrorState from '@/components/ErrorState'
import InlineAlert from '@/components/InlineAlert'
import StatusBadge from '@/components/StatusBadge'
import TextField from '@/components/TextField'
import { Button } from '@/components/ui/button'
import { formatEventTime } from '@/lib/format'
import { applyServerFieldErrors } from '@/lib/form-errors'
import { parseEventId } from '@/pages/events/availability'
import OrganizerPage from '@/pages/organizer/OrganizerPage'

const normalizePhone = (value: string) => value.replace(/[\s()-]/g, '')
const normalizeIban = (value: string) => value.replace(/ /g, '').toUpperCase()
const length = (value: string) => Array.from(value.trim()).length

type ProfileRequest = () => Promise<OrganizerProfileResponse>
type Save = (request: ProfileRequest) => Promise<OrganizerProfileResponse | undefined>
type ProfileData = {
  profile: OrganizerProfileResponse
  busy: boolean
  run: Save
  actions: ReturnType<typeof useOrganizerProfileActions>
}

function useProfileForm<T extends FieldValues>(
  defaults: DefaultValues<T>,
  save: (values: T) => Promise<OrganizerProfileResponse | undefined>,
  afterSave: (profile: OrganizerProfileResponse) => T,
) {
  const { t } = useTranslation()
  const form = useForm<T>({ defaultValues: defaults })
  const [saved, setSaved] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
    void form.handleSubmit(async (values) => {
      setSaved(false)
      form.clearErrors()
      try {
        const profile = await save(values)
        if (!profile) return
        form.reset(afterSave(profile))
        setSaved(true)
      } catch (error) {
        if (!applyServerFieldErrors(error, form.setError, { message: t('validation.invalid') })) {
          form.setError('root.server', { message: t(errorMessageKey(error)) })
        }
      }
    })(event)
  }

  return { ...form, saved, submit }
}

function ProfileSection({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      tabIndex={-1}
      aria-labelledby={`${id}-title`}
      className="min-w-0 scroll-mt-6 space-y-4 rounded-lg border border-line bg-surface p-5"
    >
      <h2 id={`${id}-title`} className="type-card-title">
        {title}
      </h2>
      {children}
    </section>
  )
}

function FormFeedback({ error, saved }: { error?: string; saved: boolean }) {
  const { t } = useTranslation()
  if (error)
    return (
      <InlineAlert tone="danger" role="alert">
        {error}
      </InlineAlert>
    )
  if (saved)
    return (
      <InlineAlert tone="ok" role="status">
        {t('organizerProfile.saved')}
      </InlineAlert>
    )
  return null
}

function PublicNameForm({ profile, busy, run, actions }: ProfileData) {
  const { t } = useTranslation()
  const form = useProfileForm(
    { display_name: profile.display_name ?? '' },
    ({ display_name }) =>
      run(() => actions.updatePublicName({ display_name: display_name.trim() || null })),
    (profile) => ({ display_name: profile.display_name ?? '' }),
  )
  const { errors, isSubmitting } = form.formState

  return (
    <ProfileSection id="public-profile" title={t('organizerProfile.public')}>
      <form noValidate onSubmit={form.submit} className="space-y-4">
        <TextField
          label={t('organizerProfile.publicName')}
          hint={t('organizerProfile.publicHint')}
          autoComplete="organization"
          readOnly={busy}
          error={errors.display_name?.message}
          {...form.register('display_name', {
            validate: (value) => {
              const size = length(value)
              return (
                size === 0 ||
                (size >= 2 && size <= 100) ||
                t('organizerApplication.displayName.length')
              )
            },
          })}
        />
        <FormFeedback saved={form.saved} error={errors.root?.server?.message} />
        <Button type="submit" disabled={busy} loading={isSubmitting}>
          {t('organizerProfile.save')}
        </Button>
      </form>
    </ProfileSection>
  )
}

function IdentityForm({ profile, busy, run, actions }: ProfileData) {
  const { t } = useTranslation()
  const approved = profile.status === 'approved'
  const valuesOf = (profile: OrganizerProfileResponse): IdentityVerificationRequest => ({
    legal_name: profile.legal_name ?? '',
    contact_phone: profile.contact_phone ?? '',
  })
  const form = useProfileForm(
    valuesOf(profile),
    (values) =>
      run(() =>
        actions.verifyIdentity({
          legal_name: values.legal_name.trim(),
          contact_phone: normalizePhone(values.contact_phone),
        }),
      ),
    valuesOf,
  )
  const { errors, isSubmitting } = form.formState
  const verifiedAt = profile.identity_verified_at

  return (
    <ProfileSection id="identity" title={t('organizerProfile.identity')}>
      {verifiedAt ? (
        <InlineAlert tone="ok">
          {t('organizerProfile.verifiedAt', {
            time: formatEventTime(verifiedAt, { withZone: true }),
          })}
        </InlineAlert>
      ) : (
        <p className="type-small text-ink-2">{t('organizerProfile.identityPending')}</p>
      )}
      <form noValidate onSubmit={form.submit} className="space-y-4">
        <TextField
          label={t('organizerProfile.legalName')}
          autoComplete="organization"
          readOnly={busy || !approved}
          required
          error={errors.legal_name?.message}
          {...form.register('legal_name', {
            validate: (value) =>
              (length(value) >= 2 && length(value) <= 200) ||
              t('organizerProfile.length', { max: 200 }),
          })}
        />
        <TextField
          label={t('organizerProfile.phone')}
          hint="+7 701 123 45 67"
          type="tel"
          autoComplete="tel"
          readOnly={busy || !approved}
          required
          error={errors.contact_phone?.message}
          {...form.register('contact_phone', {
            validate: (value) =>
              /^\+7\d{10}$/.test(normalizePhone(value)) || t('organizerProfile.invalidPhone'),
          })}
        />
        <FormFeedback saved={form.saved} error={errors.root?.server?.message} />
        <Button type="submit" disabled={busy || !approved} loading={isSubmitting}>
          {t(verifiedAt ? 'organizerProfile.updateIdentity' : 'organizerProfile.verify')}
        </Button>
      </form>
    </ProfileSection>
  )
}

function PayoutForm({ profile, busy, run, actions }: ProfileData) {
  const { t } = useTranslation()
  const approved = profile.status === 'approved'
  const account = profile.payout_account
  const [editing, setEditing] = useState(false)
  const valuesOf = (profile: OrganizerProfileResponse): PayoutAccountRequest => ({
    holder_name: profile.payout_account?.holder_name ?? '',
    bank_name: profile.payout_account?.bank_name ?? '',
    iban: '',
  })
  const form = useProfileForm(
    valuesOf(profile),
    (values) =>
      run(() =>
        actions.setPayoutAccount({
          holder_name: values.holder_name.trim(),
          bank_name: values.bank_name.trim(),
          iban: normalizeIban(values.iban),
        }),
      ),
    (profile) => {
      setEditing(false)
      return valuesOf(profile)
    },
  )
  const { errors, isSubmitting } = form.formState
  const showForm = approved && (!account || editing)

  return (
    <ProfileSection id="payout" title={t('organizerProfile.payout')}>
      {account && (
        <dl className="space-y-2 wrap-anywhere">
          <div>
            <dt className="type-small text-ink-2">{t('organizerProfile.holder')}</dt>
            <dd>{account.holder_name}</dd>
          </div>
          <div>
            <dt className="type-small text-ink-2">{t('organizerProfile.bank')}</dt>
            <dd>{account.bank_name}</dd>
          </div>
          <div>
            <dt className="type-small text-ink-2">IBAN</dt>
            <dd className="font-mono">…{account.iban_last4}</dd>
          </div>
        </dl>
      )}
      {account && approved && !editing && (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            form.reset(valuesOf(profile))
            setEditing(true)
          }}
        >
          {t('organizerProfile.replaceAccount')}
        </Button>
      )}
      {showForm && (
        <form noValidate onSubmit={form.submit} className="space-y-4">
          <TextField
            label={t('organizerProfile.holder')}
            autoComplete="off"
            readOnly={busy}
            required
            error={errors.holder_name?.message}
            {...form.register('holder_name', {
              validate: (value) =>
                (length(value) >= 2 && length(value) <= 200) ||
                t('organizerProfile.length', { max: 200 }),
            })}
          />
          <TextField
            label={t('organizerProfile.bank')}
            autoComplete="off"
            readOnly={busy}
            required
            error={errors.bank_name?.message}
            {...form.register('bank_name', {
              validate: (value) =>
                (length(value) >= 2 && length(value) <= 100) ||
                t('organizerProfile.length', { max: 100 }),
            })}
          />
          <TextField
            label="IBAN"
            hint={t('organizerProfile.ibanHint')}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            readOnly={busy}
            required
            error={errors.iban?.message}
            {...form.register('iban', {
              validate: (value) =>
                /^KZ\d{2}[A-Z0-9]{16}$/.test(normalizeIban(value)) ||
                t('organizerProfile.invalidIban'),
            })}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy} loading={isSubmitting}>
              {t('organizerProfile.savePayout')}
            </Button>
            {account && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  form.reset(valuesOf(profile))
                  setEditing(false)
                }}
              >
                {t('common.cancel')}
              </Button>
            )}
          </div>
        </form>
      )}
      <FormFeedback saved={form.saved && !showForm} error={errors.root?.server?.message} />
    </ProfileSection>
  )
}

function ProfileDetails({ profile }: { profile: OrganizerProfileResponse }) {
  const { t } = useTranslation()
  const actions = useOrganizerProfileActions()
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)

  async function run(request: ProfileRequest) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      return await request()
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }

  const props = { profile, busy, run, actions }
  return (
    <>
      {profile.status !== 'approved' && (
        <InlineAlert tone="warn">{t('errors.OrganizerNotApprovedError')}</InlineAlert>
      )}
      <PublicNameForm {...props} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <IdentityForm {...props} />
        <PayoutForm {...props} />
      </div>
    </>
  )
}

export default function OrganizerProfilePage() {
  const { t } = useTranslation()
  const profile = useOrganizerProfile()
  const [params] = useSearchParams()
  const { hash } = useLocation()
  const eventId = parseEventId(params.get('event') ?? undefined)
  const loaded = !!profile.data

  useEffect(() => {
    if (!loaded || (hash !== '#identity' && hash !== '#payout')) return
    const section = document.getElementById(hash.slice(1))
    section?.focus({ preventScroll: true })
    section?.scrollIntoView?.()
  }, [hash, loaded])

  return (
    <OrganizerPage
      routeId="organizer-profile"
      title={t('nav.profile')}
      meta={
        profile.data && <StatusBadge kind="organizerApplication" status={profile.data.status} />
      }
      actions={
        eventId !== null && (
          <Button asChild variant="outline" size="sm">
            <Link to={`/organizer/events/${eventId}#paid-sales`}>
              {t('organizerProfile.backToActivation')}
            </Link>
          </Button>
        )
      }
    >
      {profile.data ? (
        <ProfileDetails profile={profile.data} />
      ) : profile.isError ? (
        <ErrorState
          title={t('organizerProfile.loadError')}
          description={t(errorMessageKey(profile.error))}
          onRetry={() => void profile.refetch()}
          retrying={profile.isFetching}
        />
      ) : (
        <p role="status">{t('common.loading')}</p>
      )}
    </OrganizerPage>
  )
}
