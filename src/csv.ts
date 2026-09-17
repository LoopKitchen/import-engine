import type { ImportColumn, ImportTemplate, ValidationRow } from './types'

export interface ParsedTable {
  headers: string[]
  rows: string[][]
  delimiter: ',' | '\t' | ';'
}

export function parseDelimited(text: string): ParsedTable {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = pickDelimiter(firstLine)

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      quoted = true
    } else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }
  if (cell.length || row.length) {
    row.push(cell)
    rows.push(row)
  }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''))
  const headers = (nonEmpty.shift() ?? []).map((h) => h.trim())
  return { headers, rows: nonEmpty, delimiter }
}

function pickDelimiter(line: string): ',' | '\t' | ';' {
  const count = (d: string) => line.split(d).length - 1
  const tabs = count('\t')
  const semis = count(';')
  const commas = count(',')
  if (tabs > commas && tabs >= semis) return '\t'
  if (semis > commas && semis > tabs) return ';'
  return ','
}

export function mapHeaders(template: Pick<ImportTemplate, 'columns'>, headers: string[]): { mapping: Record<string, string>; unmatched: string[] } {
  const mapping: Record<string, string> = {}
  const unmatched: string[] = []
  for (const header of headers) {
    const needle = header.trim().toLowerCase()
    if (!needle) continue
    const column =
      template.columns.find((c) => c.key.toLowerCase() === needle) ??
      template.columns.find((c) => c.aliases.some((a) => a.toLowerCase() === needle))
    if (column) mapping[header] = column.key
    else unmatched.push(header)
  }
  return { mapping, unmatched }
}

export function toRecords(template: ImportTemplate, table: ParsedTable, mapping: Record<string, string>): Record<string, string>[] {
  const indexByKey: Record<string, number> = {}
  table.headers.forEach((h, i) => {
    const key = mapping[h]
    if (key && indexByKey[key] === undefined) indexByKey[key] = i
  })
  return table.rows.map((cells) => {
    const record: Record<string, string> = {}
    for (const column of template.columns) {
      const idx = indexByKey[column.key]
      let value = idx === undefined ? '' : (cells[idx] ?? '').trim()
      if (/^'[=+\-@\d]/.test(value)) value = value.slice(1)
      record[column.key] = value
    }
    return record
  })
}

const FORMULA_PREFIX = /^[=+\-@\t\r]/

export function escapeCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (FORMULA_PREFIX.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines = [headers.map(escapeCell).join(',')]
  for (const row of rows) lines.push(headers.map((h) => escapeCell(row[h])).join(','))
  return lines.join('\n')
}

export function sampleCsv(template: ImportTemplate): string {
  const headers = template.columns.map((c) => c.key)
  const rows = template.sample_rows.length ? template.sample_rows : [Object.fromEntries(template.columns.map((c) => [c.key, c.example]))]
  return toCsv(headers, rows)
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function splitMulti(value: string, column: ImportColumn, fallback = '|'): string[] {
  const delimiter = column.delimiter ?? fallback
  return value
    .split(delimiter)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function contentKey(templateKey: string, rows: Record<string, unknown>[]): string {
  const text = templateKey + JSON.stringify(rows)
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${templateKey}-${hash.toString(16)}-${rows.length}`
}

export function rowValues<T = Record<string, unknown>>(rows: ValidationRow[]): T[] {
  return rows.map((r) => r.values as T)
}
