import { soleCloseMatch } from './closeMatch'
import { mapHeaders, splitMulti } from './csv'
import { isBlank, parseDate, parseFloatLikePython } from './pythonCompat'
import { ResolvedOptions, resolveOptionSources, type OptionSourceContext } from './optionSources'
import { MULTI_DELIMITER } from './templates'
import type { BlockingError, ImportColumn, ImportTemplate, RowError, ValidationReport, ValidationRow } from './types'

const EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/
const TRUTHY = new Set(['yes', 'y', 'true', '1', 't'])
const FALSY = new Set(['no', 'n', 'false', '0', 'f'])

function delimiterFor(column: ImportColumn): string {
  return column.delimiter ?? MULTI_DELIMITER
}

const EXISTENCE_DEFAULT_MESSAGE = 'A record with this value already exists.'
const EXISTENCE_DEFAULT_FIX = 'Add its id to update it, or remove the row.'

function pluralLabel(column: ImportColumn): string {
  const label = column.label.toLowerCase()
  return label.endsWith('s') ? label : `${label}s`
}

function unknownRefMessage(column: ImportColumn, value: string | string[], resolved: ResolvedOptions | null): string {
  const values = Array.isArray(value) ? value : [value]
  const quoted = values.map((v) => `'${v}'`).join(', ')
  const verb = values.length === 1 ? 'is' : 'are'
  if (resolved === null || resolved.isEmpty()) {
    return `We could not check ${quoted} against your ${pluralLabel(column)}.`
  }
  const sample = resolved.sample()
  const examples = sample.join(', ')
  const more = resolved.values.size - sample.length
  const suffix = more > 0 ? ` and ${more} more` : ''
  return `${quoted} ${verb} not among your ${pluralLabel(column)}. Yours include: ${examples}${suffix}.`
}

function closestLegal(column: ImportColumn, part: string, resolved: ResolvedOptions | null): string | null {
  const pool = new Map<string, string>()
  if (column.type === 'enum') {
    for (const value of column.enum_values) pool.set(value.toLowerCase(), value)
  } else if (resolved !== null && !resolved.isEmpty()) {
    for (const [spelling, canonical] of resolved.index) {
      pool.set(spelling, resolved.labels.get(canonical) ?? canonical)
    }
  }
  if (pool.size === 0) return null

  const distinct = new Set(pool.values())
  if (distinct.size === 1) return String([...distinct][0])

  const match = soleCloseMatch(part.trim().toLowerCase(), pool.keys())
  return match === null ? null : String(pool.get(match))
}

function suggestReplacement(
  column: ImportColumn,
  part: string,
  fullText: string,
  resolved: ResolvedOptions | null,
): RowError['fix'] {
  const replacement = closestLegal(column, part, resolved)
  if (replacement === null) return null

  const soleOption = isSoleLegalValue(column, resolved, replacement)
  let value = replacement
  if (column.multi) {
    const parts = fullText.split(delimiterFor(column)).map((p) => p.trim())
    value = parts.map((p) => (p === part.trim() ? replacement : p)).join(delimiterFor(column))
  }
  return {
    column_key: column.key,
    value,
    label: soleOption ? `Use the only option: '${replacement}'` : `Replace with '${replacement}'`,
  }
}

function isSoleLegalValue(column: ImportColumn, resolved: ResolvedOptions | null, replacement: string): boolean {
  if (column.type === 'enum') return column.enum_values.length === 1
  if (resolved === null || resolved.isEmpty()) return false
  return resolved.values.size === 1 && [...resolved.values][0] !== undefined && replacement !== ''
}

interface Coerced {
  value: unknown
  error: RowError | null
}

export function narrow(
  column: ImportColumn,
  options: Map<string, ResolvedOptions>,
  rowValues: Record<string, unknown>,
): ResolvedOptions | null {
  if (!column.option_source) return null
  const resolved = options.get(column.option_source.key) ?? null
  if (resolved === null || !column.parent_column) return resolved

  const parentValue = rowValues[column.parent_column]
  if (parentValue === null || parentValue === undefined) return null

  const narrowed = new ResolvedOptions()
  for (const child of resolved.dependents.get(String(parentValue)) ?? []) {
    narrowed.values.add(child)
    narrowed.labels.set(child, child)
    narrowed.index.set(child.toLowerCase(), child)
  }
  return narrowed
}

