import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import CheckboxField from '@/components/CheckboxField'
import DateTimeField from '@/components/DateTimeField'
import RadioCards from '@/components/RadioCards'
import SelectField from '@/components/SelectField'
import TextareaField from '@/components/TextareaField'

function ApiValue({ value, testId }: { value: string | null; testId: string }) {
  const { t } = useTranslation()
  return (
    <p className="type-small text-ink-2">
      {t('dev.controls.sentToApi')}{' '}
      <code className="break-all text-ink" data-testid={testId}>
        {value ?? t('dev.controls.empty')}
      </code>
    </p>
  )
}

// W2.4: select, textarea, date and time, checkbox and radio cards.
export default function ControlsSection() {
  const { t } = useTranslation()
  // '' shows the placeholder; undefined would make the select uncontrolled
  const [category, setCategory] = useState('')
  // 14:00 UTC is 19:00 in Astana: the field shows 19:00 in any browser time zone
  const [start, setStart] = useState<string | null>('2026-10-24T14:00:00Z')
  const [end, setEnd] = useState<string | null>('2026-10-24T22:00:00+05:00')
  const [agreed, setAgreed] = useState(false)
  const [access, setAccess] = useState('public')

  const categories = [
    { value: 'concert', label: t('dev.controls.concert') },
    { value: 'lecture', label: t('dev.controls.lecture') },
    { value: 'sport', label: t('dev.controls.sport') },
  ]
  const endTooEarly = start !== null && end !== null && Date.parse(end) <= Date.parse(start)

  return (
    <section className="space-y-8" data-testid="controls">
      <h2 className="type-card-title">Form controls</h2>

      <div className="grid gap-6 sm:grid-cols-2">
        <SelectField
          label={t('dev.controls.category')}
          placeholder={t('dev.controls.categoryPlaceholder')}
          options={categories}
          value={category}
          onValueChange={setCategory}
        />
        <SelectField
          label={t('dev.controls.category')}
          placeholder={t('dev.controls.categoryPlaceholder')}
          options={categories}
          error={t('dev.controls.categoryRequired')}
        />
        <SelectField
          label={t('dev.controls.category')}
          options={categories}
          defaultValue="lecture"
          disabled
        />
      </div>

      <TextareaField
        label={t('dev.controls.description')}
        placeholder={t('dev.controls.descriptionPlaceholder')}
        hint={t('dev.controls.descriptionHint')}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <DateTimeField label={t('dev.controls.start')} value={start} onChange={setStart} />
          <ApiValue value={start} testId="start-api-value" />
        </div>
        <div className="space-y-2">
          <DateTimeField
            label={t('dev.controls.end')}
            value={end}
            onChange={setEnd}
            min={start ?? undefined}
            error={endTooEarly ? t('dev.controls.endBeforeStart') : undefined}
          />
          <ApiValue value={end} testId="end-api-value" />
        </div>
      </div>

      <div className="grid max-w-md gap-4">
        <CheckboxField
          label={t('dev.controls.terms')}
          checked={agreed}
          onCheckedChange={(checked) => setAgreed(checked === true)}
        />
        <CheckboxField label={t('dev.controls.terms')} error={t('dev.controls.termsRequired')} />
        <CheckboxField label={t('dev.controls.terms')} defaultChecked disabled />
      </div>

      <RadioCards
        className="max-w-2xl"
        label={t('dev.controls.access')}
        value={access}
        onValueChange={setAccess}
        options={[
          {
            value: 'public',
            title: t('dev.controls.accessPublic'),
            description: t('dev.controls.accessPublicText'),
          },
          {
            value: 'seated',
            title: t('dev.controls.accessSeated'),
            description: t('dev.controls.accessSeatedText'),
          },
          {
            value: 'unlisted',
            title: t('dev.controls.accessLink'),
            description: t('dev.controls.accessLinkText'),
          },
        ]}
      />
    </section>
  )
}
