<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Close, RefreshRight, VideoPause, VideoPlay } from '@element-plus/icons-vue'
import { useCrystalStore } from '@/stores/crystal'
import {
  CELL_EDGES,
  cellAxes,
  cellCorners,
  fractionalToCartesian,
  type Vec3,
} from '@/lib/lattice'
import { elementStyle } from '@/lib/elements'
import { computeBonds, type BondResult, type NeighborReplica } from '@/lib/bonds'
import {
  buildSymmetryMotion,
  computeSymmetryElements,
  operationOrbit,
  sameFractionalSite,
  type SymmetryElement,
  type SymmetryMotion,
} from '@/lib/symmetry-elements'
import { type AtomSite, type LatticeParams, type SymmetryElementKind } from '@/types/crystal'

const store = useCrystalStore()
const container = ref<HTMLDivElement | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
const content = new THREE.Group()
let atomMeshes: THREE.InstancedMesh[] = []
let atomInstanceMaps: AtomSite[][] = []
let frameId = 0
let resizeObserver: ResizeObserver | null = null
let pointerStart: { x: number; y: number } | null = null
let lastFitRadius = 10

const autoRotate = ref(false)
const picked = ref<AtomSite | null>(null)
const symmetryCounts = ref<Partial<Record<SymmetryElementKind, number>>>({})
let fitSignature = ''

const selectedElement = ref<SymmetryElement | null>(null)
const demoPlaying = ref(false)
const demoOrbitSize = ref(0)
let selectedRoot: THREE.Object3D | null = null
let symmetryGroup: THREE.Group | null = null

const selectedSymbol = computed(() => {
  const element = selectedElement.value
  if (!element) return ''
  if (element.kind === 'mirror') return 'm'
  if (element.kind === 'glide') return 'g'
  return axisLabel(element)
})
const selectedKindLabel = computed(() =>
  selectedElement.value ? KIND_LABELS[selectedElement.value.kind] : '',
)

const symmetryLegend = computed(() =>
  SYMMETRY_KIND_ORDER.filter((kind) => (symmetryCounts.value[kind] ?? 0) > 0).map((kind) => ({
    kind,
    label: KIND_LABELS[kind],
    count: symmetryCounts.value[kind] ?? 0,
    color: store.displaySettings.symmetryColors[kind],
    hidden: store.displaySettings.hiddenSymmetryElements.includes(kind),
  })),
)

const DARK_BACKGROUND = new THREE.Color('#111827')
const LIGHT_BACKGROUND = new THREE.Color('#eef2f7')
const AXIS_COLORS = [0xef4444, 0x22c55e, 0x3b82f6]
const PRESET_COLORS = [
  '#22c55e',
  '#06b6d4',
  '#f59e0b',
  '#f97316',
  '#a855f7',
  '#ef4444',
  '#3b82f6',
  '#eab308',
]

// --- Symmetry generation demo ---
const DEMO_STATION = 0.95
const DEMO_GAP = 0.35
const DEMO_CYCLE_PAUSE = 1.5
const DEMO_HIGHLIGHT = new THREE.Color('#6d8bff')
// Generic fallback seeds (guaranteed off every symmetry element) used when no
// displayed atom can drive the animation.
const GENERIC_SEEDS: Vec3[] = [
  [0.31, 0.17, 0.23],
  [0.13, 0.29, 0.37],
  [0.29, 0.11, 0.07],
]

interface DemoState {
  element: SymmetryElement
  motion: SymmetryMotion
  orbit: Vec3[]
  matches: ({ mesh: THREE.InstancedMesh; id: number } | null)[]
  ghost: THREE.Mesh
  trail: THREE.Vector3[]
  trailLine: THREE.Line
  litAt: number[]
  elapsed: number
  prevPhase: number
  lit: number
}

let demo: DemoState | null = null
let lastFrameTime = 0
let lastSymmetryElements: SymmetryElement[] = []

// --- Smooth camera moves ---
interface CameraTween {
  fromPos: THREE.Vector3
  toPos: THREE.Vector3
  fromTarget: THREE.Vector3
  toTarget: THREE.Vector3
  t: number
  duration: number
}

let cameraTween: CameraTween | null = null

function tweenCameraTo(position: THREE.Vector3, target: THREE.Vector3, duration = 0.9) {
  if (!camera || !controls) return
  cameraTween = {
    fromPos: camera.position.clone(),
    toPos: position.clone(),
    fromTarget: controls.target.clone(),
    toTarget: target.clone(),
    t: 0,
    duration,
  }
}

function updateCameraTween(dt: number) {
  if (!cameraTween || !camera || !controls) return
  cameraTween.t += dt
  const raw = Math.min(cameraTween.t / cameraTween.duration, 1)
  const k = easeInOut(raw)
  camera.position.lerpVectors(cameraTween.fromPos, cameraTween.toPos, k)
  controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, k)
  if (raw >= 1) cameraTween = null
}

/** World-space position of an element's axis/plane center. */
function elementWorldCenter(element: SymmetryElement): THREE.Vector3 {
  const params = store.currentSpaceGroup!.latticeParams
  return toVector(fractionalToCartesian(element.origin, params)).add(content.position)
}

/** Aim the camera straight at one element: face-on for planes, side-on for axes. */
function frameElement(element: SymmetryElement) {
  if (!camera || !controls) return
  const params = store.currentSpaceGroup!.latticeParams
  const dir = toVector(fractionalToCartesian(element.direction, params)).normalize()
  const isPlane = element.kind === 'mirror' || element.kind === 'glide'

  let view: THREE.Vector3
  if (isPlane) {
    // Face the plane, with a slight tilt so it keeps some depth.
    const [u] = orthonormalBasis(dir)
    view = dir.clone().addScaledVector(u!, 0.35).normalize()
  } else {
    // Look perpendicular to the axis, keeping as much of the user's current
    // side of view as possible.
    const current = camera.position.clone().sub(controls.target)
    let perp = current.addScaledVector(dir, -current.dot(dir))
    if (perp.length() < 0.1) perp = orthonormalBasis(dir)[0]!.clone()
    view = perp.normalize().addScaledVector(dir, 0.3).normalize()
  }

  const target = elementWorldCenter(element)
  const distance = Math.max(camera.position.distanceTo(controls.target), lastFitRadius * 0.9)
  tweenCameraTo(target.clone().addScaledVector(view, distance), target)
}

