import type { AtomSite, SpaceGroupData, WyckoffPosition } from '@/types/crystal'
import { dedupePositions, evaluateCoordinates, usedVariables, type CoordinateValues } from './coords'
import type { Vec3 } from './lattice'

/** Default element used for the virtual demo structure. */
export const DEFAULT_ELEMENT = 'X'

/** Generic variable values that avoid accidental special positions. */
const DEFAULT_VALUES: CoordinateValues = { x: 0.13, y: 0.27, z: 0.41 }

/** Pick concrete values for the free variables used by a Wyckoff position. */
export function valuesForPosition(position: WyckoffPosition): CoordinateValues {
  const used = usedVariables([position.representative])
  return {
    x: used.has('x') ? DEFAULT_VALUES.x : 0,
    y: used.has('y') ? DEFAULT_VALUES.y : 0,
    z: used.has('z') ? DEFAULT_VALUES.z : 0,
  }
}

/**
 * Generate all equivalent fractional positions for a Wyckoff position by
 * evaluating every coordinate expression and reducing to one unit cell.
 */
export function equivalentPositions(position: WyckoffPosition): Vec3[] {
  const values = valuesForPosition(position)
  const positions = position.coordinates.map((triple) => evaluateCoordinates(triple, values))
  return dedupePositions(positions)
}

/** Build the atom-site list for one Wyckoff position. */
export function atomsForPosition(
  data: SpaceGroupData,
  position: WyckoffPosition,
  element = DEFAULT_ELEMENT,
): AtomSite[] {
  return equivalentPositions(position).map((coords, index) => ({
    id: `${data.number}-${position.letter}-${index}`,
    label: `${element}${index + 1}`,
    element,
    wyckoffLetter: position.letter,
    multiplicity: position.multiplicity,
    siteSymmetry: position.siteSymmetry,
    fractionalCoords: coords,
    occupancy: 1,
  }))
}

/**
 * Generate atoms for a space group. When `wyckoffLetter` is omitted the
 * general position (the first, highest-multiplicity entry) is used.
 */
export function generateAtoms(
  data: SpaceGroupData,
  wyckoffLetter?: string,
  element = DEFAULT_ELEMENT,
): AtomSite[] {
  const position =
    data.wyckoffPositions.find((wp) => wp.letter === wyckoffLetter) ?? data.wyckoffPositions[0]
  if (!position) return []
  return atomsForPosition(data, position, element)
}
