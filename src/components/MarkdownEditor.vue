<template>
  <div class="md-editor" :class="{ focused }">
    <!-- Шапка: вкладки + «развернуть». Переключение только явное — раньше
         редактор сам прыгал в просмотр по blur и схлопывался по высоте. -->
    <div class="md-toolbar">
      <div class="md-tabs" role="tablist">
        <button type="button" role="tab" class="md-tab" :class="{ active: mode === 'write' }" @click="setMode('write')">
          <Pencil :size="11" :stroke-width="2.2" /> Текст
        </button>
        <button type="button" role="tab" class="md-tab" :class="{ active: mode === 'preview' }" @click="setMode('preview')">
          <Eye :size="11" :stroke-width="2.2" /> Просмотр
        </button>
      </div>
      <button type="button" class="md-expand-btn" title="Открыть как документ (Ctrl+Shift+F)" @click="openExpanded">
        <Maximize2 :size="12" :stroke-width="2.2" /><span>Развернуть</span>
      </button>
    </div>

    <div ref="paneEl" class="md-pane" :style="paneStyle">
      <textarea
        v-if="mode === 'write'"
        ref="textareaEl"
        :value="modelValue"
        class="md-textarea"
        :placeholder="placeholder"
        :rows="rows"
        spellcheck="true"
        @input="onInput"
        @focus="focused = true"
        @blur="focused = false"
        @keydown="onInlineKeydown"
      />
      <div
        v-else
        class="md-preview markdown-body"
        :class="{ empty: !modelValue }"
        title="Двойной клик — редактировать"
        @dblclick="setMode('write', true)"
      >
        <div v-if="modelValue" v-html="rendered"></div>
        <span v-else @click="setMode('write', true)">Пусто — нажми, чтобы написать</span>
      </div>
    </div>
    <div class="md-footer">
      <span class="md-hint">Markdown · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> — развернуть</span>
      <span v-if="modelValue" class="md-hint">{{ stats }}</span>
    </div>

    <!-- Режим «документа»: широкая панель по центру (на мобилке — весь экран),
         редактор и живой превью рядом. Тот же v-model — ничего синхронизировать не надо. -->
    <Teleport to="body">
      <Transition name="md-doc">
        <div v-if="expanded" class="md-doc-overlay" @mousedown.self="closeExpanded">
          <div class="md-doc" role="dialog" aria-modal="true" :aria-label="title || 'Описание'">
            <div class="md-doc-header">
              <div class="md-doc-title">
                <FileText :size="15" :stroke-width="2" />
                <span>{{ title || 'Описание' }}</span>
              </div>
              <div class="md-tabs">
                <button type="button" class="md-tab" :class="{ active: docMode === 'write' }" @click="setDocMode('write')">
                  <Pencil :size="11" :stroke-width="2.2" /> Текст
                </button>
                <button type="button" class="md-tab desktop-only" :class="{ active: docMode === 'split' }" @click="setDocMode('split')">
                  <Columns :size="11" :stroke-width="2.2" /> Рядом
                </button>
                <button type="button" class="md-tab" :class="{ active: docMode === 'preview' }" @click="setDocMode('preview')">
                  <Eye :size="11" :stroke-width="2.2" /> Просмотр
                </button>
              </div>
              <div class="md-doc-actions">
                <span v-if="modelValue" class="md-doc-stats">{{ stats }}</span>
                <button type="button" class="md-doc-close" title="Свернуть (Esc)" @click="closeExpanded">
                  <Minimize2 :size="16" :stroke-width="2.2" />
                </button>
              </div>
            </div>

            <div class="md-doc-body" :class="`mode-${effectiveDocMode}`">
              <textarea
                v-show="effectiveDocMode !== 'preview'"
                ref="docTextareaEl"
                :value="modelValue"
                class="md-doc-textarea"
                :placeholder="placeholder || 'Пиши в Markdown…'"
                spellcheck="true"
                @input="$emit('update:modelValue', $event.target.value)"
                @scroll="syncScroll"
                @keydown.tab.prevent="insertTab"
              />
              <div
                v-show="effectiveDocMode !== 'write'"
                ref="docPreviewEl"
                class="md-doc-preview"
              >
                <div class="markdown-body md-doc-page" :class="{ empty: !modelValue }">
                  <div v-if="modelValue" v-html="rendered"></div>
                  <span v-else>Здесь появится превью</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'
import { Pencil, Eye, Maximize2, Minimize2, Columns, FileText } from 'lucide-vue-next'
import { renderMarkdown } from '@/composables/useMarkdown'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  rows: { type: [Number, String], default: 4 },
  /** Заголовок в режиме документа (название карточки/подзадачи) */
  title: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])

const DOC_MODE_KEY = 'wv.mdDocMode'
const MAX_INLINE_VH = 0.45 // дальше инлайн-поле не растёт — для большего есть «Развернуть»

// Заполненное описание чаще читают, чем правят — открываем просмотр.
const mode = ref(props.modelValue ? 'preview' : 'write')
const focused = ref(false)
const expanded = ref(false)
const docMode = ref(localStorage.getItem(DOC_MODE_KEY) || 'split')
const isNarrow = ref(false)

