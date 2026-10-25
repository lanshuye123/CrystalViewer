<script setup lang="ts">
import { computed } from 'vue'
import { useCrystalStore } from '@/stores/crystal'
import type {
  BackgroundTheme,
  DisplaySettings,
  ModelType,
  SymmetryElementKind,
} from '@/types/crystal'

const store = useCrystalStore()
const settings = computed(() => store.displaySettings)

function update(partial: Partial<DisplaySettings>) {
  store.setDisplaySettings(partial)
}

const modelTypes: { label: string; value: ModelType }[] = [
  { label: '球棍模型', value: 'ball-stick' },
  { label: '仅原子', value: 'atoms-only' },
  { label: '空间填充', value: 'space-filling' },
  { label: '线框', value: 'wireframe' },
]

const backgrounds: { label: string; value: BackgroundTheme }[] = [
  { label: '深色', value: 'dark' },
  { label: '浅色', value: 'light' },
]

const SYMMETRY_GROUPS: { label: string; kinds: SymmetryElementKind[] }[] = [
  { label: '对称面', kinds: ['mirror', 'glide'] },
  { label: '对称轴', kinds: ['rotation', 'screw'] },
  { label: '反演轴', kinds: ['rotoinversion'] },
]

const SYMMETRY_TEXT: Record<SymmetryElementKind, string> = {
  mirror: '镜面',
  glide: '滑移面',
  rotation: '旋转轴',
  screw: '螺旋轴',
  rotoinversion: '旋转反演',
}

function toggleKind(kind: SymmetryElementKind) {
  store.toggleSymmetryElement(kind)
}

function setAll(hidden: boolean) {
  store.setHiddenSymmetryElements(hidden ? SYMMETRY_GROUPS.flatMap((group) => group.kinds) : [])
}

const superCells: { label: string; value: 1 | 2 | 3 }[] = [
  { label: '1×1×1', value: 1 },
  { label: '2×2×2', value: 2 },
  { label: '3×3×3', value: 3 },
]
</script>

<template>
  <el-card class="settings glass-panel" shadow="never">
    <template #header>
      <div class="settings__header">
        <span class="settings__dot"></span>
        <span class="settings__title">显示设置</span>
      </div>
    </template>

    <div class="settings__row">
      <span>晶胞边框</span>
      <el-switch
        :model-value="settings.showCell"
        @change="(value: string | number | boolean) => update({ showCell: Boolean(value) })"
      />
    </div>

    <div class="settings__row">
      <span>原子标签</span>
      <el-switch
        :model-value="settings.showLabels"
        @change="(value: string | number | boolean) => update({ showLabels: Boolean(value) })"
      />
    </div>

    <div class="settings__row">
      <span>对称元素</span>
      <el-switch
        :model-value="settings.showSymmetryElements"
        @change="
          (value: string | number | boolean) => update({ showSymmetryElements: Boolean(value) })
        "
      />
    </div>

    <div v-if="settings.showSymmetryElements" class="settings__sub">
      <div v-for="group in SYMMETRY_GROUPS" :key="group.label" class="settings__subgroup">
        <span class="settings__subgroup-title">{{ group.label }}</span>
        <el-checkbox
          v-for="kind in group.kinds"
          :key="kind"
          class="settings__subcheck"
          :model-value="!settings.hiddenSymmetryElements.includes(kind)"
          size="small"
          @change="toggleKind(kind)"
        >
          {{ SYMMETRY_TEXT[kind] }}
        </el-checkbox>
      </div>

      <div class="settings__block">
        <span>辅助线透明度</span>
        <el-slider
          :model-value="settings.symmetryOpacity"
          :min="0.1"
          :max="0.7"
          :step="0.02"
          :format-tooltip="(value: number) => `${Math.round(value * 100)}%`"
          @input="(value: number | number[]) => update({ symmetryOpacity: Number(value) })"
        />
      </div>

      <div class="settings__block">
        <span>显示半径（0 = 不裁剪）</span>
        <el-slider
          :model-value="settings.symmetryRadius"
          :min="0"
          :max="1.2"
          :step="0.05"
          :format-tooltip="(value: number) => (value === 0 ? '全部' : `${value.toFixed(2)}× 晶胞`)"
          @input="(value: number | number[]) => update({ symmetryRadius: Number(value) })"
        />
      </div>

      <div class="settings__subrow">
        <button type="button" class="settings__linkbtn" @click="setAll(false)">全部显示</button>
        <button type="button" class="settings__linkbtn" @click="setAll(true)">全部隐藏</button>
      </div>
    </div>

    <div class="settings__row">
      <span>化学键</span>
      <el-switch
        :model-value="settings.showBonds"
        @change="(value: string | number | boolean) => update({ showBonds: Boolean(value) })"
      />
    </div>

    <div class="settings__block">
      <span>原子半径</span>
      <el-slider
        :model-value="settings.atomRadiusScale"
        :min="0.2"
        :max="1"
        :step="0.05"
        :format-tooltip="(value: number) => `${value.toFixed(2)}×`"
        @input="(value: number | number[]) => update({ atomRadiusScale: Number(value) })"
      />
    </div>

    <div class="settings__block">
      <span>模型类型</span>
      <el-radio-group
        :model-value="settings.modelType"
        size="small"
        @change="(value: string | number | boolean | undefined) => update({ modelType: value as ModelType })"
      >
        <el-radio-button v-for="model in modelTypes" :key="model.value" :value="model.value">
          {{ model.label }}
        </el-radio-button>
      </el-radio-group>
    </div>

    <div class="settings__block">
      <span>背景颜色</span>
      <el-radio-group
        :model-value="settings.background"
        size="small"
        @change="
          (value: string | number | boolean | undefined) =>
            update({ background: value as BackgroundTheme })
        "
      >
        <el-radio-button v-for="background in backgrounds" :key="background.value" :value="background.value">
          {{ background.label }}
        </el-radio-button>
      </el-radio-group>
    </div>

    <div class="settings__block">
      <span>超胞显示</span>
      <el-radio-group
        :model-value="settings.superCell"
        size="small"
        @change="
          (value: string | number | boolean | undefined) => update({ superCell: Number(value) as 1 | 2 | 3 })
        "
      >
        <el-radio-button v-for="size in superCells" :key="size.value" :value="size.value">
          {{ size.label }}
        </el-radio-button>
      </el-radio-group>
      <span class="settings__hint">将原子沿每个轴复制 N 倍，便于观察完整轨道</span>
    </div>
  </el-card>
</template>

<style scoped>
.settings {
  --el-card-border-color: transparent;
}

.settings :deep(.el-card__header) {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-soft);
}

.settings :deep(.el-card__body) {
  padding: 4px 14px 10px;
}

.settings__header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.settings__title {
  font-weight: 600;
  font-size: 13px;
}

.settings__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 0;
  font-size: 13px;
}

.settings__block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0;
  font-size: 13px;
  border-top: 1px dashed var(--border-soft);
}

.settings__block:first-of-type {
  border-top: none;
}

.settings__hint {
  font-size: 11px;
  color: var(--text-secondary);
}

.settings__sub {
  margin: 0 0 10px;
  padding: 10px 12px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.settings__subgroup {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings__subgroup-title {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--el-text-color-secondary, rgba(148, 163, 184, 0.9));
}

.settings__subcheck {
  height: 24px;
  margin-right: 0;
}

.settings__subrow {
  display: flex;
  gap: 8px;
}

.settings__linkbtn {
  padding: 3px 8px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}

.settings__linkbtn:hover {
  background: rgba(148, 163, 184, 0.16);
}
</style>
