import { describe, expect, it } from 'vitest'
import {
  SPACE_GROUP_INDEX,
  loadSpaceGroup,
  matchSpaceGroup,
  normalizeSymbol,
  suggestSpaceGroups,
} from '@/lib/spacegroup'

describe('space group matching', () => {
  it('indexes all 230 space groups', () => {
    expect(SPACE_GROUP_INDEX).toHaveLength(230)
    expect(SPACE_GROUP_INDEX[0]!.number).toBe(1)
    expect(SPACE_GROUP_INDEX[229]!.number).toBe(230)
  })

  it('matches by number', () => {
    expect(matchSpaceGroup('62')?.symbol).toBe('Pnma')
    expect(matchSpaceGroup(' 225 ')?.number).toBe(225)
    expect(matchSpaceGroup('231')).toBeUndefined()
  })

  it('matches H-M symbols ignoring case and spaces', () => {
    expect(matchSpaceGroup('Pnma')?.number).toBe(62)
    expect(matchSpaceGroup('pnma')?.number).toBe(62)
    expect(matchSpaceGroup('F m -3 m')?.number).toBe(225)
    expect(matchSpaceGroup('Fm-3m')?.number).toBe(225)
  })

  it('normalises symbols', () => {
    expect(normalizeSymbol(' Fm -3m ')).toBe('fm-3m')
  })

  it('suggests similar groups', () => {
    const suggestions = suggestSpaceGroups('Pnm')
    expect(suggestions.some((entry) => entry.number === 62)).toBe(true)
  })

  it('lazily loads full data', async () => {
    const data = await loadSpaceGroup(SPACE_GROUP_INDEX[224]!)
    expect(data.number).toBe(225)
    expect(data.symbolHM).toBe('Fm-3m')
    expect(data.symmetryOperations).toHaveLength(192)
  })
})