const textareaEl = ref(null)
const paneEl = ref(null)
const docTextareaEl = ref(null)
const docPreviewEl = ref(null)
const lockedHeight = ref(0)

const rendered = computed(() => (props.modelValue ? renderMarkdown(props.modelValue) : ''))
const stats = computed(() => {
  const text = props.modelValue || ''
  const words = (text.match(/\S+/g) || []).length
  const lines = text.split('\n').length
  return `${words} сл. · ${lines} стр.`
})
// На узком экране «Рядом» не помещается — показываем текст
const effectiveDocMode = computed(() => (isNarrow.value && docMode.value === 'split' ? 'write' : docMode.value))

// Пока переключаем вкладку — держим прежнюю высоту, чтобы блок не дёргался
const paneStyle = computed(() => (lockedHeight.value ? { minHeight: `${lockedHeight.value}px` } : null))

function autosize() {
  const el = textareaEl.value
  if (!el) return
  const max = Math.round(window.innerHeight * MAX_INLINE_VH)
  el.style.height = 'auto'
  const next = Math.min(el.scrollHeight + 2, max)
  el.style.height = `${next}px`
  el.style.overflowY = el.scrollHeight + 2 > max ? 'auto' : 'hidden'
}

function onInput(e) {
  emit('update:modelValue', e.target.value)
  autosize()
}

async function setMode(next, focus = false) {
  if (mode.value === next) return
  lockedHeight.value = paneEl.value?.offsetHeight || 0
  mode.value = next
  await nextTick()
  if (next === 'write') {
    autosize()
    if (focus) textareaEl.value?.focus()
  }
  // Отпускаем фиксацию после кадра — дальше высота по контенту, без скачка
  requestAnimationFrame(() => { lockedHeight.value = 0 })
}

function onInlineKeydown(e) {
  if (e.key === 'Escape' && props.modelValue) {
    e.stopPropagation()
    setMode('preview')
  }
}

async function openExpanded() {
  expanded.value = true
  await nextTick()
  if (effectiveDocMode.value !== 'preview') {
    const el = docTextareaEl.value
    el?.focus()
    // курсор туда же, где был в маленьком поле
    const src = textareaEl.value
    if (el && src) el.setSelectionRange(src.selectionStart, src.selectionEnd)
  }
}

async function closeExpanded() {
  expanded.value = false
  await nextTick()
  autosize()
}

function setDocMode(next) {
  docMode.value = next
  localStorage.setItem(DOC_MODE_KEY, next)
  if (next !== 'preview') nextTick(() => docTextareaEl.value?.focus())
}

// В режиме «Рядом» превью прокручивается пропорционально тексту
function syncScroll() {
  if (effectiveDocMode.value !== 'split') return
  const src = docTextareaEl.value
  const dst = docPreviewEl.value
  if (!src || !dst) return
  const ratio = src.scrollTop / Math.max(1, src.scrollHeight - src.clientHeight)
  dst.scrollTop = ratio * (dst.scrollHeight - dst.clientHeight)
}

function insertTab(e) {
  const el = e.target
  const { selectionStart: s, selectionEnd: end, value } = el
  const next = value.slice(0, s) + '  ' + value.slice(end)
  emit('update:modelValue', next)
  nextTick(() => el.setSelectionRange(s + 2, s + 2))
}

function onWindowKeydown(e) {
  if (expanded.value && e.key === 'Escape') {
    // перехватываем раньше модалки, чтобы Esc сворачивал документ, а не закрывал подзадачу
    e.stopPropagation()
    e.preventDefault()
    closeExpanded()
    return
  }
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.shiftKey && (e.key === 'F' || e.key === 'f' || e.code === 'KeyF')) {
    // только для редактора, в котором сейчас фокус
    if (expanded.value || document.activeElement === textareaEl.value) {
      e.preventDefault()
      expanded.value ? closeExpanded() : openExpanded()
    }
  }
}

function onResize() {
  isNarrow.value = window.innerWidth <= 860
  autosize()
}

watch(() => props.modelValue, () => {
  if (mode.value === 'write') nextTick(autosize)
})
// Блокируем прокрутку страницы под документом
watch(expanded, v => { document.documentElement.classList.toggle('md-doc-open', v) })

onMounted(() => {
  onResize()
  window.addEventListener('resize', onResize)
  window.addEventListener('keydown', onWindowKeydown, true)
  nextTick(autosize)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onWindowKeydown, true)
  document.documentElement.classList.remove('md-doc-open')
})
</script>

<style scoped>
.md-editor {
  border: 1px solid var(--border); border-radius: var(--radius-md);
  background: var(--surface-3);
  transition: border-color var(--transition), box-shadow var(--transition);
  min-width: 0;
}
.md-editor.focused { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }

