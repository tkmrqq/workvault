<template>
  <div class="md-editor">
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
      <span class="md-hint">Markdown · Esc или клик мимо — просмотр</span>
    </div>
    <div v-else class="md-preview-wrap">
      <button type="button" class="md-edit-btn" title="Редактировать" @click="enterWrite">
        <Pencil :size="12" :stroke-width="2.2" />
      </button>
      <div class="md-preview markdown-body" :class="{ empty: !modelValue }">
        <div v-if="modelValue" v-html="renderMarkdown(modelValue)"></div>
        <span v-else @click="enterWrite">Нажми, чтобы написать...</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { Pencil } from 'lucide-vue-next'
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
.md-hint {
  display: block; margin-top: 4px;
  font-size: 10px; color: var(--text-faint);
}
.md-textarea { width: 100%; }

.md-preview-wrap { position: relative; }
.md-edit-btn {
  position: absolute; top: 8px; right: 8px; z-index: 2;
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: var(--radius-sm);
  background: var(--surface); border: 1px solid var(--border);
  color: var(--text-faint);
  opacity: 0; transition: opacity var(--transition), color var(--transition), border-color var(--transition);
}
.md-preview-wrap:hover .md-edit-btn { opacity: 1; }
.md-edit-btn:hover { color: var(--accent); border-color: var(--accent-line); }
@media (hover: none) {
  .md-edit-btn { opacity: 1; } /* на тач-устройствах :hover ненадёжен — держим кнопку видимой всегда */
}

.md-preview {
  min-height: 60px; max-height: 60vh; overflow-y: auto;
  padding: 10px 34px 10px 12px;
  background: var(--surface-3); border: 1px solid var(--border); border-radius: var(--radius-md);
  font-size: var(--text-sm); cursor: default;
}
.md-preview.empty { color: var(--text-faint); font-size: var(--text-xs); display: flex; align-items: center; cursor: text; }
</style>