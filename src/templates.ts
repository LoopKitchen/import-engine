import type { ColumnType, ExistenceRule, ImportColumn, ImportTemplate, RowRule } from './types'

export const MULTI_DELIMITER = '|'

const STATIC_TYPES = new Set<ColumnType>(['text', 'email', 'phone', 'number', 'currency', 'date', 'boolean', 'url', 'enum'])

export interface ImportColumnSpec {
  key: string
  type: ColumnType
  label?: string
  required?: boolean
  multi?: boolean
  headerAliases?: string[]
  list?: string
  listLabel?: string
  parent?: string
  choices?: string[]
  default?: unknown
  example?: string
  hint?: string
}

export interface ImportRuleSpec {
  code: string
  message: string
  columns: string[]
  check: (row: Record<string, unknown>) => boolean
}

export interface ImportExistenceRuleSpec {
  code: string
  column: string
  list: string
  unlessPresent?: string
  message?: string
  suggestedFix?: string
  severity?: 'error' | 'warning'
}

export interface ImportTemplateSpec {
  key: string
  label: string
  description?: string
  upsertKey: string[]
  columns: Array<ImportColumnSpec | ImportColumn>
  sampleRows?: Record<string, string>[]
  rules?: ImportRuleSpec[]
  existenceRules?: ImportExistenceRuleSpec[]
}

export interface ImportTemplateChanges {
  key: string
  label: string
  description?: string
  upsertKey?: string[]
  removeColumns?: string[]
  addColumns?: ImportColumnSpec[]
  updateColumns?: Record<string, Partial<Omit<ImportColumnSpec, 'key'>>>
  sampleRows?: Record<string, string>[]
  rules?: ImportRuleSpec[]
  existenceRules?: ImportExistenceRuleSpec[]
}

export function defineImportColumn(spec: ImportColumnSpec): ImportColumn {
  const multi = spec.multi ?? false
  return {
    key: spec.key,
    label: spec.label || spec.key,
    type: spec.type,
    required: spec.required ?? false,
    multi,
    delimiter: multi ? MULTI_DELIMITER : null,
    aliases: spec.headerAliases ?? [],
    enum_values: spec.choices ?? [],
    option_source: spec.list ? { key: spec.list, label: spec.listLabel } : null,
    parent_column: spec.parent ?? null,
    default: spec.default ?? null,
    example: spec.example ?? '',
    hint: spec.hint ?? '',
    validated_by: STATIC_TYPES.has(spec.type) ? 'browser' : 'server',
  }
}

function isDefinedColumn(column: ImportColumnSpec | ImportColumn): column is ImportColumn {
  return 'validated_by' in column
}

function columnToSpec(column: ImportColumn): ImportColumnSpec {
  return {
    key: column.key,
    type: column.type,
    label: column.label,
    required: column.required,
    multi: column.multi,
    headerAliases: column.aliases,
    list: column.option_source?.key,
    listLabel: column.option_source?.label,
    parent: column.parent_column ?? undefined,
    choices: column.enum_values,
    default: column.default,
    example: column.example,
    hint: column.hint,
  }
}

function toExistenceRule(rule: ImportExistenceRuleSpec): ExistenceRule {
  return {
    code: rule.code,
    column: rule.column,
    unless_present: rule.unlessPresent ?? null,
    source: rule.list,
    message: rule.message,
    suggested_fix: rule.suggestedFix,
    severity: rule.severity,
  }
}

function toExistenceSpec(rule: ExistenceRule): ImportExistenceRuleSpec {
  return {
    code: rule.code,
    column: rule.column,
    list: rule.source,
    unlessPresent: rule.unless_present ?? undefined,
    message: rule.message,
    suggestedFix: rule.suggested_fix,
    severity: rule.severity,
  }
}

function assertTemplate(template: ImportTemplate): ImportTemplate {
  const keys = template.columns.map((c) => c.key)
  const duplicate = keys.find((key, i) => keys.indexOf(key) !== i)
  if (duplicate) throw new Error(`import template '${template.key}' has two '${duplicate}' columns`)
  for (const key of template.upsert_key) {
    if (!keys.includes(key)) throw new Error(`import template '${template.key}' identifies rows by '${key}', which is not a column`)
  }
  return template
}

export function defineImportTemplate(spec: ImportTemplateSpec): ImportTemplate {
  return assertTemplate({
    key: spec.key,
    label: spec.label,
    description: spec.description ?? '',
    upsert_key: spec.upsertKey,
    delimiter: MULTI_DELIMITER,
    columns: spec.columns.map((column) => (isDefinedColumn(column) ? column : defineImportColumn(column))),
    sample_rows: spec.sampleRows ?? [],
    row_rules: (spec.rules ?? []).map((rule): RowRule => ({ ...rule, columns: [...rule.columns] })),
    existence_rules: (spec.existenceRules ?? []).map(toExistenceRule),
  })
}

export function extendImportTemplate(base: ImportTemplate, changes: ImportTemplateChanges): ImportTemplate {
  const removed = new Set(changes.removeColumns ?? [])
  const updates = changes.updateColumns ?? {}
  for (const key of [...removed, ...Object.keys(updates)]) {
    if (!base.columns.some((c) => c.key === key)) throw new Error(`import template '${base.key}' has no '${key}' column`)
  }

  const kept = base.columns
    .filter((column) => !removed.has(column.key))
    .map((column) => (updates[column.key] ? defineImportColumn({ ...columnToSpec(column), ...updates[column.key], key: column.key }) : column))
  const added = (changes.addColumns ?? []).map(defineImportColumn)
  const columns = [...kept, ...added]
  const present = new Set(columns.map((c) => c.key))

  const sampleRows =
    changes.sampleRows ??
    base.sample_rows.map((row) => Object.fromEntries(columns.map((c) => [c.key, present.has(c.key) && c.key in row ? row[c.key] : c.example])))

  const rules = changes.rules ?? base.row_rules.filter((rule) => rule.columns.every((key) => present.has(key)))
  const existenceRules =
    changes.existenceRules ??
    base.existence_rules
      .filter((rule) => present.has(rule.column) && (!rule.unless_present || present.has(rule.unless_present)))
      .map(toExistenceSpec)

  return defineImportTemplate({
    key: changes.key,
    label: changes.label,
    description: changes.description ?? base.description,
    upsertKey: changes.upsertKey ?? base.upsert_key,
    columns,
    sampleRows,
    rules,
    existenceRules,
  })
}

export const STARTER_TEMPLATE = defineImportTemplate({
  key: 'contacts',
  label: 'Contacts',
  description: 'Add contacts, or update the ones you already have by email.',
  upsertKey: ['email'],
  columns: [
    { key: 'name', type: 'text', label: 'Name', required: true, example: 'Alex Morgan' },
    { key: 'email', type: 'email', label: 'Email', required: true, example: 'alex@example.com' },
  ],
  sampleRows: [{ name: 'Alex Morgan', email: 'alex@example.com' }],
})

export function getTemplate(key: string, registry?: Record<string, ImportTemplate>): ImportTemplate {
  if (registry && Object.prototype.hasOwnProperty.call(registry, key)) return registry[key]
  throw new Error(`unknown import template '${key}'`)
}
