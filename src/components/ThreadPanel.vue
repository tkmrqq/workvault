<template>
  <aside class="thread-panel" aria-label="Тред">
    <header class="tp-head">
      <div class="tp-title">
        <MessagesSquare :size="16" :stroke-width="2.2" />
        <span>Тред</span>
        <span class="tp-ch">#{{ store.activeChannel?.name }}</span>
      </div>
      <button class="tp-close" title="Закрыть (Esc)" @click="store.closeThread()">
        <X :size="16" :stroke-width="2.2" />
      </button>
    </header>

    <div ref="scrollEl" class="tp-scroll">
      <div v-if="!store.threadParent" class="tp-skeleton">
        <div class="sk-row"><span class="sk-av" /><span class="sk-lines"><span /><span /></span></div>
        <div class="sk-row"><span class="sk-av" /><span class="sk-lines"><span /></span></div>
      </div>

      <template v-else>
        <MessageItem :msg="store.threadParent" in-thread @open-image="openImage" />

        <div class="tp-divider">
          <span v-if="store.threadLoading">Загружаю ответы…</span>
          <span v-else-if="store.threadReplies.length">{{ repliesLabel }}</span>
          <span v-else>Ответов пока нет — начни обсуждение</span>
        </div>

        <MessageItem
          v-for="r in store.threadReplies" :key="r.id" :msg="r" in-thread
          @open-image="openImage"
        />
      </template>
      <div ref="bottomEl" />
    </div>

    <MessageInput :key="store.threadParentId" :parent-id="store.threadParentId" />
  </aside>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { MessagesSquare, X } from 'lucide-vue-next'
import MessageItem  from '@/components/MessageItem.vue'
import MessageInput from '@/components/MessageInput.vue'

const store    = useAppStore()
const scrollEl = ref(null)
const bottomEl = ref(null)

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
const repliesLabel = computed(() => {
  const n = store.threadReplies.length
  return `${n} ${plural(n, 'ответ', 'ответа', 'ответов')}`
})

function nearBottom() {
  const el = scrollEl.value
  return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120
}

// Новые ответы: прокручиваем вниз, если пользователь и так внизу
// (или это первая загрузка треда). Если пришли сюда из карточки канбана —
// крутим к нужному ответу и подсвечиваем его.
watch(() => [store.threadReplies.length, store.threadLoading, store.threadFocusId], (_, old) => {
  const wasBottom = nearBottom()
  nextTick(() => {
    const focusId = store.threadFocusId
    if (focusId && !store.threadLoading) {
      const el = scrollEl.value?.querySelector(`[data-msg-id="${focusId}"]`)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        store.flashMessage(focusId)
        store.threadFocusId = null
        return
      }
    }
    const justLoaded = old && old[1] && !store.threadLoading
    if (justLoaded) bottomEl.value?.scrollIntoView()
    else if (wasBottom) bottomEl.value?.scrollIntoView({ behavior: 'smooth' })
  })
})

function openImage({ url }) {
  if (url) window.open(url, '_blank', 'noopener')
}

// Esc закрывает тред — но не когда человек в поле ввода/редактирования
function onKey(e) {
  if (e.key !== 'Escape' || e.defaultPrevented) return
  const tag = document.activeElement?.tagName
  if (tag === 'TEXTAREA' || tag === 'INPUT') return
  store.closeThread()
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<style scoped>
.thread-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--bg);
  border-left: 1px solid var(--divider, var(--border));
}

.tp-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--space-2, 8px);
  height: 52px; flex-shrink: 0;
  padding: 0 var(--space-3, 12px) 0 var(--space-4, 16px);
  border-bottom: 1px solid var(--divider, var(--border));
}
.tp-title {
  display: flex; align-items: center; gap: 8px; min-width: 0;
  font-weight: 700; color: var(--text);
}
.tp-ch {
  font-weight: 500; font-size: var(--text-sm, .85rem); color: var(--text-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tp-close {
  width: 30px; height: 30px; border-radius: var(--radius-md, 8px);
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted);
  transition: background var(--dur-fast, .15s) ease, color var(--dur-fast, .15s) ease, transform var(--dur, .25s) var(--ease-spring, ease);
}
.tp-close:hover { background: var(--surface); color: var(--text); transform: rotate(90deg); }

.tp-scroll {
  flex: 1; min-height: 0;
  overflow-y: auto; overscroll-behavior: contain;
  padding: var(--space-2, 8px) 0;
}

.tp-divider {
  display: flex; align-items: center; gap: var(--space-3, 12px);
  margin: var(--space-2, 8px) var(--space-4, 16px);
  font-size: var(--text-xs, .75rem); color: var(--text-faint);
}
.tp-divider::after { content: ''; flex: 1; height: 1px; background: var(--divider, var(--border)); }

/* Скелетон, пока корень треда грузится с сервера */
.tp-skeleton { padding: var(--space-4, 16px); display: grid; gap: 18px; }
.sk-row { display: flex; gap: 12px; }
.sk-av { width: 34px; height: 34px; border-radius: 50%; }
.sk-lines { flex: 1; display: grid; gap: 8px; }
.sk-lines span { height: 10px; border-radius: 5px; }
.sk-lines span:first-child { width: 40%; }
.sk-lines span:last-child  { width: 85%; }
.sk-av, .sk-lines span {
  background: linear-gradient(90deg, var(--surface) 0%, var(--surface-3, var(--surface)) 50%, var(--surface) 100%);
  background-size: 200% 100%;
  animation: skShimmer 1.2s ease-in-out infinite;
}
@keyframes skShimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

@media (prefers-reduced-motion: reduce) {
  .sk-av, .sk-lines span { animation: none; }
  .tp-close:hover { transform: none; }
}

/* На мобиле тред — полноэкранный слой поверх чата */
@media (max-width: 860px) {
  .thread-panel {
    position: fixed; inset: 0; z-index: 60;
    border-left: none;
  }
}
</style>
