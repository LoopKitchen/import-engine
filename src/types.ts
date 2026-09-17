export type ColumnType =
  | 'text'
  | 'email'
  | 'phone'
  | 'number'
  | 'currency'
  | 'date'
  | 'boolean'
  | 'url'
  | 'enum'
  | 'ref'
  | 'ref_list'

export interface OptionSourceRef {
  key: string
  label?: string
}

export interface ImportColumn {
  key: string
  label: string
  type: ColumnType
  required: boolean
  multi: boolean
  delimiter: string | null
  aliases: string[]
  enum_values: string[]
  option_source: OptionSourceRef | null
  parent_column: string | null
  default: unknown
  example: string
  hint: string
  validated_by: 'browser' | 'server'
}

export interface RowRule {
  code: string
  message: string
  columns: string[]
  check: (row: Record<string, unknown>) => boolean
}

export interface ExistenceRule {
  code: string
  column: string
  unless_present: string | null
  source: string
  message?: string
  suggested_fix?: string
  severity?: 'error' | 'warning'
}

export interface ImportTemplate {
  key: string
  label: string
  description: string
  upsert_key: string[]
  delimiter: string
  columns: ImportColumn[]
  sample_rows: Record<string, string>[]
  row_rules: RowRule[]
  existence_rules: ExistenceRule[]
}

export interface RowError {
  row_no: number
  tier: 'cell' | 'row' | 'entity'
  code: string
  message: string
  column_key: string | null
  observed_value?: unknown
  suggested_fix?: string | null
  fix?: { column_key: string; value: string; label?: string } | null
  severity?: 'error' | 'warning'
}

export interface ValidationRow {
  row_no: number
  values: Record<string, unknown>
  valid: boolean
  errors: RowError[]
}

export interface BlockingError {
  code: string
  message: string
  column_key: string | null
  suggested_fix: string | null
}

export interface ValidationReport {
  template_key: string
  can_apply: boolean
  summary: { total: number; valid: number; invalid: number }
  blocking: BlockingError[]
  unknown_headers: string[]
  rows: ValidationRow[]
}

export type OutcomeStatus = 'applied' | 'updated' | 'skipped' | 'failed' | 'invalid'

export interface ApplyOutcome {
  row_no: number
  status: OutcomeStatus
  key: string | null
  error: string | null
  detail: Record<string, unknown>
}

export interface ApplyResponse {
  template_key: string
  summary: { applied: number; updated: number; skipped: number; failed: number }
  outcomes: ApplyOutcome[]
  validation: { total: number; valid: number; invalid: number }
}

export interface ImportEngineConfig {
  getTenant: () => string | null | undefined
  loadOptions: (sourceKey: string) => Promise<unknown>
  templates?: Record<string, ImportTemplate>
  notify?: (message: string, severity: 'error' | 'success' | 'info') => void
}

export type OnImport = (
  rows: ValidationRow[],
  template: ImportTemplate,
) => Promise<ApplyOutcome[]>

export type ErrorIndex = Record<number, { row: RowError[]; cells: Record<string, RowError[]> }>