/** Orient the camera so the cell's symmetry elements are clearly in view. */
function frameAllSymmetry() {
  if (!camera || !controls || !lastSymmetryElements.length) return
  const params = store.currentSpaceGroup!.latticeParams
  const axes: THREE.Vector3[] = []
  const planeNormals: THREE.Vector3[] = []
  for (const element of lastSymmetryElements) {
    const d = toVector(fractionalToCartesian(element.direction, params)).normalize()
    if (element.kind === 'mirror' || element.kind === 'glide') planeNormals.push(d)
    else axes.push(d)
  }

  const sum = (vectors: THREE.Vector3[]): THREE.Vector3 | null => {
    const total = new THREE.Vector3()
    for (const v of vectors) total.add(v)
    return total.length() > 0.2 ? total.normalize() : null
  }

  const axis = sum(axes)
  const normal = sum(planeNormals)
  let view: THREE.Vector3
  if (axis) {
    // Oblique view: the axis stays visible as a line while planes show faces.
    let perp: THREE.Vector3
    if (normal) {
      // Prefer the plane normal least aligned with the axis.
      perp = planeNormals.reduce((best, n) =>
        Math.abs(n.dot(axis)) < Math.abs(best.dot(axis)) ? n : best,
      )
    } else {
      const current = camera.position.clone().sub(controls.target)
      perp = current.addScaledVector(axis, -current.dot(axis))
      if (perp.length() < 0.1) perp = orthonormalBasis(axis)[0]!.clone()
      perp.normalize()
    }
    view = perp.clone().addScaledVector(axis, 0.45).normalize()
  } else if (normal) {
    const [u] = orthonormalBasis(normal)
    view = normal.clone().addScaledVector(u!, 0.4).normalize()
  } else {
    return
  }

  const target = new THREE.Vector3(0, 0, 0)
  const distance = Math.max(lastFitRadius, camera.position.distanceTo(controls.target) * 0.8)
  tweenCameraTo(target.clone().addScaledVector(view, distance), target)
}

function toVector(coords: Vec3): THREE.Vector3 {
  return new THREE.Vector3(coords[0], coords[1], coords[2])
}

function makeTextSprite(text: string, color = '#e5e7eb'): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 64
  const context = canvas.getContext('2d')!
  context.font = 'bold 44px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  // Dark outline keeps labels readable on both light and dark backgrounds.
  context.lineWidth = 9
  context.lineJoin = 'round'
  context.strokeStyle = 'rgba(17, 24, 39, 0.85)'
  context.strokeText(text, canvas.width / 2, canvas.height / 2)
  context.fillStyle = color
  context.fillText(text, canvas.width / 2, canvas.height / 2)
  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(0.9, 0.45, 1)
  return sprite
}

function buildCell(params: LatticeParams): THREE.Group {
  const group = new THREE.Group()
  const corners = cellCorners(params).map(toVector)
  const edgePoints: THREE.Vector3[] = []
  for (const [start, end] of CELL_EDGES) {
    edgePoints.push(corners[start]!, corners[end]!)
  }
  const edgeGeometry = new THREE.BufferGeometry().setFromPoints(edgePoints)
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xcbd5e1, transparent: true, opacity: 1 })
  group.add(new THREE.LineSegments(edgeGeometry, edgeMaterial))

  const axes = cellAxes(params)
  const maxAxisLength = Math.max(...axes.map((axis) => Math.hypot(axis[0], axis[1], axis[2])))
  const shaftRadius = maxAxisLength * 0.016
  const headRadius = shaftRadius * 2.2
  const headLength = maxAxisLength * 0.07
  axes.forEach((axis, index) => {
    const direction = toVector(axis).normalize()
    const length = toVector(axis).length()
    const shaftLength = Math.max(length - headLength, length * 0.7)
    const material = new THREE.MeshBasicMaterial({ color: AXIS_COLORS[index]! })

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 12),
      material,
    )
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
    shaft.position.copy(direction.clone().multiplyScalar(shaftLength / 2))
    group.add(shaft)

    const head = new THREE.Mesh(new THREE.ConeGeometry(headRadius, headLength, 16), material)
    head.quaternion.copy(shaft.quaternion)
    head.position.copy(direction.clone().multiplyScalar(shaftLength + headLength / 2))
    group.add(head)

    const sprite = makeTextSprite(['a', 'b', 'c'][index]!, `#${AXIS_COLORS[index]!.toString(16).padStart(6, '0')}`)
    sprite.position.copy(direction.clone().multiplyScalar(length + headLength * 1.4))
    sprite.scale.set(1.6, 0.8, 1)
    group.add(sprite)
  })
  return group
}

function atomRadius(element: string): number {
  const style = elementStyle(element)
  const scale = store.displaySettings.atomRadiusScale
  switch (store.displaySettings.modelType) {
    case 'space-filling':
      return style.radius
    case 'wireframe':
      return style.radius * scale * 0.4
    default:
      return style.radius * scale
  }
}

