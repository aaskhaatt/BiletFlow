import { useTranslation } from 'react-i18next'

export default function SkipLink() {
  const { t } = useTranslation()

  return (
    <a
      href="#main-content"
      onClick={(event) => {
        const main = document.getElementById('main-content')
        if (!main) return
        event.preventDefault()
        main.focus()
      }}
      className="sr-only z-[100] rounded-sm bg-surface p-3 text-brand focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >
      {t('nav.skip')}
    </a>
  )
}
