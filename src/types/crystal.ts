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
}

export type ModelType = 'ball-stick' | 'space-filling' | 'wireframe'
export type BackgroundTheme = 'dark' | 'light'

export interface DisplaySettings {
  showCell: boolean
  showLabels: boolean
  showSymmetryElements: boolean
  showBonds: boolean
  atomRadiusScale: number
  modelType: ModelType
  background: BackgroundTheme
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  showCell: true,
  showLabels: false,
  showSymmetryElements: false,
  showBonds: true,
  atomRadiusScale: 0.5,
  modelType: 'ball-stick',
  background: 'dark',
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
