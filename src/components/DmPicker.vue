<template>
  <Teleport to="body">
    <div class="dmp-backdrop" @click.self="emit('close')" @keydown.esc="emit('close')">
      <div class="dmp" role="dialog" aria-modal="true" aria-label="Новое личное сообщение">
        <div class="dmp-head">
          <span class="dmp-title">Новое сообщение</span>
          <button class="dmp-close" @click="emit('close')" aria-label="Закрыть"><X :size="15" :stroke-width="2.2" /></button>
        </div>
        <div class="dmp-search">
          <Search :size="13" :stroke-width="2" class="dmp-search-icon" />
          <input ref="inputEl" v-model="q" placeholder="Кому написать?" @keydown.down.prevent="move(1)"
            @keydown.up.prevent="move(-1)" @keydown.enter.prevent="pick(list[cursor])" />
        </div>
        <div class="dmp-list">
          <button v-for="(u, i) in list" :key="u.id" type="button" class="dmp-item"
            :class="{ cur: i === cursor }" :disabled="busy" @mouseenter="cursor = i" @click="pick(u)">
            <span class="dmp-avatar" :style="{ background: (u.color || '#7c6af7') + '22', color: u.color || '#7c6af7' }">
              <AvatarContent :value="u.avatar" :name="u.name" />
              <span v-if="isOnline(u.id)" class="dmp-online" />
            </span>
            <span class="dmp-name">{{ u.id === store.user?.id ? 'Избранное (заметки для себя)' : u.name }}</span>
            <span v-if="store.statusActive(u)" class="dmp-status">{{ u.status_emoji }} {{ u.status_text }}</span>
          </button>
          <div v-if="!list.length" class="dmp-empty">Никого не нашлось</div>
        </div>
        <div v-if="error" class="dmp-error">{{ error }}</div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { X, Search } from 'lucide-vue-next'

const emit = defineEmits(['close'])
const store = useAppStore()
const router = useRouter()
const q = ref('')
const cursor = ref(0)
const busy = ref(false)
const error = ref('')
const inputEl = ref(null)

const list = computed(() => {
  const s = q.value.trim().toLowerCase()
  const me = store.user?.id
  const all = [...(store.users || [])].sort((a, b) => (a.id === me) - (b.id === me) || String(a.name).localeCompare(String(b.name), 'ru'))
  return s ? all.filter(u => String(u.name || '').toLowerCase().includes(s)) : all
})
watch(q, () => { cursor.value = 0 })

function isOnline(id) { return store.onlineList.some(u => u.userId === id) }
function move(d) {
  const n = list.value.length
  if (n) cursor.value = (cursor.value + d + n) % n
}
async function pick(u) {
  if (!u || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const id = await store.openDm(u.id)
    router.push({ name: 'chat', params: { channelId: id } })
    emit('close')
  } catch (e) {
    error.value = e.message || 'Не удалось открыть диалог'
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  if (!store.users?.length) await store.loadUsers?.()
  await nextTick()
  inputEl.value?.focus()
})
</script>

<style scoped>
.dmp-backdrop {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0, 0, 0, .45);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 12vh;
}
.dmp {
  width: min(420px, calc(100vw - 32px));
  background: var(--surface); color: var(--text);
  border: 1px solid var(--border); border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  display: flex; flex-direction: column; max-height: 70vh; overflow: hidden;
}
.dmp-head { display: flex; align-items: center; padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--divider); }
.dmp-title { font-weight: 700; font-size: var(--text-base); flex: 1; }
.dmp-close { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; border-radius: 6px; display: flex; }
.dmp-close:hover { background: var(--hover); color: var(--text); }
.dmp-search { position: relative; padding: var(--space-3) var(--space-4) var(--space-2); }
.dmp-search-icon { position: absolute; left: calc(var(--space-4) + 10px); top: 50%; transform: translateY(-25%); color: var(--text-faint); }
.dmp-search input {
  width: 100%; box-sizing: border-box; padding: 8px 10px 8px 30px;
  background: var(--surface-2); color: var(--text);
  border: 1px solid var(--border); border-radius: var(--radius-md); font-size: var(--text-sm); outline: none;
}
.dmp-search input:focus { border-color: var(--accent); }
.dmp-list { overflow-y: auto; padding: var(--space-1) var(--space-2) var(--space-3); }
.dmp-item {
  width: 100%; display: flex; align-items: center; gap: var(--space-3);
  padding: 7px var(--space-2); border: none; background: none; color: var(--text);
  border-radius: var(--radius-md); cursor: pointer; text-align: left; font-size: var(--text-sm);
}
.dmp-item.cur { background: var(--hover); }
.dmp-item:disabled { opacity: .6; cursor: progress; }
.dmp-avatar {
  position: relative; width: 28px; height: 28px; border-radius: var(--radius-full);
  display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0;
}
.dmp-avatar :deep(img) { width: 100%; height: 100%; border-radius: inherit; object-fit: cover; }
.dmp-online {
  position: absolute; right: -1px; bottom: -1px; width: 9px; height: 9px;
  border-radius: 50%; background: var(--green); border: 2px solid var(--surface);
}
.dmp-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dmp-status { margin-left: auto; color: var(--text-faint); font-size: var(--text-xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 45%; }
.dmp-empty { padding: var(--space-4); text-align: center; color: var(--text-faint); font-size: var(--text-sm); }
.dmp-error { padding: 0 var(--space-4) var(--space-3); color: #e06c75; font-size: var(--text-xs); }
</style>