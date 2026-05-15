<template>
  <div class="ch-header">
    <div class="ch-info">
      <span class="ch-icon">{{ store.activeChannel?.icon || '#' }}</span>
      <span class="ch-name">{{ store.activeChannel?.name || 'Выбери канал' }}</span>
    </div>
    <div class="ch-users">
      <div v-for="u in onlineHere" :key="u.userId" class="online-avatar"
        :style="{ background: getUserColor(u) + '22', color: getUserColor(u) }"
        :title="u.userName"
      >{{ getUserAvatar(u) }}</div>
      <span class="ch-count">{{ onlineHere.length }} онлайн</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const onlineHere = computed(() =>
  store.onlineList.filter(u => u.channelId === store.activeChId)
)
function getUserColor(u) {
  return '#7c6af7'
}
function getUserAvatar(u) {
  return u.userName?.[0]?.toUpperCase() || '?'
}
</script>

<style scoped>
.ch-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 var(--space-5);
  height: 52px; min-height: 52px;
  border-bottom: 1px solid var(--divider);
  background: var(--surface);
}
.ch-info { display: flex; align-items: center; gap: var(--space-2); }
.ch-icon { font-size: 1rem; }
.ch-name { font-size: var(--text-base); font-weight: 700; }
.ch-users { display: flex; align-items: center; gap: var(--space-2); }
.online-avatar {
  width: 28px; height: 28px; border-radius: var(--radius-full);
  display: flex; align-items: center; justify-content: center;
  font-size: .7rem; font-weight: 700;
  margin-left: -6px;
}
.ch-count { font-size: var(--text-xs); color: var(--text-muted); margin-left: var(--space-2); }
</style>
