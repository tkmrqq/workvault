import { reactive } from 'vue'

// Единое состояние на всё приложение — модалка монтируется один раз в App.vue,
// а confirmDialog() можно звать из любого компонента и await'ить результат,
// как обычный window.confirm(), только красиво и без блокировки движка рендера.
const state = reactive({
  open: false,
  message: '',
  confirmLabel: 'Да',
  cancelLabel: 'Отмена',
  danger: false,
  _resolve: null
})

export function confirmDialog(message, options = {}) {
  state.open = true
  state.message = message
  state.confirmLabel = options.confirmLabel || 'Да'
  state.cancelLabel = options.cancelLabel || 'Отмена'
  state.danger = !!options.danger
  return new Promise((resolve) => {
    state._resolve = resolve
  })
}

export function useConfirmState() {
  return state
}

export function resolveConfirm(result) {
  state.open = false
  state._resolve?.(result)
  state._resolve = null
}
