import { describe, expect, it } from 'vitest'
import orthorhombic from '@/data/spacegroups/orthorhombic.json'
import cubic from '@/data/spacegroups/cubic.json'
import type { SpaceGroupData } from '@/types/crystal'
import { equivalentPositions, generateAtoms } from '@/lib/symmetry'

const pnma = (orthorhombic as SpaceGroupData[]).find((group) => group.number === 62)!
const fm3m = (cubic as SpaceGroupData[]).find((group) => group.number === 225)!

describe('symmetry atom generation', () => {
  it('generates the 8 general positions of Pnma', () => {
    const general = pnma.wyckoffPositions[0]!
    expect(general.letter).toBe('d')
    expect(equivalentPositions(general)).toHaveLength(8)
  })

  it('generates 4 atoms on the Pnma a site', () => {
    const atoms = generateAtoms(pnma, 'a')
    expect(atoms).toHaveLength(4)
    expect(atoms[0]!.siteSymmetry).toBe('-1')
    expect(atoms.every((atom) => atom.wyckoffLetter === 'a')).toBe(true)
  })

  it('contains all 192 general positions of Fm-3m', () => {
    expect(generateAtoms(fm3m)).toHaveLength(192)
  })

  it('keeps fractional coordinates within the unit cell', () => {
    for (const atom of generateAtoms(fm3m)) {
      for (const value of atom.fractionalCoords) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThan(1)
      }
    }
  })
})
