import type { LatticeParams, SymmetryElementKind, SymmetryOperation } from '@/types/crystal'
import { fractionalToCartesian, type Vec3 } from '@/lib/lattice'

/**
 * A geometric symmetry element derived from a symmetry operation:
 * the mirror/glide plane or rotation/screw/rotoinversion axis that the
 * operation acts around, located at its true position inside the cell.
 */
export interface SymmetryElement {
  kind: SymmetryElementKind
  /** Rotation fold (2/3/4/6 for axes, 1 for planes). */
  fold: number
  /** Screw subscript p of an n_p screw axis (1..n-1). */
  screw?: number
  /** Fractional point on the axis / in the plane, wrapped into [-0.5, 0.5). */
  origin: Vec3
  /** Primitive integer fractional direction: axis direction or plane normal. */
  direction: Vec3
  /** In-plane glide translation (fractional) of a glide plane. */
  glide?: Vec3
  seitz: string
  /** Source operation, kept for symmetry animations. */
  operation: SymmetryOperation
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!]
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

function dot(a: Vec3, b: Vec3): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!
}

/** Wrap a fractional component into [-0.5, 0.5) without producing -0. */
function wrapFraction(value: number): number {
  return ((value % 1) + 1.5) % 1 - 0.5
}

/**
 * Find the primitive integer direction in the null space of an integer 3x3
 * matrix with rank 2, reduced by its gcd and canonicalized in sign.
 */
function primitiveDirection(matrix: number[][]): Vec3 | null {
  const candidates = [
    cross(matrix[0]! as Vec3, matrix[1]! as Vec3),
    cross(matrix[0]! as Vec3, matrix[2]! as Vec3),
    cross(matrix[1]! as Vec3, matrix[2]! as Vec3),
  ]
  let best = candidates[0]!
  for (const candidate of candidates) {
    if (dot(candidate, candidate) > dot(best, best)) best = candidate
  }
  if (dot(best, best) < 1e-9) return null
  const divisor = gcd(gcd(Math.abs(best[0]!), Math.abs(best[1]!)), Math.abs(best[2]!))
  // `value || 0` normalizes -0 (from multiplying 0 by negative entries) to 0.
  const direction: Vec3 = [
    (divisor > 1 ? best[0]! / divisor : best[0]!) || 0,
    (divisor > 1 ? best[1]! / divisor : best[1]!) || 0,
    (divisor > 1 ? best[2]! / divisor : best[2]!) || 0,
  ]
  for (const value of direction) {
    if (Math.abs(value) > 1e-9) {
      if (value < 0) return [0 - direction[0]!, 0 - direction[1]!, 0 - direction[2]!]
      break
    }
  }
  return direction
}

/** Fold order n from the rotation trace (trace = 1 + 2cos(2pi/n), negated for rotoinversions). */
function rotationFold(trace: number, inverted: boolean): number {
  const proper = inverted ? -trace : trace
  const cos = (proper - 1) / 2
  const angle = Math.acos(Math.min(1, Math.max(-1, cos)))
  if (angle < 1e-4) return 1
  const fold = Math.round((2 * Math.PI) / angle)
  return fold >= 2 && fold <= 8 ? fold : 1
}

/**
 * Solve the symmetric 3x3 system a·x = b by Gaussian elimination with partial
 * pivoting. Singular directions are treated as free variables set to zero, so
 * the result is the solution with the fewest nonzero components (for rank-2
 * systems this is the point on the axis/plane closest to the origin).
 */
function solveSymmetric(a: number[][], b: number[]): Vec3 | null {
  const m: number[][] = [
    [a[0]![0]!, a[0]![1]!, a[0]![2]!, b[0]!],
    [a[1]![0]!, a[1]![1]!, a[1]![2]!, b[1]!],
    [a[2]![0]!, a[2]![1]!, a[2]![2]!, b[2]!],
  ]
  const EPS = 1e-9
  for (let col = 0; col < 3; col++) {
    let pivot = -1
    let best = EPS
    for (let row = col; row < 3; row++) {
      if (Math.abs(m[row]![col]!) > best) {
        best = Math.abs(m[row]![col]!)
        pivot = row
      }
    }
    if (pivot < 0) continue
    if (pivot !== col) {
      const tmp = m[pivot]!
      m[pivot] = m[col]!
      m[col] = tmp
    }
    for (let row = col + 1; row < 3; row++) {
      const factor = m[row]![col]! / m[col]![col]!
      if (factor === 0) continue
      for (let k = col; k < 4; k++) m[row]![k]! -= factor * m[col]![k]!
    }
  }
  const x = [0, 0, 0]
  for (let row = 2; row >= 0; row--) {
    const diag = m[row]![row]!
    if (Math.abs(diag) < EPS) continue
    let sum = m[row]![3]!
    for (let col = row + 1; col < 3; col++) sum -= m[row]![col]! * x[col]!
    x[row] = sum / diag
  }
  return [x[0]!, x[1]!, x[2]!]
}

