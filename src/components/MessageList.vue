<template>
  <div class="msg-list" ref="listEl" @scroll="onScroll">
    <div v-if="canLoadMore" class="load-more">
      <button class="load-btn" @click="loadMore" :disabled="loadingMore">
        <ArrowUp :size="12" :stroke-width="2.5" style="vertical-align:-1px;margin-right:4px" />{{ loadingMore ? 'Загружаю...' : 'Загрузить ещё' }}
      </button>
    </div>

    <div v-if="!store.activeMessages.length && store.activeChId" class="empty-state">
      <div class="empty-icon">{{ store.activeChannel?.icon }}</div>
      <h3># {{ store.activeChannel?.name }}</h3>
      <p>Это начало канала. Напиши первым!</p>
    </div>

    <div v-else-if="store.activeMessages.length && !store.filteredActiveMessages.length && store.activeChId" class="empty-state">
      <Search :size="48" />
      <h3>Ничего не найдено</h3>
      <p>В этом канале нет сообщений с таким фильтром</p>
    </div>

    <div v-if="!store.activeChId" class="empty-state">
      <div class="empty-icon">💬</div>
      <h3>Выбери канал</h3>
      <p>Выбери канал из левой панели</p>
    </div>

    <section v-for="(group, date) in groupedByDate" :key="date" class="day-group">
      <div class="date-sep"><span>{{ date }}</span></div>
      <template v-for="msg in group" :key="msg.id">
        <div v-if="msg.id === newDividerId" class="new-divider"><span>Новые сообщения</span></div>
        <MessageItem :msg="msg" @open-image="openLightbox" />
      </template>
    </section>

    <div v-if="store.typingNames.length" class="typing-indicator">
      <span class="typing-dots"><span/><span/><span/></span>
      <span class="typing-text">
        {{ store.typingNames.join(', ') }} {{ store.typingNames.length === 1 ? 'печатает' : 'печатают' }}...
      </span>
    </div>
    <div ref="bottomEl" />
  </div>

  <!-- ── Lightbox ── -->
  <Teleport to="body">
    <div v-if="lightboxUrl" class="lightbox" @click.self="lightboxUrl = null" @keydown.esc="lightboxUrl = null" tabindex="0" ref="lightboxEl">
      <button class="lb-close" @click="lightboxUrl = null"><X :size="18" :stroke-width="2.5" /></button>
      <div class="lb-img-wrap">
        <img :src="lightboxUrl" class="lb-img" :alt="lightboxAlt" @click.stop />
      </div>
      <div v-if="lightboxAlt" class="lb-caption">{{ lightboxAlt }}</div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '@/stores/app'
import MessageItem from './MessageItem.vue'
import { ArrowUp, X, Search } from 'lucide-vue-next'


const store = useAppStore()
const listEl      = ref(null)
const bottomEl    = ref(null)
const lightboxEl  = ref(null)
const loadingMore = ref(false)
const atBottom    = ref(true)
const lightboxUrl = ref(null)
const lightboxAlt = ref('')

const canLoadMore = computed(() => {
  if (!store.activeChId || !store.activeMessages.length) return false
  return store.hasMore[store.activeChId] ?? false
})

function openLightbox({ url, alt }) {
  lightboxUrl.value = url
  lightboxAlt.value = alt || ''
  nextTick(() => lightboxEl.value?.focus())
}

const groupedByDate = computed(() => {
  const groups = {}
  for (const msg of store.filteredActiveMessages) {
    const d = new Date(msg.created_at * 1000)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    let label
    if (d.toDateString() === today.toDateString()) label = 'Сегодня'
    else if (d.toDateString() === yesterday.toDateString()) label = 'Вчера'
    else label = d.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })
    if (!groups[label]) groups[label] = []
    groups[label].push(msg)
  }
  return groups
})

function onScroll() {
  const el = listEl.value
  if (!el) return
  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 60
}

