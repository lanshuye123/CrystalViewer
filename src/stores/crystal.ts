import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  type AtomSite,
  type DisplaySettings,
  type SpaceGroupData,
  type SpaceGroupIndexEntry,
} from '@/types/crystal'
import { generateAtoms } from '@/lib/symmetry'
import { loadSpaceGroup, matchSpaceGroup, SPACE_GROUP_INDEX } from '@/lib/spacegroup'
import { loadDisplaySettings, saveDisplaySettings } from '@/lib/settings-storage'

export const useCrystalStore = defineStore('crystal', () => {
  const index = ref<SpaceGroupIndexEntry[]>(SPACE_GROUP_INDEX)
  const currentSpaceGroup = ref<SpaceGroupData | null>(null)
  const currentAtoms = ref<AtomSite[]>([])
  const selectedWyckoffLetter = ref<string | null>(null)
  const displaySettings = ref<DisplaySettings>(loadDisplaySettings())
  const fps = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const atomCount = computed(() => currentAtoms.value.length)
  const currentEntry = computed<SpaceGroupIndexEntry | null>(() => {
    if (!currentSpaceGroup.value) return null
    return index.value.find((entry) => entry.number === currentSpaceGroup.value!.number) ?? null
  })

  function setDisplaySettings(partial: Partial<DisplaySettings>) {
    displaySettings.value = { ...displaySettings.value, ...partial }
    saveDisplaySettings(displaySettings.value)
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
      const general = data.wyckoffPositions[0]
      selectedWyckoffLetter.value = general?.letter ?? null
      currentAtoms.value = general ? generateAtoms(data, general.letter) : []
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
    fps,
    loading,
    error,
    atomCount,
    currentEntry,
    setDisplaySettings,
    selectWyckoff,
    selectSpaceGroup,
    selectByNumber,
  }
})