/**
 * Least-squares foot point of a symmetry element: the point on the axis or
 * plane, closest to the origin, satisfying (R - I)p = -t. For every element
 * kind the fixed locus obeys this equation (for rotoinversions the axis is
 * invariant as a set rather than pointwise).
 */
function leastSquaresFoot(rotation: number[][], translation: number[]): Vec3 | null {
  // A = R - I
  const a = rotation.map((row, i) => row.map((value, j) => value - (i === j ? 1 : 0)))
  const ata: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  const atb = [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let sum = 0
      for (let k = 0; k < 3; k++) sum += a[k]![i]! * a[k]![j]!
      ata[i]![j] = sum
    }
    let sum = 0
    for (let k = 0; k < 3; k++) sum += a[k]![i]! * -translation[k]!
    atb[i] = sum
  }
  return solveSymmetric(ata, atb)
}

/**
 * Derive the geometric symmetry elements (axes/planes at their true
 * fractional positions) from a space group's symmetry operations.
 * Operations acting on the same element are deduplicated.
 */
export function computeSymmetryElements(operations: SymmetryOperation[]): SymmetryElement[] {
  const elements: SymmetryElement[] = []
  const seen = new Set<string>()

  for (const operation of operations) {
    const kind = operation.type
    if (kind === 'identity' || kind === 'inversion') continue

    const isPlane = kind === 'mirror' || kind === 'glide'
    // Proper rotations leave their axis invariant: null(R - I) is the axis.
    // Mirrors and rotoinversions reverse the axis/normal: null(R + I).
    const shift = isPlane || kind === 'rotoinversion' ? 1 : -1
    const nullMatrix = operation.rotation.map((row, i) =>
      row.map((value, j) => value + (i === j ? shift : 0)),
    )
    const direction = primitiveDirection(nullMatrix)
    if (!direction) continue

    const trace = operation.rotation.reduce((sum, row, i) => sum + row[i]!, 0)
    const fold = isPlane ? 1 : rotationFold(trace, kind === 'rotoinversion')
    if (!isPlane && fold < 2) continue

    const foot = leastSquaresFoot(operation.rotation, operation.translation)
    if (!foot) continue
    const origin: Vec3 = [wrapFraction(foot[0]!), wrapFraction(foot[1]!), wrapFraction(foot[2]!)]
    const translation: Vec3 = [operation.translation[0]!, operation.translation[1]!, operation.translation[2]!]

    let screw: number | undefined
    if (kind === 'screw') {
      const axial = dot(translation, direction) / dot(direction, direction)
      const subscript = ((Math.round(fold * axial) % fold) + fold) % fold
      if (subscript > 0) screw = subscript
    }

    let glide: Vec3 | undefined
    if (kind === 'glide') {
      const axial = dot(translation, direction) / dot(direction, direction)
      const inPlane: Vec3 = [
        operation.translation[0]! - axial * direction[0]!,
        operation.translation[1]! - axial * direction[1]!,
        operation.translation[2]! - axial * direction[2]!,
      ]
      const wrapped: Vec3 = [wrapFraction(inPlane[0]!), wrapFraction(inPlane[1]!), wrapFraction(inPlane[2]!)]
      if (Math.max(...wrapped.map((value) => Math.abs(value))) > 0.01) glide = wrapped
    }

    const key = [
      kind,
      fold,
      screw ?? '-',
      glide ? glide.map((value) => value.toFixed(3)).join(',') : '-',
      direction.map((value) => value.toFixed(3)).join(','),
      origin.map((value) => value.toFixed(3)).join(','),
    ].join('|')
    if (seen.has(key)) continue
    seen.add(key)

    elements.push({ kind, fold, screw, origin, direction, glide, seitz: operation.seitz, operation })
  }

  return elements
}

function vAdd(a: Vec3, b: Vec3): Vec3 {
  return [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!]
}

function vSub(a: Vec3, b: Vec3): Vec3 {
  return [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!]
}

function vScale(a: Vec3, k: number): Vec3 {
  return [a[0]! * k, a[1]! * k, a[2]! * k]
}

function vLerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t]
}

function vDist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!)
}

/** Rodrigues rotation of point p around the axis through o with unit direction d. */
function rotateAroundAxis(p: Vec3, o: Vec3, d: Vec3, angle: number): Vec3 {
  const v = vSub(p, o)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const c = cross(d, v)
  const dv = dot(d, v)
  const k = 1 - cos
  return [
    o[0]! + v[0]! * cos + c[0]! * sin + d[0]! * dv * k,
    o[1]! + v[1]! * cos + c[1]! * sin + d[1]! * dv * k,
    o[2]! + v[2]! * cos + c[2]! * sin + d[2]! * dv * k,
  ]
}

