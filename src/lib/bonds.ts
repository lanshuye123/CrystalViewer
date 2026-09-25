import type { AtomSite, LatticeParams } from '@/types/crystal'
import { fractionalToCartesian, type Vec3 } from './lattice'
import { covalentRadius } from './elements'

export interface BondOptions {
  /** Multiplier applied to the summed covalent radii. */
  tolerance?: number
  /** Skip pairs closer than this distance (Å) — near-degenerate sites. */
  minDistance?: number
}

/** A bond between atom `i` and the periodic image of atom `j` at `j + offset`. */
export interface Bond {
  i: number
  j: number
  offset: Vec3
  /** Bond length in Å (cartesian). */
  length: number
}

/** A periodic replica of an atom that must be rendered so bonds stay connected. */
export interface NeighborReplica {
  /** Index into the atom array this replica derives from. */
  atom: number
  offset: Vec3
}

export interface BondResult {
  bonds: Bond[]
  replicas: NeighborReplica[]
}

const OFFSETS: Vec3[] = []
for (let x = -1; x <= 1; x++) {
  for (let y = -1; y <= 1; y++) {
    for (let z = -1; z <= 1; z++) {
      OFFSETS.push([x, y, z])
    }
  }
}

/**
 * Compute bonds between atoms using the periodic minimum-image convention.
 * Every atom pair is tested against the 27 neighbouring cell images, so bonds
 * crossing the unit-cell boundary are detected. Bonds from an atom to its own
 * periodic images are included as well.
 */
export function computeBonds(
  atoms: AtomSite[],
  params: LatticeParams,
  options: BondOptions = {},
): BondResult {
  const tolerance = options.tolerance ?? 1.15
  const minDistance = options.minDistance ?? 0.4

  const bonds: Bond[] = []
  const replicaKeys = new Set<string>()
  const replicas: NeighborReplica[] = []

  const positions = atoms.map((atom) => atom.fractionalCoords)
  const radii = atoms.map((atom) => covalentRadius(atom.element))

  for (let i = 0; i < atoms.length; i++) {
    for (let j = i; j < atoms.length; j++) {
      const cutoff = (radii[i]! + radii[j]!) * tolerance
      for (const offset of OFFSETS) {
        // Skip the degenerate self pair (atom with its own image at offset 0).
        if (i === j && offset[0] === 0 && offset[1] === 0 && offset[2] === 0) continue

        const [ox, oy, oz] = offset
        const delta: Vec3 = [
          positions[i]![0] - positions[j]![0] - ox,
          positions[i]![1] - positions[j]![1] - oy,
          positions[i]![2] - positions[j]![2] - oz,
        ]
        const cart = fractionalToCartesian(delta, params)
        const length = Math.hypot(cart[0], cart[1], cart[2])
        if (length < minDistance || length > cutoff) continue

        bonds.push({ i, j, offset, length })

        // Bond endpoints outside the base cell need visible replicas.
        if (offset[0] !== 0 || offset[1] !== 0 || offset[2] !== 0) {
          addReplica(j, offset)
          // `0 - v` avoids producing -0 for zero components.
          addReplica(i, [0 - ox, 0 - oy, 0 - oz])
        }
      }
    }
  }

  function addReplica(atom: number, offset: Vec3) {
    const key = `${atom}:${offset.join(',')}`
    if (replicaKeys.has(key)) return
    replicaKeys.add(key)
    replicas.push({ atom, offset })
  }

  return { bonds, replicas }
}
