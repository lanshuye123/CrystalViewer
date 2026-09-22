<script setup lang="ts">
import { computed } from 'vue'
import { useCrystalStore } from '@/stores/crystal'
import { CRYSTAL_SYSTEM_LABELS } from '@/types/crystal'

const store = useCrystalStore()

const summary = computed(() => {
  const group = store.currentSpaceGroup
  if (!group) return '未选择空间群'
  return `#${group.number} ${group.symbolHM} · ${CRYSTAL_SYSTEM_LABELS[group.crystalSystem]}晶系 · 原子 ${store.atomCount}`
})
</script>

<template>
  <footer class="status-bar">
    <span>{{ summary }}</span>
    <span v-if="store.currentAtoms.length" class="status-bar__meta">
      当前显示 {{ store.selectedWyckoffLetter }} 位置
    </span>
    <span class="status-bar__fps">{{ store.fps }} FPS</span>
  </footer>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  height: 30px;
  font-size: 12px;
  color: #e5e7eb;
  background: #1f2937;
}

.status-bar__meta {
  color: #9ca3af;
}

.status-bar__fps {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
</style>
