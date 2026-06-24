<template>
  <aside class="sidebar">
    <!-- TitleBar убран отсюда — он теперь в ChatView.vue над всем лейаутом -->
    <div class="sidebar-header">
      <svg class="logo" viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="8" fill="var(--accent)" opacity=".18"/>
        <path d="M16 5L25 10.5V21.5L16 27L7 21.5V10.5L16 5Z"
          fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-linejoin="round"/>
        <circle cx="16" cy="16" r="3.2" fill="var(--accent)" opacity=".9"/>
      </svg>
      <span class="app-name">WorkVault</span>
      <button class="icon-btn" @click="showEdit = true" title="Управление каналами">⚙️</button>
      <button class="icon-btn" @click="store.toggleTheme()" title="Тема">
        <span v-if="store.theme === 'dark'">☀️</span>
        <span v-else>🌙</span>
      </button>
    </div>

    <div class="user-badge" @click="showProfile = true" title="Настройки профиля">
      <span class="avatar-sm" :style="{ background: store.user?.color + '22', color: store.user?.color }">
        {{ store.user?.avatar }}
      </span>
      <span class="user-name">{{ store.user?.name }}</span>
      <span class="online-dot" title="Онлайн" />
    </div>

    <div class="search-box">
      <span class="search-icon">🔍</span>
      <input v-model="search" placeholder="Поиск..." />
    </div>

    <nav class="channel-nav">
      <div v-for="folder in filteredFolders" :key="folder.id" class="folder">
        <button class="folder-header" @click="toggleFolder(folder.id)">
          <span class="folder-arrow" :class="{ open: !collapsed[folder.id] }">›</span>
          <span class="folder-icon">{{ folder.icon }}</span>
          <span class="folder-name">{{ folder.name }}</span>
        </button>
        <div v-show="!collapsed[folder.id]" class="folder-channels">
          <button
            v-for="ch in folder.channels" :key="ch.id"
            class="channel-item"
            :class="{ active: store.activeChId === ch.id }"
            @click="go(ch.id)"
          >
            <span class="ch-icon">{{ ch.icon }}</span>
            <span class="ch-name">{{ ch.name }}</span>
            <span v-if="unread[ch.id]" class="badge">{{ unread[ch.id] }}</span>
            <span v-if="onlineInChannel(ch.id)" class="ch-online">{{ onlineInChannel(ch.id) }}</span>
          </button>
        </div>
      </div>
    </nav>

    <!-- ─── КАНБАН ──────────────────────────────────────────── -->
    <div class="kanban-nav">
      <button
        class="channel-item kanban-btn"
        :class="{ active: $route.name === 'kanban' }"
        @click="router.push('/kanban')"
      >
        <span class="ch-icon">📋</span>
        <span class="ch-name">Канбан</span>
      </button>
    </div>

    <div class="online-section">
      <div class="online-label">Онлайн — {{ store.onlineList.length }}</div>
      <div class="online-list">
        <div v-for="u in store.onlineList" :key="u.userId" class="online-user">
          <span class="online-dot-sm" />
          <span class="ou-name">{{ u.userName }}</span>
        </div>
      </div>
    </div>

    <EditSidebar v-if="showEdit" @close="showEdit = false" />
      <ProfileModal
        v-if="showProfile && store.user"
        :user="store.user"
        :view-only="false"
        @close="showProfile = false"
        @updated="showProfile = false"
      />
  </aside>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import EditSidebar from './EditSidebar.vue'
import ProfileModal from './ProfileModal.vue'
// TitleBar импорт убран

const showProfile = ref(false)
const store   = useAppStore()
const router  = useRouter()
const search  = ref('')
const collapsed = ref({})
const showEdit  = ref(false)
const unread    = ref({})

const filteredFolders = computed(() => {
  if (!search.value.trim()) return store.folders
  const q = search.value.toLowerCase()
  return store.folders
    .map(f => ({ ...f, channels: (f.channels || []).filter(c => c.name.toLowerCase().includes(q)) }))
    .filter(f => f.channels.length)
})

function toggleFolder(id) { collapsed.value[id] = !collapsed.value[id] }

function go(channelId) {
  store.setChannel(channelId)
  router.push({ name: 'chat', params: { channelId } })
}