async function loadMore() {
  loadingMore.value = true
  const el = listEl.value
  const prevScrollHeight = el?.scrollHeight || 0
  await store.loadMore(store.activeChId)
  await nextTick()
  if (el) el.scrollTop = el.scrollHeight - prevScrollHeight
  loadingMore.value = false
}

function scrollToBottom(force = false) {
  if (!force && !atBottom.value) return
  nextTick(() => bottomEl.value?.scrollIntoView({ behavior: 'smooth' }))
}

watch(() => store.activeMessages.length, () => scrollToBottom())
watch(() => store.activeChId, () => {
  atBottom.value = true
  nextTick(() => bottomEl.value?.scrollIntoView())
})
watch(() => store.typingNames.length, () => scrollToBottom())

// Ширина ленты меняется (открыли/закрыли тред, ресайз окна) — текст
// переносится, высота контента прыгает. Если были внизу — держим низ.
let resizeObs = null
onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !listEl.value) return
  resizeObs = new ResizeObserver(() => {
    const el = listEl.value
    if (el && atBottom.value) el.scrollTop = el.scrollHeight
  })
  resizeObs.observe(listEl.value)
})
onUnmounted(() => resizeObs?.disconnect())

// ─── «Новые сообщения» ───────────────────────────────────
// Последнее прочитанное сообщение по каналам храним локально. При входе в
// канал ставим разделитель перед первым чужим непрочитанным и держим его,
// пока не уйдёшь из канала (как в Slack).
const LAST_READ_KEY = 'wv-last-read'
const newDividerId = ref(null)
let dividerFor = null
function readLastRead() {
  try { return JSON.parse(localStorage.getItem(LAST_READ_KEY) || '{}') || {} } catch { return {} }
}
function markRead() {
  const ch = store.activeChId
  const list = store.activeMessages
  if (!ch || !list.length || document.hidden) return
  const lastId = list[list.length - 1].id
  const map = readLastRead()
  if ((map[ch] || 0) >= lastId) return
  map[ch] = lastId
  try { localStorage.setItem(LAST_READ_KEY, JSON.stringify(map)) } catch { }
}
function scrollToDivider() {
  nextTick(() => {
    const list = listEl.value
    const el = list?.querySelector('.new-divider')
    if (!list || !el) return
    const delta = el.getBoundingClientRect().top - list.getBoundingClientRect().top
    list.scrollTop += delta - list.clientHeight / 3
  })
}
watch(() => [store.activeChId, store.activeMessages.length], ([ch, len]) => {
  if (ch !== dividerFor) {
    newDividerId.value = null
    if (ch && len) {
      dividerFor = ch
      const last = readLastRead()[ch]
      const first = last ? store.activeMessages.find(m => m.id > last && m.user_id !== store.user?.id) : null
      newDividerId.value = first?.id || null
      if (first && !store.focusTarget) scrollToDivider()
    }
  }
  if (atBottom.value) markRead()
}, { immediate: true })
watch(atBottom, v => { if (v) markRead() })
function onVisibility() { if (!document.hidden && atBottom.value) markRead() }
onMounted(() => document.addEventListener('visibilitychange', onVisibility))
onUnmounted(() => document.removeEventListener('visibilitychange', onVisibility))

// ─── Переход к конкретному сообщению (из карточки канбана) ───────
// Если сообщение старое и ещё не подгружено — догружаем историю пачками.
let focusBusy = false
async function tryFocusMessage() {
  const target = store.focusTarget
  if (!target || focusBusy) return
  if (target.channelId !== store.activeChId || !store.activeMessages.length) return
  focusBusy = true
  try {
    atBottom.value = false // чтобы автоскролл вниз не перебил нас
    for (let i = 0; i < 20; i++) {
      const list = store.activeMessages
      if (list.some(m => m.id === target.messageId)) break
      if (!store.hasMore[store.activeChId] || list[0].id < target.messageId) break
      if (!(await store.loadMore(store.activeChId))) break
    }
    await nextTick()
    await new Promise(r => setTimeout(r, 60))
    const el = listEl.value?.querySelector(`[data-msg-id="${target.messageId}"]`)
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      if (!target.replyId) store.flashMessage(target.messageId)
    }
    if (target.replyId) store.openThread(target.messageId, target.replyId)
  } finally {
    store.focusTarget = null
    focusBusy = false
  }
}
watch(
  () => [store.focusTarget, store.activeChId, store.activeMessages.length],
  tryFocusMessage,
  { immediate: true }
)
</script>