function coerce(
  column: ImportColumn,
  value: unknown,
  rowNo: number,
  options: Map<string, ResolvedOptions>,
  rowValues: Record<string, unknown>,
): Coerced {
  const text = String(value).trim()

  const bad = (message: string, code = 'bad_type', fix: RowError['fix'] = null): Coerced => ({
    value: null,
    error: {
      row_no: rowNo,
      tier: code === 'unknown_ref' ? 'entity' : 'cell',
      code,
      column_key: column.key,
      message,
      observed_value: value,
      suggested_fix: null,
      fix,
    },
  })

  switch (column.type) {
    case 'text':
    case 'phone':
      return { value: column.multi ? splitMulti(text, column, MULTI_DELIMITER) : text, error: null }

    case 'email': {
      const lowered = text.toLowerCase()
      if (!EMAIL_RE.test(lowered)) return bad(`'${text}' is not a valid email address.`)
      return { value: lowered, error: null }
    }

    case 'url': {
      const lowered = text.toLowerCase()
      if (!lowered.startsWith('http://') && !lowered.startsWith('https://')) {
        return bad(`'${text}' is not a valid link. Links start with https://`)
      }
      return { value: text, error: null }
    }

    case 'number': {
      const parsed = parseFloatLikePython(text.replace(/,/g, ''))
      if (parsed === null) return bad(`'${text}' is not a number.`)
      return { value: Math.trunc(parsed), error: null }
    }

    case 'currency': {
      const parsed = parseFloatLikePython(text.replace(/\$/g, '').replace(/,/g, '').trim())
      if (parsed === null) return bad(`'${text}' is not an amount.`)
      return { value: parsed, error: null }
    }

    case 'boolean': {
      const lowered = text.toLowerCase()
      if (TRUTHY.has(lowered)) return { value: true, error: null }
      if (FALSY.has(lowered)) return { value: false, error: null }
      return bad(`'${text}' should be yes or no.`)
    }

    case 'date': {
      const parsed = parseDate(text)
      if (parsed === null) return bad(`'${text}' is not a date we recognize. Use YYYY-MM-DD.`)
      return { value: parsed, error: null }
    }

    case 'enum': {
      const allowed = new Map(column.enum_values.map((v) => [v.toLowerCase(), v]))
      const parts = column.multi ? splitMulti(text, column, MULTI_DELIMITER) : [text]
      const canonicals: string[] = []
      for (const part of parts) {
        const canonical = allowed.get(part.toLowerCase())
        if (canonical === undefined) {
          return bad(
            `'${part}' is not one of: ${column.enum_values.join(', ')}.`,
            'not_in_enum',
            suggestReplacement(column, part, text, null),
          )
        }
        canonicals.push(canonical)
      }
      return { value: column.multi ? canonicals : canonicals[0], error: null }
    }

    case 'ref': {
      const resolved = narrow(column, options, rowValues)
      if (resolved === null && column.parent_column) {
        return { value: text, error: null }
      }
      const canonical = resolved ? resolved.canonical(text) : null
      if (canonical === null) {
        return bad(
          unknownRefMessage(column, text, resolved),
          'unknown_ref',
          suggestReplacement(column, text, text, resolved),
        )
      }
      return { value: canonical, error: null }
    }

    case 'ref_list': {
      const resolved = narrow(column, options, rowValues)
      const parts = splitMulti(text, column, MULTI_DELIMITER)
      const canonicals: string[] = []
      const badParts: string[] = []
      for (const part of parts) {
        const canonical = resolved ? resolved.canonical(part) : null
        if (canonical === null) badParts.push(part)
        else canonicals.push(canonical)
      }
      if (badParts.length === 0) return { value: canonicals, error: null }

      const replacements = new Map<string, string | null>()
      for (const part of badParts) replacements.set(part, closestLegal(column, part, resolved))
      const removals = badParts.filter((part) => !replacements.get(part))

      const fixedParts = parts
        .filter((part) => Boolean(replacements.get(part)) || !removals.includes(part))
        .map((part) => replacements.get(part) || part)

      let fix: RowError['fix'] = null
      if (fixedParts.length === 0 && column.required) {
      } else {
        const bits: string[] = []
        const replaced = badParts.filter((part) => replacements.get(part))
        if (replaced.length) {
          bits.push(`replace with ${replaced.map((part) => `'${replacements.get(part)}'`).join(', ')}`)
        }
        if (removals.length) {
          bits.push(`remove ${removals.map((part) => `'${part}'`).join(', ')}`)
        }
        const label = bits.join(' and ')
        fix = {
          column_key: column.key,
          value: fixedParts.join(delimiterFor(column)),
          label: label.slice(0, 1).toUpperCase() + label.slice(1),
        }
      }
      return bad(unknownRefMessage(column, badParts, resolved), 'unknown_ref', fix)
    }

    default:
      return { value: text, error: null }
  }
}

export function templateOptionSourceKeys(template: ImportTemplate): string[] {
  const keys: string[] = []
  for (const column of template.columns) if (column.option_source) keys.push(column.option_source.key)
  for (const rule of template.existence_rules) if (rule.source) keys.push(rule.source)
  return [...new Set(keys)]
}

export function resolveTemplateOptions(
  template: ImportTemplate,
  ctx: OptionSourceContext,
): Promise<Map<string, ResolvedOptions>> {
  return resolveOptionSources(templateOptionSourceKeys(template), ctx)
}

function collectBlocking(template: ImportTemplate, options: Map<string, ResolvedOptions>): BlockingError[] {
  const blocking: BlockingError[] = []
  for (const column of template.columns) {
    const key = column.option_source?.key
    if (!key || column.parent_column) continue
    const resolved = options.get(key)
    if (resolved && !resolved.isEmpty()) continue
    const label = column.option_source?.label ?? key
    blocking.push({
      code: 'empty_option_set',
      column_key: column.key,
      message: `We could not load the list of ${label.toLowerCase()}, so '${column.label}' cannot be checked.`,
      suggested_fix:
        'This is usually a temporary problem on our side. Try again in a minute. ' +
        'If it keeps happening, tell support which import you were running.',
    })
  }
  return blocking
}