function onlineInChannel(channelId) {
  return store.onlineList.filter(u => u.channelId === channelId && u.userId !== store.user?.id).length || 0
}
</script>

<style scoped>
.user-badge { cursor: pointer; transition: background var(--transition); border-radius: var(--radius-md); }

.user-badge:hover { background: var(--hover); }

.sidebar {
  display: flex; flex-direction: column;
  background: var(--surface);
  border-right: 1px solid var(--divider);
  overflow: hidden;
  user-select: none;
}
.sidebar-header {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--divider);
  min-height: 52px;
}
.logo { width: 26px; height: 26px; flex-shrink: 0; }
.app-name { flex: 1; font-size: var(--text-sm); font-weight: 700; }
.icon-btn {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-md); font-size: .85rem;
  transition: background var(--transition);
}
.icon-btn:hover { background: var(--hover); }

.user-badge {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--divider);
}
.avatar-sm {
  width: 26px; height: 26px; border-radius: var(--radius-full);
  display: flex; align-items: center; justify-content: center;
  font-size: .85rem; flex-shrink: 0;
}
.user-name { flex: 1; font-size: var(--text-xs); font-weight: 600; color: var(--text-muted); }
.online-dot {
  width: 8px; height: 8px; border-radius: var(--radius-full);
  background: var(--green); flex-shrink: 0;
}

.search-box {
  display: flex; align-items: center; gap: var(--space-2);
  margin: var(--space-3);
  background: var(--surface-3); border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  transition: border-color var(--transition);
}
.search-box:focus-within { border-color: var(--accent-line); }
.search-icon { font-size: .7rem; }
.search-box input {
  background: none; border: none; outline: none;
  font-size: var(--text-xs); color: var(--text); width: 100%;
}
.search-box input::placeholder { color: var(--text-faint); }

.channel-nav { flex: 1; overflow-y: auto; padding: var(--space-2) 0; }
.folder { margin-bottom: var(--space-1); }
.folder-header {
  display: flex; align-items: center; gap: var(--space-2);
  width: 100%; padding: var(--space-1) var(--space-3) var(--space-1) var(--space-2);
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em; color: var(--text-faint);
  transition: color var(--transition);
}
.folder-header:hover { color: var(--text-muted); }
.folder-arrow { display: inline-block; font-size: .75rem; transition: transform var(--transition); }
.folder-arrow.open { transform: rotate(90deg); }
.folder-icon { font-size: .8rem; }
.folder-name { flex: 1; }

.folder-channels { padding-left: var(--space-2); }
.channel-item {
  display: flex; align-items: center; gap: var(--space-2);
  width: 100%; padding: var(--space-1) var(--space-3) var(--space-1) var(--space-4);
  font-size: var(--text-xs); color: var(--text-muted);
  transition: background var(--transition), color var(--transition);
  position: relative;
}
.channel-item:hover { background: var(--hover); color: var(--text); }
.channel-item.active { background: var(--accent-soft); color: var(--text); }
.channel-item.active::before {
  content: ''; position: absolute; left: 0; top: 25%; bottom: 25%;
  width: 2px; background: var(--accent);
  border-radius: 0 var(--radius-full) var(--radius-full) 0;
}
.ch-icon { font-size: .85rem; color: var(--text-faint); }
.channel-item.active .ch-icon { color: var(--accent); }
.ch-name { flex: 1; }
.badge {
  font-size: 10px; font-weight: 700; min-width: 18px; height: 16px;
  background: var(--accent); color: white;
  border-radius: var(--radius-full);
  display: flex; align-items: center; justify-content: center; padding: 0 4px;
}
.ch-online { font-size: 10px; color: var(--green); font-weight: 600; }

.online-section {
  border-top: 1px solid var(--divider);
  padding: var(--space-2) var(--space-4) var(--space-3);
}
.online-label {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em; color: var(--text-faint); margin-bottom: var(--space-2);
}
.online-list { display: flex; flex-direction: column; gap: 2px; }
.online-user { display: flex; align-items: center; gap: var(--space-2); }
.online-dot-sm { width: 6px; height: 6px; border-radius: var(--radius-full); background: var(--green); flex-shrink: 0; }
.ou-name { font-size: var(--text-xs); color: var(--text-muted); }

.kanban-nav {
  padding: var(--space-2) var(--space-2) 0;
  border-top: 1px solid var(--divider);
}

</style>
