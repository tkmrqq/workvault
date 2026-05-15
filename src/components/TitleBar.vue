<template>
  <div v-if="isElectron" class="titlebar">
    <div class="drag-region"></div>
    <div class="win-controls">
      <button class="wc-btn" @click="win('minimize')">─</button>
      <button class="wc-btn" @click="win('maximize')">□</button>
      <button class="wc-btn close" @click="win('close')">✕</button>
    </div>
  </div>
</template>

<script setup>
// window.electronAPI появляется только в Electron через preload.js
const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron

function win(action) {
  window.electronAPI?.[action]()
}
</script>

<style scoped>
.titlebar {
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  background: var(--surface);
  border-bottom: 1px solid var(--divider);
}

/* Вся левая часть — зона перетаскивания */
.drag-region {
  flex: 1;
  height: 100%;
  -webkit-app-region: drag;
}

/* Кнопки НЕ drag-зона — иначе не кликаются */
.win-controls {
  display: flex;
  -webkit-app-region: no-drag;
}

.wc-btn {
  width: 46px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 12px;
  transition: background 120ms;
}
.wc-btn:hover { background: var(--hover); color: var(--text); }
.wc-btn.close:hover { background: #c42b1c; color: white; }
</style>