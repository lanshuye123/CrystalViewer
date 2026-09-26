import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyOperation,
  equivalentSites,
  expandCustomAtoms,
  loadCustomAtomState,
  saveCustomAtomState,
  type CustomAtomInput,
} from '@/lib/custom-atoms'
import type { SpaceGroupData, SymmetryOperation } from '@/types/crystal'

const IDENTITY: SymmetryOperation = {
  seitz: 'x, y, z',
  rotation: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  translation: [0, 0, 0],
  type: 'identity',
}

const INVERSION: SymmetryOperation = {
  seitz: '-x, -y, -z',
  rotation: [
    [-1, 0, 0],
    [0, -1, 0],
    [0, 0, -1],
  ],
  translation: [0, 0, 0],
  type: 'inversion',
}

const GROUP: SpaceGroupData = {
  number: 2,
  symbolHM: 'P-1',
  symbolHall: '-P 1',
  crystalSystem: 'triclinic',
  latticeType: 'P',
  pointGroup: '-1',
  latticeParams: { a: 1, b: 1, c: 1, alpha: 90, beta: 90, gamma: 90 },
  symmetryOperations: [IDENTITY, INVERSION],
  wyckoffPositions: [],
}

function input(coords: [number, number, number], element = 'Si'): CustomAtomInput {
  return { id: 'ca-1', element, coords }
}

describe('applyOperation', () => {
  it('applies rotation and translation with wrapping', () => {
    const glide: SymmetryOperation = {
      seitz: '-x+1/2, y, z',
      rotation: [
        [-1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      translation: [0.5, 0, 0],
      type: 'glide',
    }
    expect(applyOperation(glide, [0.25, 0.3, 0.4])).toEqual([0.25, 0.3, 0.4])
    expect(applyOperation(glide, [0, 0, 0])).toEqual([0.5, 0, 0])
  })

  it('wraps negative coordinates into [0, 1)', () => {
    expect(applyOperation(INVERSION, [0.25, 0, 0])).toEqual([0.75, 0, 0])
  })
})

describe('equivalentSites', () => {
  it('generates and dedupes equivalent positions', () => {
    const sites = equivalentSites([0.25, 0.25, 0.25], GROUP.symmetryOperations)
    expect(sites).toHaveLength(2)
  })

  it('collapses sites on symmetry elements', () => {
    // The inversion center maps to itself.
    const sites = equivalentSites([0, 0, 0], GROUP.symmetryOperations)
    expect(sites).toHaveLength(1)
  })

  it('treats coordinates near 1 as equal to 0', () => {
    const mirror: SymmetryOperation = {
      seitz: 'x, y, -z',
      rotation: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, -1],
      ],
      translation: [0, 0, 0],
      type: 'mirror',
    }
    // z = 1e-9 mirrors to ~1 which must dedupe against 0.
    const sites = equivalentSites([0.1, 0.1, 1e-9], [IDENTITY, mirror])
    expect(sites).toHaveLength(1)
  })
})

describe('expandCustomAtoms', () => {
  it('expands inputs by symmetry and marks them custom', () => {
    const atoms = expandCustomAtoms(GROUP, [input([0.2, 0.2, 0.2])], true)
    expect(atoms).toHaveLength(2)
    expect(atoms.every((atom) => atom.isCustom && atom.sourceId === 'ca-1')).toBe(true)
    expect(atoms.every((atom) => atom.element === 'Si')).toBe(true)
  })

  it('returns a single wrapped site when symmetry is disabled', () => {
    const atoms = expandCustomAtoms(GROUP, [input([0.2, 0.2, 0.2])], false)
    expect(atoms).toHaveLength(1)
    expect(atoms[0]!.fractionalCoords).toEqual([0.2, 0.2, 0.2])
  })

  it('works without a space group', () => {
    const atoms = expandCustomAtoms(null, [input([1.2, -0.3, 0.5])], true)
    expect(atoms).toHaveLength(1)
    const [x, y, z] = atoms[0]!.fractionalCoords
    expect(x).toBeCloseTo(0.2, 10)
    expect(y).toBeCloseTo(0.7, 10)
    expect(z).toBe(0.5)
  })
})

describe('custom-atom storage', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('round-trips inputs and settings', () => {
    saveCustomAtomState({
      inputs: [input([0.1, 0.2, 0.3], 'Fe')],
      settings: { showCustomAtoms: true, customApplySymmetry: false, showWyckoffAtoms: false },
    })
    const state = loadCustomAtomState()
    expect(state.inputs).toHaveLength(1)
    expect(state.inputs[0]).toMatchObject({ element: 'Fe', coords: [0.1, 0.2, 0.3] })
    expect(state.settings.customApplySymmetry).toBe(false)
    expect(state.settings.showWyckoffAtoms).toBe(false)
  })

  it('drops malformed inputs and falls back to defaults', () => {
    localStorage.setItem(
      'crystalviewer.custom-atoms',
      JSON.stringify({ inputs: [{ id: 'x' }, { id: 'y', element: 'Si', coords: [0, 0] }, null] }),
    )
    const state = loadCustomAtomState()
    expect(state.inputs).toHaveLength(0)
    expect(state.settings.showCustomAtoms).toBe(true)
  })

  it('returns defaults for corrupted payloads', () => {
    localStorage.setItem('crystalviewer.custom-atoms', '{oops')
    expect(loadCustomAtomState().inputs).toHaveLength(0)
  })
})
