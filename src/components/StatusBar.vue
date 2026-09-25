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
    <span class="status-bar__item">
      <span class="status-bar__dot"></span>
      {{ summary }}
    </span>
    <span v-if="store.currentAtoms.length" class="status-bar__meta">
      当前显示 {{ store.selectedWyckoffLetter }} 位置
    </span>
    <span class="status-bar__fps mono">{{ store.fps }} FPS</span>
  </footer>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  height: 32px;
  font-size: 12px;
  color: #e5e7eb;
  background: linear-gradient(90deg, #111827, #1f2937);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.status-bar__item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-bar__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.8);
}

.status-bar__meta {
  color: #9ca3af;
}

.status-bar__fps {
  margin-left: auto;
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
}
</style>
