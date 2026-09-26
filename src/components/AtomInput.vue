<script setup lang="ts">
import { computed, reactive } from 'vue'
import { Delete, MagicStick } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useCrystalStore } from '@/stores/crystal'
import { ELEMENT_STYLES, elementStyle } from '@/lib/elements'
import { CRYSTAL_SYSTEM_LABELS } from '@/types/crystal'

const store = useCrystalStore()

const form = reactive({ element: 'Si', x: 0, y: 0, z: 0 })

function elementColor(element: string): string {
  return elementStyle(element).color
}

/** Elements with a known style; unknown symbols still work via the fallback. */
const elementOptions = Object.keys(ELEMENT_STYLES).filter((element) => element !== 'X')

/** Free-text element input with symbol suggestions. */
function queryElements(queryString: string, cb: (results: { value: string }[]) => void) {
  const query = queryString.trim().toLowerCase()
  const results = elementOptions
    .filter((element) => !query || element.toLowerCase().startsWith(query))
    .map((element) => ({ value: element }))
  cb(results)
}

/** Number of symmetry-equivalent sites generated per input row. */
const siteCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const atom of store.customAtoms) {
    if (!atom.sourceId) continue
    counts.set(atom.sourceId, (counts.get(atom.sourceId) ?? 0) + 1)
  }
  return counts
})

function addAtom() {
  store.addCustomAtom(form.element, [form.x, form.y, form.z])
  ElMessage.success(`已添加 ${store.customAtomInputs.at(-1)!.element} 原子`)
}

async function loadDetected() {
  if (!store.detectedStructure) return
  const ok = await store.selectByNumber(store.detectedStructure.number)
  if (ok) ElMessage.success(`已载入 #${store.detectedStructure.number} ${store.detectedStructure.symbolHM}`)
}
</script>

<template>
  <div class="atom-input">
    <div class="atom-input__form">
      <el-autocomplete
        v-model="form.element"
        class="atom-input__element"
        :fetch-suggestions="queryElements"
        placeholder="元素符号"
        clearable
      />
      <label class="atom-input__coord">
        x
        <el-input-number v-model="form.x" :min="0" :max="1" :step="0.05" :precision="4" size="small" controls-position="right" />
      </label>
      <label class="atom-input__coord">
        y
        <el-input-number v-model="form.y" :min="0" :max="1" :step="0.05" :precision="4" size="small" controls-position="right" />
      </label>
      <label class="atom-input__coord">
        z
        <el-input-number v-model="form.z" :min="0" :max="1" :step="0.05" :precision="4" size="small" controls-position="right" />
      </label>
      <el-button type="primary" size="small" @click="addAtom">添加</el-button>
    </div>

    <div class="atom-input__switches">
      <span class="atom-input__switch">
        <el-switch
          size="small"
          :model-value="store.customAtomSettings.customApplySymmetry"
          @change="(value: string | number | boolean) => store.setCustomAtomSettings({ customApplySymmetry: Boolean(value) })"
        />
        对称等效位置
      </span>
      <span class="atom-input__switch">
        <el-switch
          size="small"
          :model-value="store.customAtomSettings.showCustomAtoms"
          @change="(value: string | number | boolean) => store.setCustomAtomSettings({ showCustomAtoms: Boolean(value) })"
        />
        显示自定义原子
      </span>
      <span class="atom-input__switch">
        <el-switch
          size="small"
          :model-value="store.customAtomSettings.showWyckoffAtoms"
          @change="(value: string | number | boolean) => store.setCustomAtomSettings({ showWyckoffAtoms: Boolean(value) })"
        />
        显示 Wyckoff 原子
      </span>
    </div>

    <div class="atom-input__detect">
      <el-button
        size="small"
        type="primary"
        plain
        :icon="MagicStick"
        :loading="store.detecting"
        :disabled="!store.customAtomInputs.length"
        @click="store.detectStructure()"
      >
        识别晶体结构
      </el-button>
      <div v-if="store.detectedStructure" class="atom-input__result">
        <div class="atom-input__result-text">
          识别为
          <strong class="mono">{{ store.detectedStructure.symbolHM }}</strong>
          <span class="mono atom-input__result-number">#{{ store.detectedStructure.number }}</span>
          <el-tag size="small" effect="plain" round>
            {{ CRYSTAL_SYSTEM_LABELS[store.detectedStructure.crystalSystem] }}晶系 · {{ store.detectedStructure.latticeType }}格子
          </el-tag>
        </div>
        <el-button size="small" type="primary" link @click="loadDetected">载入该空间群</el-button>
      </div>
      <span v-else-if="store.detectError" class="atom-input__error">{{ store.detectError }}</span>
      <span v-else class="atom-input__muted">根据自定义原子识别所属空间群</span>
    </div>

    <el-table :data="store.customAtomInputs" size="small" height="100%" empty-text="尚未添加原子">
      <el-table-column label="元素" width="72">
        <template #default="{ row }">
          <span class="atom-input__element-tag" :style="{ background: elementColor(row.element) }">
            {{ row.element }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="x" width="86" class-name="mono">
        <template #default="{ row }">{{ row.coords[0].toFixed(4) }}</template>
      </el-table-column>
      <el-table-column label="y" width="86" class-name="mono">
        <template #default="{ row }">{{ row.coords[1].toFixed(4) }}</template>
      </el-table-column>
      <el-table-column label="z" width="86" class-name="mono">
        <template #default="{ row }">{{ row.coords[2].toFixed(4) }}</template>
      </el-table-column>
      <el-table-column label="等效位置" width="80">
        <template #default="{ row }">
          <el-tag v-if="store.customAtomSettings.customApplySymmetry" size="small" effect="plain" round>
            {{ siteCounts.get(row.id) ?? 1 }}
          </el-tag>
          <span v-else class="atom-input__muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="76">
        <template #default="{ row }">
          <el-button size="small" text type="danger" :icon="Delete" @click="store.removeCustomAtom(row.id)" />
        </template>
      </el-table-column>
    </el-table>

    <div class="atom-input__footer">
      <span class="atom-input__summary">
        {{ store.customAtomInputs.length }} 个输入 · 展开 {{ store.customAtomCount }} 个原子
      </span>
      <el-button
        v-if="store.customAtomInputs.length"
        size="small"
        text
        type="danger"
        @click="store.clearCustomAtoms()"
      >
        清空
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.atom-input {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  min-height: 0;
}

.atom-input__form {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.atom-input__element {
  width: 120px;
}

.atom-input__detect {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 10px;
  border: 1px dashed var(--border-soft);
  border-radius: 8px;
  background: rgba(79, 110, 247, 0.04);
}

.atom-input__result {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
}

.atom-input__result-text {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.atom-input__result strong {
  color: var(--accent);
  font-size: 14px;
}

.atom-input__result-number {
  color: var(--text-secondary);
}

.atom-input__error {
  font-size: 12px;
  color: var(--el-color-danger);
}

.atom-input__coord {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.atom-input__coord :deep(.el-input-number) {
  width: 88px;
}

.atom-input__switches {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #374151;
}

.atom-input__switch {
  display: flex;
  align-items: center;
  gap: 5px;
}

.atom-input__element-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  padding: 1px 6px;
  border-radius: 6px;
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}

.atom-input__muted {
  color: var(--text-secondary);
}

.atom-input__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 2px;
}

.atom-input__summary {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
