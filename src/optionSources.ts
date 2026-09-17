export interface OptionEntry {
  value?: string | number | null
  display_label?: string | null
  aliases?: Array<string | number> | null
  dependents?: OptionEntry[] | null
}

export class ResolvedOptions {
  values = new Set<string>()
  index = new Map<string, string>()
  labels = new Map<string, string>()
  dependents = new Map<string, Set<string>>()
  fetchFailed = false

  canonical(raw: unknown): string | null {
    if (raw === null || raw === undefined) return null
    return this.index.get(String(raw).trim().toLowerCase()) ?? null
  }

  isEmpty(): boolean {
    return this.values.size === 0
  }

  sample(limit = 3): string[] {
    const labelled = [...this.values].map((v) => this.labels.get(v) ?? v)
    labelled.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    return labelled.slice(0, limit)
  }
}

export function indexEntries(entries: OptionEntry[]): ResolvedOptions {
  const resolved = new ResolvedOptions()

  for (const entry of entries) {
    const value = entry?.value
    if (value === null || value === undefined || value === '') continue
    const canonical = String(value)
    const label = String(entry.display_label || canonical)
    resolved.values.add(canonical)
    resolved.labels.set(canonical, label)
    resolved.index.set(canonical.toLowerCase(), canonical)
    resolved.index.set(label.toLowerCase(), canonical)
    const dependents = entry.dependents || []
    if (dependents.length) {
      const children = new Set<string>()
      for (const child of dependents) {
        const childValue = child?.value
        if (childValue === null || childValue === undefined || childValue === '') continue
        children.add(String(childValue))
      }
      resolved.dependents.set(canonical, children)
    }
  }

  for (const entry of entries) {
    const value = entry?.value
    if (value === null || value === undefined || value === '') continue
    for (const alias of entry.aliases || []) {
      if (alias === null || alias === undefined || alias === '') continue
      resolved.index.set(String(alias).trim().toLowerCase(), String(value))
    }
  }

  return resolved
}

export type OptionLoader = (listName: string) => Promise<unknown>

export interface OptionSourceContext {
  tenant: string
  loadOptions: OptionLoader
}

export async function resolveOptionSource(listName: string, ctx: OptionSourceContext): Promise<ResolvedOptions> {
  let body: unknown
  try {
    body = await ctx.loadOptions(listName)
  } catch {
    const failed = new ResolvedOptions()
    failed.fetchFailed = true
    return failed
  }
  return indexEntries(Array.isArray(body) ? (body as OptionEntry[]) : [])
}

export async function resolveOptionSources(
  listNames: Iterable<string>,
  ctx: OptionSourceContext,
): Promise<Map<string, ResolvedOptions>> {
  const unique = [...new Set(listNames)]
  const resolved = await Promise.all(unique.map((name) => resolveOptionSource(name, ctx)))
  return new Map(unique.map((name, i) => [name, resolved[i]]))
}
