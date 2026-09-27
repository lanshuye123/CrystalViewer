<script setup lang="ts">
import { computed } from 'vue'
import { useCrystalStore } from '@/stores/crystal'
import type { BackgroundTheme, DisplaySettings, ModelType } from '@/types/crystal'

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
</style>