function buildAtoms(atoms: AtomSite[], replicas: NeighborReplica[]): THREE.Group {
  const group = new THREE.Group()
  const instanceMap: AtomSite[] = []

  const params = store.currentSpaceGroup!.latticeParams
  const geometry = new THREE.SphereGeometry(1, 24, 16)
  const wireframe = store.displaySettings.modelType === 'wireframe'
  const material = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.05, wireframe })
  const mesh = new THREE.InstancedMesh(geometry, material, atoms.length + replicas.length)
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)

  const matrix = new THREE.Matrix4()
  const color = new THREE.Color()

  const place = (atom: AtomSite, offset: Vec3, index: number) => {
    const frac: Vec3 = [
      atom.fractionalCoords[0] + offset[0],
      atom.fractionalCoords[1] + offset[1],
      atom.fractionalCoords[2] + offset[2],
    ]
    const position = toVector(fractionalToCartesian(frac, params))
    const radius = atomRadius(atom.element)
    matrix.makeScale(radius, radius, radius)
    matrix.setPosition(position)
    mesh.setMatrixAt(index, matrix)
    color.set(elementStyle(atom.element).color)
    mesh.setColorAt(index, color)
    instanceMap[index] = atom
  }

  atoms.forEach((atom, index) => place(atom, [0, 0, 0], index))
  replicas.forEach((replica, index) => place(atoms[replica.atom]!, replica.offset, atoms.length + index))

  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  atomMeshes.push(mesh)
  atomInstanceMaps.push(instanceMap)
  group.add(mesh)

  if (store.displaySettings.showLabels) {
    atoms.forEach((atom) => {
      const sprite = makeTextSprite(atom.label)
      sprite.position.copy(toVector(fractionalToCartesian(atom.fractionalCoords, params)))
      sprite.position.y += atomRadius(atom.element) + 0.35
      sprite.scale.set(1.4, 0.7, 1)
      group.add(sprite)
    })
  }
  return group
}

/** Render bonds as two half-cylinders, each tinted by the atom it touches. */
function buildBonds(atoms: AtomSite[], result: BondResult): THREE.Group {
  const group = new THREE.Group()
  const bonds = result.bonds
  if (!bonds.length) return group

  const params = store.currentSpaceGroup!.latticeParams
  const geometry = new THREE.CylinderGeometry(1, 1, 1, 10)
  const material = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 })
  const mesh = new THREE.InstancedMesh(geometry, material, bonds.length * 2)
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)

  const bondRadius = store.displaySettings.modelType === 'wireframe' ? 0.05 : 0.1
  const matrix = new THREE.Matrix4()
  const scale = new THREE.Vector3()
  const color = new THREE.Color()
  const white = new THREE.Color('#ffffff')
  const up = new THREE.Vector3(0, 1, 0)
  const dir = new THREE.Vector3()
  const quat = new THREE.Quaternion()

  let instance = 0
  for (const bond of bonds) {
    const a = toVector(fractionalToCartesian(atoms[bond.i]!.fractionalCoords, params))
    const jFrac = atoms[bond.j]!.fractionalCoords
    const b = toVector(
      fractionalToCartesian(
        [jFrac[0]! + bond.offset[0], jFrac[1]! + bond.offset[1], jFrac[2]! + bond.offset[2]],
        params,
      ),
    )
    dir.subVectors(b, a)
    const length = dir.length()
    if (length < 1e-6) continue
    quat.setFromUnitVectors(up, dir.clone().normalize())
    const half = length / 2

    const placeHalf = (center: THREE.Vector3, element: string) => {
      scale.set(bondRadius, half, bondRadius)
      matrix.compose(center, quat, scale)
      mesh.setMatrixAt(instance, matrix)
      color.set(elementStyle(element).color).lerp(white, 0.15)
      mesh.setColorAt(instance, color)
      instance++
    }
    placeHalf(a.clone().addScaledVector(dir, 0.25), atoms[bond.i]!.element)
    placeHalf(a.clone().addScaledVector(dir, 0.75), atoms[bond.j]!.element)
  }

  mesh.count = instance
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  group.add(mesh)
  return group
}

const SUBSCRIPT_DIGITS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉']
const SYMMETRY_KIND_ORDER: SymmetryElementKind[] = [
  'mirror',
  'glide',
  'rotation',
  'screw',
  'rotoinversion',
]
const KIND_LABELS = {
  rotation: '旋转轴',
  screw: '螺旋轴',
  mirror: '镜面',
  glide: '滑移面',
  rotoinversion: '旋转反演轴',
} satisfies Record<SymmetryElementKind, string>

/** Hermann-Maguin style axis symbol, e.g. "4", "2₁" or "3̄". */
function axisLabel(element: SymmetryElement): string {
  if (element.kind === 'rotoinversion') return `${element.fold}\u0304`
  if (element.kind === 'screw' && element.screw) {
    const subscript = String(element.screw)
      .split('')
      .map((digit) => SUBSCRIPT_DIGITS[Number(digit)] ?? digit)
      .join('')
    return `${element.fold}${subscript}`
  }
  return String(element.fold)
}

/** Two unit vectors spanning the plane perpendicular to the direction. */
function orthonormalBasis(direction: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  const helper = Math.abs(direction.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const u = new THREE.Vector3().crossVectors(helper, direction).normalize()
  const v = new THREE.Vector3().crossVectors(direction, u).normalize()
  return [u, v]
}

/** Build a translucent mirror/glide plane with a border and a glide arrow. */
function buildSymmetryPlane(
  element: SymmetryElement,
  color: THREE.Color,
  foot: THREE.Vector3,
  normal: THREE.Vector3,
  extent: number,
): THREE.Group {
  const params = store.currentSpaceGroup!.latticeParams
  const plane = new THREE.Group()
  const half = extent / 2

  plane.add(
    new THREE.Mesh(
      new THREE.PlaneGeometry(extent, extent),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.13,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    ),
  )

  const borderGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-half, -half, 0),
    new THREE.Vector3(half, -half, 0),
    new THREE.Vector3(half, half, 0),
    new THREE.Vector3(-half, half, 0),
  ])
  if (element.kind === 'glide') {
    // Dashed border distinguishes glide planes from mirrors.
    const border = new THREE.LineLoop(
      borderGeometry,
      new THREE.LineDashedMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        dashSize: extent * 0.05,
        gapSize: extent * 0.035,
      }),
    )
    border.computeLineDistances()
    plane.add(border)

    if (element.glide) {
      const glide = toVector(fractionalToCartesian(element.glide, params))
      const [u, v] = orthonormalBasis(normal)
      const local = new THREE.Vector3(glide.dot(u), glide.dot(v), 0)
      const arrowLength = local.length()
      if (arrowLength > extent * 0.04) {
        const direction = local.clone().normalize()
        const shaftLength = arrowLength * 0.6
        plane.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
              local.clone().multiplyScalar(-0.5),
              local
                .clone()
                .multiplyScalar(-0.5)
                .addScaledVector(direction, shaftLength),
            ]),
            new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }),
          ),
        )
        const headLength = arrowLength - shaftLength
        const head = new THREE.Mesh(
          new THREE.ConeGeometry(headLength * 0.45, headLength, 10),
          new THREE.MeshBasicMaterial({ color }),
        )
        head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
        head.position
          .copy(local.clone().multiplyScalar(-0.5))
          .addScaledVector(direction, shaftLength + headLength / 2)
        plane.add(head)
      }
    }
  } else {
    plane.add(
      new THREE.LineLoop(
        borderGeometry,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }),
      ),
    )
  }

  plane.position.copy(foot)
  plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
  return plane
}

