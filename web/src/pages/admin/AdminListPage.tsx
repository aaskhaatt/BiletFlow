import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { errorMessageKey } from '@/api/error-codes'
import {
  adminListUrl,
  useAdminList,
  type AdminListName,
  type AdminListRows,
} from '@/api/hooks/admin'
import { apiCsv } from '@/api/http'
import DemoBanner from '@/components/DemoBanner'
import InlineAlert from '@/components/InlineAlert'
import type { TableColumn } from '@/components/ResponsiveTable'
import SelectField, { type SelectOption } from '@/components/SelectField'
import TextField from '@/components/TextField'
import { Button } from '@/components/ui/button'
import { downloadCsvBlob } from '@/lib/csv'
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
  AdminPage,
  AdminPagination,
  AdminTable,
} from './AdminPage'

const PAGE_SIZE = 50
const SEARCH_DELAY = 350
const ALL = 'all'

export type AdminFilter =
  | { name: 'status' | 'suspended' | 'purpose' | 'active'; label: string; options: SelectOption[] }
  | { name: 'event_id'; label: string }

function positiveInteger(value: string) {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0
}

function filteredParams(params: URLSearchParams, filters: readonly AdminFilter[]) {
  const result = new URLSearchParams()
  const q = params.get('q')?.trim()
  if (q) result.set('q', q)
  for (const filter of filters) {
    const value = params.get(filter.name)
    if (
      value &&
      ('options' in filter
        ? filter.options.some((option) => option.value === value)
        : positiveInteger(value))
    ) {
      result.set(filter.name, value)
    }
  }
  return result
}

export default function AdminListPage<Name extends AdminListName>({
  list,
  columns,
  filters,
  searchLabel,
  rowKey,
  showTime,
  demo,
  children,
}: {
  list: Name
  columns: TableColumn<AdminListRows[Name]>[]
  filters: readonly AdminFilter[]
  searchLabel: string
  rowKey: (row: AdminListRows[Name]) => number
  showTime?: boolean
  /** The list shows money (orders, payments, refunds, campaigns): say that it is a demonstration. */
  demo?: boolean
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [draft, setDraft] = useState({ q, text: q })
  if (draft.q !== q) setDraft({ q, text: q })
  const search = draft.q === q ? draft.text : q
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<unknown>()
  const rawPage = Number(params.get('page'))
  const page =
    Number.isSafeInteger(rawPage) && rawPage > 0 && Number.isSafeInteger((rawPage - 1) * PAGE_SIZE)
      ? rawPage
      : 1

  useEffect(() => {
    const trimmed = search.trim()
    if (draft.q !== q || trimmed === q) return
    const timer = window.setTimeout(() => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (trimmed) next.set('q', trimmed)
          else next.delete('q')
          next.delete('page')
          return next
        },
        { replace: true },
      )
    }, SEARCH_DELAY)
    return () => window.clearTimeout(timer)
  }, [draft.q, q, search, setParams])

  const exportParams = filteredParams(params, filters)
  const pagedParams = new URLSearchParams(exportParams)
  pagedParams.set('limit', String(PAGE_SIZE))
  pagedParams.set('offset', String((page - 1) * PAGE_SIZE))
  const query = useAdminList(list, pagedParams)
  const lastPage = query.data ? Math.max(1, Math.ceil(query.data.total / PAGE_SIZE)) : undefined

  useEffect(() => {
    if (lastPage !== undefined && page > lastPage) {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (lastPage === 1) next.delete('page')
          else next.set('page', String(lastPage))
          return next
        },
        { replace: true },
      )
    }
  }, [lastPage, page, setParams])

  function changeFilter(name: AdminFilter['name'], value: string, replace = false) {
    const next = new URLSearchParams(params)
    if (value && value !== ALL) next.set(name, value)
    else next.delete(name)
    next.delete('page')
    setParams(next, { replace })
  }

  async function exportCsv() {
    setExportError(undefined)
    setExporting(true)
    try {
      const csv = await apiCsv(adminListUrl(list, exportParams))
      downloadCsvBlob(`${list}.csv`, csv)
    } catch (error) {
      setExportError(error)
    } finally {
      setExporting(false)
    }
  }

  const title = t(`adminZone.lists.${list}` as `adminZone.lists.${AdminListName}`)
  return (
    <AdminPage
      id={list}
      title={title}
      actions={
        <Button
          type="button"
          variant="outline"
          loading={exporting}
          disabled={query.isError || !query.data || search.trim() !== q}
          onClick={() => void exportCsv()}
        >
          {t('adminZone.exportCsv')}
        </Button>
      }
    >
      {exportError !== undefined && (
        <InlineAlert tone="danger" role="alert">
          {t(errorMessageKey(exportError))}
        </InlineAlert>
      )}
      {demo && <DemoBanner />}
      <section
        aria-label={title}
        className="overflow-hidden rounded-lg border border-line bg-surface"
      >
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <TextField
            type="search"
            label={t('adminZone.search')}
            placeholder={searchLabel}
            fieldClassName="w-full sm:w-72"
            value={search}
            onChange={(event) => setDraft({ q, text: event.target.value })}
          />
          {filters.map((filter) =>
            'options' in filter ? (
              <SelectField
                key={filter.name}
                label={filter.label}
                className="w-full sm:w-44"
                options={[{ value: ALL, label: t('adminZone.all') }, ...filter.options]}
                value={exportParams.get(filter.name) ?? ALL}
                onValueChange={(value) => changeFilter(filter.name, value)}
              />
            ) : (
              <TextField
                key={filter.name}
                label={filter.label}
                inputMode="numeric"
                fieldClassName="w-full sm:w-36"
                value={params.get(filter.name) ?? ''}
                error={
                  params.get(filter.name) && !exportParams.has(filter.name)
                    ? t('adminZone.invalidId')
                    : undefined
                }
                onChange={(event) => changeFilter(filter.name, event.target.value, true)}
              />
            ),
          )}
        </div>
        {query.isError ? (
          <div className="p-4">
            <AdminError
              error={query.error}
              retry={() => void query.refetch()}
              retrying={query.isFetching}
            />
          </div>
        ) : !query.data ? (
          <AdminLoading />
        ) : query.data.items.length === 0 ? (
          <AdminEmpty filtered={exportParams.size > 0} />
        ) : (
          <AdminTable caption={title} columns={columns} rows={query.data.items} rowKey={rowKey} />
        )}
        {query.data && query.data.total > 0 && (
          <AdminPagination
            page={page}
            pageSize={PAGE_SIZE}
            total={query.data.total}
            onChange={(value) => {
              const next = new URLSearchParams(params)
              if (value === 1) next.delete('page')
              else next.set('page', String(value))
              setParams(next)
            }}
          />
        )}
      </section>
      {showTime && <p className="type-small text-ink-muted">{t('time.astanaZone')}</p>}
      {children}
    </AdminPage>
  )
}
