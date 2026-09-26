import type { AtomSite, SpaceGroupData, SymmetryOperation } from '@/types/crystal'

/** One user-defined atom: element plus fractional coordinates. */
export interface CustomAtomInput {
  id: string
  element: string
  coords: [number, number, number]
}

export interface CustomAtomSettings {
  showCustomAtoms: boolean
  /** Apply space-group symmetry to generate equivalent sites. */
  customApplySymmetry: boolean
  /** Show the atoms generated from the selected Wyckoff position. */
  showWyckoffAtoms: boolean
}

export const DEFAULT_CUSTOM_ATOM_SETTINGS: CustomAtomSettings = {
  showCustomAtoms: true,
  customApplySymmetry: true,
  showWyckoffAtoms: true,
}

export interface CustomAtomState {
  inputs: CustomAtomInput[]
  settings: CustomAtomSettings
}

const STORAGE_KEY = 'crystalviewer.custom-atoms'

/** Wrap a fractional coordinate into [0, 1). */
function wrap(value: number): number {
  const wrapped = value % 1
  return wrapped < 0 ? wrapped + 1 : wrapped
}

/** Snap values within epsilon of 1 down to 0 so equivalent sites dedupe. */
function snap(value: number, epsilon = 1e-6): number {
  return Math.abs(value - 1) < epsilon || Math.abs(value) < epsilon ? 0 : value
}

function positionKey(coords: [number, number, number]): string {
  return coords.map((value) => Math.round(snap(wrap(value)) * 1e6)).join(',')
}

/** Apply a symmetry operation (rotation + translation) to fractional coords. */
export function applyOperation(
  operation: SymmetryOperation,
  coords: [number, number, number],
): [number, number, number] {
  const rotation = operation.rotation
  const translation = operation.translation
  const out: [number, number, number] = [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    out[i] = wrap(
      rotation[i]![0]! * coords[0]! + rotation[i]![1]! * coords[1]! + rotation[i]![2]! * coords[2]! + translation[i]!,
    )
  }
  return out
}

/** All distinct equivalent positions for one input under the given operations. */
export function equivalentSites(
  coords: [number, number, number],
  operations: SymmetryOperation[],
): [number, number, number][] {
  const seen = new Set<string>()
  const result: [number, number, number][] = []
  for (const operation of operations) {
    const site = applyOperation(operation, coords)
    const key = positionKey(site)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(site)
  }
  return result
}

/**
 * Expand user-defined atoms into renderable atom sites. When `applySymmetry`
 * is enabled and a space group is loaded, every input generates its full set
 * of symmetry-equivalent positions inside the unit cell.
 */
export function expandCustomAtoms(
  group: SpaceGroupData | null,
  inputs: CustomAtomInput[],
  applySymmetry: boolean,
): AtomSite[] {
  return inputs.flatMap((input) => {
    let sites: [number, number, number][]
    if (group && applySymmetry) {
      sites = equivalentSites(input.coords, group.symmetryOperations)
    } else {
      sites = [[wrap(input.coords[0]!), wrap(input.coords[1]!), wrap(input.coords[2]!)]]
    }

    return sites.map((coords, index) => ({
      id: `${input.id}-${index}`,
      label: `${input.element}${index + 1}`,
      element: input.element,
      wyckoffLetter: '',
      multiplicity: sites.length,
      siteSymmetry: '',
      fractionalCoords: coords,
      occupancy: 1,
      isCustom: true,
      sourceId: input.id,
    }))
  })
}

/** Load persisted custom-atom state; falls back to defaults on any error. */
export function loadCustomAtomState(): CustomAtomState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { inputs: [], settings: { ...DEFAULT_CUSTOM_ATOM_SETTINGS } }
    const parsed = JSON.parse(raw) as Partial<CustomAtomState>
    const inputs = Array.isArray(parsed.inputs)
      ? parsed.inputs.filter(
          (input): input is CustomAtomInput =>
            Boolean(input) &&
            typeof input.id === 'string' &&
            typeof input.element === 'string' &&
            Array.isArray(input.coords) &&
            input.coords.length === 3 &&
            input.coords.every((value) => typeof value === 'number' && Number.isFinite(value)),
        )
      : []
    const settings = { ...DEFAULT_CUSTOM_ATOM_SETTINGS, ...parsed.settings }
    return { inputs, settings }
  } catch {
    return { inputs: [], settings: { ...DEFAULT_CUSTOM_ATOM_SETTINGS } }
  }
}

/** Persist custom-atom state; silently ignores storage failures. */
export function saveCustomAtomState(state: CustomAtomState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage unavailable — custom atoms simply do not persist.
  }
}