/** Helical line around the top end of a screw axis, hinting at its handedness. */
function buildScrewHelix(
  color: THREE.Color,
  foot: THREE.Vector3,
  direction: THREE.Vector3,
  extent: number,
  axisLength: number,
): THREE.Line {
  const [u, v] = orthonormalBasis(direction)
  const radius = extent * 0.035
  const helixLength = extent * 0.22
  const turns = 1.25
  const segments = 48
  const top = foot.clone().addScaledVector(direction, axisLength / 2)
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const angle = t * turns * Math.PI * 2
    points.push(
      top
        .clone()
        .addScaledVector(u, Math.cos(angle) * radius)
        .addScaledVector(v, Math.sin(angle) * radius)
        .addScaledVector(direction, -t * helixLength),
    )
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }),
  )
}

/** Build a rotation/screw/rotoinversion axis with fold-order labels. */
function buildSymmetryAxis(
  element: SymmetryElement,
  color: THREE.Color,
  foot: THREE.Vector3,
  direction: THREE.Vector3,
  extent: number,
): THREE.Group {
  const group = new THREE.Group()
  const axisLength = extent * 1.35
  const label = axisLabel(element)
  const hex = `#${color.getHexString()}`

  if (element.kind === 'rotoinversion') {
    // Dashed line marks rotoinversion axes (as in VESTA style).
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        foot.clone().addScaledVector(direction, -axisLength / 2),
        foot.clone().addScaledVector(direction, axisLength / 2),
      ]),
      new THREE.LineDashedMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        dashSize: extent * 0.06,
        gapSize: extent * 0.04,
      }),
    )
    line.computeLineDistances()
    group.add(line)
  } else {
    const radius = extent * 0.008
    const axis = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, axisLength, 10),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }),
    )
    axis.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
    axis.position.copy(foot)
    group.add(axis)
    if (element.kind === 'screw') {
      group.add(buildScrewHelix(color, foot, direction, extent, axisLength))
    }
  }

  for (const sign of [-1, 1]) {
    const sprite = makeTextSprite(label, hex)
    sprite.position.copy(
      foot.clone().addScaledVector(direction, sign * (axisLength / 2 + extent * 0.05)),
    )
    sprite.scale.set(extent * 0.1, extent * 0.05, 1)
    group.add(sprite)
  }
  return group
}

function buildSymmetryElements(elements: SymmetryElement[]): THREE.Group {
  const group = new THREE.Group()
  const params = store.currentSpaceGroup!.latticeParams
  const corners = cellCorners(params).map(toVector)
  const box = new THREE.Box3().setFromPoints(corners)
  const size = box.getSize(new THREE.Vector3())
  const extent = Math.max(size.x, size.y, size.z)
  const hidden = store.displaySettings.hiddenSymmetryElements

  for (const element of elements) {
    if (hidden.includes(element.kind)) continue
    const color = new THREE.Color(store.displaySettings.symmetryColors[element.kind])
    const foot = toVector(fractionalToCartesian(element.origin, params))
    const direction = toVector(fractionalToCartesian(element.direction, params)).normalize()
    // Wrapper carries the element for scene picking.
    const wrapper = new THREE.Group()
    wrapper.userData.element = element
    if (element.kind === 'mirror' || element.kind === 'glide') {
      wrapper.add(buildSymmetryPlane(element, color, foot, direction, extent))
    } else {
      wrapper.add(buildSymmetryAxis(element, color, foot, direction, extent))
    }
    group.add(wrapper)
  }
  return group
}

/** Raise/lower the opacity of every material below a symmetry element root. */
function setEmphasis(root: THREE.Object3D | null, on: boolean) {
  if (!root) return
  root.traverse((child) => {
    const material = (child as THREE.Mesh).material as (THREE.Material & { userData: Record<string, unknown> }) | undefined
    if (!material) return
    if (on) {
      material.userData.baseOpacity = material.transparent ? material.opacity : 1
      material.transparent = true
      material.opacity = Math.min(1, (material.userData.baseOpacity as number) + 0.35)
    } else if (material.userData.baseOpacity !== undefined) {
      material.opacity = material.userData.baseOpacity as number
      material.transparent = material.opacity < 1
      delete material.userData.baseOpacity
    }
  })
}

function sameElement(a: SymmetryElement | undefined, b: SymmetryElement | null): boolean {
  return Boolean(a && b && a.kind === b.kind && a.seitz === b.seitz)
}

/** Find the freshly built scene object for a (possibly stale) selected element. */
function findRootByElement(element: SymmetryElement): THREE.Object3D | null {
  for (const child of symmetryGroup?.children ?? []) {
    if (sameElement(child.userData.element as SymmetryElement | undefined, element)) return child
  }
  return null
}

/** Pick the first displayed atom to drive the generation demo. */
function demoSeed(): AtomSite | null {
  if (store.customAtomSettings.showWyckoffAtoms && store.currentAtoms.length) return store.currentAtoms[0]!
  if (store.customAtomSettings.showCustomAtoms && store.customAtoms.length) return store.customAtoms[0]!
  return store.currentAtoms[0] ?? store.customAtoms[0] ?? null
}

