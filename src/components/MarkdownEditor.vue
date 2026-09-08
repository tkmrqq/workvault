<template>
  <div class="md-editor">
    <!-- Обычный (не полноэкранный) вид -->
    <template v-if="!fullscreen">
      <div v-if="mode === 'write'" class="md-write">
        <textarea
          ref="textareaEl"
          :value="modelValue"
          @input="$emit('update:modelValue', $event.target.value)"
          @blur="onBlur"
          @keydown.esc="$event.target.blur()"
          class="field-textarea md-textarea"
          :placeholder="placeholder"
          :rows="rows"
        />
        <div class="md-write-footer">
          <span class="md-hint">Markdown · Esc или клик мимо — просмотр</span>
          <button type="button" class="md-fullscreen-btn mobile-only" title="На весь экран" @click="fullscreen = true">
            <Maximize2 :size="12" :stroke-width="2.2" />
          </button>
        </div>
      </div>
      <div v-else class="md-preview-wrap">
        <div class="md-preview-actions">
          <button type="button" class="md-icon-btn mobile-only" title="На весь экран" @click="fullscreen = true">
            <Maximize2 :size="12" :stroke-width="2.2" />
          </button>
          <button type="button" class="md-icon-btn" title="Редактировать" @click="enterWrite">
            <Pencil :size="12" :stroke-width="2.2" />
          </button>
        </div>
        <div class="md-preview compact-mobile markdown-body" :class="{ empty: !modelValue }">
          <div v-if="modelValue" v-html="renderMarkdown(modelValue)"></div>
          <span v-else @click="enterWrite">Нажми, чтобы написать...</span>
        </div>
        <button v-if="modelValue" type="button" class="md-expand-hint mobile-only" @click="fullscreen = true">Читать целиком</button>
      </div>
    </template>

    <!-- Полноэкранный режим — компактный превью на мобилке иначе съедал
         бы весь экран описанием карточки/подзадачи; тут места много,
         можно спокойно и читать, и редактировать длинный текст -->
    <Teleport to="body">
      <div v-if="fullscreen" class="md-fs-overlay">
        <div class="md-fs-header">
          <div class="md-fs-tabs">
            <button type="button" class="md-tab" :class="{ active: mode === 'write' }" @click="mode = 'write'">Написать</button>
            <button type="button" class="md-tab" :class="{ active: mode === 'preview' }" @click="mode = 'preview'">Просмотр</button>
          </div>
          <button type="button" class="md-fs-close" @click="fullscreen = false">
            <X :size="18" :stroke-width="2.2" />
          </button>
        </div>
        <div class="md-fs-body">
          <textarea
            v-if="mode === 'write'"
            :value="modelValue"
            @input="$emit('update:modelValue', $event.target.value)"
            class="md-fs-textarea"
            :placeholder="placeholder"
          />
          <div v-else class="markdown-body md-fs-preview" :class="{ empty: !modelValue }">
            <div v-if="modelValue" v-html="renderMarkdown(modelValue)"></div>
            <span v-else>Нечего показывать — поле пустое</span>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { Pencil, Maximize2, X } from 'lucide-vue-next'
import { renderMarkdown } from '@/composables/useMarkdown'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  rows: { type: [Number, String], default: 4 }
})
defineEmits(['update:modelValue'])

// Если уже что-то написано — открываем сразу просмотр (это описание,
// его чаще читают, чем правят); для пустого поля — сразу редактирование,
// иначе непонятно, куда вообще кликать, чтобы начать писать.
const mode = ref(props.modelValue ? 'preview' : 'write')
const fullscreen = ref(false)
const textareaEl = ref(null)

async function enterWrite() {
  mode.value = 'write'
  await nextTick()
  textareaEl.value?.focus()
}
function onBlur() {
  // Пустое поле оставляем в режиме письма — превью с "нечего показывать"
  // сразу после того, как человек только что писал, выглядело бы странно.
  if (props.modelValue) mode.value = 'preview'
}
</script>

<style scoped>
.md-write { position: relative; }
.md-write-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; }
.md-hint { font-size: 10px; color: var(--text-faint); }
.md-textarea { width: 100%; }

.md-preview-wrap { position: relative; }
.md-preview-actions {
  position: absolute; top: 8px; right: 8px; z-index: 2;
  display: flex; gap: 4px;
}
.md-icon-btn, .md-fullscreen-btn {
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: var(--radius-sm);
  background: var(--surface); border: 1px solid var(--border);
  color: var(--text-faint);
  opacity: 0; pointer-events: none; transition: opacity var(--transition), color var(--transition), border-color var(--transition);
}
.md-preview-wrap:hover .md-icon-btn { opacity: 1; pointer-events: auto; }
.md-icon-btn:hover, .md-fullscreen-btn:hover { color: var(--accent); border-color: var(--accent-line); }
@media (hover: none) {
  .md-icon-btn { opacity: 1; pointer-events: auto; } /* на тач-устройствах :hover ненадёжен — держим кнопки видимыми всегда */
}

.md-preview {
  min-height: 60px; max-height: 60vh; overflow-y: auto;
  padding: 10px 34px 10px 12px;
  background: var(--surface-3); border: 1px solid var(--border); border-radius: var(--radius-md);
  font-size: var(--text-sm); cursor: default;
}
.md-preview.empty { color: var(--text-faint); font-size: var(--text-xs); display: flex; align-items: center; cursor: text; }

/* Кнопки "на весь экран" — не нужны на десктопе, там и так 60vh за глаза */
.mobile-only { display: none; }
.md-expand-hint {
  display: none;
  width: 100%; margin-top: 6px; padding: 6px;
  font-size: var(--text-xs); font-weight: 600; color: var(--accent);
  text-align: center; border-radius: var(--radius-md);
  transition: background var(--transition);
}
.md-expand-hint:hover { background: var(--accent-soft); }

@media (max-width: 860px) {
  .mobile-only { display: flex; }
  .md-preview.compact-mobile {
    max-height: 140px; /* на телефоне длинное описание не должно съедать весь экран карточки */
  }
  .md-expand-hint { display: block; }
}

/* ── Полноэкранный режим ── */
.md-fs-overlay {
  position: fixed; inset: 0; z-index: 3500;
  background: var(--surface); /* не bg — иначе на светлой теме сливается с текстовыми полями */
  display: flex; flex-direction: column;
}
.md-fs-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.md-fs-tabs { display: flex; gap: 4px; }
.md-tab {
  padding: 5px 14px; border-radius: var(--radius-full);
  font-size: var(--text-xs); font-weight: 600; color: var(--text-faint);
  transition: all var(--transition);
}
.md-tab:hover { color: var(--text-muted); }
.md-tab.active { background: var(--accent-soft); color: var(--accent); }
.md-fs-close {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: var(--radius-md); color: var(--text-muted);
}
.md-fs-close:hover { background: var(--hover); color: var(--text); }
.md-fs-body { flex: 1; overflow-y: auto; padding: 14px 16px; min-height: 0; }
.md-fs-textarea {
  width: 100%; height: 100%; min-height: 100%;
  background: none; border: none; outline: none; resize: none;
  font-size: var(--text-base); font-family: inherit; color: var(--text); line-height: 1.55;
}
.md-fs-textarea::placeholder { color: var(--text-faint); }
.md-fs-preview { font-size: var(--text-base); }
.md-fs-preview.empty { color: var(--text-faint); font-size: var(--text-sm); }
</style>