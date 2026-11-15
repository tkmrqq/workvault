<template>
  <div v-if="pins.length" class="pin-bar" ref="rootEl">
    <button type="button" class="pin-main" :title="'Перейти к сообщению'" @click="jumpCurrent">
      <span class="pin-track" aria-hidden="true">
        <span v-for="(p, i) in trackItems" :key="p.id" class="pin-tick" :class="{ on: i === trackActive }" />
      </span>
      <Pin class="pin-ico" :size="14" :stroke-width="2.2" />
      <span class="pin-body">
        <span class="pin-label">
          Закреплённое сообщение<template v-if="pins.length > 1"> · {{ idx + 1 }} из {{ pins.length }}</template>
        </span>
        <span class="pin-text"><b>{{ current.user_name }}:</b> {{ preview(current) }}</span>
      </span>
    </button>
    <button type="button" class="pin-btn" :class="{ active: listOpen }" title="Все закреплённые" @click="listOpen = !listOpen">
      <ListIcon :size="15" :stroke-width="2.2" />
    </button>

    <div v-if="listOpen" class="pin-list" role="menu">
      <div class="pin-list-head">Закреплённые · {{ pins.length }}</div>
      <div class="pin-list-scroll">
        <div v-for="p in pins" :key="p.id" class="pin-row">
          <button type="button" class="pin-row-main" @click="jumpTo(p)">
            <span class="pin-row-top">
              <b :style="{ color: p.user_color || 'var(--text)' }">{{ p.user_name }}</b>
              <span class="pin-row-date">{{ fmtDate(p.created_at) }}</span>
            </span>
            <span class="pin-row-text">{{ preview(p) }}</span>
            <span v-if="p.pinned_by_name" class="pin-row-by">закрепил(а) {{ p.pinned_by_name }}</span>
          </button>
          <button type="button" class="pin-unpin" title="Открепить" @click="unpin(p)">
            <PinOff :size="14" :stroke-width="2.2" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { Pin, PinOff, List as ListIcon } from 'lucide-vue-next'

const store = useAppStore()
const pins = computed(() => store.activePins || [])
const idx = ref(0)
const listOpen = ref(false)
const rootEl = ref(null)

const current = computed(() => pins.value[Math.min(idx.value, pins.value.length - 1)] || {})
// Максимум 4 риски слева, как в Telegram
const trackItems = computed(() => {
  const n = pins.value.length
  if (n <= 4) return pins.value
  const start = Math.min(Math.max(0, idx.value - 1), n - 4)
  return pins.value.slice(start, start + 4)
})
const trackActive = computed(() => trackItems.value.findIndex(p => p.id === current.value.id))

watch(() => store.activeChId, () => { idx.value = 0; listOpen.value = false })
watch(() => pins.value.length, n => { if (idx.value >= n) idx.value = 0 })

function preview(m) {
  if (!m) return ''
  if (m.poll) return '📊 ' + (m.poll.question || 'Опрос')
  if (m.text) return String(m.text).replace(/\s+/g, ' ').slice(0, 160)
  if (m.type === 'sticker') return 'Стикер'
  if (m.type === 'image') return '🖼 Изображение'
  if (m.attachment || m.type === 'file') return '📎 Файл'
  return 'Сообщение'
}
function fmtDate(s) {
  if (!s) return ''
  const d = new Date(String(s).includes('T') || String(s).endsWith('Z') ? s : String(s).replace(' ', 'T') + 'Z')
  if (isNaN(d)) return ''
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function jumpTo(p) {
  if (!p?.id) return
  store.jumpToMessage(store.activeChId, p.id)
  listOpen.value = false
}
// Клик по плашке: прыгаем к текущему и переключаемся на следующий (более старый)
function jumpCurrent() {
  jumpTo(current.value)
  if (pins.value.length > 1) idx.value = (idx.value + 1) % pins.value.length
}
async function unpin(p) {
  try { await store.pinMessage(p.id, false) }
  catch (e) { alert(e.message) }
}

function onDocClick(e) {
  if (listOpen.value && rootEl.value && !rootEl.value.contains(e.target)) listOpen.value = false
}
function onKey(e) { if (e.key === 'Escape' && listOpen.value) listOpen.value = false }
onMounted(() => { document.addEventListener('mousedown', onDocClick); document.addEventListener('keydown', onKey) })
onUnmounted(() => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey) })
</script>

<style scoped>
.pin-bar {
  position: relative;
  display: flex; align-items: stretch; gap: var(--space-1);
  padding: 4px var(--space-4) 6px;
  border-top: 1px solid var(--divider);
  background: var(--surface);
}
.pin-main {
  flex: 1; min-width: 0;
  display: flex; align-items: center; gap: var(--space-2);
  padding: 4px var(--space-2);
  border: none; background: none; color: var(--text);
  border-radius: var(--radius-md); cursor: pointer; text-align: left;
  transition: background var(--transition);
}
.pin-main:hover { background: var(--hover); }
.pin-track { display: flex; flex-direction: column; gap: 2px; align-self: stretch; justify-content: center; }
.pin-tick { width: 2px; flex: 1; max-height: 10px; min-height: 4px; border-radius: 2px; background: var(--accent-line, var(--border)); opacity: .45; }
.pin-tick.on { background: var(--accent); opacity: 1; }
.pin-ico { color: var(--accent); flex-shrink: 0; }
.pin-body { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
.pin-label { font-size: var(--text-xs); font-weight: 700; color: var(--accent); }
.pin-text { font-size: var(--text-sm); color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pin-text b { color: var(--text); font-weight: 600; }
.pin-btn {
  display: flex; align-items: center; justify-content: center;
  width: 32px; border: none; background: none; color: var(--text-muted);
  border-radius: var(--radius-md); cursor: pointer;
}
.pin-btn:hover, .pin-btn.active { background: var(--hover); color: var(--text); }

.pin-list {
  position: absolute; right: var(--space-4); top: calc(100% + 4px); z-index: 50;
  width: min(380px, calc(100vw - 32px));
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-md); box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.pin-list-head { padding: var(--space-2) var(--space-3); font-size: var(--text-xs); font-weight: 700; color: var(--text-muted); border-bottom: 1px solid var(--divider); }
.pin-list-scroll { max-height: 360px; overflow-y: auto; padding: var(--space-1); }
.pin-row { display: flex; align-items: flex-start; gap: 4px; border-radius: var(--radius-md); }
.pin-row:hover { background: var(--hover); }
.pin-row-main {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;
  padding: 6px var(--space-2); border: none; background: none; color: var(--text);
  text-align: left; cursor: pointer; font-size: var(--text-sm);
}
.pin-row-top { display: flex; align-items: baseline; gap: var(--space-2); }
.pin-row-date { font-size: var(--text-xs); color: var(--text-faint); }
.pin-row-text { color: var(--text-muted); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }
.pin-row-by { font-size: var(--text-xs); color: var(--text-faint); }
.pin-unpin {
  margin: 6px 4px 0 0; padding: 4px; display: flex;
  border: none; background: none; color: var(--text-faint); border-radius: 6px; cursor: pointer;
  opacity: 0; transition: opacity var(--transition);
}
.pin-row:hover .pin-unpin, .pin-unpin:focus-visible { opacity: 1; }
.pin-unpin:hover { color: #e06c75; background: var(--surface-2); }
@media (hover: none) { .pin-unpin { opacity: 1; } }
</style>