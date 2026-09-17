export const CLOSE_MATCH_CUTOFF = 0.78

function findLongestMatch(
  a: string,
  b2j: Map<string, number[]>,
  alo: number,
  ahi: number,
  blo: number,
  bhi: number,
): [number, number, number] {
  let besti = alo
  let bestj = blo
  let bestsize = 0
  let j2len = new Map<number, number>()

  for (let i = alo; i < ahi; i++) {
    const newj2len = new Map<number, number>()
    const positions = b2j.get(a[i])
    if (positions) {
      for (const j of positions) {
        if (j < blo) continue
        if (j >= bhi) break
        const k = (j2len.get(j - 1) ?? 0) + 1
        newj2len.set(j, k)
        if (k > bestsize) {
          besti = i - k + 1
          bestj = j - k + 1
          bestsize = k
        }
      }
    }
    j2len = newj2len
  }
  return [besti, bestj, bestsize]
}

function buildB2j(b: string): Map<string, number[]> {
  const b2j = new Map<string, number[]>()
  for (let j = 0; j < b.length; j++) {
    const positions = b2j.get(b[j])
    if (positions) positions.push(j)
    else b2j.set(b[j], [j])
  }
  return b2j
}

function matchingTotal(a: string, b: string, b2j: Map<string, number[]>): number {
  let total = 0
  const queue: [number, number, number, number][] = [[0, a.length, 0, b.length]]
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop() as [number, number, number, number]
    const [i, j, size] = findLongestMatch(a, b2j, alo, ahi, blo, bhi)
    if (size === 0) continue
    total += size
    if (alo < i && blo < j) queue.push([alo, i, blo, j])
    if (i + size < ahi && j + size < bhi) queue.push([i + size, ahi, j + size, bhi])
  }
  return total
}

function calcRatio(matches: number, length: number): number {
  return length ? (2.0 * matches) / length : 1.0
}

function realQuickRatio(a: string, b: string): number {
  return calcRatio(Math.min(a.length, b.length), a.length + b.length)
}

function quickRatio(a: string, b: string): number {
  const counts = new Map<string, number>()
  for (let i = 0; i < b.length; i++) counts.set(b[i], (counts.get(b[i]) ?? 0) + 1)
  let matches = 0
  for (let i = 0; i < a.length; i++) {
    const remaining = counts.get(a[i]) ?? 0
    if (remaining > 0) {
      counts.set(a[i], remaining - 1)
      matches++
    }
  }
  return calcRatio(matches, a.length + b.length)
}

export function soleCloseMatch(word: string, candidates: Iterable<string>, cutoff = CLOSE_MATCH_CUTOFF): string | null {
  const b2j = buildB2j(word)
  let found: string | null = null
  for (const candidate of candidates) {
    if (realQuickRatio(candidate, word) < cutoff) continue
    if (quickRatio(candidate, word) < cutoff) continue
    if (calcRatio(matchingTotal(candidate, word, b2j), candidate.length + word.length) < cutoff) continue
    if (found !== null) return null
    found = candidate
  }
  return found
}
