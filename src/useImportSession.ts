import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { validateRowsInBrowser } from './browserValidate'
import { mapHeaders, parseDelimited, toRecords } from './csv'
import { describeError } from './describeError'
import type { OptionSourceContext, ResolvedOptions } from './optionSources'
import type {
  ApplyOutcome,
  ApplyResponse,
  ImportTemplate,
  RowError,
  ValidationRow,
} from './types'
import { resolveTemplateOptions, templateOptionSourceKeys, validateWith } from './validate'

export type Phase = 'upload' | 'review' | 'confirm' | 'importing' | 'result' | 'done'
export type CheckState = 'idle' | 'running' | 'done'
export type GridFilter = 'all' | 'problem' | 'new' | 'update' | 'unchecked'

export interface DraftRow {
  key: string
  n: number
  values: Record<string, string>
  problems: Record<string, RowError>
  warnings: Record<string, RowError>
  checked: boolean
  rowProblem?: string | null
}

export interface RowFailure {
  rowKey: string
  n: number
  label: string
  reason: string
  edited: boolean
  skipped: boolean
}

const PAGE = 40

export const GRID_RENDER_CAP = 500
let seq = 0
const nextKey = () => `r${(seq += 1)}`

const isBlank = (v: string | undefined) => !v || !v.trim()

export function upsertIsAChoice(template: ImportTemplate): boolean {
  const keys = template.upsert_key.map((k) => template.columns.find((c) => c.key === k)).filter(Boolean)
  return keys.length > 0 && keys.every((c) => !c!.required)
}

export function rowIsUpdate(template: ImportTemplate, row: DraftRow): boolean {
  if (!upsertIsAChoice(template)) return true
  return template.upsert_key.every((k) => !isBlank(row.values[k]))
}

export const rowHasProblem = (r: DraftRow) => Object.keys(r.problems).length > 0 || !!r.rowProblem

function blankRow(template: ImportTemplate, n: number): DraftRow {
  return {
    key: nextKey(),
    n,
    values: Object.fromEntries(template.columns.map((c) => [c.key, ''])),
    problems: {},
    warnings: {},
    rowProblem: null,
    checked: false,
  }
}

function partition(errors: RowError[]) {
  const problems: Record<string, RowError> = {}
  const warnings: Record<string, RowError> = {}
  for (const e of errors) {
    const field = e.column_key ?? '__row__'
    const bucket = e.severity === 'warning' ? warnings : problems
    if (!bucket[field]) bucket[field] = e
  }
  return { problems, warnings }
}

interface Options {
  template: ImportTemplate
  optionCtx: OptionSourceContext
  apply: (rows: ValidationRow[]) => Promise<ApplyOutcome[]>
  onClose: () => void
  notify?: (message: string, severity: 'error' | 'success' | 'info') => void
  onImported?: (response: ApplyResponse) => void
}

