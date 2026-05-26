<template>
  <Teleport to="body">
    <div v-if="state" class="update-banner">
      <span v-if="state === 'available'">⬇️ Скачиваем обновление...</span>
      <span v-else>✅ Обновление готово!</span>
      <button v-if="state === 'downloaded'" class="update-btn" @click="install">
        Установить и перезапустить
      </button>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const state = ref(null)

onMounted(() => {
  if (!window.electronAPI) return
  window.electronAPI.onUpdateAvailable?.(() => state.value = 'available')
  window.electronAPI.onUpdateDownloaded?.(() => state.value = 'downloaded')
})

function install() {
  window.electronAPI?.installUpdate()
}
</script>

<style scoped>
.update-banner {
  position: fixed; bottom: var(--space-4); right: var(--space-4); z-index: 999;
  display: flex; align-items: center; gap: var(--space-3);
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: var(--space-3) var(--space-4);
  box-shadow: var(--shadow-lg); font-size: var(--text-sm);
  animation: slideUp .3s ease;
}
.update-btn {
  padding: var(--space-1) var(--space-3); border-radius: var(--radius-md);
  background: var(--accent); color: white;
  font-size: var(--text-xs); font-weight: 700;
  transition: background var(--transition);
}
.update-btn:hover { background: var(--accent-hover, var(--accent)); }
@keyframes slideUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>