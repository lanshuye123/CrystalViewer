import type { LatticeParams } from '@/types/crystal'

const DEG_TO_RAD = Math.PI / 180

export type Vec3 = [number, number, number]

/**
 * Build the fractional -> cartesian transformation matrix M from lattice
 * parameters (see requirement doc §6.2):
 *
 *   M = | a   b·cosγ            c·cosβ                          |
 *       | 0   b·sinγ            c·(cosα - cosβ·cosγ)/sinγ        |
 *       | 0   0                 V/(a·b·sinγ)                     |
 */
export function latticeMatrix(params: LatticeParams): number[][] {
  const { a, b, c } = params
  const alpha = params.alpha * DEG_TO_RAD
  const beta = params.beta * DEG_TO_RAD
  const gamma = params.gamma * DEG_TO_RAD
  const cosAlpha = Math.cos(alpha)
  const cosBeta = Math.cos(beta)
  const cosGamma = Math.cos(gamma)
  const sinGamma = Math.sin(gamma)

  const volume =
    a * b * c * Math.sqrt(1 - cosAlpha ** 2 - cosBeta ** 2 - cosGamma ** 2 + 2 * cosAlpha * cosBeta * cosGamma)

  return [
    [a, b * cosGamma, c * cosBeta],
    [0, b * sinGamma, (c * (cosAlpha - cosBeta * cosGamma)) / sinGamma],
    [0, 0, volume / (a * b * sinGamma)],
  ]
}

export function fractionalToCartesian(frac: Vec3, params: LatticeParams): Vec3 {
  const m = latticeMatrix(params)
  const [x, y, z] = frac
  return [
    m[0]![0]! * x + m[0]![1]! * y + m[0]![2]! * z,
    m[1]![0]! * x + m[1]![1]! * y + m[1]![2]! * z,
    m[2]![0]! * x + m[2]![1]! * y + m[2]![2]! * z,
  ]
}

/** The eight cell corners in cartesian space, indexed by (i + 2j + 4k). */
export function cellCorners(params: LatticeParams): Vec3[] {
  const corners: Vec3[] = []
  for (let k = 0; k < 2; k++) {
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 2; i++) {
        corners.push(fractionalToCartesian([i, j, k], params))
      }
    }
  }
  return corners
}

/** Corner index pairs forming the 12 edges of the unit cell. */
export const CELL_EDGES: [number, number][] = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [0, 2],
  [1, 3],
  [4, 6],
  [5, 7],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
]

/** The three cell basis vectors (a, b, c) starting from the origin. */
export function cellAxes(params: LatticeParams): [Vec3, Vec3, Vec3] {
  return [
    fractionalToCartesian([1, 0, 0], params),
    fractionalToCartesian([0, 1, 0], params),
    fractionalToCartesian([0, 0, 1], params),
  ]
}
