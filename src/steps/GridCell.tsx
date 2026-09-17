import { MenuItem, Select } from '@mui/material'
import React from 'react'

import type { ResolvedOptions } from './../optionSources'
import type { ImportColumn, RowError } from './../types'
import { narrow } from './../validate'

export interface GridCellProps {
  column: ImportColumn
  rowNo: number
  value: string
  problem?: RowError
  warning?: RowError
  options: Map<string, ResolvedOptions> | null
  rowValues: Record<string, string>
  onChange: (value: string) => void
}

export function choicesFor(
  column: ImportColumn,
  options: Map<string, ResolvedOptions> | null,
  rowValues: Record<string, string>,
): { resolved: ResolvedOptions | null; choices: Array<{ value: string; label: string }> | null } {
  if (column.enum_values?.length) {
    return { resolved: null, choices: column.enum_values.map((v) => ({ value: v, label: v })) }
  }
  if (!column.option_source || !options) return { resolved: null, choices: null }
  const forNarrowing = column.parent_column ? canonicalise(rowValues, column, options) : rowValues
  const resolved = narrow(column, options, forNarrowing)
  if (!resolved || resolved.isEmpty()) return { resolved, choices: null }
  return {
    resolved,
    choices: [...resolved.values]
      .map((v) => ({ value: v, label: resolved.labels.get(v) ?? v }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
  }
}

function canonicalise(
  rowValues: Record<string, string>,
  column: ImportColumn,
  options: Map<string, ResolvedOptions>,
): Record<string, string> {
  const parentKey = column.parent_column as string
  const parentSource = column.option_source?.key
  const parentOptions = parentSource ? options.get(parentSource) : undefined
  const raw = rowValues[parentKey] ?? ''
  const canonical = parentOptions?.canonical(raw)
  return canonical && canonical !== raw ? { ...rowValues, [parentKey]: canonical } : rowValues
}

export function GridCell({ column, rowNo, value, problem, warning, options, rowValues, onChange }: GridCellProps) {
  const finding = problem ?? warning
  const { resolved, choices } = choicesFor(column, options, rowValues)
  const listId = `imp-list-${column.key}-${rowNo}`

  if (choices && !column.multi) {
    const canonical = resolved?.canonical(value) ?? (choices.some((c) => c.value === value) ? value : null)
    const unmatched = value.trim() !== '' && canonical === null
    return (
      <div className={`imp-cell${problem ? ' imp-cell--bad' : warning ? ' imp-cell--warn' : ''}`}>
        <Select
          className="imp-select"
          variant="standard"
          disableUnderline
          fullWidth
          value={canonical ?? (unmatched ? '__unmatched__' : '')}
          displayEmpty
          inputProps={{ 'aria-label': `${column.label}, row ${rowNo}`, 'aria-invalid': !!problem }}
          MenuProps={{ PaperProps: { sx: { maxHeight: 320 } } }}
          onChange={(e) => onChange(e.target.value === '__unmatched__' ? value : String(e.target.value))}
          sx={{
            '& .MuiSelect-select': {
              fontFamily: 'var(--imp-font-mono)',
              fontSize: 13,
              color: '#243b4a',
              p: '4px 6px',
              minHeight: 'unset',
            },
          }}
        >
          {!column.required && (
            <MenuItem value="">
              <em>blank</em>
            </MenuItem>
          )}
          {column.required && !canonical && !unmatched && (
            <MenuItem value="" disabled>
              Choose one…
            </MenuItem>
          )}
          {unmatched && <MenuItem value="__unmatched__">{value} — not on your account</MenuItem>}
          {choices.map((c) => (
            <MenuItem key={c.value} value={c.value}>
              {c.label}
            </MenuItem>
          ))}
        </Select>
        {finding && <div className={`imp-cell-msg${problem ? '' : ' imp-cell-msg--warn'}`}>{finding.message}</div>}
      </div>
    )
  }

  return (
    <div className={`imp-cell${problem ? ' imp-cell--bad' : warning ? ' imp-cell--warn' : ''}`}>
      <input
        value={value}
        list={choices ? listId : undefined}
        placeholder={column.required ? 'required' : column.example || ''}
        aria-label={`${column.label}, row ${rowNo}`}
        aria-invalid={!!problem}
        onChange={(e) => onChange(e.target.value)}
      />
      {choices && (
        <datalist id={listId}>
          {choices.map((c) => (
            <option key={c.value} value={c.value} />
          ))}
        </datalist>
      )}
      {finding && <div className={`imp-cell-msg${problem ? '' : ' imp-cell-msg--warn'}`}>{finding.message}</div>}
    </div>
  )
}
