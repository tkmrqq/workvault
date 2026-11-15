import { reactive } from 'vue'

function readBoolean(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : value === 'true'
  } catch {
    return fallback
  }
}

// Цветовые схемы: ключ = значение атрибута data-scheme, палитры — в assets/base.css.
// swatch — цвет кружка в настройках (акцент тёмной темы).
export const COLOR_SCHEMES = [
  { id: 'violet',   name: 'Фиалка',   swatch: '#7c6af7' },
  { id: 'ocean',    name: 'Океан',    swatch: '#4a9eff' },
  { id: 'emerald',  name: 'Изумруд',  swatch: '#3fbf8a' },
  { id: 'amber',    name: 'Янтарь',   swatch: '#e8a33d' },
  { id: 'sakura',   name: 'Сакура',   swatch: '#ec6fa8' },
  { id: 'crimson',  name: 'Гранат',   swatch: '#e5534b' },
  { id: 'nord',     name: 'Север',    swatch: '#88c0d0' },
  { id: 'mono',     name: 'Графит',   swatch: '#c8c8c3' }
]
const SCHEME_IDS = new Set(COLOR_SCHEMES.map(s => s.id))

function readScheme() {
  try {
    const v = localStorage.getItem('wv-color-scheme')
    return SCHEME_IDS.has(v) ? v : 'violet'
  } catch {
    return 'violet'
  }
}

export const uiPreferences = reactive({
  animationsEnabled: readBoolean('wv-animations-enabled', true),
  modalAnimationsEnabled: readBoolean('wv-modal-animations-enabled', true),
  doneSoundEnabled: readBoolean('wv-kanban-done-sound', true),
  kanbanWide: readBoolean('wv-kanban-wide', false),
  colorScheme: readScheme()
})

const STORAGE_KEYS = {
  animationsEnabled: 'wv-animations-enabled',
  modalAnimationsEnabled: 'wv-modal-animations-enabled',
  doneSoundEnabled: 'wv-kanban-done-sound',
  kanbanWide: 'wv-kanban-wide',
  colorScheme: 'wv-color-scheme'
}

function applyModalAnimationsPreference() {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.modalAnimations = String(uiPreferences.modalAnimationsEnabled)
  }
}

// data-scheme ставим и на <html> (для телепортированных модалок), и на #app —
// там же висит data-theme, иначе его переменные перекрыли бы схему с <html>.
export function applyColorScheme() {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.scheme = uiPreferences.colorScheme
  const app = document.getElementById('app')
  if (app) app.dataset.scheme = uiPreferences.colorScheme
}

applyModalAnimationsPreference()
applyColorScheme()

export function setUiPreference(key, value) {
  if (!(key in uiPreferences)) return
  if (key === 'colorScheme') {
    if (!SCHEME_IDS.has(value)) return
    uiPreferences.colorScheme = value
  } else {
    uiPreferences[key] = Boolean(value)
  }
  try {
    localStorage.setItem(STORAGE_KEYS[key], String(uiPreferences[key]))
  } catch {
    // Preferences still apply for the current session if storage is unavailable.
  }
  if (key === 'modalAnimationsEnabled') applyModalAnimationsPreference()
  if (key === 'colorScheme') applyColorScheme()
}
