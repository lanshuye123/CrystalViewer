<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useCrystalStore } from '@/stores/crystal'
import {
  CELL_EDGES,
  cellAxes,
  cellCorners,
  fractionalToCartesian,
  type Vec3,
} from '@/lib/lattice'
import { elementStyle } from '@/lib/elements'
import { type AtomSite, type LatticeParams, type SymmetryOperation } from '@/types/crystal'

const store = useCrystalStore()
const container = ref<HTMLDivElement | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
const content = new THREE.Group()
let atomsMesh: THREE.InstancedMesh | null = null
let atomInstanceMap: AtomSite[] = []
let frameId = 0
let resizeObserver: ResizeObserver | null = null
let pointerStart: { x: number; y: number } | null = null
let lastFitRadius = 10

const autoRotate = ref(false)
const picked = ref<AtomSite | null>(null)

const DARK_BACKGROUND = new THREE.Color('#111827')
const LIGHT_BACKGROUND = new THREE.Color('#eef2f7')
const AXIS_COLORS = [0xef4444, 0x22c55e, 0x3b82f6]

function toVector(coords: Vec3): THREE.Vector3 {
  return new THREE.Vector3(coords[0], coords[1], coords[2])
}

function makeTextSprite(text: string, color = '#e5e7eb'): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 64
  const context = canvas.getContext('2d')!
  context.fillStyle = color
  context.font = 'bold 44px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
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
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.9 })
  group.add(new THREE.LineSegments(edgeGeometry, edgeMaterial))

  const origin = corners[0]!
  const axes = cellAxes(params)
  axes.forEach((axis, index) => {
    const geometry = new THREE.BufferGeometry().setFromPoints([origin, toVector(axis)])
    const material = new THREE.LineBasicMaterial({ color: AXIS_COLORS[index]!, linewidth: 2 })
    group.add(new THREE.Line(geometry, material))
    const sprite = makeTextSprite(['a', 'b', 'c'][index]!, `#${AXIS_COLORS[index]!.toString(16).padStart(6, '0')}`)
    sprite.position.copy(toVector(axis))
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

function buildAtoms(atoms: AtomSite[]): THREE.Group {
  const group = new THREE.Group()
  atomInstanceMap = []
  atomsMesh = null

  const params = store.currentSpaceGroup!.latticeParams
  const element = atoms[0]!.element
  const style = elementStyle(element)

  const geometry = new THREE.SphereGeometry(1, 24, 16)
  const wireframe = store.displaySettings.modelType === 'wireframe'
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(style.color),
    roughness: 0.42,
    metalness: 0.05,
    wireframe,
  })
  const mesh = new THREE.InstancedMesh(geometry, material, atoms.length)
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)

  const matrix = new THREE.Matrix4()
  const radius = atomRadius(element)
  atoms.forEach((atom, index) => {
    const position = toVector(fractionalToCartesian(atom.fractionalCoords, params))
    matrix.makeScale(radius, radius, radius)
    matrix.setPosition(position)
    mesh.setMatrixAt(index, matrix)
    atomInstanceMap[index] = atom
  })
  mesh.instanceMatrix.needsUpdate = true
  atomsMesh = mesh
  group.add(mesh)

  if (store.displaySettings.showLabels) {
    atoms.forEach((atom) => {
      const sprite = makeTextSprite(atom.label)
      sprite.position.copy(toVector(fractionalToCartesian(atom.fractionalCoords, params)))
      sprite.position.y += radius + 0.35
      sprite.scale.set(1.4, 0.7, 1)
      group.add(sprite)
    })
  }
  return group
}

function nullSpaceVector(matrix: number[][]): THREE.Vector3 | null {
  const rows = matrix.map((row) => new THREE.Vector3(row[0]!, row[1]!, row[2]!))
  const candidates = [
    new THREE.Vector3().crossVectors(rows[0]!, rows[1]!),
    new THREE.Vector3().crossVectors(rows[0]!, rows[2]!),
    new THREE.Vector3().crossVectors(rows[1]!, rows[2]!),
  ]
  let best = candidates[0]!
  for (const candidate of candidates) {
    if (candidate.length() > best.length()) best = candidate
  }
  if (best.length() < 1e-6) return null
  return best.normalize()
}

