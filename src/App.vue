<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Setting } from '@element-plus/icons-vue'
import SpaceGroupInput from '@/components/SpaceGroupInput.vue'
import SpaceGroupInfoCard from '@/components/SpaceGroupInfoCard.vue'
import CrystalViewer from '@/components/CrystalViewer.vue'
import DisplaySettings from '@/components/DisplaySettings.vue'
import AtomTable from '@/components/AtomTable.vue'
import StatusBar from '@/components/StatusBar.vue'
import { useCrystalStore } from '@/stores/crystal'

const store = useCrystalStore()
const showSettings = ref(true)

onMounted(() => {
  if (!store.currentSpaceGroup) {
    void store.selectByNumber(225)
  }
})
</script>

<template>
  <div class="app">
    <header class="app__header">
      <div class="app__brand">
        CrystalViewer
        <span class="app__subtitle">空间群晶胞查看器</span>
      </div>
      <SpaceGroupInput />
    </header>

    <main class="app__main">
      <section class="app__viewer">
        <CrystalViewer />
        <SpaceGroupInfoCard class="app__info" />
        <el-button
          class="app__settings-toggle"
          size="small"
          :icon="Setting"
          @click="showSettings = !showSettings"
        >
          显示设置
        </el-button>
        <transition name="el-fade-in">
          <div v-show="showSettings" class="app__settings">
            <DisplaySettings />
          </div>
        </transition>
      </section>

      <aside class="app__table">
        <AtomTable />
      </aside>
    </main>

    <StatusBar />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.app__header {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 12px 16px;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
  flex-wrap: wrap;
}

.app__brand {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.5px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.app__subtitle {
  font-size: 12px;
  font-weight: 400;
  color: #909399;
}

.app__main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(360px, 2fr);
  gap: 12px;
  padding: 12px;
}

.app__viewer {
  position: relative;
  min-height: 0;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
}

.app__info {
  position: absolute;
  top: 12px;
  left: 12px;
  width: 320px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(6px);
}

.app__settings-toggle {
  position: absolute;
  top: 12px;
  right: 176px;
  z-index: 2;
}

.app__settings {
  position: absolute;
  top: 52px;
  right: 12px;
  width: 262px;
  max-height: calc(100% - 70px);
  overflow: auto;
}

.app__table {
  min-height: 0;
}

@media (max-width: 900px) {
  .app__main {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(320px, 55vh) minmax(240px, 1fr);
    overflow: auto;
  }

  .app__info {
    width: 240px;
  }

  .app__settings-toggle {
    right: 12px;
  }
}
</style>
