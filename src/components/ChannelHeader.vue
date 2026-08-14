<template>
  <div class="ch-header-wrap">
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

    <div v-if="store.activeChId" class="ch-filters">
      <button
        v-for="f in filters" :key="f.value"
        class="filter-chip"
        :class="{ active: store.activeAttachmentFilter === f.value }"
        @click="store.setAttachmentFilter(store.activeChId, f.value)"
      ><component :is="f.icon" :size="12" :stroke-width="2.2" /> {{ f.label }}</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { LayoutGrid, Image as ImageIcon, FileText, Link2 } from 'lucide-vue-next'

const store = useAppStore()
const onlineHere = computed(() =>
  store.onlineList.filter(u => u.channelId === store.activeChId)
)
const filters = [
  { value: 'all',      icon: LayoutGrid, label: 'Все' },
  { value: 'image',    icon: ImageIcon,  label: 'Картинки' },
  { value: 'document', icon: FileText,   label: 'Документы' },
  { value: 'link',     icon: Link2,      label: 'Ссылки' },
]
function getUserColor(u) {
  return '#7c6af7'
}
function getUserAvatar(u) {
  return u.userName?.[0]?.toUpperCase() || '?'
}
</script>

<style scoped>
.ch-header-wrap { background: var(--surface); border-bottom: 1px solid var(--divider); }
.ch-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 var(--space-5);
  height: 52px; min-height: 52px;
}
.ch-filters {
  display: flex; align-items: center; gap: var(--space-2);
  padding: 0 var(--space-5) var(--space-2);
  overflow-x: auto;
}
.filter-chip {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: var(--text-xs); font-weight: 600;
  color: var(--text-muted);
  padding: 4px 10px; border-radius: var(--radius-full);
  border: 1px solid var(--border); background: var(--surface-2);
  white-space: nowrap;
  transition: all var(--transition);
}
.filter-chip:hover { background: var(--hover); color: var(--text); }
.filter-chip.active {
  background: var(--accent-soft); color: var(--accent);
  border-color: var(--accent-line);
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