/** Locate the rendered atom instance occupying a fractional site. */
function matchAtom(site: Vec3): { mesh: THREE.InstancedMesh; id: number } | null {
  for (let m = 0; m < atomMeshes.length; m++) {
    const map = atomInstanceMaps[m]!
    for (let i = 0; i < map.length; i++) {
      if (sameFractionalSite(map[i]!.fractionalCoords, site)) return { mesh: atomMeshes[m]!, id: i }
    }
  }
  return null
}

function restoreAtomColors() {
  const color = new THREE.Color()
  for (let m = 0; m < atomMeshes.length; m++) {
    const mesh = atomMeshes[m]!
    const map = atomInstanceMaps[m]!
    for (let i = 0; i < map.length; i++) {
      color.set(elementStyle(map[i]!.element).color)
      mesh.setColorAt(i, color)
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }
}

function lightStation(state: DemoState, index: number) {
  const match = state.matches[index]
  state.litAt[index] = state.elapsed
  if (!match) return
  match.mesh.setColorAt(match.id, DEMO_HIGHLIGHT)
  if (match.mesh.instanceColor) match.mesh.instanceColor.needsUpdate = true
}

/** Dim atoms and bonds so the demo stands out. */
function dimScene() {
  content.traverse((child) => {
    const material = (child as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
    if (material && (material as unknown as { isMeshStandardMaterial?: boolean }).isMeshStandardMaterial) {
      material.transparent = true
      material.opacity = 0.09
    }
  })
}

function undimScene() {
  content.traverse((child) => {
    const material = (child as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
    if (material && (material as unknown as { isMeshStandardMaterial?: boolean }).isMeshStandardMaterial) {
      material.transparent = false
      material.opacity = 1
    }
  })
}

function startDemo() {
  stopDemo(true)
  const element = selectedElement.value
  if (!element || !scene) return
  // Prefer a displayed atom so its equivalent sites light up; fall back to a
  // generic virtual seed when no suitable atom exists.
  const seedAtom = demoSeed()
  let seedFrac: Vec3 | null = seedAtom?.fractionalCoords ?? null
  let orbit = seedFrac ? operationOrbit(element.operation, seedFrac) : []
  if (orbit.length < 2) {
    for (const candidate of GENERIC_SEEDS) {
      seedFrac = candidate
      orbit = operationOrbit(element.operation, candidate)
      if (orbit.length >= 2) break
    }
  }
  if (!seedFrac || orbit.length < 2) return

  const params = store.currentSpaceGroup!.latticeParams
  const color = seedAtom ? elementStyle(seedAtom.element).color : '#6d8bff'
  const radius = seedAtom ? atomRadius(seedAtom.element) : params.a * 0.09
  const ghost = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.4, 24, 16),
    new THREE.MeshStandardMaterial({
      color,
      emissive: new THREE.Color(color).multiplyScalar(0.75),
      emissiveIntensity: 1.2,
      roughness: 0.3,
    }),
  )
  ghost.position.copy(toVector(fractionalToCartesian(orbit[0]!, params)))
  content.add(ghost)

  // Trail line that follows the ghost atom and fades out behind it.
  const trailLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }),
  )
  content.add(trailLine)

  const state: DemoState = {
    element,
    motion: buildSymmetryMotion(element, params),
    orbit,
    matches: orbit.map(matchAtom),
    ghost,
    trail: [],
    trailLine,
    litAt: orbit.map(() => -1),
    elapsed: 0,
    prevPhase: 0,
    lit: 0,
  }
  demo = state
  demoOrbitSize.value = orbit.length
  dimScene()
  // Hide the other symmetry elements so the animated one dominates the view.
  for (const child of symmetryGroup?.children ?? []) {
    if (child !== selectedRoot) child.visible = false
  }
  lightStation(state, 0)
  demoPlaying.value = true
}

function stopDemo(keepSelection = false) {
  if (demo) {
    if (demo.ghost.parent) demo.ghost.parent.remove(demo.ghost)
    disposeObject(demo.ghost)
    if (demo.trailLine.parent) demo.trailLine.parent.remove(demo.trailLine)
    disposeObject(demo.trailLine)
    demo = null
    undimScene()
    restoreAtomColors()
    for (const child of symmetryGroup?.children ?? []) child.visible = true
  }
  demoPlaying.value = false
  if (!keepSelection) {
    selectedElement.value = null
    setEmphasis(selectedRoot, false)
    selectedRoot = null
  }
}

function toggleDemo() {
  if (demoPlaying.value) {
    demoPlaying.value = false
    return
  }
  if (demo) {
    demoPlaying.value = true
  } else {
    startDemo()
  }
}

function selectElement(element: SymmetryElement) {
  setEmphasis(selectedRoot, false)
  selectedElement.value = element
  selectedRoot = findRootByElement(element)
  setEmphasis(selectedRoot, true)
  // Bring the element front and center, then play its animation.
  frameElement(element)
  startDemo()
}

