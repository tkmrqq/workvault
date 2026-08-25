<template>
  <Teleport to="body">
    <Transition name="confirm-fade">
      <div v-if="state.open" class="confirm-overlay" @click.self="onCancel" @keydown.esc="onCancel">
        <div class="confirm-modal">
          <p class="confirm-message">{{ state.message }}</p>
          <div class="confirm-footer">
            <button class="confirm-btn-cancel" @click="onCancel">{{ state.cancelLabel }}</button>
            <button
              :class="state.danger ? 'confirm-btn-danger' : 'confirm-btn-accent'"
              @click="onConfirm"
              ref="confirmBtn"
            >{{ state.confirmLabel }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { watch, nextTick, ref } from 'vue'
import { useConfirmState, resolveConfirm } from '@/composables/useConfirm'

const state = useConfirmState()
const confirmBtn = ref(null)

// Фокус на кнопке подтверждения при открытии — Enter/Space сразу работают,
// Esc вешаем на сам оверлей.
watch(() => state.open, async (open) => {
  if (open) {
    await nextTick()
    confirmBtn.value?.focus()
  }
})

function onConfirm() { resolveConfirm(true) }
function onCancel()  { resolveConfirm(false) }
</script>

<style scoped>
.confirm-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.55);
  display: flex; align-items: center; justify-content: center;
  z-index: 3000; padding: 16px;
}
.confirm-modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  width: min(380px, 100%);
  padding: 22px 20px 16px;
  opacity: 0; transform: scale(.96) translateY(8px);
  animation: confirmModalIn .15s ease forwards;
}
@keyframes confirmModalIn {
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.confirm-message {
  font-size: var(--text-sm); color: var(--text); line-height: 1.5;
  white-space: pre-line; margin-bottom: 18px;
}
.confirm-footer { display: flex; justify-content: flex-end; gap: 8px; }
.confirm-btn-cancel, .confirm-btn-accent, .confirm-btn-danger {
  padding: 8px 16px; border-radius: var(--radius-md);
  font-size: var(--text-sm); font-weight: 600;
  transition: all var(--transition);
}
.confirm-btn-cancel {
  background: var(--surface-3); color: var(--text-muted);
  border: 1px solid var(--border);
}
.confirm-btn-cancel:hover { background: var(--hover); color: var(--text); }
.confirm-btn-accent { background: var(--accent); color: #fff; }
.confirm-btn-accent:hover { background: var(--accent-hover); }
.confirm-btn-danger { background: rgba(224,108,117,.12); color: #e06c75; }
.confirm-btn-danger:hover { background: rgba(224,108,117,.25); }

.confirm-fade-enter-active, .confirm-fade-leave-active { transition: opacity .15s ease; }
.confirm-fade-enter-from, .confirm-fade-leave-to { opacity: 0; }
</style>
