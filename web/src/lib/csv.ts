// CSV files written in the browser (the event history export).
//
// A spreadsheet runs a cell that starts with = + - or @ as a formula, so such a
// cell gets a ' in front: whatever a buyer or a venue typed stays text. The file is
// UTF-8 with a BOM, so Excel reads Cyrillic and Kazakh letters.

const FORMULA_START = /^[=+\-@\t\r]/

/** One cell: neutralized if it looks like a formula, quoted if it has a comma, a quote or a line break. */
export function csvCell(value: string): string {
  const text = FORMULA_START.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** Rows of cells as the text of a CSV file (CRLF line ends, BOM first). */
export function toCsv(rows: string[][]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

/** Hands the text to the user as a file download. */
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
