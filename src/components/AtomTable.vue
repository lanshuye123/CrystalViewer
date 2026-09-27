<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { CopyDocument } from '@element-plus/icons-vue'
import { useCrystalStore } from '@/stores/crystal'
import type { WyckoffPosition } from '@/types/crystal'

const store = useCrystalStore()

const positions = computed(() => store.currentSpaceGroup?.wyckoffPositions ?? [])

function rowClassName({ row }: { row: WyckoffPosition }): string {
  return row.letter === store.selectedWyckoffLetter ? 'atom-table__row--active' : ''
}

function selectRow(row: WyckoffPosition) {
  store.selectWyckoff(row.letter)
}

async function copyCoordinates(row: WyckoffPosition) {
  const text = row.coordinates.join('\n')
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(`已复制 ${row.letter} 位置的等效坐标`)
  } catch {
    ElMessage.error('复制失败，请手动选择文本')
  }
}
</script>

<template>
  <el-card class="atom-table" shadow="never">
    <template #header>
      <div class="atom-table__header">
        <div class="atom-table__heading">
          <span class="atom-table__dot"></span>
          <span class="atom-table__title">Wyckoff 位置</span>
          <el-tag v-if="positions.length" size="small" effect="plain" round class="mono">
            {{ positions.length }}
          </el-tag>
          <el-tag v-if="store.atomCount" size="small" effect="light" round class="atom-table__count">
            显示 {{ store.atomCount }} 个原子
          </el-tag>
        </div>
        <span class="atom-table__hint">点击行切换显示位置 · 多重度越低原子越少</span>
      </div>
    </template>

    <el-table
      :data="positions"
      size="small"
      height="100%"
      :row-class-name="rowClassName"
      :default-sort="{ prop: 'multiplicity', order: 'ascending' }"
      @row-click="selectRow"
    >
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="atom-table__expand">
            <div class="atom-table__expand-head">
              <span>{{ row.multiplicity }}{{ row.letter }} 全部等效坐标</span>
              <el-button
                size="small"
                text
                :icon="CopyDocument"
                @click.stop="copyCoordinates(row)"
              >
                复制
              </el-button>
            </div>
            <div class="mono atom-table__coords">
              <div v-for="(coord, index) in row.coordinates" :key="index">
                {{ index + 1 }}. {{ coord }}
              </div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="letter" label="字母" width="64" sortable />
      <el-table-column prop="multiplicity" label="多重度" width="82" sortable />
      <el-table-column
        prop="siteSymmetry"
        label="位置对称性"
        width="104"
        class-name="mono"
      />
      <el-table-column prop="representative" label="代表坐标" class-name="mono" />
    </el-table>
  </el-card>
</template>

<style scoped>
.atom-table {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.atom-table :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  padding: 8px;
}

.atom-table :deep(.el-card__header) {
  padding: 10px 16px;
}

.atom-table__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.atom-table__heading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.atom-table__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.atom-table__title {
  font-weight: 600;
  font-size: 14px;
}

.atom-table__count {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: transparent;
}

.atom-table__hint {
  font-size: 12px;
  color: var(--text-secondary);
}

/* Rows behave like clickable list items */
.atom-table :deep(.el-table__row) {
  cursor: pointer;
}

.atom-table :deep(.el-table__row:hover > td) {
  background: var(--accent-soft) !important;
}

.atom-table__expand {
  padding: 4px 12px;
}

.atom-table__expand-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #606266;
  font-size: 12px;
}

.atom-table__coords {
  margin-top: 6px;
  max-height: 180px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.7;
  user-select: text;
}

.atom-table :deep(.atom-table__row--active td.el-table__cell) {
  background: var(--el-color-primary-light-9);
}
</style>
