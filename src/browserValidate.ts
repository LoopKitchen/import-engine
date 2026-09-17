import { splitMulti } from './csv'
import type { ErrorIndex, ImportColumn, ImportTemplate, RowError } from './types'

const EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/
const TRUTHY = new Set(['yes', 'y', 'true', '1', 't'])
const FALSY = new Set(['no', 'n', 'false', '0', 'f'])
const DATE_PATTERNS = [/^\d{4}-\d{2}-\d{2}$/, /^\d{1,2}\/\d{1,2}\/\d{4}$/, /^\d{4}\/\d{2}\/\d{2}$/, /^\d{1,2}-\d{1,2}-\d{4}$/]

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === ''
}

function cellError(rowNo: number, column: ImportColumn, code: string, message: string, value: unknown): RowError {
  return { row_no: rowNo, tier: 'cell', code, message, column_key: column.key, observed_value: value }
}

export function validateCell(rowNo: number, column: ImportColumn, raw: unknown): RowError | null {
  if (isBlank(raw)) {
    return column.required ? cellError(rowNo, column, 'required', `'${column.label}' is required.`, raw) : null
  }
  if (column.validated_by !== 'browser') return null
  const text = String(raw).trim()
  const values = column.multi ? splitMulti(text, column) : [text]

  for (const value of values) {
    switch (column.type) {
      case 'email':
        if (!EMAIL.test(value.toLowerCase())) return cellError(rowNo, column, 'bad_type', `'${value}' is not a valid email address.`, raw)
        break
      case 'url':
        if (!/^https?:\/\//i.test(value)) return cellError(rowNo, column, 'bad_type', `'${value}' is not a valid link. Links start with https://`, raw)
        break
      case 'number':
        if (Number.isNaN(Number(value.replace(/,/g, '')))) return cellError(rowNo, column, 'bad_type', `'${value}' is not a number.`, raw)
        break
      case 'currency':
        if (Number.isNaN(Number(value.replace(/[$,]/g, '')))) return cellError(rowNo, column, 'bad_type', `'${value}' is not an amount.`, raw)
        break
      case 'boolean': {
        const lowered = value.toLowerCase()
        if (!TRUTHY.has(lowered) && !FALSY.has(lowered)) return cellError(rowNo, column, 'bad_type', `'${value}' should be yes or no.`, raw)
        break
      }
      case 'date':
        if (!DATE_PATTERNS.some((p) => p.test(value))) return cellError(rowNo, column, 'bad_type', `'${value}' is not a date we recognize. Use YYYY-MM-DD.`, raw)
        break
      case 'enum': {
        const allowed = column.enum_values.map((v) => v.toLowerCase())
        if (!allowed.includes(value.toLowerCase())) {
          return cellError(rowNo, column, 'not_in_enum', `'${value}' is not one of: ${column.enum_values.join(', ')}.`, raw)
        }
        break
      }
      default:
        break
    }
  }
  return null
}

export function validateRowsInBrowser(template: ImportTemplate, rows: Record<string, unknown>[]): RowError[] {
  const errors: RowError[] = []
  rows.forEach((row, i) => {
    for (const column of template.columns) {
      const err = validateCell(i + 1, column, row[column.key])
      if (err) errors.push(err)
    }
  })
  return errors
}

export function indexErrors(errors: RowError[]): ErrorIndex {
  const index: ErrorIndex = {}
  for (const err of errors) {
    const entry = (index[err.row_no] ??= { row: [], cells: {} })
    if (err.column_key) (entry.cells[err.column_key] ??= []).push(err)
    else entry.row.push(err)
  }
  return index
}