.md-toolbar {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 4px 4px 4px 6px; border-bottom: 1px solid var(--border);
}
.md-tabs { display: flex; gap: 2px; }
.md-tab {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: var(--radius-full, 999px);
  font-size: var(--text-xs); font-weight: 600; color: var(--text-faint);
  transition: color var(--transition), background var(--transition);
}
.md-tab:hover { color: var(--text-muted); }
.md-tab.active { background: var(--accent-soft); color: var(--accent); }
.md-expand-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 8px; border-radius: var(--radius-sm, 6px);
  font-size: var(--text-xs); font-weight: 600; color: var(--text-faint);
  transition: color var(--transition), background var(--transition);
}
.md-expand-btn:hover { color: var(--accent); background: var(--accent-soft); }

.md-pane { position: relative; }
.md-textarea {
  display: block; width: 100%;
  min-height: 84px; /* ручной resize выключен — высота подстраивается сама (autosize) */
  padding: 10px 12px;
  background: none; border: none; outline: none; resize: none;
  font: inherit; font-size: var(--text-sm); line-height: 1.55; color: var(--text);
  overflow-y: hidden;
}
.md-textarea::placeholder { color: var(--text-faint); }
.md-preview {
  min-height: 84px; max-height: 45vh; overflow-y: auto;
  padding: 10px 12px; font-size: var(--text-sm); cursor: text;
}
.md-preview.empty { color: var(--text-faint); font-size: var(--text-xs); display: flex; align-items: center; }

.md-footer {
  display: flex; justify-content: space-between; gap: 8px;
  padding: 4px 10px 6px; border-top: 1px solid var(--border);
}
.md-hint { font-size: 10px; color: var(--text-faint); white-space: nowrap; }
.md-hint kbd {
  font-family: inherit; font-size: 9px; padding: 0 4px; border-radius: 3px;
  border: 1px solid var(--border); background: var(--surface-2);
}

/* ── Режим документа ── */
.md-doc-overlay {
  position: fixed; inset: 0; z-index: 3500;
  background: rgba(0, 0, 0, .55);
  display: flex; align-items: center; justify-content: center;
  padding: 3vh 3vw;
}
.md-doc {
  width: min(1200px, 100%); height: 100%;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-xl, 14px); box-shadow: var(--shadow-lg);
  display: flex; flex-direction: column; overflow: hidden;
}
.md-doc-header {
  display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px;
  padding: 10px 12px 10px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.md-doc-title {
  display: flex; align-items: center; gap: 8px; min-width: 0;
  font-size: var(--text-sm); font-weight: 700; color: var(--text);
}
.md-doc-title svg { color: var(--accent); flex-shrink: 0; }
.md-doc-title span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.md-doc-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
.md-doc-stats { font-size: var(--text-xs); color: var(--text-faint); white-space: nowrap; }
.md-doc-close {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: var(--radius-md); color: var(--text-muted);
}
.md-doc-close:hover { background: var(--hover); color: var(--text); }

.md-doc-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr; }
.md-doc-body.mode-split { grid-template-columns: 1fr 1fr; }
.md-doc-textarea {
  width: 100%; height: 100%; padding: 20px 24px;
  background: var(--surface-2); border: none; outline: none; resize: none;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 13px; line-height: 1.65; color: var(--text); tab-size: 2;
}
.md-doc-body.mode-write .md-doc-textarea { padding: 28px max(24px, calc((100% - 820px) / 2)); }
.md-doc-body.mode-split .md-doc-textarea { border-right: 1px solid var(--border); }
.md-doc-textarea::placeholder { color: var(--text-faint); }
.md-doc-preview { overflow-y: auto; min-height: 0; padding: 20px 28px; }
.md-doc-page { max-width: 760px; margin: 0 auto; font-size: var(--text-base); line-height: 1.65; }
.md-doc-page.empty { color: var(--text-faint); font-size: var(--text-sm); }

.md-doc-enter-active, .md-doc-leave-active { transition: opacity .18s ease; }
.md-doc-enter-active .md-doc, .md-doc-leave-active .md-doc { transition: transform .22s var(--ease-out, cubic-bezier(.2,.8,.2,1)), opacity .18s ease; }
.md-doc-enter-from, .md-doc-leave-to { opacity: 0; }
.md-doc-enter-from .md-doc, .md-doc-leave-to .md-doc { transform: scale(.97) translateY(8px); opacity: 0; }

@media (max-width: 860px) {
  .desktop-only { display: none; }
  .md-expand-btn span { display: none; }
  .md-footer .md-hint:first-child { display: none; }
  .md-doc-overlay { padding: 0; }
  .md-doc { border-radius: 0; border: none; }
  .md-doc-header { grid-template-columns: 1fr auto; padding: 8px 10px; }
  .md-doc-title { grid-column: 1 / -1; }
  .md-doc-stats { display: none; }
  .md-doc-textarea, .md-doc-body.mode-write .md-doc-textarea { padding: 14px 16px; font-size: 14px; }
  .md-doc-preview { padding: 14px 16px; }
}
</style>

<style>
/* под открытым документом страница не скроллится */
html.md-doc-open, html.md-doc-open body { overflow: hidden; }
</style>
