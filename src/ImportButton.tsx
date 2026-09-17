import { Button, CircularProgress } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import React, { ReactNode, useState } from 'react'

import { IconFileUp } from './Icons'
import { ImportDialog } from './ImportDialog'
import type { ApplyResponse, ImportEngineConfig, ImportTemplate, OnImport } from './types'

export interface ImportButtonProps {
  template?: ImportTemplate
  templateKey?: string
  config: ImportEngineConfig
  onApplied?: (response: ApplyResponse) => void
  onClose?: () => void
  onImport: OnImport
  label?: string
  disabled?: boolean
  size?: 'small' | 'medium' | 'large'
  sx?: SxProps<Theme>
  render?: (open: () => void, active: boolean) => ReactNode
  'data-testid'?: string
}

export function ImportButton({ template, templateKey, config, onApplied, onClose, onImport, label = 'Bulk import', disabled, size = 'medium', sx, render, ...rest }: ImportButtonProps) {
  const [open, setOpen] = useState(false)
  const trigger = render ? (
    render(() => setOpen(true), open)
  ) : (
    <Button
      variant="outlined"
      size={size}
      onClick={() => setOpen(true)}
      disabled={disabled}
      startIcon={open ? <CircularProgress size={14} /> : <IconFileUp size={18} />}
      data-testid={rest['data-testid']}
      sx={{
        fontSize: size === 'small' ? 13 : 14,
        fontWeight: 600,
        px: size === 'small' ? 1.5 : 2.5,
        py: size === 'small' ? 0.5 : 1,
        textTransform: 'none',
        borderStyle: 'dashed',
        '&:hover': { borderStyle: 'dashed' },
        ...((sx as object) ?? {}),
      }}
    >
      {label}
    </Button>
  )
  return (
    <>
      {trigger}
      <ImportDialog
        open={open}
        onClose={() => {
          setOpen(false)
          onClose?.()
        }}
        template={template}
        templateKey={templateKey}
        config={config}
        onApplied={onApplied}
        onImport={onImport}
      />
    </>
  )
}
