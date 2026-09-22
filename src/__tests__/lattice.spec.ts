import { describe, expect, it } from 'vitest'
import { CELL_EDGES, cellAxes, cellCorners, fractionalToCartesian, latticeMatrix } from '@/lib/lattice'
import type { LatticeParams } from '@/types/crystal'

const cubic: LatticeParams = { a: 4, b: 4, c: 4, alpha: 90, beta: 90, gamma: 90 }
const hexagonal: LatticeParams = { a: 4, b: 4, c: 7, alpha: 90, beta: 90, gamma: 120 }

describe('lattice', () => {
  it('builds a diagonal matrix for cubic cells', () => {
    const matrix = latticeMatrix(cubic)
    expect(matrix[0]![0]).toBeCloseTo(4)
    expect(matrix[1]![1]).toBeCloseTo(4)
    expect(matrix[2]![2]).toBeCloseTo(4)
    expect(matrix[0]![1]).toBeCloseTo(0)
  })

  it('places the hexagonal b axis at 120 degrees', () => {
    const [, b] = cellAxes(hexagonal)
    expect(b[0]).toBeCloseTo(-2)
    expect(b[1]).toBeCloseTo(4 * (Math.sqrt(3) / 2))
    expect(b[2]).toBeCloseTo(0)
  })

  it('maps fractional to cartesian coordinates', () => {
    expect(fractionalToCartesian([1, 1, 1], cubic)).toEqual([4, 4, 4])
    expect(fractionalToCartesian([0.5, 0.5, 0.5], cubic)).toEqual([2, 2, 2])
  })

  it('exposes 8 corners and 12 edges', () => {
    expect(cellCorners(cubic)).toHaveLength(8)
    expect(CELL_EDGES).toHaveLength(12)
  })
})
