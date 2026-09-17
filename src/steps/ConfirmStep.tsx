import React from 'react'

import type { ImportTemplate } from '../types'
import { rowIsUpdate, type ImportSession } from '../useImportSession'

export function ConfirmStep({ session, template }: { session: ImportSession; template: ImportTemplate }) {
  const { summary, rows } = session
  const noun = template.label.toLowerCase()
  const updateRows = rows.filter((r) => rowIsUpdate(template, r))
  const keyLabels = template.upsert_key
    .map((k) => template.columns.find((c) => c.key === k)?.label ?? k)
    .join(' + ')

  const cards: Array<{ key: string; num: number; title: string; body: string; filter?: 'new' | 'update' }> =
    session.upsertIsAChoice
      ? [
          {
            key: 'create',
            num: summary.creates,
            title: 'created',
            body: `New ${noun}, added to your account as soon as you press Import.`,
            filter: 'new',
          },
          {
            key: 'update',
            num: summary.updates,
            title: 'updated',
            body: `Matched by ${keyLabels}. Only the fields in your file change; everything else stays as it is.`,
            filter: 'update',
          },
          {
            key: 'skip',
            num: 0,
            title: 'skipped',
            body: 'No rows dropped, no duplicates ignored. What you see is what gets written.',
          },
        ]
      : [
          {
            key: 'update',
            num: summary.clean,
            title: 'written',
            body: `Matched by ${keyLabels}. Rows that already exist are updated; the rest are added.`,
            filter: 'update',
          },
          {
            key: 'skip',
            num: 0,
            title: 'skipped',
            body: 'No rows dropped, no duplicates ignored. What you see is what gets written.',
          },
        ]

  const referenceColumns = template.columns.filter((c) => c.option_source)
  const referenceCount = rows.reduce(
    (n, r) => n + referenceColumns.filter((c) => (r.values[c.key] ?? '').trim() !== '').length,
    0,
  )
  const dataColumns = template.columns.filter((c) => !template.upsert_key.includes(c.key))
  const overwritten = dataColumns.filter((c) => updateRows.some((r) => (r.values[c.key] ?? '').trim() !== ''))
  const untouched = dataColumns.filter((c) => !overwritten.includes(c))
  const showCard = (card: (typeof cards)[number]) => {
    if (!card.filter || card.num === 0) return
    session.setFilter(card.filter)
    session.goReview()
  }

  return (
    <>
      <div className="imp-body">
        <div className="imp-pass">
          <span aria-hidden>✓</span>
          <div>
            {rows.length} row{rows.length === 1 ? '' : 's'} passed every check — required fields, formats and duplicates
            {referenceCount > 0 &&
              `, and all ${referenceCount} reference${referenceCount === 1 ? '' : 's'} found in your account`}
            .
          </div>
        </div>

        <div className="imp-section-title">Here is what pressing Import will do</div>

        <div className="imp-plan">
          {cards.map((c) => {
            const clickable = !!c.filter && c.num > 0
            return (
              <button
                type="button"
                className={`imp-plan-card imp-plan-card--${c.key}${clickable ? ' is-clickable' : ''}`}
                key={c.key}
                disabled={!clickable}
                aria-label={clickable ? `Show the ${c.num} rows that will be ${c.title}` : undefined}
                onClick={() => showCard(c)}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <div className="imp-plan-num">{c.num}</div>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>{c.title}</div>
                </div>
                <div className="imp-plan-body">{c.body}</div>
                {clickable && <div className="imp-plan-link">Show these rows →</div>}
              </button>
            )
          })}
        </div>

        {overwritten.length > 0 && (
          <div className="imp-diffs">
            <div className="imp-diffs-head">
              <div>
                {session.upsertIsAChoice
                  ? `What changes on the ${updateRows.length} existing ${updateRows.length === 1 ? noun.replace(/s$/, '') : noun}`
                  : `What your file sets, on whichever ${noun.replace(/s$/, '')} ${keyLabels} matches`}
              </div>
            </div>
            <div className="imp-fieldlist">
              <div className="imp-fieldlist-row">
                <div className="imp-fieldlist-label">Set from your file</div>
                <div>
                  {overwritten.map((c) => (
                    <span className="imp-fieldchip" key={c.key}>
                      {c.label}
                    </span>
                  ))}
                </div>
              </div>
              {untouched.length > 0 && (
                <div className="imp-fieldlist-row">
                  <div className="imp-fieldlist-label">Not in your file</div>
                  <div>
                    {untouched.map((c) => (
                      <span className="imp-fieldchip imp-fieldchip--quiet" key={c.key}>
                        {c.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="imp-foot" style={{ marginTop: 18 }}>
        <button type="button" className="imp-btn imp-btn--quiet" onClick={session.goReview}>
          ← Back to rows
        </button>
        <div className="imp-spacer" />
        <button type="button" className="imp-btn" onClick={session.close}>
          Cancel
        </button>
        <button type="button" className="imp-btn imp-btn--primary" onClick={session.commit}>
          Import {rows.length} row{rows.length === 1 ? '' : 's'}
        </button>
      </div>
    </>
  )
}

export function ImportingStep({ session }: { session: ImportSession }) {
  const total = session.rows.length
  return (
    <div className="imp-working">
      <div style={{ fontSize: 15, fontWeight: 600 }}>
        Importing {total} row{total === 1 ? '' : 's'}
      </div>
      <div className="imp-progress">
        <span style={{ width: `${session.progress}%` }} />
      </div>
      <div style={{ marginTop: 26, fontSize: 13, color: 'var(--imp-faint)' }}>
        Safe to leave this open. Nothing else is touched while it runs.
      </div>
    </div>
  )
}
