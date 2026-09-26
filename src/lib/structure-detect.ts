import type { CrystalSystem, LatticeParams, SpaceGroupData, SymmetryOperation } from '@/types/crystal'
import { fractionalToCartesian } from './lattice'
import { applyOperation } from './custom-atoms'

/** A user-entered atom used for structure identification. */
export interface DetectAtom {
  element: string
  coords: [number, number, number]
}

const ANGLE_TOL_DEG = 0.5
const RELATIVE_LENGTH_TOL = 1e-3

/** Is the given crystal system metrically compatible with the cell? */
export function isMetricCompatible(system: CrystalSystem, p: LatticeParams): boolean {
  const right = (angle: number) => Math.abs(angle - 90) < ANGLE_TOL_DEG
  const eq = (a: number, b: number) => Math.abs(a - b) < Math.max(a, b) * RELATIVE_LENGTH_TOL + 1e-9
  switch (system) {
    case 'triclinic':
      return true
    case 'monoclinic':
      return right(p.alpha) && right(p.gamma)
    case 'orthorhombic':
      return right(p.alpha) && right(p.beta) && right(p.gamma)
    case 'tetragonal':
      return right(p.alpha) && right(p.beta) && right(p.gamma) && eq(p.a, p.b)
    case 'trigonal':
    case 'hexagonal':
      return right(p.alpha) && right(p.beta) && Math.abs(p.gamma - 120) < ANGLE_TOL_DEG && eq(p.a, p.b)
    case 'cubic':
      return right(p.alpha) && right(p.beta) && right(p.gamma) && eq(p.a, p.b) && eq(p.b, p.c)
  }
}

/** Wrap a fractional difference into [-0.5, 0.5) for minimum-image comparison. */
function wrapHalf(value: number): number {
  return value - Math.round(value)
}

/** Does this operation map every atom onto an atom of the same element? */
function operationPreserves(
  operation: SymmetryOperation,
  atoms: DetectAtom[],
  byElement: Map<string, DetectAtom[]>,
  params: LatticeParams,
  tolerance: number,
): boolean {
  for (const atom of atoms) {
    const target = applyOperation(operation, atom.coords)
    let matched = false
    for (const candidate of byElement.get(atom.element) ?? []) {
      const delta: [number, number, number] = [
        wrapHalf(target[0]! - candidate.coords[0]!),
        wrapHalf(target[1]! - candidate.coords[1]!),
        wrapHalf(target[2]! - candidate.coords[2]!),
      ]
      const cart = fractionalToCartesian(delta, params)
      if (Math.hypot(cart[0], cart[1], cart[2]) <= tolerance) {
        matched = true
        break
      }
    }
    if (!matched) return false
  }
  return true
}

/**
 * Identify the space group of a structure given its lattice and atom basis.
 * Every space group whose full set of symmetry operations maps the structure
 * onto itself is a candidate; the candidate with the most operations (the
 * maximal symmetry group) is returned. Returns null when no atom is given.
 * P1 (#1) always matches, so a valid structure never returns null.
 */
export function detectSpaceGroup(
  atoms: DetectAtom[],
  params: LatticeParams,
  groups: SpaceGroupData[],
  tolerance = 0.3,
): SpaceGroupData | null {
  if (!atoms.length) return null

  const byElement = new Map<string, DetectAtom[]>()
  for (const atom of atoms) {
    const list = byElement.get(atom.element) ?? []
    list.push(atom)
    byElement.set(atom.element, list)
  }

  let best: SpaceGroupData | null = null
  for (const group of groups) {
    if (!isMetricCompatible(group.crystalSystem, params)) continue
    // A group with no more operations than the current best cannot replace it.
    if (best && group.symmetryOperations.length <= best.symmetryOperations.length) continue
    const preserved = group.symmetryOperations.every((operation) =>
      operationPreserves(operation, atoms, byElement, params, tolerance),
    )
    if (preserved) best = group
  }
  return best
}
