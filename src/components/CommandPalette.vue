<template>
  <Teleport to="body">
    <Transition name="cp-fade">
      <div v-if="cp.state.open" class="cp-overlay" @click.self="cp.close()">
        <div class="cp-box">
          <div class="cp-input-row">
            <Search :size="15" :stroke-width="2.2" class="cp-search-icon" />
            <input
              ref="inputEl"
              v-model="query"
              class="cp-input"
              placeholder="Куда перейти или что сделать? (Ctrl+K / Ctrl+/)"
              @keydown.down.prevent="move(1)"
              @keydown.up.prevent="move(-1)"
              @keydown.enter.prevent="runSelected"
              @keydown.esc="cp.close()"
            />
            <kbd class="cp-esc-hint">Esc</kbd>
          </div>

          <div class="cp-results">
            <div v-if="!filtered.length" class="cp-empty">Ничего не нашлось</div>
            <button
              v-for="(item, i) in filtered" :key="item.id"
              class="cp-item"
              :class="{ active: i === activeIndex }"
              @mouseenter="activeIndex = i"
              @click="run(item)"
            >
              <component :is="item.icon" :size="15" :stroke-width="2" class="cp-item-icon" />
              <span class="cp-item-label">{{ item.label }}</span>
              <span v-if="item.hint" class="cp-item-hint">{{ item.hint }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useCommandPalette } from '@/composables/useCommandPalette'
import { confirmDialog } from '@/composables/useConfirm'
import { LayoutDashboard, MessageSquare, Plus, Sun, Moon, LogOut, Hash, Search } from 'lucide-vue-next'

const cp = useCommandPalette()
const router = useRouter()
const store = useAppStore()

const query = ref('')
const activeIndex = ref(0)
const inputEl = ref(null)

const staticCommands = computed(() => [
  { id: 'nav-kanban', label: 'Канбан', icon: LayoutDashboard, run: () => router.push('/kanban') },
  { id: 'new-card', label: 'Новая задача', icon: Plus, run: () => router.push('/kanban?new=1') },
  { id: 'nav-chat', label: 'Чат', icon: MessageSquare, run: () => router.push(store.activeChId ? `/chat/${store.activeChId}` : '/chat') },
  { id: 'theme', label: store.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема', icon: store.theme === 'dark' ? Sun : Moon, run: () => store.toggleTheme() },
  {
    id: 'logout', label: 'Выйти из аккаунта', icon: LogOut,
    run: async () => { if (await confirmDialog('Выйти из аккаунта?')) { store.logout(); router.push('/') } }
  }
])

const channelCommands = computed(() => store.allChannels.map(ch => ({
  id: `ch-${ch.id}`,
  label: ch.name,
  hint: 'канал',
  icon: Hash,
  run: () => { store.setChannel(ch.id); router.push({ name: 'chat', params: { channelId: ch.id } }) }
})))

const allCommands = computed(() => [...staticCommands.value, ...channelCommands.value])

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return allCommands.value
  return allCommands.value.filter(c => c.label.toLowerCase().includes(q))
})

watch(filtered, () => { activeIndex.value = 0 })
watch(() => cp.state.open, async (open) => {
  if (open) {
    query.value = ''
    activeIndex.value = 0
    await nextTick()
    inputEl.value?.focus()
  }
})

function move(delta) {
  if (!filtered.value.length) return
  activeIndex.value = (activeIndex.value + delta + filtered.value.length) % filtered.value.length
}
function run(item) {
  cp.close()
  item.run()
}
function runSelected() {
  const item = filtered.value[activeIndex.value]
  if (item) run(item)
}

// Глобальный шорткат — вешаем один раз здесь, а не в App.vue,
// чтобы вся логика палитры жила в одном компоненте
// Ctrl/Cmd+K — основной шорткат. Firefox резервирует Ctrl+K под фокус на
// поиск в тулбаре и не всегда отдаёт его странице — Ctrl+/ как запасной вариант.
function onGlobalKeydown(e) {
  const isK = e.key === 'k' || e.key === 'K'
  const isSlash = e.key === '/' && !e.shiftKey
  if ((e.metaKey || e.ctrlKey) && (isK || isSlash)) {
    e.preventDefault()
    cp.toggle()
  }
}
window.addEventListener('keydown', onGlobalKeydown)
</script>

<style scoped>
.cp-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.5);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 12vh;
  z-index: 4000;
}
.cp-box {
  width: min(520px, 92vw); max-height: 60vh;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-xl); box-shadow: var(--shadow-lg);
  display: flex; flex-direction: column; overflow: hidden;
}
.cp-input-row {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.cp-search-icon { color: var(--text-faint); flex-shrink: 0; }
.cp-input {
  flex: 1; background: none; border: none; outline: none;
  font-size: var(--text-base); color: var(--text);
}
.cp-input::placeholder { color: var(--text-faint); }
.cp-esc-hint {
  font-size: 10px; font-weight: 600; color: var(--text-faint);
  border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px;
  flex-shrink: 0;
}
.cp-results { overflow-y: auto; padding: 6px; }
.cp-empty { padding: 20px; text-align: center; font-size: var(--text-sm); color: var(--text-faint); }
.cp-item {
  width: 100%; display: flex; align-items: center; gap: 10px;
  padding: 9px 10px; border-radius: var(--radius-md);
  font-size: var(--text-sm); color: var(--text); text-align: left;
}
.cp-item-icon { color: var(--text-faint); flex-shrink: 0; }
.cp-item.active { background: var(--accent-soft); }
.cp-item.active .cp-item-icon { color: var(--accent); }
.cp-item-label { flex: 1; }
.cp-item-hint { font-size: 11px; color: var(--text-faint); }

.cp-fade-enter-active, .cp-fade-leave-active { transition: opacity .15s ease; }
.cp-fade-enter-from, .cp-fade-leave-to { opacity: 0; }
</style>