/** Fractional image of a point under the full Seitz operation. */
function applySeitz(operation: SymmetryOperation, p: Vec3): Vec3 {
  const r = operation.rotation
  return [
    r[0]![0]! * p[0]! + r[0]![1]! * p[1]! + r[0]![2]! * p[2]! + operation.translation[0]!,
    r[1]![0]! * p[0]! + r[1]![1]! * p[1]! + r[1]![2]! * p[2]! + operation.translation[1]!,
    r[2]![0]! * p[0]! + r[2]![1]! * p[1]! + r[2]![2]! * p[2]! + operation.translation[2]!,
  ]
}

function mod1(value: number): number {
  const r = ((value % 1) + 1) % 1
  return r === 1 ? 0 : r
}

/** True when two fractional points coincide modulo lattice translations. */
export function sameFractionalSite(a: Vec3, b: Vec3): boolean {
  for (let i = 0; i < 3; i++) {
    const d = Math.abs(a[i]! - b[i]!)
    if (Math.min(d, 1 - d) > 1e-6) return false
  }
  return true
}

/**
 * Orbit of a fractional point under repeated application of an operation:
 * the equivalent positions generated from the seed, closing when the seed
 * is reached again.
 */
export function operationOrbit(operation: SymmetryOperation, seed: Vec3, maxSteps = 48): Vec3[] {
  const start: Vec3 = [mod1(seed[0]!), mod1(seed[1]!), mod1(seed[2]!)]
  const points: Vec3[] = [start]
  let p = start
  for (let i = 0; i < maxSteps; i++) {
    p = applySeitz(operation, p)
    const q: Vec3 = [mod1(p[0]!), mod1(p[1]!), mod1(p[2]!)]
    if (sameFractionalSite(q, start)) break
    points.push(q)
  }
  return points
}

/** A continuous symmetry transformation parameterized by progress t in [0, 1]. */
export interface SymmetryMotion {
  /** Cartesian image of a fractional point at progress t (t = 1 is the full operation). */
  at(point: Vec3, t: number): Vec3
}

/** An integer vector least aligned with the (integer fractional) direction. */
function perpendicularFractional(direction: Vec3): Vec3 {
  const candidates: Vec3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
  let best = candidates[0]!
  let bestDot = Infinity
  for (const candidate of candidates) {
    const value = Math.abs(dot(candidate, direction))
    if (value < bestDot) {
      bestDot = value
      best = candidate
    }
  }
  return best
}

/**
 * Build the continuous motion that visualizes an element acting on an atom:
 * rotation/screw axes rotate around the axis (screws also translate along
 * it), mirror/glide planes interpolate straight to the image, and
 * rotoinversion axes rotate first and then pull through the center.
 */
export function buildSymmetryMotion(element: SymmetryElement, params: LatticeParams): SymmetryMotion {
  const op = element.operation
  const toCart = (v: Vec3): Vec3 => fractionalToCartesian(v, params)
  const full = (p: Vec3): Vec3 => toCart(applySeitz(op, p))

  if (element.kind === 'mirror' || element.kind === 'glide') {
    return { at: (p, t) => vLerp(toCart(p), full(p), t) }
  }

  const o = toCart(element.origin)
  const dRaw = toCart(element.direction)
  const dLen = Math.hypot(dRaw[0]!, dRaw[1]!, dRaw[2]!) || 1
  const d: Vec3 = [dRaw[0]! / dLen, dRaw[1]! / dLen, dRaw[2]! / dLen]
  const angle = (2 * Math.PI) / element.fold
  // Screws translate along the axis; pure rotations have no such component.
  const tAxial = vScale(d, dot(toCart(op.translation as Vec3), d))

  // Detect the handedness of the rotation part with a probe point off the axis.
  const e = perpendicularFractional(element.direction)
  const probe: Vec3 = [
    element.origin[0]! + e[0]! * 0.137,
    element.origin[1]! + e[1]! * 0.137,
    element.origin[2]! + e[2]! * 0.137,
  ]
  const target = full(probe)
  const plus = vAdd(rotateAroundAxis(toCart(probe), o, d, angle), tAxial)
  const minus = vAdd(rotateAroundAxis(toCart(probe), o, d, -angle), tAxial)
  let sign = 1
  if (element.kind === 'rotoinversion') {
    const invert = (x: Vec3): Vec3 => vSub(vScale(o, 2), x)
    sign = vDist(invert(plus), target) <= vDist(invert(minus), target) ? 1 : -1
  } else {
    sign = vDist(plus, target) <= vDist(minus, target) ? 1 : -1
  }

  if (element.kind === 'rotoinversion') {
    return {
      at: (p, t) => {
        if (t < 0.45) {
          return rotateAroundAxis(toCart(p), o, d, sign * angle * (t / 0.45))
        }
        const rotated = rotateAroundAxis(toCart(p), o, d, sign * angle)
        return vLerp(rotated, full(p), (t - 0.45) / 0.55)
      },
    }
  }

  return {
    at: (p, t) => vAdd(rotateAroundAxis(toCart(p), o, d, sign * angle * t), vScale(tAxial, t)),
  }
}