function clearSelection() {
  stopDemo(false)
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

/** Rebuild the trail geometry with per-vertex colors fading into the background. */
function updateTrail(state: DemoState) {
  const background = scene?.background instanceof THREE.Color ? scene.background : new THREE.Color('#111827')
  const base = new THREE.Color(store.displaySettings.symmetryColors[state.element.kind])
  const positions: number[] = []
  const colors: number[] = []
  const total = Math.max(state.trail.length - 1, 1)
  state.trail.forEach((point, index) => {
    positions.push(point.x, point.y, point.z)
    const age = (state.trail.length - 1 - index) / total
    const color = base.clone().lerp(background, age * 0.9)
    colors.push(color.r, color.g, color.b)
  })
  state.trailLine.geometry.dispose()
  state.trailLine.geometry = new THREE.BufferGeometry()
  state.trailLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  state.trailLine.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
}

/** White flash decaying into the highlight color on freshly lit atoms. */
const FLASH_WHITE = new THREE.Color('#ffffff')

function updateLitFlash(state: DemoState) {
  const color = new THREE.Color()
  let dirty = false
  for (let i = 0; i < state.matches.length; i++) {
    const age = state.elapsed - state.litAt[i]!
    if (age < 0 || age > 0.5) continue
    const match = state.matches[i]
    if (!match) continue
    color.copy(FLASH_WHITE).lerp(DEMO_HIGHLIGHT, age / 0.5)
    match.mesh.setColorAt(match.id, color)
    dirty = true
  }
  if (dirty) {
    for (const mesh of new Set(state.matches.filter(Boolean).map((m) => m!.mesh))) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }
}

/** Advance the generation demo; called every frame from the render loop. */
function updateDemo(dt: number) {
  if (!demo || !demoPlaying.value) return
  demo.elapsed += dt
  const K = demo.orbit.length
  const period = K * (DEMO_STATION + DEMO_GAP) + DEMO_CYCLE_PAUSE
  const phase = demo.elapsed % period
  if (phase < demo.prevPhase) {
    // A new cycle starts: clear highlights, relight the seed site.
    restoreAtomColors()
    demo.trail = []
    lightStation(demo, 0)
    demo.lit = 0
  }
  demo.prevPhase = phase

  // Breathing pulse keeps the moving atom easy to follow.
  demo.ghost.scale.setScalar(1 + 0.22 * Math.sin(demo.elapsed * Math.PI * 2 * 1.2))

  const segment = Math.floor(phase / (DEMO_STATION + DEMO_GAP))
  if (segment >= K) {
    updateLitFlash(demo)
    return // end-of-cycle pause
  }
  const local = phase - segment * (DEMO_STATION + DEMO_GAP)
  const params = store.currentSpaceGroup!.latticeParams
  const toIndex = (segment + 1) % K

  if (local < DEMO_STATION) {
    const progress = easeInOut(local / DEMO_STATION)
    demo.ghost.position.copy(toVector(demo.motion.at(demo.orbit[segment]!, progress)))
  } else {
    if (demo.lit < toIndex || (toIndex === 0 && demo.lit < K)) {
      lightStation(demo, toIndex)
      demo.lit = toIndex === 0 ? K : toIndex
    }
    demo.ghost.position.copy(toVector(fractionalToCartesian(demo.orbit[toIndex]!, params)))
  }

  // Extend the trail when the ghost has moved far enough.
  const last = demo.trail[demo.trail.length - 1]
  if (!last || last.distanceTo(demo.ghost.position) > 0.02) {
    demo.trail.push(demo.ghost.position.clone())
    if (demo.trail.length > 70) demo.trail.shift()
  }
  updateTrail(demo)
  updateLitFlash(demo)
}


function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(material)) material.forEach((item) => item.dispose())
    else material?.dispose()
  })
}

function clearContent() {
  atomMeshes = []
  atomInstanceMaps = []
  while (content.children.length) {
    const child = content.children.pop()!
    disposeObject(child)
  }
}

function fitView() {
  const group = store.currentSpaceGroup
  if (!group || !camera || !controls) return
  const corners = cellCorners(group.latticeParams).map(toVector)
  const box = new THREE.Box3().setFromPoints(corners)
  const center = box.getCenter(new THREE.Vector3())
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  content.position.copy(center.clone().negate())
  const distance = Math.max(sphere.radius, 1) * 2.8
  lastFitRadius = distance
  const direction = new THREE.Vector3(1, 0.85, 1).normalize()
  camera.position.copy(direction.multiplyScalar(distance))
  camera.near = distance / 100
  camera.far = distance * 100
  camera.updateProjectionMatrix()
  controls.target.set(0, 0, 0)
  controls.update()
}

function rebuild() {
  if (!scene) return
  clearContent()
  if (store.displaySettings.background === 'light') {
    scene.background = LIGHT_BACKGROUND.clone()
  } else {
    scene.background = DARK_BACKGROUND.clone()
  }
  const group = store.currentSpaceGroup
  if (!group) return
  if (store.displaySettings.showCell) content.add(buildCell(group.latticeParams))

  // "仅原子" shows isolated atoms; bonds are also off in space-filling.
  const wantBonds =
    store.displaySettings.showBonds &&
    store.displaySettings.modelType !== 'space-filling' &&
    store.displaySettings.modelType !== 'atoms-only'
  const renderAtomSet = (atoms: AtomSite[]) => {
    if (!atoms.length) return
    const bondResult = wantBonds ? computeBonds(atoms, group.latticeParams) : null
    content.add(buildAtoms(atoms, bondResult?.replicas ?? []))
    if (bondResult) content.add(buildBonds(atoms, bondResult))
  }

  if (store.customAtomSettings.showWyckoffAtoms) renderAtomSet(store.currentAtoms)
  if (store.customAtomSettings.showCustomAtoms) renderAtomSet(store.customAtoms)
  symmetryCounts.value = {}
  symmetryGroup = null
  lastSymmetryElements = []
  if (store.displaySettings.showSymmetryElements) {
    const elements = computeSymmetryElements(group.symmetryOperations)
    const counts: Partial<Record<SymmetryElementKind, number>> = {}
    for (const element of elements) {
      counts[element.kind] = (counts[element.kind] ?? 0) + 1
    }
    symmetryCounts.value = counts
    lastSymmetryElements = elements
    symmetryGroup = buildSymmetryElements(elements)
    content.add(symmetryGroup)
  }
  // The scene was rebuilt: re-attach the selection and demo to fresh objects.
  demo = null
  if (selectedElement.value) {
    selectedRoot = findRootByElement(selectedElement.value)
    if (selectedRoot) {
      selectedElement.value = selectedRoot.userData.element as SymmetryElement
      setEmphasis(selectedRoot, true)
    } else {
      selectedElement.value = null
      demoPlaying.value = false
    }
  }
  if (demoPlaying.value && selectedElement.value) startDemo()
  // Only refit the camera when the cell itself changes; tweaks like colors or
  // atom radius should not yank the user's viewpoint around.
  const signature = String(group.number)
  if (signature !== fitSignature) {
    fitSignature = signature
    fitView()
    if (store.displaySettings.showSymmetryElements) frameAllSymmetry()
  }
}

