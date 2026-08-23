import { reactive } from 'vue'

// Общее состояние на всё приложение — мобильный сайдбар открывается кнопкой-гамбургером
// в шапке любой из страниц (чат/канбан/карточка) и закрывается сам при переходе или тапе
// по фону. Один reactive-объект вместо prop-drilling через три разных layout-компонента.
const state = reactive({ open: false })

export function useMobileSidebar() {
    return {
        state,
        toggle: () => { state.open = !state.open },
        close: () => { state.open = false }
    }
}