<style scoped>
.msg-list {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column;
  padding: var(--space-4) 0;
}

.empty-state {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: var(--space-3); color: var(--text-faint);
  text-align: center; padding: var(--space-8);
}
.empty-icon { font-size: 3rem; }
.empty-state h3 { font-size: var(--text-lg); font-weight: 700; color: var(--text-muted); }
.empty-state p  { font-size: var(--text-sm); }

.load-more { display: flex; justify-content: center; padding: var(--space-3); }
.load-btn {
  font-size: var(--text-xs); color: var(--accent);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-full);
  border: 1px solid var(--accent-line);
  background: var(--accent-soft);
  transition: all var(--transition);
}
.load-btn:hover:not(:disabled) { background: var(--accent); color: white; }
.load-btn:disabled { opacity: .5; cursor: not-allowed; }

.day-group { position: relative; }
/* ��ата «прилипает» к верху ленты, пока листаешь сообщения этого дня */
.date-sep {
  position: sticky; top: 8px; z-index: 4;
  display: flex; justify-content: center;
  padding: var(--space-2) var(--space-5);
  pointer-events: none;
}
.date-sep span {
  padding: 3px 12px; border-radius: var(--radius-full, 999px);
  font-size: 11px; font-weight: 700; color: var(--text-muted);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
}
.new-divider {
  display: flex; align-items: center; gap: var(--space-3);
  margin: var(--space-2) 0; padding: 0 var(--space-5);
  color: var(--danger, #e5484d);
  font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
  animation: ndIn .45s var(--ease-out, ease) both;
}
.new-divider::before { content: ''; flex: 1; height: 1px; background: currentColor; opacity: .5; }
@keyframes ndIn { from { opacity: 0; transform: scaleX(.96); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .new-divider { animation: none; } }

.typing-indicator {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-5);
  font-size: var(--text-xs); color: var(--text-muted);
}
.typing-dots { display: flex; gap: 3px; align-items: center; }
.typing-dots span {
  width: 5px; height: 5px; border-radius: var(--radius-full);
  background: var(--text-muted); animation: bounce .9s infinite;
}
.typing-dots span:nth-child(2) { animation-delay: .15s; }
.typing-dots span:nth-child(3) { animation-delay: .3s; }
@keyframes bounce { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-4px); } }

/* ── Lightbox ── */
.lightbox {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,.88);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: var(--space-3);
  animation: lbFade .15s ease;
  outline: none;
}
@keyframes lbFade { from { opacity: 0 } to { opacity: 1 } }

.lb-close {
  position: absolute; top: var(--space-4); right: var(--space-5);
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-full);
  background: rgba(255,255,255,.12); color: white;
  font-size: .9rem; transition: background .15s;
}
.lb-close:hover { background: rgba(255,255,255,.25); }

.lb-img-wrap {
  max-width: min(90vw, 1200px);
  max-height: 80vh;
  display: flex; align-items: center; justify-content: center;
}
.lb-img {
  max-width: 100%; max-height: 80vh;
  border-radius: var(--radius-lg);
  box-shadow: 0 24px 64px rgba(0,0,0,.6);
  object-fit: contain;
  animation: lbScale .15s ease;
  cursor: default;
}
@keyframes lbScale { from { transform: scale(.96) } to { transform: scale(1) } }

.lb-caption {
  font-size: var(--text-xs); color: rgba(255,255,255,.5);
  max-width: 60ch; text-align: center;
}
</style>