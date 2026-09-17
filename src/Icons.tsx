import React from 'react'

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export const IconCopy = ({ size = 15 }: { size?: number }) => (
  <svg {...base(size)} aria-hidden>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
)

export const IconDownload = ({ size = 15 }: { size?: number }) => (
  <svg {...base(size)} aria-hidden>
    <path d="M12 3v12" />
    <path d="m7 11 5 5 5-5" />
    <path d="M4 21h16" />
  </svg>
)

export const IconFileUp = ({ size = 30 }: { size?: number }) => (
  <svg {...base(size)} aria-hidden>
    <path d="M14 3v5h5" />
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2Z" />
    <path d="M12 17v-5" />
    <path d="m9.5 14.5 2.5-2.5 2.5 2.5" />
  </svg>
)

export const IconPlus = ({ size = 15 }: { size?: number }) => (
  <svg {...base(size)} aria-hidden>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconTrash = ({ size = 15 }: { size?: number }) => (
  <svg {...base(size)} aria-hidden>
    <path d="M4 7h16" />
    <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
  </svg>
)