function resize() {
  const element = container.value
  if (!element || !renderer || !camera) return
  const width = element.clientWidth
  const height = element.clientHeight
  if (width === 0 || height === 0) return
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}

function onPointerDown(event: PointerEvent) {
  pointerStart = { x: event.clientX, y: event.clientY }
  // Manual dragging cancels any automatic camera move.
  cameraTween = null
}

function onPointerUp(event: PointerEvent) {
  if (!pointerStart) return
  const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y)
  pointerStart = null
  if (moved > 5 || !camera || !renderer) return

  const rect = renderer.domElement.getBoundingClientRect()
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  )
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(pointer, camera)

  // Symmetry elements take priority when they are visible.
  if (store.displaySettings.showSymmetryElements && symmetryGroup) {
    raycaster.params.Line = { threshold: 0.2 }
    const hit = raycaster.intersectObject(symmetryGroup, true)[0]
    if (hit) {
      let node: THREE.Object3D | null = hit.object
      while (node && !(node.userData && node.userData.element)) node = node.parent
      if (node && node !== content) {
        selectElement(node.userData.element as SymmetryElement)
        return
      }
    }
  }

  if (!atomMeshes.length) {
    clearSelection()
    return
  }
  const hits = raycaster.intersectObjects(atomMeshes, false)
  const hit = hits[0]
  if (hit && hit.instanceId !== undefined) {
    const meshIndex = atomMeshes.indexOf(hit.object as THREE.InstancedMesh)
    picked.value = atomInstanceMaps[meshIndex]?.[hit.instanceId] ?? null
  } else {
    picked.value = null
    clearSelection()
  }
}

function resetView() {
  fitView()
}

function init() {
  const element = container.value
  if (!element) return

  scene = new THREE.Scene()
  scene.background = DARK_BACKGROUND.clone()

  camera = new THREE.PerspectiveCamera(45, element.clientWidth / element.clientHeight || 1, 0.1, 2000)
  camera.position.set(12, 10, 14)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(element.clientWidth, element.clientHeight, false)
  renderer.domElement.classList.add('viewer-canvas')
  element.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 1
  controls.maxDistance = lastFitRadius * 20
  controls.autoRotateSpeed = 1.6

  scene.add(new THREE.AmbientLight(0xffffff, 0.72))
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.5)
  keyLight.position.set(20, 32, 24)
  scene.add(keyLight)
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.45)
  fillLight.position.set(-24, -12, -18)
  scene.add(fillLight)
  scene.add(content)

  let frames = 0
  let last = performance.now()
  lastFrameTime = last
  const animate = () => {
    frameId = requestAnimationFrame(animate)
    const now = performance.now()
    const dt = Math.min((now - lastFrameTime) / 1000, 0.1)
    lastFrameTime = now
    updateCameraTween(dt)
    controls?.update()
    updateDemo(dt)
    if (renderer && scene && camera) renderer.render(scene, camera)
    frames++
    if (now - last >= 500) {
      store.fps = Math.round((frames * 1000) / (now - last))
      frames = 0
      last = now
    }
  }
  animate()

  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(element)
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointerup', onPointerUp)

  rebuild()
}

onMounted(init)

onBeforeUnmount(() => {
  cancelAnimationFrame(frameId)
  resizeObserver?.disconnect()
  renderer?.domElement.removeEventListener('pointerdown', onPointerDown)
  renderer?.domElement.removeEventListener('pointerup', onPointerUp)
  clearContent()
  controls?.dispose()
  renderer?.dispose()
  if (renderer?.domElement.parentElement) {
    renderer.domElement.parentElement.removeChild(renderer.domElement)
  }
  renderer = null
  scene = null
  camera = null
  controls = null
})

watch(autoRotate, (value) => {
  if (controls) controls.autoRotate = value
})

watch(
  () => [
    store.currentAtoms,
    store.currentSpaceGroup,
    store.displaySettings,
    store.customAtoms,
    store.customAtomSettings,
  ],
  () => rebuild(),
  { deep: true },
)

// Registered after the rebuild watch so the scene (and lastSymmetryElements)
// is up to date when the camera re-orients. Turning symmetry elements on
// points the camera straight at them instead of hiding them behind the cell.
watch(
  () => store.displaySettings.showSymmetryElements,
  (value) => {
    if (value) frameAllSymmetry()
  },
)
</script>

