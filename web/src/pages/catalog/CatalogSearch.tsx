import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SearchIcon } from '@/components/icons'
import { Input } from '@/components/ui/input'
import { SEARCH_MAX_LENGTH } from '@/pages/catalog/catalog-search'

type CatalogSearchProps = {
  /** The search in the address. */
  value: string
  onSearch: (q: string) => void
}

/**
 * The catalog's search field. It searches on Enter (the "Search" key on a phone
 * keyboard); emptying the field shows every event again at once.
 */
export default function CatalogSearch({ value, onSearch }: CatalogSearchProps) {
  const { t } = useTranslation()
  const [text, setText] = useState(value)
  const [shownValue, setShownValue] = useState(value)

  // The address changed from outside (Back button, a link): show its search
  if (value !== shownValue) {
    setShownValue(value)
    setText(value)
  }

  return (
    <form
      role="search"
      className="min-[1024px]:w-full min-[1024px]:max-w-[440px] min-[1024px]:basis-[440px]"
      onSubmit={(event) => {
        event.preventDefault()
        onSearch(text.trim())
      }}
    >
      <label htmlFor="catalog-search" className="sr-only">
        {t('catalog.searchLabel')}
      </label>
      <div className="relative">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-muted min-[1024px]:hidden"
        />
        <Input
          id="catalog-search"
          type="search"
          enterKeyHint="search"
          maxLength={SEARCH_MAX_LENGTH}
          placeholder={t('catalog.searchPlaceholder')}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            if (event.target.value === '' && value !== '') onSearch('')
          }}
          className="pl-11 min-[1024px]:h-12 min-[1024px]:pl-3.5"
        />
      </div>
    </form>
  )
}
