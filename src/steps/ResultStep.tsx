import React from 'react'

import { downloadText, toCsv } from '../csv'
import { IconDownload } from '../Icons'
import type { ImportTemplate } from '../types'
import type { ImportSession } from '../useImportSession'

function fixColumns(template: ImportTemplate): string {
  const narrow = (t: string) => ['number', 'date', 'currency', 'bool', 'enum'].includes(t)
  return template.columns.map((c) => (narrow(c.type) ? '124px' : 'minmax(136px, 1fr)')).join(' ')
}

export function ResultStep({ session, template }: { session: ImportSession; template: ImportTemplate }) {
  const { failures, committed, rows, unattributed } = session
  const ok = committed.created + committed.updated
  const editedCount = failures.filter((f) => f.edited).length
  const byKey = new Map(rows.map((r) => [r.key, r]))

  return (
    <>
      <div className="imp-body">
        <div className="imp-result-heads">
          <div className="imp-result-head imp-result-head--ok">
            <div className="imp-result-num">{ok}</div>
            <div className="imp-result-label">row{ok === 1 ? '' : 's'} went through</div>
            <div className="imp-result-detail">
              {session.upsertIsAChoice
                ? `${committed.created} created · ${committed.updated} updated`
                : `${committed.created + committed.updated} written`}
            </div>
          </div>
          <div className="imp-result-head imp-result-head--bad">
            <div className="imp-result-num">{failures.length}</div>
            <div className="imp-result-label">came back with a problem</div>
            <div className="imp-result-detail">
              {unattributed
                ? 'This destination reports totals only, so these rows are the ones it could not place. Fix below and retry.'
                : 'Nothing was saved for these. Fix below and retry — the rest stay put.'}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Fix and retry just these</div>
          <div className="imp-spacer" />
          <div className={`imp-fixpill${editedCount ? ' imp-fixpill--some' : ''}`}>
            {editedCount === 0 ? 'none edited yet' : `${editedCount} of ${failures.length} edited`}
          </div>
        </div>

        <div className="imp-fixlist">
          {failures.map((f) => {
            const row = byKey.get(f.rowKey)
            const suggestion = row && Object.values(row.problems).find((p) => p.fix)?.fix
            return (
              <div className={`imp-fixcard${f.edited ? ' is-edited' : ''}`} key={f.rowKey}>
                <div className="imp-fixcard-head">
                  <div className="imp-fixcard-icon" aria-hidden>
                    {f.edited ? '\u2713' : '!'}
                  </div>
                  <span style={{ fontFamily: 'var(--imp-font-mono)', fontSize: 12.5, color: 'var(--imp-faint)' }}>
                    row {f.n}
                  </span>
                  <span style={{ fontSize: 14.5, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.label}
                  </span>
                  <div className="imp-spacer" />
                  <button
                    type="button"
                    className="imp-btn imp-btn--link"
                    style={{ fontSize: 12.5, color: 'var(--imp-faint)', whiteSpace: 'nowrap' }}
                    onClick={() => session.skipFailure(f.rowKey)}
                  >
                    Skip this row
                  </button>
                </div>

                <div className="imp-fixcard-reason">{f.reason}</div>

                {row && (
                  <div className="imp-fixrow" style={{ '--imp-fix-cols': fixColumns(template) } as React.CSSProperties}>
                    {template.columns.map((c) => (
                      <div className="imp-fixcell" key={c.key}>
                        <label htmlFor={`fix-${f.rowKey}-${c.key}`}>{c.key}</label>
                        <input
                          id={`fix-${f.rowKey}-${c.key}`}
                          value={row.values[c.key] ?? ''}
                          placeholder={c.required ? 'required' : c.example ?? ''}
                          onChange={(e) => session.editFailure(f.rowKey, c.key, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {suggestion && (
                  <div style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="imp-suggest"
                      onClick={() => session.editFailure(f.rowKey, suggestion.column_key, suggestion.value)}
                    >
                      {suggestion.label ?? `Use ${suggestion.value}`}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: 14, paddingBottom: 4 }}>
          <button
            type="button"
            className="imp-btn imp-btn--link"
            style={{ display: 'flex', gap: 7, fontSize: 13.5, color: 'var(--imp-muted)' }}
            onClick={() =>
              downloadText(
                `${template.key}-not-imported.csv`,
                toCsv(
                  [...template.columns.map((c) => c.key), 'error'],
                  failures.map((f) => ({ ...(byKey.get(f.rowKey)?.values ?? {}), error: f.reason })),
                ),
              )
            }
          >
            <IconDownload size={13} /> Download these {failures.length} row{failures.length === 1 ? '' : 's'} as CSV
          </button>
        </div>
      </div>

      <div className="imp-foot" style={{ marginTop: 14 }}>
        <button type="button" className="imp-btn imp-btn--quiet" onClick={session.backToRows}>
          ← Back to rows
        </button>
        <button type="button" className="imp-btn imp-btn--quiet" onClick={session.reset}>
          Import another file
        </button>
        <div className="imp-spacer" />
        <button type="button" className="imp-btn" onClick={session.finish}>
          Keep the {ok} and close
        </button>
        <button type="button" className="imp-btn imp-btn--primary" onClick={session.retryFailures}>
          Retry {failures.length} row{failures.length === 1 ? '' : 's'}
        </button>
      </div>
    </>
  )
}

export function DoneStep({ session, template }: { session: ImportSession; template: ImportTemplate }) {
  const { committed, failures, skippedCount } = session
  const noun = template.label.toLowerCase()
  const total = committed.created + committed.updated
  const unresolved = failures.length + skippedCount

  const lines = session.upsertIsAChoice
    ? [
        { num: committed.created, label: `${noun} created`, detail: 'Added to your account' },
        {
          num: committed.updated,
          label: `${noun} updated`,
          detail: `Matched by ${template.upsert_key.join(' + ')} · only the fields you supplied changed`,
        },
        { num: unresolved, label: 'rows left unresolved', detail: unresolved ? 'Skipped or still failing; these were not written' : 'No downloads, no leftover file to come back to' },
      ]
    : [
        { num: total, label: `${noun} written`, detail: 'Saved to your account' },
        { num: unresolved, label: 'rows left unresolved', detail: unresolved ? 'Skipped or still failing; these were not written' : 'No downloads, no leftover file to come back to' },
      ]

  return (
    <>
      <div className="imp-body" style={{ paddingTop: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              background: '#e9f5ee',
              border: '1px solid var(--imp-ok-line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--imp-ok)',
              fontSize: 18,
            }}
            aria-hidden
          >
            ✓
          </div>
          <div>
            <div style={{ fontSize: 21, fontWeight: 600, letterSpacing: '-.01em' }}>
              {total} {noun} imported
            </div>
            <div style={{ marginTop: 2, fontSize: 14, color: 'var(--imp-muted)' }}>
              {unresolved ? 'Rows left unresolved were not written.' : 'Everything in your file was imported. Nothing left over.'}
            </div>
          </div>
        </div>

        <div className="imp-receipt">
          {lines.map((l) => (
            <div className="imp-receipt-row" key={l.label}>
              <div className="imp-receipt-num">{l.num}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{l.label}</div>
                <div style={{ fontSize: 12.5, color: 'var(--imp-faint)' }}>{l.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="imp-foot" style={{ marginTop: 20 }}>
        <button type="button" className="imp-btn imp-btn--quiet" onClick={session.reset}>
          Import another file
        </button>
        <div className="imp-spacer" />
        <button type="button" className="imp-btn imp-btn--primary" onClick={session.close}>
          Done
        </button>
      </div>
    </>
  )
}
