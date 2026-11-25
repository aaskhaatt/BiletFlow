import 'i18next'
import type { ru } from '@/i18n/locales/ru'

// t('...') only accepts keys that exist in the translations.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof ru }
  }
}
