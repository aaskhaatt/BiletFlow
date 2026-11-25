import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import {
  FALLBACK_LANGUAGE,
  pickInitialLanguage,
  saveLanguage,
  type Language,
} from '@/i18n/language'
import { en } from '@/i18n/locales/en'
import { kk } from '@/i18n/locales/kk'
import { ru } from '@/i18n/locales/ru'

// Imported once, before the app renders (main.tsx). Components use useTranslation().

function setDocumentLanguage(language: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = language
}

i18n.on('languageChanged', setDocumentLanguage)

void i18n.use(initReactI18next).init({
  resources: {
    kk: { translation: kk },
    ru: { translation: ru },
    en: { translation: en },
  },
  lng: pickInitialLanguage(),
  fallbackLng: FALLBACK_LANGUAGE,
  interpolation: { escapeValue: false }, // React already escapes
})

setDocumentLanguage(i18n.language)

/** Switches the interface language and remembers the choice on this device. */
export function changeLanguage(language: Language) {
  saveLanguage(language)
  return i18n.changeLanguage(language)
}

export default i18n
