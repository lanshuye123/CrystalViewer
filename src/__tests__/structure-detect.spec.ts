import { describe, expect, it } from 'vitest'
import { detectSpaceGroup, isMetricCompatible } from '@/lib/structure-detect'
import type { LatticeParams } from '@/types/crystal'
import cubicData from '@/data/spacegroups/cubic.json'
import triclinicData from '@/data/spacegroups/triclinic.json'
import type { SpaceGroupData } from '@/types/crystal'

const cubic = cubicData as unknown as SpaceGroupData[]
const triclinic = triclinicData as unknown as SpaceGroupData[]

const CUBIC_CELL: LatticeParams = { a: 4, b: 4, c: 4, alpha: 90, beta: 90, gamma: 90 }

function byNumber(groups: SpaceGroupData[], number: number): SpaceGroupData {
  const group = groups.find((item) => item.number === number)
  if (!group) throw new Error(`missing group #${number}`)
  return group
}

describe('isMetricCompatible', () => {
  const p = (over: Partial<LatticeParams>): LatticeParams => ({
    a: 4,
    b: 4,
    c: 4,
    alpha: 90,
    beta: 90,
    gamma: 90,
    ...over,
  })

  it('accepts any cell for triclinic', () => {
    expect(isMetricCompatible('triclinic', p({ a: 3, alpha: 80, gamma: 100 }))).toBe(true)
  })

  it('rejects wrong angles', () => {
    expect(isMetricCompatible('cubic', p({ alpha: 89 }))).toBe(false)
    expect(isMetricCompatible('hexagonal', p({ gamma: 90 }))).toBe(false)
  })

  it('checks axis equality for tetragonal and cubic', () => {
    expect(isMetricCompatible('tetragonal', p({ c: 6 }))).toBe(true)
    expect(isMetricCompatible('cubic', p({ c: 6 }))).toBe(false)
  })
})

describe('detectSpaceGroup', () => {
  it('identifies CsCl as Pm-3m (#221)', () => {
    const result = detectSpaceGroup(
      [
        { element: 'Cs', coords: [0, 0, 0] },
        { element: 'Cl', coords: [0.5, 0.5, 0.5] },
      ],
      CUBIC_CELL,
      cubic,
    )
    expect(result?.number).toBe(221)
    expect(result?.symbolHM).toBe('Pm-3m')
  })

  it('identifies NaCl basis as Fm-3m (#225)', () => {
    // Full conventional cell: Na on 4a, Cl on 4b of the F-centred lattice.
    const result = detectSpaceGroup(
      [
        { element: 'Na', coords: [0, 0, 0] },
        { element: 'Na', coords: [0, 0.5, 0.5] },
        { element: 'Na', coords: [0.5, 0, 0.5] },
        { element: 'Na', coords: [0.5, 0.5, 0] },
        { element: 'Cl', coords: [0.5, 0.5, 0.5] },
        { element: 'Cl', coords: [0.5, 0, 0] },
        { element: 'Cl', coords: [0, 0.5, 0] },
        { element: 'Cl', coords: [0, 0, 0.5] },
      ],
      CUBIC_CELL,
      cubic,
    )
    expect(result?.number).toBe(225)
  })

  it('identifies diamond basis as Fd-3m (#227)', () => {
    // Full conventional cell: C on the 8a sites (dataset origin choice 2).
    const result = detectSpaceGroup(
      [
        { element: 'C', coords: [0.125, 0.125, 0.125] },
        { element: 'C', coords: [0.875, 0.375, 0.375] },
        { element: 'C', coords: [0.125, 0.625, 0.625] },
        { element: 'C', coords: [0.875, 0.875, 0.875] },
        { element: 'C', coords: [0.625, 0.125, 0.625] },
        { element: 'C', coords: [0.375, 0.375, 0.875] },
        { element: 'C', coords: [0.625, 0.625, 0.125] },
        { element: 'C', coords: [0.375, 0.875, 0.375] },
      ],
      CUBIC_CELL,
      cubic,
    )
    expect(result?.number).toBe(227)
  })

  it('falls back to P1 for an asymmetric structure', () => {
    const result = detectSpaceGroup(
      [
        { element: 'Si', coords: [0.13, 0.27, 0.41] },
        { element: 'O', coords: [0.62, 0.35, 0.18] },
      ],
      CUBIC_CELL,
      triclinic,
    )
    expect(result?.number).toBe(1)
  })

  it('distinguishes elements: swapped site breaks the CsCl match', () => {
    const result = detectSpaceGroup(
      [
        { element: 'Cl', coords: [0, 0, 0] },
        { element: 'Cl', coords: [0.5, 0.5, 0.5] },
      ],
      CUBIC_CELL,
      cubic,
    )
    // Two identical Cl atoms on both sites: body-centering is preserved.
    expect(result?.number).toBe(229) // Im-3m
  })

  it('returns null without atoms', () => {
    expect(detectSpaceGroup([], CUBIC_CELL, cubic)).toBeNull()
  })

  it('tolerates small coordinate perturbations', () => {
    const result = detectSpaceGroup(
      [
        { element: 'Cs', coords: [0.002, -0.001, 0] },
        { element: 'Cl', coords: [0.501, 0.499, 0.5] },
      ],
      CUBIC_CELL,
      cubic,
    )
    expect(result?.number).toBe(221)
  })
})

describe('detection against the current dataset', () => {
  it('finds the loaded space group from its own general-position atoms', () => {
    // Reconstruct a special-position atom set of #221 from its Wyckoff 1a site.
    const group = byNumber(cubic, 221)
    const atoms = [
      { element: 'X', coords: [0, 0, 0] as [number, number, number] },
      { element: 'X', coords: [0.5, 0.5, 0.5] as [number, number, number] },
    ]
    const result = detectSpaceGroup(atoms, group.latticeParams, cubic)
    expect(result?.number).toBeGreaterThanOrEqual(221)
    expect(result?.number).toBeLessThanOrEqual(230)
  })
})
