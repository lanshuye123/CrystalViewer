<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Setting } from '@element-plus/icons-vue'
import SpaceGroupInput from '@/components/SpaceGroupInput.vue'
import SpaceGroupInfoCard from '@/components/SpaceGroupInfoCard.vue'
import CrystalViewer from '@/components/CrystalViewer.vue'
import DisplaySettings from '@/components/DisplaySettings.vue'
import AtomTable from '@/components/AtomTable.vue'
import AtomInput from '@/components/AtomInput.vue'
import StatusBar from '@/components/StatusBar.vue'
import { useCrystalStore } from '@/stores/crystal'

const store = useCrystalStore()
const showSettings = ref(true)
const sideTab = ref<'wyckoff' | 'custom'>('wyckoff')

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
        <span class="app__logo" aria-hidden="true"></span>
        <span class="app__name">CrystalViewer</span>
        <span class="app__subtitle">空间群晶胞查看器</span>
      </div>
      <SpaceGroupInput />
    </header>

    <main class="app__main">
      <section class="app__viewer">
        <CrystalViewer />
        <el-button
          class="app__settings-toggle"
          size="small"
          circle
          :type="showSettings ? 'primary' : 'default'"
          :icon="Setting"
          :title="showSettings ? '隐藏显示设置' : '显示显示设置'"
          @click="showSettings = !showSettings"
        />
        <transition name="el-fade-in">
          <div v-show="showSettings" class="app__settings">
            <DisplaySettings />
          </div>
        </transition>
      </section>

      <aside class="app__side">
        <SpaceGroupInfoCard class="app__side-info" />
        <el-tabs v-model="sideTab" class="app__side-tabs">
          <el-tab-pane label="Wyckoff 位置" name="wyckoff" lazy>
            <AtomTable />
          </el-tab-pane>
          <el-tab-pane name="custom">
            <template #label>
              自定义原子
              <el-badge
                v-if="store.customAtomInputs.length"
                :value="store.customAtomInputs.length"
                class="app__tab-badge"
              />
            </template>
            <AtomInput />
          </el-tab-pane>
        </el-tabs>
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
  padding: 10px 20px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border-soft);
  flex-wrap: wrap;
  z-index: 3;
}

.app__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
}

.app__logo {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.35), transparent 55%),
    linear-gradient(135deg, var(--accent), #06b6d4);
  box-shadow: 0 2px 6px rgba(79, 110, 247, 0.35);
}

.app__name {
  font-size: 19px;
  font-weight: 800;
  letter-spacing: 0.3px;
  background: linear-gradient(120deg, #1f2937 40%, var(--accent));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.app__subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  padding-left: 10px;
  border-left: 1px solid var(--border-soft);
}

.app__main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(340px, 420px);
  gap: var(--viewer-gap);
  padding: var(--viewer-gap);
}

.app__viewer {
  position: relative;
  min-height: 0;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-soft);
  background: #111827;
}

.app__settings-toggle {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 3;
  box-shadow: var(--shadow-float);
}

.app__settings {
  position: absolute;
  top: 52px;
  right: 12px;
  width: 264px;
  max-height: calc(100% - 70px);
  overflow: auto;
  z-index: 2;
  border-radius: var(--radius-md);
}

.app__side {
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--viewer-gap);
}

.app__side-info {
  flex: none;
}

.app__side-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.app__side-tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 12px;
}

.app__side-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
}

.app__side-tabs :deep(.el-tab-pane) {
  height: 100%;
}

.app__tab-badge {
  margin-left: 6px;
  transform: translateY(-1px);
}

@media (max-width: 900px) {
  .app__main {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(320px, 55vh) minmax(240px, 1fr);
    overflow: auto;
  }

  .app__settings-toggle {
    right: 12px;
  }
}
</style>
