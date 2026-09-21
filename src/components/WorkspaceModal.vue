<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay" @click.self="$emit('close')">
      <div class="modal ws-modal">
        <div class="modal-header">
          <h2 class="modal-title-row">
            <component :is="resolveWorkspaceIcon(form.icon)" :size="17" :stroke-width="2" />
            {{ isEdit ? 'Изменить зону' : 'Новая рабочая зона' }}
          </h2>
          <button class="modal-close" @click="$emit('close')"><X :size="14" :stroke-width="2.5" /></button>
        </div>

        <div class="modal-body">
          <!-- Live preview -->
          <div class="ws-preview">
            <span class="ws-badge" :style="badgeStyle(form.color)">
              <component :is="resolveWorkspaceIcon(form.icon)" :size="18" :stroke-width="2.2" />
            </span>
            <span class="ws-preview-name">{{ form.name || 'Название зоны' }}</span>
          </div>

          <label class="field-label">Название</label>
          <input
            ref="nameRef"
            v-model="form.name"
            class="field-input"
            placeholder="Например, Маркетинг"
            maxlength="40"
            @keydown.enter="save"
          />

          <label class="field-label">Цвет</label>
          <div class="ws-color-grid">
            <button
              v-for="c in WORKSPACE_COLORS" :key="c"
              class="ws-color-swatch" :class="{ active: form.color === c }"
              :style="{ background: c }"
              type="button"
              @click="form.color = c"
            >
              <Check v-if="form.color === c" :size="13" :stroke-width="3" />
            </button>
          </div>

          <label class="field-label">Иконка</label>
          <div class="ws-icon-grid">
            <button
              v-for="(comp, key) in WORKSPACE_ICONS" :key="key"
              class="ws-icon-swatch" :class="{ active: form.icon === key }"
              :style="form.icon === key ? badgeStyle(form.color) : null"
              type="button"
              :title="key"
              @click="form.icon = key"
            >
              <component :is="comp" :size="16" :stroke-width="2" />
            </button>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-cancel" @click="$emit('close')">Отмена</button>
          <button class="btn-save" :disabled="!form.name.trim() || saving" @click="save">
            {{ saving ? 'Сохраняю...' : (isEdit ? 'Сохранить' : 'Создать') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { reactive, ref, computed, watch, nextTick } from 'vue'
import { X, Check } from 'lucide-vue-next'
import { WORKSPACE_ICONS, WORKSPACE_COLORS, resolveWorkspaceIcon } from '@/lib/workspaceIcons'

const props = defineProps({
  open:      { type: Boolean, default: false },
  workspace: { type: Object,  default: null } // null → создание, иначе редактирование
})
const emit = defineEmits(['close', 'save'])

const isEdit = computed(() => !!props.workspace)
const saving = ref(false)
const nameRef = ref(null)

function randomColor() { return WORKSPACE_COLORS[Math.floor(Math.random() * WORKSPACE_COLORS.length)] }

const form = reactive({ name: '', icon: 'folder', color: randomColor() })

// Каждое открытие модалки — сброс формы под текущий контекст (создание/правка)
watch(() => props.open, async (isOpen) => {
  if (!isOpen) return
  if (props.workspace) {
    form.name  = props.workspace.name
    form.icon  = props.workspace.icon || 'folder'
    form.color = props.workspace.color || randomColor()
  } else {
    form.name  = ''
    form.icon  = 'folder'
    form.color = randomColor()
  }
  await nextTick()
  nameRef.value?.focus()
})

function badgeStyle(color) {
  return { background: color, color: '#fff' }
}

async function save() {
  if (!form.name.trim() || saving.value) return
  saving.value = true
  try {
    await Promise.resolve(emit('save', { name: form.name.trim(), icon: form.icon, color: form.color }))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
/* Базовая "оболочка" модалки — как в KanbanCardView.vue (scoped-стили
   между компонентами не пересекаются, поэтому дублируем тут же) */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.55);
  display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px;
}
.modal {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-xl); width: min(460px, 100%);
  max-height: 90vh; box-shadow: var(--shadow-lg);
  display: flex; flex-direction: column;
  animation: modalIn .2s ease forwards;
}
@keyframes modalIn { from { opacity: 0; transform: scale(.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 12px; border-bottom: 1px solid var(--border);
}
.modal-title-row { display: flex; align-items: center; gap: 8px; font-size: var(--text-base); font-weight: 700; }
.modal-close {
  width: 28px; height: 28px; border-radius: var(--radius-md);
  font-size: 13px; color: var(--text-faint);
  display: flex; align-items: center; justify-content: center;
  transition: all var(--transition);
}
.modal-close:hover { background: var(--hover); color: var(--text); }
.modal-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; overflow-x: hidden; min-height: 0; min-width: 0; }
.modal-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
  padding: 12px 20px 16px; border-top: 1px solid var(--border);
}
.btn-save {
  padding: 8px 18px; border-radius: var(--radius-md);
  font-size: var(--text-sm); font-weight: 600;
  background: var(--accent); color: #fff;
  transition: background var(--transition);
}
.btn-save:hover:not(:disabled) { background: var(--accent-hover); }
.btn-save:disabled { opacity: .45; cursor: not-allowed; }
.btn-cancel {
  padding: 8px 16px; border-radius: var(--radius-md);
  font-size: var(--text-sm); font-weight: 600;
  background: var(--surface-3); color: var(--text-muted);
  border: 1px solid var(--border); transition: all var(--transition);
}
.btn-cancel:hover { background: var(--hover); }

.ws-preview {
  display: flex; align-items: center; gap: var(--space-3);
  margin-bottom: var(--space-4);
}
.ws-preview-name { font-size: var(--text-sm); font-weight: 700; color: var(--text); }

.ws-badge {
  width: 40px; height: 40px; border-radius: 11px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 6px rgba(0,0,0,.18);
}

.field-input {
  width: 100%; background: var(--surface-3); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm); color: var(--text); margin-bottom: var(--space-3);
}
.field-input:focus { outline: none; border-color: var(--accent-line); }

.ws-color-grid {
  display: flex; flex-wrap: wrap; gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.ws-color-swatch {
  width: 26px; height: 26px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; opacity: .55; transition: all var(--transition);
  border: 2px solid transparent;
}
.ws-color-swatch:hover { opacity: .85; }
.ws-color-swatch.active { opacity: 1; border-color: var(--text); transform: scale(1.08); }

.ws-icon-grid {
  display: grid; grid-template-columns: repeat(8, 1fr); gap: var(--space-2);
}
.ws-icon-swatch {
  aspect-ratio: 1; border-radius: 9px; background: var(--surface-3);
  border: 1px solid var(--border); color: var(--text-muted);
  display: flex; align-items: center; justify-content: center;
  transition: all var(--transition);
}
.ws-icon-swatch:hover { background: var(--hover); color: var(--text); }
.ws-icon-swatch.active { border-color: transparent; }
</style>