function subtractIdentity(rotation: number[][], sign: number): number[][] {
  return rotation.map((row, i) => row.map((value, j) => value + (i === j ? sign : 0)))
}

function buildSymmetryElements(operations: SymmetryOperation[]): THREE.Group {
  const group = new THREE.Group()
  const params = store.currentSpaceGroup!.latticeParams
  const corners = cellCorners(params).map(toVector)
  const box = new THREE.Box3().setFromPoints(corners)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const length = Math.max(size.x, size.y, size.z) * 1.1

  const seen = new Set<string>()
  for (const operation of operations) {
    if (operation.type === 'identity' || operation.type === 'inversion') continue
    const key = `${operation.type}:${operation.seitz}`
    if (seen.has(key)) continue
    seen.add(key)

    const isPlane = operation.type === 'mirror' || operation.type === 'glide'
    const matrix = subtractIdentity(operation.rotation, isPlane ? 1 : -1)
    const direction = nullSpaceVector(matrix)
    if (!direction) continue

    if (isPlane) {
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(length, length),
        new THREE.MeshBasicMaterial({
          color: operation.type === 'mirror' ? 0x22c55e : 0x06b6d4,
          transparent: true,
          opacity: 0.12,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      )
      plane.position.copy(center)
      plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction)
      group.add(plane)
    } else {
      const color = operation.type === 'screw' ? 0xf97316 : 0xf59e0b
      const geometry = new THREE.BufferGeometry().setFromPoints([
        center.clone().addScaledVector(direction, -length),
        center.clone().addScaledVector(direction, length),
      ])
      group.add(new THREE.Line(geometry, new THREE.LineDashedMaterial({ color })))
    }
  }
  return group
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
  atomInstanceMap = []
  atomsMesh = null
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
  if (store.currentAtoms.length) content.add(buildAtoms(store.currentAtoms))
  if (store.displaySettings.showSymmetryElements) {
    content.add(buildSymmetryElements(group.symmetryOperations))
  }
  fitView()
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
}

function onPointerUp(event: PointerEvent) {
  if (!pointerStart) return
  const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y)
  pointerStart = null
  if (moved > 5 || !atomsMesh || !camera || !renderer) return

  const rect = renderer.domElement.getBoundingClientRect()
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  )
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObject(atomsMesh, false)
  const hit = hits[0]
  if (hit && hit.instanceId !== undefined) {
    picked.value = atomInstanceMap[hit.instanceId] ?? null
  } else {
    picked.value = null
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
  const animate = () => {
    frameId = requestAnimationFrame(animate)
    controls?.update()
    if (renderer && scene && camera) renderer.render(scene, camera)
    frames++
    const now = performance.now()
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
  () => [store.currentAtoms, store.currentSpaceGroup, store.displaySettings],
  () => rebuild(),
  { deep: true },
)
</script>

<template>
  <div class="viewer">
    <div ref="container" class="viewer__canvas-host"></div>

    <div class="viewer__toolbar">
      <el-switch
        v-model="autoRotate"
        size="small"
        active-text="自动旋转"
        inline-prompt
        style="--el-switch-on-color: #409eff"
      />
      <el-button size="small" :disabled="!store.currentSpaceGroup" @click="resetView">
        重置视角
      </el-button>
    </div>

    <el-card v-if="picked" class="viewer__picked" shadow="always">
      <div class="viewer__picked-head">
        <strong>{{ picked.label }}</strong>
        <el-button size="small" text @click="picked = null">关闭</el-button>
      </div>
      <div class="viewer__picked-row">元素：{{ picked.element }}</div>
      <div class="viewer__picked-row">
        Wyckoff：{{ picked.multiplicity }}{{ picked.wyckoffLetter }}（{{ picked.siteSymmetry }}）
      </div>
      <div class="viewer__picked-row mono">
        分数坐标：({{ picked.fractionalCoords.map((v) => v.toFixed(3)).join(', ') }})
      </div>
    </el-card>

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
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(31, 41, 55, 0.72);
  backdrop-filter: blur(6px);
}

.viewer__toolbar :deep(.el-switch__label) {
  color: #e5e7eb;
}

.viewer__picked {
  position: absolute;
  left: 12px;
  bottom: 12px;
  width: 240px;
}

.viewer__picked-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.viewer__picked-row {
  font-size: 12px;
  color: #4b5563;
  line-height: 1.7;
}

.viewer__empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
