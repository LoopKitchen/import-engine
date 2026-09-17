import { Dialog } from '@mui/material'
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import './import-dialog.css'
import type { OptionSourceContext } from './optionSources'
import { ConfirmStep, ImportingStep } from './steps/ConfirmStep'
import { DoneStep, ResultStep } from './steps/ResultStep'
import { gridColumns, ReviewStep, specColumns } from './steps/ReviewStep'
import { UploadStep } from './steps/UploadStep'
import { getTemplate } from './templates'
import type { ApplyResponse, ImportEngineConfig, ImportTemplate, OnImport, ValidationRow } from './types'
import { useImportSession, type Phase } from './useImportSession'

const STEPS = ['File', 'Check', 'Confirm', 'Import'] as const

const stepIndex: Record<Phase, number> = {
  upload: 0,
  review: 1,
  confirm: 2,
  importing: 3,
  result: 3,
  done: 4,
}

export interface ImportDialogProps {
  open: boolean
  onClose: () => void
  template?: ImportTemplate
  templateKey?: string
  config: ImportEngineConfig
  onApplied?: (response: ApplyResponse) => void
  onImport: OnImport
  title?: string
  density?: 'comfortable' | 'compact'
  showStepper?: boolean
}

export function ImportDialog({
  open,
  onClose,
  template: templateProp,
  templateKey,
  config,
  onApplied,
  onImport,
  title,
  density = 'comfortable',
  showStepper = true,
}: ImportDialogProps) {
  const [template, setTemplate] = useState<ImportTemplate | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    try {
      if (templateProp) setTemplate(templateProp)
      else if (templateKey) setTemplate(getTemplate(templateKey, config.templates))
      else throw new Error('Pass the import dialog a template.')
      setFatal(null)
    } catch (e: unknown) {
      setTemplate(null)
      setFatal(e instanceof Error ? e.message : 'Unknown import template.')
    }
  }, [open, templateKey, templateProp])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth={false}
      PaperProps={{ sx: { borderRadius: '10px', maxWidth: 1120, width: '100%', m: 2 } }}
    >
      {fatal ? (
        <div className="imp">
          <div className="imp-error" style={{ margin: 24 }}>
            {fatal}
          </div>
        </div>
      ) : (
        template && (
          <Body
            key={template.key}
            template={template}
            config={config}
            onClose={onClose}
            onApplied={onApplied}
            onImport={onImport}
            title={title}
            density={density}
            showStepper={showStepper}
          />
        )
      )}
    </Dialog>
  )
}

function Body({
  template,
  config,
  onClose,
  onApplied,
  onImport,
  title,
  density,
  showStepper,
}: {
  template: ImportTemplate
  config: ImportEngineConfig
  onClose: () => void
  onApplied?: (response: ApplyResponse) => void
  onImport: OnImport
  title?: string
  density: 'comfortable' | 'compact'
  showStepper: boolean
}) {
  const configRef = useRef(config)
  const importRef = useRef(onImport)
  useLayoutEffect(() => {
    configRef.current = config
    importRef.current = onImport
  })
  const tenant = config.getTenant() ?? ''
  const optionCtx = useMemo<OptionSourceContext>(
    () => ({ tenant, loadOptions: (sourceKey) => configRef.current.loadOptions(sourceKey) }),
    [tenant],
  )

  const notify = useCallback<NonNullable<ImportEngineConfig['notify']>>(
    (message, severity) => configRef.current.notify?.(message, severity),
    [],
  )

  const apply = useCallback((rows: ValidationRow[]) => importRef.current(rows, template), [template])

  const session = useImportSession({
    template,
    optionCtx,
    apply,
    onClose,
    onImported: onApplied,
    notify,
  })
  const current = stepIndex[session.phase]

  const subtitle = (() => {
    switch (session.phase) {
      case 'upload':
        return 'Check the columns, then paste your rows or drop a file.'
      case 'review':
        return `${session.fileName} · ${session.rows.length} row${session.rows.length === 1 ? '' : 's'}`
      case 'confirm':
        return 'Last look before anything is written.'
      case 'importing':
        return 'Writing rows to your account.'
      case 'result':
        return `${session.fileName} · finished with problems on ${session.failures.length} row${session.failures.length === 1 ? '' : 's'}`
      case 'done':
        return `${session.fileName || 'Import'} · finished`
      default:
        return ''
    }
  })()

  return (
    <div
      className={`imp${density === 'compact' ? ' imp--compact' : ''}`}
      style={
        {
          '--imp-grid-cols': gridColumns(template),
          '--imp-spec-cols': specColumns(template),
        } as React.CSSProperties
      }
    >
      <div className="imp-card">
        <div className="imp-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="imp-title">{title ?? `Import ${template.label.toLowerCase()}`}</div>
            <div className="imp-sub">{subtitle}</div>
          </div>
          {showStepper && (
            <div className="imp-steps">
              {STEPS.map((label, i) => (
                <div className={`imp-step${i < current ? ' is-done' : i === current ? ' is-current' : ''}`} key={label}>
                  <div className="imp-step-dot">{i < current ? '✓' : i + 1}</div>
                  <div className="imp-step-label">{label}</div>
                  {i < STEPS.length - 1 && <div className="imp-step-bar" />}
                </div>
              ))}
            </div>
          )}
        </div>

        {session.error && (
          <div className="imp-error" role="alert">
            {session.error}
          </div>
        )}

        {session.phase === 'upload' && <UploadStep session={session} template={template} />}
        {session.phase === 'review' && <ReviewStep session={session} template={template} />}
        {session.phase === 'confirm' && <ConfirmStep session={session} template={template} />}
        {session.phase === 'importing' && <ImportingStep session={session} />}
        {session.phase === 'result' && <ResultStep session={session} template={template} />}
        {session.phase === 'done' && <DoneStep session={session} template={template} />}
      </div>
    </div>
  )
}
