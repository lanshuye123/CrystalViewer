import { describe, expect, it } from 'vitest'
import { computeSymmetryElements } from '@/lib/symmetry-elements'
import type { OperationType, SymmetryOperation } from '@/types/crystal'

function op(
  type: OperationType,
  seitz: string,
  rotation: number[][],
  translation: number[],
): SymmetryOperation {
  return { type, seitz, rotation, translation }
}

describe('computeSymmetryElements', () => {
  it('locates a 2-fold rotation axis at the origin', () => {
    const elements = computeSymmetryElements([
      op('rotation', '-x, -y, z', [
        [-1, 0, 0],
        [0, -1, 0],
        [0, 0, 1],
      ], [0, 0, 0]),
    ])
    expect(elements).toHaveLength(1)
    expect(elements[0]).toMatchObject({
      kind: 'rotation',
      fold: 2,
      origin: [0, 0, 0],
      direction: [0, 0, 1],
    })
  })

  it('shifts an offset 2-fold axis to its true position', () => {
    // -x+1/2, -y+1/2, z: the fixed line is (1/4, 1/4, z).
    const elements = computeSymmetryElements([
      op('rotation', '-x+1/2, -y+1/2, z', [
        [-1, 0, 0],
        [0, -1, 0],
        [0, 0, 1],
      ], [0.5, 0.5, 0]),
    ])
    expect(elements).toHaveLength(1)
    expect(elements[0]).toMatchObject({
      kind: 'rotation',
      fold: 2,
      origin: [0.25, 0.25, 0],
      direction: [0, 0, 1],
    })
  })

  it('derives the screw subscript of a 2_1 axis', () => {
    const elements = computeSymmetryElements([
      op('screw', '-x, -y, z+1/2', [
        [-1, 0, 0],
        [0, -1, 0],
        [0, 0, 1],
      ], [0, 0, 0.5]),
    ])
    expect(elements).toHaveLength(1)
    expect(elements[0]).toMatchObject({ kind: 'screw', fold: 2, screw: 1 })
  })

  it('finds a mirror plane normal and position', () => {
    // x, -y, z: reflection through the plane y = 0.
    const elements = computeSymmetryElements([
      op('mirror', 'x, -y, z', [
        [1, 0, 0],
        [0, -1, 0],
        [0, 0, 1],
      ], [0, 0, 0]),
    ])
    expect(elements).toHaveLength(1)
    expect(elements[0]).toMatchObject({
      kind: 'mirror',
      direction: [0, 1, 0],
      origin: [0, 0, 0],
    })
    expect(elements[0]!.glide).toBeUndefined()
  })

  it('computes the in-plane glide vector of a glide plane', () => {
    // x, -y, z+1/2: c-glide through y = 0.
    const elements = computeSymmetryElements([
      op('glide', 'x, -y, z+1/2', [
        [1, 0, 0],
        [0, -1, 0],
        [0, 0, 1],
      ], [0, 0, 0.5]),
    ])
    expect(elements).toHaveLength(1)
    expect(elements[0]).toMatchObject({ kind: 'glide', direction: [0, 1, 0] })
    // 1/2 wraps to -1/2, an equivalent representation of the same glide.
    expect(elements[0]!.glide).toEqual([0, 0, -0.5])
  })

  it('supports rotoinversion axes with their fold order', () => {
    // y, -x, -z: 4-bar axis along c through the origin.
    const elements = computeSymmetryElements([
      op('rotoinversion', 'y, -x, -z', [
        [0, 1, 0],
        [-1, 0, 0],
        [0, 0, -1],
      ], [0, 0, 0]),
    ])
    expect(elements).toHaveLength(1)
    expect(elements[0]).toMatchObject({
      kind: 'rotoinversion',
      fold: 4,
      direction: [0, 0, 1],
      origin: [0, 0, 0],
    })
  })

  it('locates an offset rotoinversion axis', () => {
    // y+1/2, -x+1/2, -z: 4-bar axis along c through (1/2, 0, z).
    const elements = computeSymmetryElements([
      op('rotoinversion', 'y+1/2, -x+1/2, -z', [
        [0, 1, 0],
        [-1, 0, 0],
        [0, 0, -1],
      ], [0.5, 0.5, 0]),
    ])
    expect(elements).toHaveLength(1)
    expect(elements[0]).toMatchObject({
      kind: 'rotoinversion',
      fold: 4,
      // 1/2 wraps into the [-0.5, 0.5) convention as -1/2, the same line.
      origin: [-0.5, 0, 0],
    })
  })

  it('skips identity and inversion operations', () => {
    const elements = computeSymmetryElements([
      op('identity', 'x, y, z', [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ], [0, 0, 0]),
      op('inversion', '-x, -y, -z', [
        [-1, 0, 0],
        [0, -1, 0],
        [0, 0, -1],
      ], [0, 0, 0]),
    ])
    expect(elements).toHaveLength(0)
  })

  it('deduplicates operations acting on the same element', () => {
    const rotation = [
      [-1, 0, 0],
      [0, -1, 0],
      [0, 0, 1],
    ]
    const elements = computeSymmetryElements([
      op('rotation', '-x, -y, z', rotation, [0, 0, 0]),
      op('rotation', '-x, -y, z+1', rotation, [0, 0, 1]),
    ])
    expect(elements).toHaveLength(1)
  })

  it('distinguishes glide planes that share a locus but differ in glide vector', () => {
    const rotation = [
      [1, 0, 0],
      [0, -1, 0],
      [0, 0, 1],
    ]
    const elements = computeSymmetryElements([
      op('glide', 'x+1/2, -y, z', rotation, [0.5, 0, 0]),
      op('glide', 'x, -y, z+1/2', rotation, [0, 0, 0.5]),
    ])
    expect(elements).toHaveLength(2)
  })
})
