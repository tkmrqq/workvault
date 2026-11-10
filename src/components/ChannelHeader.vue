<template>
  <div class="ch-header-wrap">
    <div class="ch-header">
      <div class="ch-info">
        <MobileMenuButton />
        <span class="ch-icon-box">{{ store.activeChannel?.icon || '#' }}</span>
        <div class="ch-titles">
          <span v-if="activeFolder" class="ch-folder">{{ activeFolder.icon }} {{ activeFolder.name }}</span>
          <span class="ch-name" :title="store.activeChannel?.name">{{ store.activeChannel?.name || 'Выбери канал' }}</span>
        </div>
      </div>
      <div v-if="store.activeChId" class="ch-users" :title="onlineHere.map(u => u.userName).join(', ')">
        <div class="avatar-stack">
          <div v-for="u in shownAvatars" :key="u.userId" class="online-avatar"
            :style="{ background: getUserColor(u) + '22', color: getUserColor(u) }"
            :title="u.userName"
          ><AvatarContent :value="store.usersById?.[u.userId]?.avatar || getUserAvatar(u)" :name="u.userName" /></div>
          <div v-if="extraCount" class="online-avatar more">+{{ extraCount }}</div>
        </div>
        <span class="ch-count"><span class="live-dot" />{{ onlineHere.length }} онлайн</span>
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
import MobileMenuButton from './MobileMenuButton.vue'
import { LayoutGrid, Image as ImageIcon, FileText, Link2 } from 'lucide-vue-next'

const store = useAppStore()
const onlineHere = computed(() =>
  store.onlineList.filter(u => u.channelId === store.activeChId)
)
const MAX_AVATARS = 5
const shownAvatars = computed(() => onlineHere.value.slice(0, MAX_AVATARS))
const extraCount   = computed(() => Math.max(0, onlineHere.value.length - MAX_AVATARS))
const activeFolder = computed(() =>
  store.folders.find(f => (f.channels || []).some(c => c.id === store.activeChId)) || null
)
const filters = [
  { value: 'all',      icon: LayoutGrid, label: 'Все' },
  { value: 'image',    icon: ImageIcon,  label: 'Картинки' },
  { value: 'document', icon: FileText,   label: 'Документы' },
  { value: 'link',     icon: Link2,      label: 'Ссылки' },
]
function getUserColor(u) {
  return store.usersById?.[u.userId]?.color || '#7c6af7'
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
.ch-info { display: flex; align-items: center; gap: var(--space-2); min-width: 0; flex: 1; }
.ch-icon-box {
  width: 32px; height: 32px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-md);
  background: var(--accent-soft); color: var(--accent);
  font-size: 1rem; font-weight: 700;
}
.ch-titles { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
.ch-folder {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ch-name {
  font-size: var(--text-base); font-weight: 700;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ch-users { display: flex; align-items: center; gap: var(--space-2); flex-shrink: 0; }
.avatar-stack { display: flex; align-items: center; padding-left: 6px; }
.online-avatar {
  width: 28px; height: 28px; border-radius: var(--radius-full);
  display: flex; align-items: center; justify-content: center;
  font-size: .7rem; font-weight: 700;
  margin-left: -6px;
  border: 2px solid var(--surface);
  overflow: hidden;
}
.online-avatar.more { background: var(--surface-3, var(--surface-2)); color: var(--text-muted); font-size: 10px; }
.ch-count {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: var(--text-xs); color: var(--text-muted); margin-left: var(--space-1);
  white-space: nowrap;
}
.live-dot { width: 6px; height: 6px; border-radius: var(--radius-full); background: var(--green); }
@media (max-width: 860px) {
  .ch-header { padding: 0 var(--space-3); }
  .ch-filters { padding: 0 var(--space-3) var(--space-2); }
  .avatar-stack { display: none; }
}
</style>