import { describe, expect, it } from 'vitest'
import { computeBonds } from '@/lib/bonds'
import type { AtomSite, LatticeParams } from '@/types/crystal'

/** Carbon pair cutoff: (0.76 + 0.76) * 1.15 = 1.748 Å. */
const C_C_CUTOFF = 1.748

function cubic(a: number): LatticeParams {
  return { a, b: a, c: a, alpha: 90, beta: 90, gamma: 90 }
}

function atom(id: string, frac: [number, number, number], element = 'C'): AtomSite {
  return {
    id,
    label: id,
    element,
    wyckoffLetter: 'a',
    multiplicity: 1,
    siteSymmetry: '1',
    fractionalCoords: frac,
    occupancy: 1,
  }
}

describe('computeBonds', () => {
  it('bonds two atoms inside the cutoff', () => {
    // a = 3.6 Å: direct distance 0.72 Å, nearest image 2.88 Å.
    const result = computeBonds([atom('a', [0, 0, 0]), atom('b', [0.2, 0, 0])], cubic(3.6))
    expect(result.bonds).toHaveLength(1)
    expect(result.bonds[0]).toMatchObject({ i: 0, j: 1, offset: [0, 0, 0] })
    expect(result.bonds[0]!.length).toBeCloseTo(0.72, 5)
    expect(result.replicas).toHaveLength(0)
  })

  it('finds a bond across the cell boundary and reports replicas', () => {
    // a = 1.9 Å: direct distance 0.19 Å (degenerate), image at -1 is 1.71 Å.
    const result = computeBonds([atom('a', [0, 0, 0]), atom('b', [0.1, 0, 0])], cubic(1.9))
    expect(C_C_CUTOFF).toBeGreaterThan(1.71)
    expect(result.bonds).toHaveLength(1)
    expect(result.bonds[0]).toMatchObject({ i: 0, j: 1, offset: [-1, 0, 0] })
    expect(result.bonds[0]!.length).toBeCloseTo(1.71, 5)
    // replicas of both endpoints are needed to draw the boundary-crossing bond
    expect(result.replicas).toHaveLength(2)
    expect(result.replicas).toContainEqual({ atom: 1, offset: [-1, 0, 0] })
    expect(result.replicas).toContainEqual({ atom: 0, offset: [1, 0, 0] })
  })

  it('bonds an atom to its own periodic images', () => {
    // a = 1.5 Å: face images at 1.5 Å bond, edge images at 2.12 Å do not.
    const result = computeBonds([atom('a', [0.5, 0.5, 0.5])], cubic(1.5))
    expect(result.bonds).toHaveLength(6)
    expect(result.bonds.every((bond) => bond.i === bond.j)).toBe(true)
    expect(result.replicas).toHaveLength(6)
  })

  it('produces no bonds beyond the cutoff', () => {
    const result = computeBonds([atom('a', [0, 0, 0]), atom('b', [0.5, 0, 0])], cubic(4))
    expect(result.bonds).toHaveLength(0)
    expect(result.replicas).toHaveLength(0)
  })

  it('skips near-degenerate pairs closer than minDistance', () => {
    // a = 2 Å: direct pair at 0.1 Å is filtered, images are 3.9 Å away.
    const result = computeBonds(
      [atom('a', [0, 0, 0]), atom('b', [0.05, 0, 0])],
      cubic(2),
      { minDistance: 0.4 },
    )
    expect(result.bonds).toHaveLength(0)
    expect(result.replicas).toHaveLength(0)
  })
})
