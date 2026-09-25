<script setup lang="ts">
import { computed } from 'vue'
import { useCrystalStore } from '@/stores/crystal'
import { CRYSTAL_SYSTEM_LABELS } from '@/types/crystal'

const store = useCrystalStore()

const group = computed(() => store.currentSpaceGroup)

const latticeText = computed(() => {
  const p = group.value?.latticeParams
  if (!p) return '—'
  return `a=${p.a} b=${p.b} c=${p.c} Å, α=${p.alpha}° β=${p.beta}° γ=${p.gamma}°`
})
</script>

<template>
  <el-card class="info-card" shadow="never">
    <template v-if="group">
      <div class="info-card__headline">
        <span class="info-card__number mono">#{{ group.number }}</span>
        <span class="info-card__symbol">{{ group.symbolHM }}</span>
        <el-tag size="small" effect="light" round>
          {{ CRYSTAL_SYSTEM_LABELS[group.crystalSystem] }}晶系
        </el-tag>
      </div>
      <el-descriptions :column="2" size="small" border>
        <el-descriptions-item label="Hall 符号">
          <span class="mono">{{ group.symbolHall }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="点群">
          <span class="mono">{{ group.pointGroup }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="Bravais 格子">{{ group.latticeType }}</el-descriptions-item>
        <el-descriptions-item label="对称操作数">
          {{ group.symmetryOperations.length }}
        </el-descriptions-item>
        <el-descriptions-item label="晶胞参数" :span="2">
          <span class="mono">{{ latticeText }}</span>
        </el-descriptions-item>
      </el-descriptions>
    </template>
    <el-empty v-else description="请输入或选择空间群" :image-size="48" />
  </el-card>
</template>

<style scoped>
.info-card :deep(.el-card__body) {
  padding: 12px 14px;
}

.info-card__headline {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 10px;
}

.info-card__number {
  color: var(--accent);
  font-size: 14px;
  font-weight: 600;
}

.info-card__symbol {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.info-card :deep(.el-descriptions__label) {
  width: 88px;
}
</style>
