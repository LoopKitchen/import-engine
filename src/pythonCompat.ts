const DATE_FORMATS = ['%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y', '%Y/%m/%d', '%m-%d-%Y', '%d-%b-%Y']

export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

export function pythonTruthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value !== ''
  if (Array.isArray(value)) return value.length > 0
  if (value instanceof Set || value instanceof Map) return value.size > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return Boolean(value)
}

const FLOAT_RE = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/

export function parseFloatLikePython(text: string): number | null {
  const trimmed = text.trim()
  if (!FLOAT_RE.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

const MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const STRPTIME_TOKENS: Record<string, string> = {
  Y: '(\\d{4})',
  m: '(1[0-2]|0[1-9]|[1-9])',
  d: '(3[01]|[12]\\d|0[1-9]|[1-9]| [1-9])',
  b: `(${MONTH_ABBR.join('|')})`,
}

const COMPILED_DATE_FORMATS = DATE_FORMATS.map((format) => {
  const fields: string[] = []
  let source = '^'
  for (let i = 0; i < format.length; i++) {
    if (format[i] === '%' && i + 1 < format.length) {
      const token = format[i + 1]
      source += STRPTIME_TOKENS[token]
      fields.push(token)
      i++
    } else {
      source += format[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
  }
  return { regex: new RegExp(`${source}$`, 'i'), fields }
})

function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

export function parseDate(text: string): string | null {
  for (const { regex, fields } of COMPILED_DATE_FORMATS) {
    const match = regex.exec(text)
    if (!match) continue
    let year = 0
    let month = 0
    let day = 0
    fields.forEach((field, i) => {
      const raw = match[i + 1].trim()
      if (field === 'Y') year = Number(raw)
      else if (field === 'm') month = Number(raw)
      else if (field === 'd') day = Number(raw)
      else month = MONTH_ABBR.indexOf(raw.toLowerCase()) + 1
    })
    if (year < 1 || month < 1 || month > 12) continue
    if (day < 1 || day > daysInMonth(year, month)) continue
    const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return iso
  }
  return null
}
