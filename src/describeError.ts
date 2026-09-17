const MAX_PARTS = 3

const USELESS = new Set(['[object object]', 'error', 'request failed', 'network error', 'undefined', 'null', '{}'])

function meaningful(value: string): string | null {
  const text = value.trim()
  if (!text || USELESS.has(text.toLowerCase())) return null
  return text.toLowerCase().includes('[object object]') ? null : text
}

function fromDetail(detail: unknown): string | null {
  if (typeof detail === 'string' && detail.trim()) return detail.trim()
  if (!Array.isArray(detail)) return null
  const parts = detail
    .map((entry) => {
      if (typeof entry === 'string') return entry
      if (!entry || typeof entry !== 'object') return null
      const e = entry as { loc?: unknown[]; msg?: unknown }
      const msg = typeof e.msg === 'string' ? e.msg : null
      if (!msg) return null
      const field = Array.isArray(e.loc)
        ? e.loc.filter((p) => typeof p === 'string' && p !== 'body').slice(-1)[0]
        : undefined
      return field ? `${field}: ${msg}` : msg
    })
    .filter((p): p is string => !!p)
  if (!parts.length) return null
  const shown = parts.slice(0, MAX_PARTS).join('; ')
  return parts.length > MAX_PARTS ? `${shown} (and ${parts.length - MAX_PARTS} more)` : shown
}

export function describeError(err: unknown, fallback = 'The server rejected this without saying why.'): string {
  const seen = new Set<unknown>()

  const walk = (value: unknown, depth: number): string | null => {
    if (depth > 4 || value === null || value === undefined) return null
    if (typeof value === 'string') return meaningful(value)
    if (typeof value !== 'object') return String(value)
    if (seen.has(value)) return null
    seen.add(value)

    const o = value as Record<string, unknown>
    return (
      fromDetail(o.detail) ??
      walk(o.detail, depth + 1) ??
      walk(o.body, depth + 1) ??
      walk(o.response, depth + 1) ??
      walk(o.data, depth + 1) ??
      walk(o.message, depth + 1) ??
      walk(o.error, depth + 1) ??
      (typeof o.status === 'number' ? `The server answered ${o.status}.` : null)
    )
  }

  return walk(err, 0) ?? fallback
}