function validateCells(
  template: ImportTemplate,
  raw: Record<string, unknown>,
  row: ValidationRow,
  options: Map<string, ResolvedOptions>,
): void {
  for (const column of template.columns) {
    const value = raw[column.key]
    if (isBlank(value)) {
      if (column.required) {
        row.errors.push({
          row_no: row.row_no,
          tier: 'cell',
          code: 'required',
          column_key: column.key,
          message: `'${column.label}' is required.`,
          observed_value: value,
        })
        row.values[column.key] = null
      } else {
        row.values[column.key] = column.default ?? null
      }
      continue
    }
    const { value: coerced, error } = coerce(column, value, row.row_no, options, row.values)
    row.values[column.key] = coerced
    if (error) row.errors.push(error)
  }
}

function validateRowRules(template: ImportTemplate, row: ValidationRow): void {
  for (const rule of template.row_rules) {
    const check = rule.check
    if (typeof check !== 'function') continue
    let ok: boolean
    try {
      ok = check(row.values)
    } catch {
      ok = false
    }
    if (ok) continue
    row.errors.push({
      row_no: row.row_no,
      tier: 'row',
      code: 'row_rule',
      column_key: rule.columns.length ? rule.columns[0] : null,
      message: rule.message,
    })
  }
}

function validateUniqueness(template: ImportTemplate, row: ValidationRow, seen: Map<string, number>): void {
  if (!template.upsert_key.length) return
  const values = template.upsert_key.map((key) => row.values[key] ?? null)
  if (values.some((v) => v === null)) return

  const signature = JSON.stringify(values)
  const first = seen.get(signature)
  if (first === undefined) {
    seen.set(signature, row.row_no)
    return
  }
  row.errors.push({
    row_no: row.row_no,
    tier: 'entity',
    code: 'duplicate_in_file',
    column_key: template.upsert_key[0],
    message: `Row ${first} already uses this ${template.upsert_key.join(', ')}.`,
    observed_value: values.length === 1 ? values[0] : values,
    suggested_fix: 'Remove one of the two rows, or correct whichever one is wrong.',
  })
}

function validateExistence(
  template: ImportTemplate,
  row: ValidationRow,
  options: Map<string, ResolvedOptions>,
): void {
  for (const rule of template.existence_rules) {
    if (rule.unless_present && !isBlank(row.values[rule.unless_present])) continue
    if (!rule.column || !rule.source) continue

    const value = row.values[rule.column]
    if (isBlank(value)) continue
    const resolved = options.get(rule.source)
    if (!resolved || resolved.isEmpty()) continue
    const existing = resolved.canonical(value)
    if (existing === null) continue

    row.errors.push({
      row_no: row.row_no,
      tier: 'entity',
      code: 'already_exists',
      column_key: rule.column,
      message: `${rule.message ?? EXISTENCE_DEFAULT_MESSAGE} It is ${resolved.labels.get(existing) ?? String(value)} (id ${existing}).`,
      observed_value: value,
      severity: rule.severity ?? 'error',
      suggested_fix: rule.severity === 'warning' ? (rule.suggested_fix ?? null) : (rule.suggested_fix ?? EXISTENCE_DEFAULT_FIX),
      fix: rule.unless_present
        ? { column_key: rule.unless_present, value: String(existing), label: `Use id ${existing}` }
        : null,
    })
  }
}

export interface ValidateOptions {
  headers?: string[]
}

export function validateWith(
  template: ImportTemplate,
  rows: Record<string, unknown>[],
  options: Map<string, ResolvedOptions>,
  config: ValidateOptions = {},
): ValidationReport {
  const blocking = collectBlocking(template, options)
  const unknownHeaders = config.headers ? mapHeaders(template, config.headers).unmatched : []
  const seen = new Map<string, number>()
  const results: ValidationRow[] = []

  rows.forEach((raw, index) => {
    const row: ValidationRow = { row_no: index + 1, values: {}, valid: true, errors: [] }
    validateCells(template, raw, row, options)
    validateRowRules(template, row)
    validateUniqueness(template, row, seen)
    validateExistence(template, row, options)
    row.valid = row.errors.every((e) => e.severity === 'warning')
    results.push(row)
  })

  const validCount = results.filter((r) => r.valid).length
  return {
    template_key: template.key,
    can_apply: blocking.length === 0 && validCount > 0,
    summary: { total: results.length, valid: validCount, invalid: results.length - validCount },
    blocking,
    unknown_headers: unknownHeaders,
    rows: results,
  }
}

export async function validate(
  template: ImportTemplate,
  rows: Record<string, unknown>[],
  ctx: OptionSourceContext,
  config: ValidateOptions = {},
): Promise<ValidationReport> {
  const options = await resolveTemplateOptions(template, ctx)
  return validateWith(template, rows, options, config)
}
