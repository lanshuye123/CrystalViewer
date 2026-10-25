export type CrystalSystem =
  | 'triclinic'
  | 'monoclinic'
  | 'orthorhombic'
  | 'tetragonal'
  | 'trigonal'
  | 'hexagonal'
  | 'cubic'

export interface LatticeParams {
  a: number
  b: number
  c: number
  alpha: number
  beta: number
  gamma: number
}

export type OperationType =
  | 'identity'
  | 'rotation'
  | 'screw'
  | 'mirror'
  | 'glide'
  | 'inversion'
  | 'rotoinversion'

/** Symmetry element kinds that can be rendered in the 3D view. */
export type SymmetryElementKind = Exclude<OperationType, 'identity' | 'inversion'>

export interface SymmetryOperation {
  /** Coordinate triple, e.g. "-x+1/2, -y, z+1/2". */
  seitz: string
  /** Integer 3x3 rotation matrix (row-major). */
  rotation: number[][]
  /** Fractional translation vector, components in [0, 1). */
  translation: number[]
  type: OperationType
}

export interface WyckoffPosition {
  letter: string
  multiplicity: number
  siteSymmetry: string
  /** Representative coordinate expression, e.g. "x, y, z". */
  representative: string
  /** All equivalent coordinate expressions for this position. */
  coordinates: string[]
}

export interface SpaceGroupData {
  number: number
  symbolHM: string
  symbolHall: string
  crystalSystem: CrystalSystem
  latticeType: string
  pointGroup: string
  latticeParams: LatticeParams
  symmetryOperations: SymmetryOperation[]
  wyckoffPositions: WyckoffPosition[]
}

export interface SpaceGroupIndexEntry {
  number: number
  symbol: string
  crystalSystem: CrystalSystem
  pointGroup: string
  latticeType: string
}

export interface AtomSite {
  id: string
  label: string
  element: string
  wyckoffLetter: string
  multiplicity: number
  siteSymmetry: string
  fractionalCoords: [number, number, number]
  occupancy: number
  uIso?: number
  /** True for atoms created from user input (custom atom panel). */
  isCustom?: boolean
  /** Id of the originating custom-atom input, if any. */
  sourceId?: string
}

export type ModelType = 'ball-stick' | 'atoms-only' | 'space-filling' | 'wireframe'
export type BackgroundTheme = 'dark' | 'light'

export interface DisplaySettings {
  showCell: boolean
  showLabels: boolean
  showSymmetryElements: boolean
  showBonds: boolean
  atomRadiusScale: number
  modelType: ModelType
  background: BackgroundTheme
  /**
   * Number of unit cells rendered along each axis (1, 2 or 3). A supercell
   * spreads atoms across multiple cells so symmetry orbits and bond networks
   * are visible at a glance.
   */
  superCell: 1 | 2 | 3
  /** User-adjustable color per symmetry element kind (hex string). */
  symmetryColors: Record<SymmetryElementKind, string>
  /** Symmetry element kinds currently hidden from the 3D view. */
  hiddenSymmetryElements: SymmetryElementKind[]
  /**
   * Opacity of the symmetry helper graphics. They are guides, not the subject:
   * keep this low so atoms stay readable.
   */
  symmetryOpacity: number
  /**
   * Distance culling: only elements whose origin lies within this radius
   * (in cell-size units, measured from the cell centre) are drawn. 0 = no limit.
   */
  symmetryRadius: number
  /** X-ray mode: everything translucent so buried elements stay visible. */
  xrayMode: boolean
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  showCell: true,
  showLabels: false,
  showSymmetryElements: false,
  showBonds: true,
  atomRadiusScale: 0.5,
  modelType: 'ball-stick',
  background: 'dark',
  superCell: 2,
  symmetryColors: {
    mirror: '#22c55e',
    glide: '#06b6d4',
    rotation: '#f59e0b',
    screw: '#f97316',
    rotoinversion: '#a855f7',
  },
  hiddenSymmetryElements: [],
  symmetryOpacity: 0.28,
  symmetryRadius: 0,
  xrayMode: false,
}

export const CRYSTAL_SYSTEM_LABELS: Record<CrystalSystem, string> = {
  triclinic: '三斜',
  monoclinic: '单斜',
  orthorhombic: '正交',
  tetragonal: '四方',
  trigonal: '三方',
  hexagonal: '六方',
  cubic: '立方',
}

export const OPERATION_TYPE_LABELS: Record<OperationType, string> = {
  identity: '恒等',
  rotation: '旋转轴',
  screw: '螺旋轴',
  mirror: '镜面',
  glide: '滑移面',
  inversion: '反演',
  rotoinversion: '旋转反演',
}

export const CRYSTAL_SYSTEMS: CrystalSystem[] = [
  'triclinic',
  'monoclinic',
  'orthorhombic',
  'tetragonal',
  'trigonal',
  'hexagonal',
  'cubic',
]
