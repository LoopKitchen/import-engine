import React from 'react'

import { downloadText, toCsv } from '../csv'
import { IconDownload, IconPlus, IconTrash } from '../Icons'
import type { ImportTemplate } from '../types'
import type { GridFilter } from '../useImportSession'
import { rowHasProblem, type ImportSession } from '../useImportSession'
import { GridCell } from './GridCell'

export function gridColumns(template: ImportTemplate): string {
  const isNarrow = (t: string) => ['number', 'date', 'currency', 'bool', 'enum'].includes(t)
  const wideIdx = template.columns.map((c, i) => (isNarrow(c.type) ? -1 : i)).filter((i) => i >= 0)
  const last = wideIdx[wideIdx.length - 1]
  const tracks = template.columns.map((c, i) =>
    isNarrow(c.type) ? '150px' : i === last ? 'minmax(150px, 1.45fr)' : 'minmax(150px, 1fr)',
  )
  return ['74px', ...tracks, '52px'].join(' ')
}

export function specColumns(template: ImportTemplate): string {
  return template.columns.map((c) => (['number', 'date', 'bool'].includes(c.type) ? '200px' : 'minmax(170px, 1fr)')).join(' ')
}

export function ReviewStep({ session, template }: { session: ImportSession; template: ImportTemplate }) {
  const { check, checkPct, summary, rows, visible, filter, unknownColumns } = session
  const idle = check === 'idle'
  const running = check === 'running'
  const problems = summary.problems
  const unchecked = summary.unchecked
  const noun = template.label.toLowerCase()

  const bandClass = idle || running ? '' : problems > 0 ? ' imp-band--problem' : unchecked > 0 ? '' : ' imp-band--ok'
  const bandTitle = idle
    ? `${rows.length} row${rows.length === 1 ? '' : 's'} read — not checked yet`
    : running
      ? 'Checking your rows against this account…'
      : problems > 0
        ? `${problems} row${problems === 1 ? '' : 's'} need${problems === 1 ? 's' : ''} your attention`
        : unchecked > 0
          ? `${unchecked} row${unchecked === 1 ? '' : 's'} changed since the last check`
          : `All ${rows.length} row${rows.length === 1 ? '' : 's'} check out`
  const bandBody = idle
    ? 'Check required fields, formats, duplicates, and every reference against your account.'
    : running
      ? 'Checking required fields, formats, duplicates, and every reference against your account.'
      : problems > 0
        ? `Everything else passed. Fix these here — the highlighted cells are editable.${
            unchecked > 0 ? ` ${unchecked} edited row${unchecked === 1 ? '' : 's'} still to re-check.` : ''
          }`
        : unchecked > 0
          ? 'Nothing is flagged on them yet — re-check when you have finished editing.'
          : 'Required fields, formats, duplicates and every reference verified against your account. Nothing left to fix.'

  const tiles: Array<{ id: GridFilter; num: number; label: string; tone: 'ok' | 'plain' | 'bad' }> = [
    ...(session.upsertIsAChoice
      ? ([
          { id: 'new', num: summary.creates, label: `new ${noun}`, tone: 'ok' },
          { id: 'update', num: summary.updates, label: 'updates to existing', tone: 'plain' },
        ] as const)
      : ([{ id: 'update', num: summary.clean, label: 'rows ready', tone: 'plain' }] as const)),
    { id: 'problem', num: problems, label: problems === 1 ? 'problem' : 'problems', tone: problems > 0 ? 'bad' : 'ok' },
    ...(unchecked > 0 ? ([{ id: 'unchecked', num: unchecked, label: 'not checked yet', tone: 'plain' }] as const) : []),
  ]

  const emptyCopy =
    filter === 'problem'
      ? 'Nothing flagged any more — every row passes.'
      : filter === 'unchecked'
        ? 'Every row has been checked.'
        : filter === 'new'
        ? `No new ${noun} in this file — every row updates an existing record.`
        : 'No updates in this file — every row creates a new record.'

  const footNote = idle
    ? 'Not checked yet'
    : running
      ? 'Checking…'
      : problems > 0
        ? `${problems} problem${problems === 1 ? '' : 's'} left`
        : unchecked > 0
          ? `${unchecked} row${unchecked === 1 ? '' : 's'} to re-check`
          : 'Ready'

  const nextLabel = idle
    ? 'Check rows to continue'
    : problems > 0
      ? `Fix ${problems} row${problems === 1 ? '' : 's'} to continue`
      : unchecked > 0
        ? 'Re-check rows to continue'
        : `Review ${summary.clean} change${summary.clean === 1 ? '' : 's'}`

  return (
    <>
      <div className={`imp-band${bandClass}`}>
        <div className="imp-band-top">
          <div className="imp-band-icon" aria-hidden>
            {idle ? '?' : running ? '·' : problems > 0 ? '!' : '✓'}
          </div>
          <div className="imp-band-text" aria-live="polite">
            <div className="imp-band-title">{bandTitle}</div>
            <div className="imp-band-body">{bandBody}</div>
            {unknownColumns.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 13, color: 'var(--imp-faint)' }}>
                Ignored {unknownColumns.length === 1 ? 'a column' : `${unknownColumns.length} columns`} this template does not
                use: {unknownColumns.map((h) => `'${h}'`).join(', ')}.
              </div>
            )}
          </div>
          <div className="imp-band-action">
            {idle && (
              <button type="button" className="imp-btn imp-btn--primary" onClick={session.runCheck}>
                Check rows
              </button>
            )}
            {running && (
              <div>
                <div className="imp-progress">
                  <span style={{ width: `${checkPct}%` }} />
                </div>
                <div className="imp-progress-count">
                  {Math.round((checkPct / 100) * rows.length)} / {rows.length} rows
                </div>
              </div>
            )}
            {check === 'done' && (
              <button type="button" className="imp-btn imp-btn--sm imp-btn--outline-accent" onClick={session.runCheck}>
                Re-check rows
              </button>
            )}
          </div>
        </div>

        <div className="imp-tiles">
          {tiles.map((t) => {
            const skeleton = idle || running
            const cls = skeleton
              ? 'imp-tile imp-tile--skeleton'
              : `imp-tile imp-tile--${t.tone === 'plain' ? 'plain' : t.tone}${filter === t.id ? ' is-active' : ''}`
            return (
              <button
                type="button"
                key={t.id}
                className={cls}
                disabled={skeleton}
                aria-pressed={filter === t.id}
                onClick={() => session.setFilter(filter === t.id ? 'all' : t.id)}
              >
                <span className="imp-tile-num">{skeleton ? '—' : t.num}</span>
                <span className="imp-tile-label">{t.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="imp-toolbar">
        <div className="imp-toolbar-caption">
          {filter === 'all'
            ? `Showing ${visible.length} of ${rows.length} rows`
            : `Filtered: ${session.filtered.length} of ${rows.length} rows · showing ${visible.length}`}
        </div>
        <div className="imp-spacer" />
        <button type="button" className="imp-btn imp-btn--sm" onClick={session.addRow}>
          <IconPlus /> Add row
        </button>
        <button
          type="button"
          className="imp-btn imp-btn--sm"
          onClick={() =>
            downloadText(
              `${template.key}-as-checked.csv`,
              toCsv(template.columns.map((c) => c.key), rows.map((r) => r.values)),
            )
          }
        >
          <IconDownload /> Export as checked
        </button>
      </div>

      <div className="imp-grid-wrap">
        <div className="imp-grid-scroll">
          <div className="imp-grid-row imp-grid-row--head">
            <div className="imp-grid-head-cell" style={{ color: 'var(--imp-muted)' }}>
              #
            </div>
            {template.columns.map((c) => (
              <div className="imp-grid-head-cell" key={c.key}>
                {c.label}
                {c.required && <span className="imp-req"> *</span>}
              </div>
            ))}
            <div className="imp-grid-head-cell" />
          </div>

          {visible.map((row) => {
            const bad = !idle && row.checked && rowHasProblem(row)
            const settled = !idle && row.checked
            return (
              <div className={`imp-grid-row${bad ? ' imp-grid-row--bad' : ''}`} key={row.key}>
                <div className="imp-grid-num">
                  <span className={`imp-mark${bad ? ' imp-mark--bad' : settled ? ' imp-mark--ok' : ''}`} aria-hidden>
                    {bad ? '!' : settled ? '✓' : '·'}
                  </span>
                  {row.n}
                </div>
                {template.columns.map((c) => (
                  <GridCell
                    key={c.key}
                    column={c}
                    rowNo={row.n}
                    value={row.values[c.key] ?? ''}
                    problem={row.problems[c.key]}
                    warning={row.warnings[c.key]}
                    options={session.options}
                    rowValues={row.values}
                    onChange={(v) => session.setCell(row.key, c.key, v)}
                  />
                ))}
                <button type="button" className="imp-row-del" title={`Remove row ${row.n}`} onClick={() => session.deleteRow(row.key)}>
                  <IconTrash />
                </button>
                {row.rowProblem && <div className="imp-row-msg">{row.rowProblem}</div>}
              </div>
            )
          })}

          {session.filtered.length === 0 && (
            <div className="imp-grid-empty">
              <div style={{ fontSize: 14.5, fontWeight: 500, color: 'var(--imp-muted)' }}>
                {rows.length === 0 ? 'No rows yet — add one below.' : emptyCopy}
              </div>
              {rows.length > 0 && (
                <button
                  type="button"
                  className="imp-btn imp-btn--link"
                  style={{ marginTop: 8, fontSize: 13.5 }}
                  onClick={() => session.setFilter('all')}
                >
                  Show all {rows.length} rows
                </button>
              )}
            </div>
          )}

        </div>

        {session.hasMore && (
          <div className="imp-grid-more">
            <button type="button" className="imp-btn imp-btn--link" style={{ fontSize: 13.5 }} onClick={session.showMore}>
              Show 60 more · {session.filtered.length - visible.length} left
            </button>
          </div>
        )}
        {!session.hasMore && session.cappedAt !== null && (
          <div className="imp-grid-more">
            <span style={{ fontSize: 13, color: 'var(--imp-faint)' }}>
              Showing the first {session.cappedAt} of {rows.length} rows. Every row is still checked and still imported.
            </span>
          </div>
        )}
      </div>

      <div className="imp-foot" style={{ marginTop: 12 }}>
        <button type="button" className="imp-btn imp-btn--quiet" onClick={session.reset}>
          Start over
        </button>
        <div className="imp-spacer" />
        <div className={`imp-foot-note imp-foot-note--${idle || running || unchecked > 0 ? 'idle' : problems > 0 ? 'bad' : 'ok'}`}>{footNote}</div>
        <button type="button" className="imp-btn" onClick={session.close}>
          Cancel
        </button>
        <button type="button" className="imp-btn imp-btn--primary" disabled={!session.canContinue} onClick={session.goConfirm}>
          {nextLabel}
        </button>
      </div>
    </>
  )
}