export function useImportSession({ template, optionCtx, apply, onClose, onImported, notify }: Options) {
  const [phase, setPhase] = useState<Phase>('upload')
  const [check, setCheck] = useState<CheckState>('idle')
  const [checkPct, setCheckPct] = useState(0)
  const [rows, setRows] = useState<DraftRow[]>([])
  const rowsRef = useRef<DraftRow[]>([])
  rowsRef.current = rows
  const checkTicket = useRef(0)
  const [fileName, setFileName] = useState('')
  const [unknownColumns, setUnknownColumns] = useState<string[]>([])
  const [filter, setFilter] = useState<GridFilter>('all')
  const [shown, setShown] = useState(PAGE)
  const [progress, setProgress] = useState(0)
  const [failures, setFailures] = useState<RowFailure[]>([])
  const [skippedKeys, setSkippedKeys] = useState<Set<string>>(new Set())
  const [unattributed, setUnattributed] = useState(false)
  const [committed, setCommitted] = useState({ created: 0, updated: 0 })
  const [error, setError] = useState<string | null>(null)

  const optionsRef = useRef<Map<string, ResolvedOptions> | null>(null)
  const [options, setOptions] = useState<Map<string, ResolvedOptions> | null>(null)
  const [optionsLoading, setOptionsLoading] = useState(false)
  const optionsPromise = useRef<Promise<Map<string, ResolvedOptions>> | null>(null)

  const optionCtxRef = useRef(optionCtx)
  optionCtxRef.current = optionCtx

  const loadOptions = useCallback(
    (force = false): Promise<Map<string, ResolvedOptions>> => {
      if (!force && optionsPromise.current) return optionsPromise.current
      setOptionsLoading(true)
      const p = resolveTemplateOptions(template, optionCtxRef.current)
        .then((resolved) => {
          optionsRef.current = resolved
          setOptions(resolved)
          return resolved
        })
        .finally(() => setOptionsLoading(false))
      optionsPromise.current = p
      p.catch(() => undefined)
      return p
    },
    [template],
  )

  useEffect(() => {
    optionsPromise.current = null
    optionsRef.current = null
    setOptions(null)
    if (!templateOptionSourceKeys(template).length) return
    void loadOptions()
  }, [loadOptions, optionCtx.tenant, template])

  const loadText = useCallback(
    (text: string, name = 'pasted rows') => {
      const table = parseDelimited(text)
      if (!table.rows.length) {
        setError('That file has no rows in it.')
        return
      }
      const { mapping, unmatched } = mapHeaders(template, table.headers)
      const missing = template.columns.filter((c) => c.required && !Object.values(mapping).includes(c.key))
      if (missing.length) {
        if (!Object.keys(mapping).length) {
          setError(`This does not look like a ${template.label} file: none of its columns match the template. Check the file and drop it again.`)
        } else {
          const labels = missing.map((c) => `'${c.label}'`).join(' and ')
          setError(`Your file is missing ${labels}. Add the column and drop it again.`)
        }
        return
      }
      const records = toRecords(template, table, mapping)
      setError(null)
      setFileName(name)
      setUnknownColumns(unmatched)
      setRows(
        records.map((values, i) => ({ key: nextKey(), n: i + 1, values, problems: {}, warnings: {}, rowProblem: null, checked: false })),
      )
      setFilter('all')
      setShown(PAGE)
      setCheck('idle')
      setCheckPct(0)
      setFailures([])
      setPhase('review')
      autoCheck.current = true
    },
    [template],
  )

  const autoCheck = useRef(false)

  const loadFile = useCallback(
    async (file: File) => {
      loadText(await file.text(), file.name)
    },
    [loadText],
  )

  const recheck = useCallback(
    (draft: DraftRow[]): DraftRow[] => {
      const options = optionsRef.current
      if (!options) {
        const found = validateRowsInBrowser(template, draft.map((r) => r.values))
        return draft.map((r, i) => ({ ...r, ...partition(found.filter((e) => e.row_no === i + 1)), checked: true }))
      }
      const report = validateWith(template, draft.map((r) => r.values), options)
      return draft.map((r, i) => ({ ...r, ...partition(report.rows[i]?.errors ?? []), checked: true }))
    },
    [template],
  )

  const runCheck = useCallback(async (refetch = true) => {
    const ticket = ++checkTicket.current
    setCheck('running')
    setCheckPct(6)
    const tick = window.setInterval(() => setCheckPct((p) => Math.min(92, p + 8)), 110)
    try {
      optionsRef.current = await loadOptions(refetch)
      window.clearInterval(tick)
      if (ticket !== checkTicket.current) return
      setCheckPct(100)
      const checked = recheck(rowsRef.current)
      setRows(checked)
      setError(null)
      window.setTimeout(() => {
        if (ticket === checkTicket.current) setCheck('done')
      }, 280)
    } catch (e: unknown) {
      window.clearInterval(tick)
      if (ticket !== checkTicket.current) return
      setCheck('idle')
      setCheckPct(0)
      setError(`Could not finish the check: ${describeError(e, 'the account lists could not be loaded')}. Nothing has been changed.`)
    }
  }, [loadOptions, recheck])

  useEffect(() => {
    if (!autoCheck.current || !rows.length) return
    autoCheck.current = false
    void runCheck(false)
  }, [rows, runCheck])

  const setCell = useCallback((rowKey: string, field: string, value: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.key === rowKey
          ? { ...r, values: { ...r.values, [field]: value }, problems: {}, warnings: {}, rowProblem: null, checked: false }
          : r,
      ),
    )
  }, [])

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, blankRow(template, prev.length + 1)])
    setFilter('all')
    setShown((s) => s + 1)
  }, [template])

  const deleteRow = useCallback((rowKey: string) => {
    setRows((prev) => prev.filter((r) => r.key !== rowKey).map((r, i) => ({ ...r, n: i + 1 })))
  }, [])

  const commit = useCallback(
    async (subset?: DraftRow[]) => {
      const batch = subset ?? rows
      if (!batch.length) return
      setPhase('importing')
      setProgress(4)
      const tick = window.setInterval(() => setProgress((p) => Math.min(94, p + 6)), 120)
      try {
        const options = optionsRef.current ?? (await loadOptions())
        const coerced = validateWith(template, batch.map((r) => r.values), options)
        const payload: ValidationRow[] = coerced.rows.map((r, i) => ({ ...r, row_no: i + 1 }))
        const outcomes = await apply(payload)
        window.clearInterval(tick)
        setProgress(100)

        const byRowNo = new Map(outcomes.map((o) => [o.row_no, o]))
        const anyUnattributed = outcomes.some((o) => o.detail?.unattributed)
        setUnattributed(anyUnattributed)

        const landed = batch.filter((r, i) => {
          const o = byRowNo.get(i + 1)
          return !o || (o.status !== 'failed' && o.status !== 'invalid')
        })
        setSkippedKeys((prev) => {
          if (!prev.size) return prev
          const next = new Set(prev)
          landed.forEach((r) => next.delete(r.key))
          return next.size === prev.size ? prev : next
        })
        const updated = landed.filter((r) => rowIsUpdate(template, r)).length
        setCommitted((c) => ({
          created: c.created + (landed.length - updated),
          updated: c.updated + updated,
        }))
        const failedCount = outcomes.filter((o) => o.status === 'failed' || o.status === 'invalid').length
        onImported?.({
          template_key: template.key,
          summary: {
            applied: landed.length,
            updated,
            skipped: outcomes.filter((o) => o.status === 'skipped').length,
            failed: failedCount,
          },
          outcomes,
          validation: { total: batch.length, valid: batch.length, invalid: 0 },
        })

        const nextFailures: RowFailure[] = batch
          .map((r, i) => ({ row: r, outcome: byRowNo.get(i + 1) }))
          .filter(({ outcome }) => outcome && (outcome.status === 'failed' || outcome.status === 'invalid'))
          .map(({ row, outcome }) => ({
            rowKey: row.key,
            n: row.n,
            label: labelFor(template, row),
            reason: outcome!.error ?? 'The destination rejected this row without saying why.',
            edited: false,
            skipped: false,
          }))

        setFailures(nextFailures)
        if (nextFailures.length) {
          notify?.(
            `${nextFailures.length} of ${batch.length} row${batch.length === 1 ? '' : 's'} did not import. ${nextFailures[0].reason}`,
            'error',
          )
        } else {
          notify?.(`Imported ${batch.length} row${batch.length === 1 ? '' : 's'}.`, 'success')
        }
        setPhase(nextFailures.length ? 'result' : 'done')
      } catch (e: unknown) {
        window.clearInterval(tick)
        setPhase('confirm')
        setError(`The import did not run: ${describeError(e, 'the request failed')}. No rows were written.`)
      }
    },
    [apply, loadOptions, notify, onImported, rows, template],
  )

  const backToRows = useCallback(() => {
    const reasons = new Map(failures.map((f) => [f.rowKey, f.reason]))
    setRows((prev) => prev.map((r) => ({ ...r, rowProblem: reasons.get(r.key) ?? null })))
    setPhase('review')
  }, [failures])

  const retryFailures = useCallback(() => {
    const live = failures.filter((f) => !f.skipped)
    if (!live.length) return
    const keys = new Set(live.map((f) => f.rowKey))
    void commit(rows.filter((r) => keys.has(r.key)))
  }, [commit, failures, rows])

  const editFailure = useCallback(
    (rowKey: string, field: string, value: string) => {
      setRows((prev) =>
        prev.map((r) =>
          r.key === rowKey
            ? { ...r, values: { ...r.values, [field]: value }, problems: {}, warnings: {}, rowProblem: null, checked: false }
            : r,
        ),
      )
      setFailures((prev) => prev.map((f) => (f.rowKey === rowKey ? { ...f, edited: true } : f)))
    },
    [],
  )

  const skipFailure = useCallback((rowKey: string) => {
    setSkippedKeys((prev) => {
      if (prev.has(rowKey)) return prev
      const next = new Set(prev)
      next.add(rowKey)
      return next
    })
    setFailures((prev) => prev.map((f) => (f.rowKey === rowKey ? { ...f, skipped: true } : f)))
  }, [])

  const reset = useCallback(() => {
    checkTicket.current += 1
    setPhase('upload')
    setCheck('idle')
    setCheckPct(0)
    setRows([])
    setFailures([])
    setSkippedKeys(new Set())
    setCommitted({ created: 0, updated: 0 })
    setUnattributed(false)
    setProgress(0)
    setFileName('')
    setUnknownColumns([])
    setError(null)
  }, [])

  const idle = check === 'idle'

  const summary = useMemo(() => {
    if (idle) return { total: rows.length, problems: 0, creates: 0, updates: 0, clean: 0, unchecked: rows.length }
    const unchecked = rows.filter((r) => !r.checked)
    const settled = rows.filter((r) => r.checked)
    const clean = settled.filter((r) => !rowHasProblem(r))
    const updates = clean.filter((r) => rowIsUpdate(template, r)).length
    return {
      total: rows.length,
      problems: settled.length - clean.length,
      creates: clean.length - updates,
      updates,
      clean: clean.length,
      unchecked: unchecked.length,
    }
  }, [idle, rows, template])

  const filtered = useMemo(() => {
    if (idle || filter === 'all') return rows
    if (filter === 'problem') return rows.filter((r) => r.checked && rowHasProblem(r))
    if (filter === 'unchecked') return rows.filter((r) => !r.checked)
    if (filter === 'new') return rows.filter((r) => r.checked && !rowIsUpdate(template, r) && !rowHasProblem(r))
    return rows.filter((r) => r.checked && rowIsUpdate(template, r) && !rowHasProblem(r))
  }, [filter, idle, rows, template])

  const visible = useMemo(() => filtered.slice(0, Math.min(shown, GRID_RENDER_CAP)), [filtered, shown])
  const liveFailures = failures.filter((f) => !f.skipped)

  return {
    phase,
    check,
    checkPct,
    rows,
    fileName,
    unknownColumns,
    filter,
    error,
    progress,
    failures: liveFailures,
    skippedCount: skippedKeys.size,
    unattributed,
    committed,
    summary,
    options,
    optionsLoading,
    filtered,
    visible,
    hasMore: filtered.length > visible.length && visible.length < GRID_RENDER_CAP,
    cappedAt: filtered.length > GRID_RENDER_CAP ? GRID_RENDER_CAP : null,
    canContinue: check === 'done' && summary.problems === 0 && summary.unchecked === 0 && rows.length > 0,
    upsertIsAChoice: upsertIsAChoice(template),
    loadFile,
    loadText,
    runCheck: () => {
      void runCheck(true)
    },
    setCell,
    addRow,
    deleteRow,
    setFilter: (f: GridFilter) => {
      setFilter(f)
      setShown(PAGE)
    },
    showMore: () => setShown((s) => Math.min(s + 60, GRID_RENDER_CAP)),
    goConfirm: () => setPhase('confirm'),
    goReview: () => setPhase('review'),
    commit: () => commit(),
    backToRows,
    retryFailures,
    editFailure,
    skipFailure,
    finish: () => setPhase('done'),
    dismissError: () => setError(null),
    reset,
    close: onClose,
  }
}

function labelFor(template: ImportTemplate, row: DraftRow): string {
  const named = template.columns.find((c) => c.required && c.type === 'text')
  const value = named ? row.values[named.key] : undefined
  if (value && value.trim()) return value.trim()
  const key = template.upsert_key.map((k) => row.values[k]).find((v) => v && v.trim())
  return key?.trim() || `Row ${row.n}`
}

export type ImportSession = ReturnType<typeof useImportSession>
