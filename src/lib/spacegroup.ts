import indexData from '@/data/spacegroups-index.json'
import type { CrystalSystem, SpaceGroupData, SpaceGroupIndexEntry } from '@/types/crystal'

export const SPACE_GROUP_INDEX = indexData as SpaceGroupIndexEntry[]

const LOADERS: Record<CrystalSystem, () => Promise<SpaceGroupData[]>> = {
  triclinic: async () => (await import('@/data/spacegroups/triclinic.json')).default as unknown as SpaceGroupData[],
  monoclinic: async () =>
    (await import('@/data/spacegroups/monoclinic.json')).default as unknown as SpaceGroupData[],
  orthorhombic: async () =>
    (await import('@/data/spacegroups/orthorhombic.json')).default as unknown as SpaceGroupData[],
  tetragonal: async () =>
    (await import('@/data/spacegroups/tetragonal.json')).default as unknown as SpaceGroupData[],
  trigonal: async () =>
    (await import('@/data/spacegroups/trigonal.json')).default as unknown as SpaceGroupData[],
  hexagonal: async () =>
    (await import('@/data/spacegroups/hexagonal.json')).default as unknown as SpaceGroupData[],
  cubic: async () => (await import('@/data/spacegroups/cubic.json')).default as unknown as SpaceGroupData[],
}

const cache = new Map<number, SpaceGroupData>()

/** Normalise an H-M symbol or number for comparison (ignore case and spaces). */
export function normalizeSymbol(value: string): string {
  return value.replace(/\s+/g, '').replace(/[−–—]/g, '-').toLowerCase()
}

function normalizeNumber(value: string): number | null {
  const text = value.trim()
  if (!/^\d+$/.test(text)) return null
  const number = Number(text)
  return number >= 1 && number <= 230 ? number : null
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1
  const cols = b.length + 1
  const distance = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0))
  for (let i = 0; i < rows; i++) distance[i]![0] = i
  for (let j = 0; j < cols; j++) distance[0]![j] = j
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      distance[i]![j] = Math.min(
        distance[i - 1]![j]! + 1,
        distance[i]![j - 1]! + 1,
        distance[i - 1]![j - 1]! + cost,
      )
    }
  }
  return distance[rows - 1]![cols - 1]!
}

/** Match a query (number or H-M symbol) against the space-group index. */
export function matchSpaceGroup(query: string): SpaceGroupIndexEntry | undefined {
  const trimmed = query.trim()
  if (!trimmed) return undefined

  const number = normalizeNumber(trimmed)
  if (number !== null) {
    return SPACE_GROUP_INDEX.find((entry) => entry.number === number)
  }

  const target = normalizeSymbol(trimmed)
  return SPACE_GROUP_INDEX.find((entry) => normalizeSymbol(entry.symbol) === target)
}

/** Suggest similar space groups when no exact match is found. */
export function suggestSpaceGroups(query: string, limit = 6): SpaceGroupIndexEntry[] {
  const target = normalizeSymbol(query)
  if (!target) return []

  return SPACE_GROUP_INDEX.map((entry) => {
    const symbol = normalizeSymbol(entry.symbol)
    let score = levenshtein(target, symbol)
    if (symbol.startsWith(target)) score -= 2
    else if (symbol.includes(target)) score -= 1
    return { entry, score }
  })
    .sort((a, b) => a.score - b.score || a.entry.number - b.entry.number)
    .slice(0, limit)
    .map((item) => item.entry)
}

/** Lazily load the full data for a space group (cached per group). */
export async function loadSpaceGroup(entry: SpaceGroupIndexEntry): Promise<SpaceGroupData> {
  const cached = cache.get(entry.number)
  if (cached) return cached

  const groups = await LOADERS[entry.crystalSystem]()
  const data = groups.find((group) => group.number === entry.number)
  if (!data) {
    throw new Error(`未找到空间群 #${entry.number} 的数据`)
  }
  cache.set(entry.number, data)
  return data
}
