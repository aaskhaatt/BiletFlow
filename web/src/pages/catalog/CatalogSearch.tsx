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
          className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-muted"
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
          className="pl-11"
        />
      </div>
    </form>
  )
}
