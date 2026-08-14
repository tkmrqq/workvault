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

    <template v-for="(group, date) in groupedByDate" :key="date">
      <div class="date-sep"><span>{{ date }}</span></div>
      <MessageItem
        v-for="msg in group" :key="msg.id" :msg="msg"
        @open-image="openLightbox"
      />
    </template>

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
import { ref, computed, watch, nextTick } from 'vue'
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

.date-sep {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  font-size: 11px; font-weight: 700; color: var(--text-faint);
}
.date-sep::before, .date-sep::after { content: ''; flex: 1; height: 1px; background: var(--divider); }

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