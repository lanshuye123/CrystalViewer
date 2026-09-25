<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { useCrystalStore } from '@/stores/crystal'
import { suggestSpaceGroups } from '@/lib/spacegroup'
import { CRYSTAL_SYSTEMS, CRYSTAL_SYSTEM_LABELS, type CrystalSystem } from '@/types/crystal'

const store = useCrystalStore()

const query = ref('')
const systemFilter = ref<CrystalSystem | ''>('')
const suggestions = ref<{ number: number; symbol: string }[]>([])

const options = computed(() =>
  store.index
    .filter((entry) => !systemFilter.value || entry.crystalSystem === systemFilter.value)
    .map((entry) => ({
      value: entry.number,
      label: `${entry.number}  ${entry.symbol}`,
    })),
)

function systemLabel(system: CrystalSystem): string {
  return CRYSTAL_SYSTEM_LABELS[system]
}

async function submit() {
  suggestions.value = []
  const value = query.value.trim()
  if (!value) return
  const ok = await store.selectSpaceGroup(value)
  if (!ok) {
    suggestions.value = suggestSpaceGroups(value)
  }
}

async function pick(entry: { number: number; symbol: string }) {
  suggestions.value = []
  query.value = String(entry.number)
  await store.selectByNumber(entry.number)
}

async function selectFromList(number: number) {
  query.value = String(number)
  suggestions.value = []
  await store.selectByNumber(number)
}
</script>

<template>
  <div class="sg-input">
    <el-input
      v-model="query"
      class="sg-input__field"
      placeholder="输入空间群编号或符号，如 62 或 Pnma"
      clearable
      @keyup.enter="submit"
    >
      <template #prepend>
        <el-select v-model="systemFilter" placeholder="全部晶系" style="width: 118px">
          <el-option label="全部晶系" value="" />
          <el-option
            v-for="system in CRYSTAL_SYSTEMS"
            :key="system"
            :label="systemLabel(system)"
            :value="system"
          />
        </el-select>
      </template>
      <template #append>
        <el-button :icon="Search" @click="submit">查询</el-button>
      </template>
    </el-input>

    <el-select
      class="sg-input__select"
      filterable
      placeholder="或从列表中选择"
      :model-value="store.currentSpaceGroup?.number"
      @change="selectFromList"
    >
      <el-option
        v-for="option in options"
        :key="option.value"
        :label="option.label"
        :value="option.value"
      />
    </el-select>

    <el-alert
      v-if="store.error"
      :title="store.error"
      type="warning"
      :closable="false"
      show-icon
      class="sg-input__alert"
    >
      <div v-if="suggestions.length" class="sg-input__suggestions">
        <span>相似空间群：</span>
        <el-tag
          v-for="suggestion in suggestions"
          :key="suggestion.number"
          size="small"
          effect="plain"
          class="sg-input__tag"
          @click="pick(suggestion)"
        >
          {{ suggestion.number }} {{ suggestion.symbol }}
        </el-tag>
      </div>
    </el-alert>
  </div>
</template>

<style scoped>
.sg-input {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.sg-input__field {
  flex: 1;
  min-width: 280px;
  max-width: 560px;
}

.sg-input__select {
  width: 200px;
}

.sg-input__alert {
  width: 100%;
}

.sg-input__suggestions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.sg-input__tag {
  cursor: pointer;
}
</style>
