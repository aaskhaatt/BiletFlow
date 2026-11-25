import type { Key, ReactNode } from 'react'

export type TableColumn<Row> = {
  id: string
  header: string
  cell: (row: Row) => ReactNode
}

type ResponsiveTableProps<Row> = {
  caption: string
  columns: readonly TableColumn<Row>[]
  rows: readonly Row[]
  rowKey: (row: Row) => Key
}

export default function ResponsiveTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
}: ResponsiveTableProps<Row>) {
  return (
    <table role="table" className="block w-full text-left lg:table" data-slot="responsive-table">
      <caption className="sr-only">{caption}</caption>
      <thead role="rowgroup" className="sr-only lg:not-sr-only lg:table-header-group">
        <tr role="row" className="bg-line-soft">
          {columns.map((column) => (
            <th key={column.id} scope="col" role="columnheader" className="p-3 type-label">
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody role="rowgroup" className="block space-y-3 lg:table-row-group lg:space-y-0">
        {rows.map((row) => (
          <tr
            key={rowKey(row)}
            role="row"
            className="block rounded-md border border-line bg-surface p-3 lg:table-row lg:rounded-none lg:border-x-0 lg:p-0"
          >
            {columns.map((column) => (
              <td
                key={column.id}
                role="cell"
                className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start gap-2 py-1.5 wrap-anywhere lg:table-cell lg:p-3"
              >
                <span aria-hidden="true" className="type-label text-ink-2 lg:hidden">
                  {column.header}
                </span>
                <div className="min-w-0">{column.cell(row)}</div>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
