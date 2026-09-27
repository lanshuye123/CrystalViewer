import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  type AtomSite,
  type DisplaySettings,
  type SpaceGroupData,
  type SpaceGroupIndexEntry,
  type SymmetryElementKind,
} from '@/types/crystal'
import { generateAtoms } from '@/lib/symmetry'
import {
  loadAllSpaceGroups,
  loadSpaceGroup,
  matchSpaceGroup,
  SPACE_GROUP_INDEX,
} from '@/lib/spacegroup'
import { loadDisplaySettings, saveDisplaySettings } from '@/lib/settings-storage'
import {
  expandCustomAtoms,
  loadCustomAtomState,
  saveCustomAtomState,
  type CustomAtomInput,
  type CustomAtomSettings,
} from '@/lib/custom-atoms'
import { detectSpaceGroup, type DetectAtom } from '@/lib/structure-detect'

let customAtomSeq = 0

export const useCrystalStore = defineStore('crystal', () => {
  const index = ref<SpaceGroupIndexEntry[]>(SPACE_GROUP_INDEX)
  const currentSpaceGroup = ref<SpaceGroupData | null>(null)
  const currentAtoms = ref<AtomSite[]>([])
  const selectedWyckoffLetter = ref<string | null>(null)
  const displaySettings = ref<DisplaySettings>(loadDisplaySettings())
  const persistedCustom = loadCustomAtomState()
  const customAtomInputs = ref<CustomAtomInput[]>(persistedCustom.inputs)
  const customAtomSettings = ref<CustomAtomSettings>(persistedCustom.settings)
  const fps = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const detectedStructure = ref<SpaceGroupData | null>(null)
  const detecting = ref(false)
  const detectError = ref<string | null>(null)

  const atomCount = computed(() => currentAtoms.value.length)
  const customAtomCount = computed(() => customAtoms.value.length)
  const currentEntry = computed<SpaceGroupIndexEntry | null>(() => {
    if (!currentSpaceGroup.value) return null
    return index.value.find((entry) => entry.number === currentSpaceGroup.value!.number) ?? null
  })

  /** Custom atoms expanded by the current space group's symmetry operations. */
  const customAtoms = computed<AtomSite[]>(() =>
    expandCustomAtoms(
      currentSpaceGroup.value,
      customAtomInputs.value,
      customAtomSettings.value.customApplySymmetry,
    ),
  )

  function setDisplaySettings(partial: Partial<DisplaySettings>) {
    displaySettings.value = { ...displaySettings.value, ...partial }
    saveDisplaySettings(displaySettings.value)
  }

  /** Change the render color of one symmetry element kind. */
  function setSymmetryElementColor(kind: SymmetryElementKind, color: string) {
    setDisplaySettings({
      symmetryColors: { ...displaySettings.value.symmetryColors, [kind]: color },
    })
  }

  /** Show/hide one symmetry element kind in the 3D view. */
  function toggleSymmetryElement(kind: SymmetryElementKind) {
    const hidden = displaySettings.value.hiddenSymmetryElements
    setDisplaySettings({
      hiddenSymmetryElements: hidden.includes(kind)
        ? hidden.filter((item) => item !== kind)
        : [...hidden, kind],
    })
  }

  function persistCustomAtoms() {
    saveCustomAtomState({
      inputs: customAtomInputs.value,
      settings: customAtomSettings.value,
    })
  }

  /** Normalize an element symbol, e.g. "si" / "SI" -> "Si". */
  function normalizeElement(element: string): string {
    const trimmed = element.trim()
    if (!trimmed) return 'X'
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
  }

  function addCustomAtom(element: string, coords: [number, number, number]) {
    customAtomSeq += 1
    customAtomInputs.value = [
      ...customAtomInputs.value,
      {
        id: `ca-${Date.now().toString(36)}-${customAtomSeq}`,
        element: normalizeElement(element),
        coords,
      },
    ]
    persistCustomAtoms()
  }

  function updateCustomAtom(id: string, coords: [number, number, number]) {
    customAtomInputs.value = customAtomInputs.value.map((input) =>
      input.id === id ? { ...input, coords } : input,
    )
    persistCustomAtoms()
  }

  function removeCustomAtom(id: string) {
    customAtomInputs.value = customAtomInputs.value.filter((input) => input.id !== id)
    persistCustomAtoms()
  }

  function clearCustomAtoms() {
    customAtomInputs.value = []
    persistCustomAtoms()
  }

  function setCustomAtomSettings(partial: Partial<CustomAtomSettings>) {
    customAtomSettings.value = { ...customAtomSettings.value, ...partial }
    persistCustomAtoms()
  }

  /** Identify the space group formed by the custom atoms in the current cell. */
  async function detectStructure(): Promise<boolean> {
    const params = currentSpaceGroup.value?.latticeParams
    if (!params) {
      detectError.value = '请先选择空间群以确定晶胞'
      return false
    }
    if (!customAtomInputs.value.length) {
      detectError.value = '请先添加自定义原子'
      detectedStructure.value = null
      return false
    }
    detecting.value = true
    detectError.value = null
    try {
      const groups = await loadAllSpaceGroups()
      const atoms: DetectAtom[] = customAtomInputs.value.map((input) => ({
        element: input.element,
        coords: [
          ((input.coords[0] % 1) + 1) % 1,
          ((input.coords[1] % 1) + 1) % 1,
          ((input.coords[2] % 1) + 1) % 1,
        ],
      }))
      detectedStructure.value = detectSpaceGroup(atoms, params, groups)
      if (!detectedStructure.value) {
        detectError.value = '未能识别结构，请检查原子坐标'
      }
      return Boolean(detectedStructure.value)
    } catch (cause) {
      detectError.value = cause instanceof Error ? cause.message : String(cause)
      return false
    } finally {
      detecting.value = false
    }
  }

  function selectWyckoff(letter: string) {
    if (!currentSpaceGroup.value) return
    const position = currentSpaceGroup.value.wyckoffPositions.find((wp) => wp.letter === letter)
    if (!position) return
    selectedWyckoffLetter.value = letter
    currentAtoms.value = generateAtoms(currentSpaceGroup.value, letter)
  }

  async function selectSpaceGroup(query: string): Promise<boolean> {
    const entry = matchSpaceGroup(query)
    if (!entry) {
      error.value = `无法匹配空间群 "${query}"`
      return false
    }
    return selectByNumber(entry.number)
  }

  async function selectByNumber(number: number): Promise<boolean> {
    const entry = index.value.find((item) => item.number === number)
    if (!entry) {
      error.value = `空间群编号 ${number} 超出范围（1-230）`
      return false
    }
    loading.value = true
    error.value = null
    try {
      const data = await loadSpaceGroup(entry)
      currentSpaceGroup.value = data
      // Default to the lowest-multiplicity (highest site-symmetry) position:
      // real structures occupy special sites, and the general position would
      // flood the cell with dozens of atoms.
      const minMultiplicity = Math.min(...data.wyckoffPositions.map((wp) => wp.multiplicity))
      const position =
        data.wyckoffPositions.find((wp) => wp.multiplicity === minMultiplicity) ??
        data.wyckoffPositions[0]
      selectedWyckoffLetter.value = position?.letter ?? null
      currentAtoms.value = position ? generateAtoms(data, position.letter) : []
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    index,
    currentSpaceGroup,
    currentAtoms,
    selectedWyckoffLetter,
    displaySettings,
    customAtomInputs,
    customAtomSettings,
    customAtoms,
    fps,
    loading,
    error,
    detectedStructure,
    detecting,
    detectError,
    atomCount,
    customAtomCount,
    currentEntry,
    setDisplaySettings,
    setSymmetryElementColor,
    toggleSymmetryElement,
    setCustomAtomSettings,
    addCustomAtom,
    updateCustomAtom,
    removeCustomAtom,
    clearCustomAtoms,
    detectStructure,
    selectWyckoff,
    selectSpaceGroup,
    selectByNumber,
  }
})
