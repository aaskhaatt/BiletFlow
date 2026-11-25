import { describe, expect, it } from 'vitest'
import { csvCell, toCsv } from '@/lib/csv'

describe('csvCell', () => {
  it.each(['=SUM(A1:A9)', '+7 701 123 45 67', '-5', '@user', '\tcmd', '\rcmd'])(
    'puts a quote in front of %j so a spreadsheet keeps it as text',
    (value) => {
      expect(csvCell(value).replace(/^"/, '')).toMatch(/^'/)
    },
  )

  it('leaves ordinary text alone', () => {
    expect(csvCell('Paid 6000 KZT')).toBe('Paid 6000 KZT')
    expect(csvCell('a=b')).toBe('a=b')
    expect(csvCell('')).toBe('')
  })

  it('quotes a cell with a comma, a quote or a line break, and doubles its quotes', () => {
    expect(csvCell('Anna, Bek')).toBe('"Anna, Bek"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
  })

  it('neutralizes and quotes together', () => {
    expect(csvCell('=HYPERLINK("x","y")')).toBe(`"'=HYPERLINK(""x"",""y"")"`)
  })
})

describe('toCsv', () => {
  it('writes a BOM, comma-separated cells and CRLF line ends', () => {
    expect(
      toCsv([
        ['Дата', 'Событие'],
        ['2026-11-15 21:40', 'Тест, 1'],
      ]),
    ).toBe('﻿Дата,Событие\r\n2026-11-15 21:40,"Тест, 1"\r\n')
  })
})

describe('downloadCsv', () => {
  it('hands the file to the browser under the given name and lets go of it', async () => {
    const { downloadCsv } = await import('@/lib/csv')
    const created: Blob[] = []
    const revoked: string[] = []
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      created.push(blob as Blob)
      return 'blob:test'
    }
    URL.revokeObjectURL = (url: string) => void revoked.push(url)
    let download = ''
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      download = this.download
    }

    downloadCsv('history.csv', 'a,b\r\n')

    expect(download).toBe('history.csv')
    expect(created).toHaveLength(1)
    expect(created[0].type).toBe('text/csv;charset=utf-8')
    expect(revoked).toEqual(['blob:test'])
    expect(document.querySelector('a[download]')).toBeNull()
  })
})
