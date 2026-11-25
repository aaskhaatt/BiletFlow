import { useTranslation } from 'react-i18next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { changeLanguage } from '@/i18n'
import { isLanguage, LANGUAGE_NAMES, LANGUAGES } from '@/i18n/language'

// The "RU ▾" switcher from the design: a short code on the button, full names in the list.
export default function LanguageSwitcher({ className }: { className?: string }) {
  const { t, i18n } = useTranslation()
  const current = isLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'ru'

  return (
    <Select
      value={current}
      onValueChange={(value) => {
        if (isLanguage(value)) void changeLanguage(value)
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={t('common.language')}
        className={className}
        data-testid="language-switcher"
      >
        <SelectValue>{current.toUpperCase()}</SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="end">
        {LANGUAGES.map((language) => (
          <SelectItem key={language} value={language} lang={language}>
            {LANGUAGE_NAMES[language]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
