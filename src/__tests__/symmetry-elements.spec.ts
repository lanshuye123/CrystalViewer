import { describe, expect, it } from 'vitest'
import {
  buildSymmetryMotion,
  computeSymmetryElements,
  operationOrbit,
} from '@/lib/symmetry-elements'
import { fractionalToCartesian, type Vec3 } from '@/lib/lattice'
import type { LatticeParams, OperationType, SymmetryOperation } from '@/types/crystal'

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

describe('operationOrbit', () => {
  it('returns a two-point orbit for a 2-fold rotation', () => {
    const rotation = op('rotation', '-x, -y, z', [
      [-1, 0, 0],
      [0, -1, 0],
      [0, 0, 1],
    ], [0, 0, 0])
    const orbit = operationOrbit(rotation, [0.3, 0.1, 0.2])
    expect(orbit).toHaveLength(2)
    expect(orbit[1]![0]!).toBeCloseTo(0.7, 6)
    expect(orbit[1]![1]!).toBeCloseTo(0.9, 6)
    expect(orbit[1]![2]!).toBeCloseTo(0.2, 6)
  })

  it('returns the six-point orbit of a 3-bar axis at a general position', () => {
    const threeBar = op('rotoinversion', 'y, -x+y, -z', [
      [0, 1, 0],
      [-1, 1, 0],
      [0, 0, -1],
    ], [0, 0, 0])
    const orbit = operationOrbit(threeBar, [0.31, 0.17, 0.23])
    expect(orbit).toHaveLength(6)
    // All points are distinct.
    const keys = new Set(orbit.map((p) => p.map((v) => v.toFixed(6)).join(',')))
    expect(keys.size).toBe(6)
  })

  it('returns a short orbit for a point on the element', () => {
    const threeBar = op('rotoinversion', 'y, -x+y, -z', [
      [0, 1, 0],
      [-1, 1, 0],
      [0, 0, -1],
    ], [0, 0, 0])
    const orbit = operationOrbit(threeBar, [0, 0, 0.3])
    expect(orbit).toHaveLength(2)
    expect(orbit[1]![0]!).toBeCloseTo(0, 6)
    expect(orbit[1]![1]!).toBeCloseTo(0, 6)
    expect(orbit[1]![2]!).toBeCloseTo(0.7, 6)
  })
})

describe('buildSymmetryMotion', () => {
  const cubic: LatticeParams = { a: 1, b: 1, c: 1, alpha: 90, beta: 90, gamma: 90 }
  const hexagonal: LatticeParams = { a: 1, b: 1, c: 1.2, alpha: 90, beta: 90, gamma: 120 }
  const point: Vec3 = [0.3, 0.1, 0.2]

  function motionOf(operation: SymmetryOperation, params: LatticeParams) {
    const [element] = computeSymmetryElements([operation])
    expect(element).toBeDefined()
    return buildSymmetryMotion(element!, params)
  }

  function fullCartesian(operation: SymmetryOperation, p: Vec3, params: LatticeParams): Vec3 {
    const r = operation.rotation
    const frac: Vec3 = [
      r[0]![0]! * p[0]! + r[0]![1]! * p[1]! + r[0]![2]! * p[2]! + operation.translation[0]!,
      r[1]![0]! * p[0]! + r[1]![1]! * p[1]! + r[1]![2]! * p[2]! + operation.translation[1]!,
      r[2]![0]! * p[0]! + r[2]![1]! * p[1]! + r[2]![2]! * p[2]! + operation.translation[2]!,
    ]
    return fractionalToCartesian(frac, params)
  }

  function expectClose(actual: Vec3, expected: Vec3) {
    for (let i = 0; i < 3; i++) {
      expect(actual[i]).toBeCloseTo(expected[i]!, 5)
    }
  }

  it('starts at the atom and ends on the 2-fold image (cubic)', () => {
    const operation = op('rotation', '-x, -y, z', [
      [-1, 0, 0],
      [0, -1, 0],
      [0, 0, 1],
    ], [0, 0, 0])
    const motion = motionOf(operation, cubic)
    expectClose(motion.at(point, 0), fractionalToCartesian(point, cubic))
    expectClose(motion.at(point, 1), fullCartesian(operation, point, cubic))
    // Halfway through a 2-fold rotation the point has turned 90 degrees.
    const mid = motion.at(point, 0.5)
    expect(mid[2]!).toBeCloseTo(0.2, 5)
    expect(Math.hypot(mid[0]!, mid[1]!)).toBeCloseTo(Math.hypot(0.3, 0.1), 5)
  })

  it('ends on the 3-fold image in a hexagonal cell', () => {
    const operation = op('rotation', '-y, x-y, z', [
      [0, -1, 0],
      [1, -1, 0],
      [0, 0, 1],
    ], [0, 0, 0])
    const motion = motionOf(operation, hexagonal)
    const end = motion.at(point, 1)
    expect(end).toHaveLength(3)
    expectClose(end, fullCartesian(operation, point, hexagonal))
  })

  it('moves halfway along the axis of a 2_1 screw', () => {
    const operation = op('screw', '-x, -y, z+1/2', [
      [-1, 0, 0],
      [0, -1, 0],
      [0, 0, 1],
    ], [0, 0, 0.5])
    const motion = motionOf(operation, cubic)
    const mid = motion.at(point, 0.5)
    expect(mid[2]!).toBeCloseTo(0.45, 5)
    expectClose(motion.at(point, 1), fullCartesian(operation, point, cubic))
  })

  it('passes through the mirror plane at half progress', () => {
    const operation = op('mirror', 'x, -y, z', [
      [1, 0, 0],
      [0, -1, 0],
      [0, 0, 1],
    ], [0, 0, 0])
    const motion = motionOf(operation, cubic)
    const mid = motion.at(point, 0.5)
    expect(mid[1]!).toBeCloseTo(0, 5)
    expectClose(motion.at(point, 1), fullCartesian(operation, point, cubic))
  })

  it('ends on the glide image', () => {
    const operation = op('glide', 'x, -y, z+1/2', [
      [1, 0, 0],
      [0, -1, 0],
      [0, 0, 1],
    ], [0, 0, 0.5])
    const motion = motionOf(operation, cubic)
    const end = motion.at(point, 1)
    expect(end).toHaveLength(3)
    expectClose(end, fullCartesian(operation, point, cubic))
  })

  it('rotates then pulls through the center of a 4-bar axis', () => {
    const operation = op('rotoinversion', 'y, -x, -z', [
      [0, 1, 0],
      [-1, 0, 0],
      [0, 0, -1],
    ], [0, 0, 0])
    const motion = motionOf(operation, cubic)
    expectClose(motion.at(point, 0), fractionalToCartesian(point, cubic))
    // End of the rotation phase: still 0.2 above the center on the axis.
    const rotated = motion.at(point, 0.45)
    expect(rotated[2]!).toBeCloseTo(0.2, 5)
    expectClose(motion.at(point, 1), fullCartesian(operation, point, cubic))
  })
})
