import React, { useRef, useState } from 'react'

import { downloadText, sampleCsv } from '../csv'
import { IconCopy, IconDownload, IconFileUp } from '../Icons'
import type { ImportTemplate } from '../types'
import { upsertIsAChoice, type ImportSession } from '../useImportSession'

export function UploadStep({ session, template }: { session: ImportSession; template: ImportTemplate }) {
  const [over, setOver] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const keyColumns = new Set(template.upsert_key)
  const fromSample = (i: number) => template.columns.map((c) => template.sample_rows[i]?.[c.key] ?? '')
  const declared = template.sample_rows.map((_, i) => fromSample(i))
  const sampleRows =
    declared.length > 1 || !upsertIsAChoice(template)
      ? declared
      : [template.columns.map((c) => (keyColumns.has(c.key) ? '' : c.example ?? '')), fromSample(0)]

  const copyHeaders = () => {
    void navigator.clipboard?.writeText(template.columns.map((c) => c.key).join(','))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <>
      <div className="imp-body">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>Your file should look like this</div>
            <div style={{ marginTop: 3, fontSize: 14, color: 'var(--imp-muted)' }}>{template.description}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button type="button" className="imp-btn imp-btn--link" onClick={copyHeaders} style={{ display: 'flex', gap: 8, padding: '9px 10px' }}>
              <IconCopy /> {copied ? 'Copied' : 'Copy headers'}
            </button>
            <button
              type="button"
              className="imp-btn imp-btn--sm imp-btn--outline-accent"
              onClick={() => downloadText(`${template.key}-sample.csv`, sampleCsv(template))}
            >
              <IconDownload /> Sample CSV
            </button>
          </div>
        </div>

        <div className="imp-spec">
          <div className="imp-spec-row imp-spec-row--head">
            {template.columns.map((c) => (
              <div className="imp-spec-cell" key={c.key}>
                {c.key}
                {c.required && <span className="imp-req"> *</span>}
              </div>
            ))}
          </div>
          {sampleRows.map((cells, i) => (
            <div className="imp-spec-row" key={i}>
              {cells.map((v, j) => (
                <div className={`imp-spec-cell${v ? '' : ' imp-spec-cell--blank'}`} key={template.columns[j].key}>
                  {v || 'blank'}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div
          className={`imp-drop${over ? ' is-over' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => fileInput.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click()
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            const file = e.dataTransfer.files?.[0]
            if (file) void session.loadFile(file)
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text/plain')
            if (text.trim()) session.loadText(text)
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', color: '#7c97a3' }}>
            <IconFileUp />
          </div>
          <div className="imp-drop-title">Drop your CSV here</div>
          <div className="imp-drop-hint">or click to browse. Pasting with Cmd+V works too</div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.tsv,text/csv,text/tab-separated-values"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void session.loadFile(f)
            e.target.value = ''
          }}
        />

        <div
          style={{
            marginTop: 10,
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            paddingBottom: 14,
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--imp-faint)' }}>
            Checked in your browser · nothing is saved until you press Import
          </div>
        </div>
      </div>

      <div className="imp-foot" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="imp-btn" onClick={session.close}>
          Cancel
        </button>
      </div>
    </>
  )
}