<template>
  <div class="viewer">
    <div ref="container" class="viewer__canvas-host"></div>

    <div class="viewer__toolbar">
      <el-tooltip content="自动旋转" placement="top">
        <el-button
          size="small"
          circle
          :type="autoRotate ? 'primary' : 'default'"
          :icon="autoRotate ? VideoPause : VideoPlay"
          @click="autoRotate = !autoRotate"
        />
      </el-tooltip>
      <el-tooltip content="重置视角" placement="top">
        <el-button
          size="small"
          circle
          :disabled="!store.currentSpaceGroup"
          :icon="RefreshRight"
          @click="resetView"
        />
      </el-tooltip>
    </div>

    <el-card v-if="picked" class="viewer__picked glass-panel" shadow="never">
      <div class="viewer__picked-head">
        <span class="viewer__picked-label mono">{{ picked.label }}</span>
        <el-button size="small" text :icon="Close" @click="picked = null" />
      </div>
      <div class="viewer__picked-row">
        <span class="viewer__picked-key">元素</span>{{ picked.element }}
      </div>
      <div v-if="picked.isCustom" class="viewer__picked-row">
        <span class="viewer__picked-key">来源</span>自定义原子（{{ picked.multiplicity }} 个等效位置）
      </div>
      <div v-else class="viewer__picked-row">
        <span class="viewer__picked-key">Wyckoff</span>{{ picked.multiplicity }}{{
          picked.wyckoffLetter
        }}（{{ picked.siteSymmetry }}）
      </div>
      <div class="viewer__picked-row mono">
        <span class="viewer__picked-key">分数坐标</span>({{
          picked.fractionalCoords.map((v) => v.toFixed(3)).join(', ')
        }})
      </div>
    </el-card>

    <div class="viewer__overlay-left">
      <div
        v-if="store.displaySettings.showSymmetryElements && symmetryLegend.length"
        class="viewer__legend glass-panel"
      >
        <div class="viewer__legend-title">对称元素</div>
        <div
          v-for="item in symmetryLegend"
          :key="item.kind"
          class="viewer__legend-item"
          :class="{ 'is-hidden': item.hidden }"
          @click="store.toggleSymmetryElement(item.kind)"
        >
          <el-color-picker
            class="viewer__legend-color"
            :model-value="item.color"
            size="small"
            :predefine="PRESET_COLORS"
            @update:model-value="
              (value: string | null) => value && store.setSymmetryElementColor(item.kind, value)
            "
            @click.stop
          />
          <span class="viewer__legend-label">{{ item.label }}</span>
          <span class="viewer__legend-count">{{ item.count }}</span>
        </div>
        <div class="viewer__legend-tip">点击色块调色 · 点击行显隐</div>
      </div>

      <el-card v-if="selectedElement" class="viewer__symdemo glass-panel" shadow="never">
        <div class="viewer__symdemo-head">
          <span
            class="viewer__symdemo-symbol mono"
            :style="{ color: store.displaySettings.symmetryColors[selectedElement.kind] }"
            >{{ selectedSymbol }}</span
          >
          <span class="viewer__symdemo-kind">{{ selectedKindLabel }}</span>
          <el-button size="small" text :icon="Close" @click="clearSelection" />
        </div>
        <div class="viewer__symdemo-seitz mono">{{ selectedElement.seitz }}</div>
        <div class="viewer__symdemo-meta">
          <template v-if="demoOrbitSize < 2">种子位于该对称元素上，无等效位置</template>
          <template v-else
            >该操作生成 <b>{{ demoOrbitSize }}</b> 个等效位置</template
          >
        </div>
        <el-button
          class="viewer__symdemo-button"
          size="small"
          type="primary"
          round
          :disabled="demoOrbitSize < 2"
          :icon="demoPlaying ? VideoPause : VideoPlay"
          @click="toggleDemo"
        >
          {{ demoPlaying ? '暂停' : '继续' }}
        </el-button>
        <div class="viewer__symdemo-tip">再次点击该对称元素可重播动画</div>
      </el-card>
    </div>

    <div v-if="store.currentSpaceGroup" class="viewer__hint">
      拖拽旋转 · 滚轮缩放{{
        store.displaySettings.showSymmetryElements ? ' · 点击对称元素播放生成动画' : ' · 点击原子查看详情'
      }}
    </div>

    <div v-if="!store.currentSpaceGroup" class="viewer__empty">
      <el-empty description="输入空间群后在此查看晶胞" :image-size="80" />
    </div>
  </div>
</template>

<style scoped>
.viewer {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #111827;
}

.viewer__canvas-host {
  position: absolute;
  inset: 0;
}

.viewer__toolbar {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 999px;
  background: rgba(31, 41, 55, 0.72);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.3);
  z-index: 2;
}

.viewer__picked {
  position: absolute;
  left: 12px;
  bottom: 12px;
  width: 250px;
  z-index: 2;
}

.viewer__picked :deep(.el-card__body) {
  padding: 10px 14px;
}

.viewer__picked-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.viewer__picked-label {
  font-size: 15px;
  font-weight: 700;
  color: var(--accent);
}

.viewer__picked-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  color: #374151;
  line-height: 1.8;
}

.viewer__picked-key {
  flex: none;
  width: 52px;
  color: var(--text-secondary);
  font-size: 11px;
}

.viewer__overlay-left {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  max-width: 250px;
  z-index: 2;
}

.viewer__legend {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px 6px;
}

.viewer__legend-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  letter-spacing: 1px;
  margin-bottom: 4px;
}

.viewer__legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px 3px 2px;
  border-radius: 8px;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease, opacity 0.15s ease;
}

.viewer__legend-item:hover {
  background: rgba(79, 110, 247, 0.08);
}

.viewer__legend-item.is-hidden {
  opacity: 0.42;
}

.viewer__legend-item.is-hidden .viewer__legend-label {
  text-decoration: line-through;
}

.viewer__legend-color {
  flex: none;
}

.viewer__legend-label {
  flex: 1;
  min-width: 56px;
}

.viewer__legend-count {
  flex: none;
  min-width: 18px;
  text-align: center;
  font-size: 11px;
  color: var(--accent);
  background: var(--accent-soft, rgba(79, 110, 247, 0.12));
  border-radius: 999px;
  padding: 0 5px;
  line-height: 16px;
}

.viewer__legend-tip {
  margin-top: 5px;
  font-size: 10px;
  color: var(--text-secondary, #9ca3af);
}

.viewer__symdemo {
  width: 100%;
  --el-card-border-color: transparent;
}

.viewer__symdemo :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
}

.viewer__symdemo-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.viewer__symdemo-symbol {
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
}

.viewer__symdemo-kind {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
}

.viewer__symdemo-seitz {
  font-size: 11px;
  color: var(--text-secondary, #6b7280);
  background: rgba(148, 163, 184, 0.14);
  border-radius: 6px;
  padding: 3px 8px;
  align-self: flex-start;
}

.viewer__symdemo-meta {
  font-size: 12px;
  color: #374151;
}

.viewer__symdemo-meta b {
  color: var(--accent);
}

.viewer__symdemo-button {
  align-self: flex-start;
}

.viewer__symdemo-tip {
  font-size: 10px;
  color: var(--text-secondary, #9ca3af);
}

.viewer__hint {
  position: absolute;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  color: rgba(229, 231, 235, 0.75);
  background: rgba(31, 41, 55, 0.55);
  backdrop-filter: blur(6px);
  pointer-events: none;
  z-index: 1;
  white-space: nowrap;
}

.viewer__empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
