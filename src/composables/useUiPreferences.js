import { reactive } from 'vue'

function readBoolean(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : value === 'true'
  } catch {
    return fallback
  }
}

export const uiPreferences = reactive({
  animationsEnabled: readBoolean('wv-animations-enabled', true),
  modalAnimationsEnabled: readBoolean('wv-modal-animations-enabled', true),
  doneSoundEnabled: readBoolean('wv-kanban-done-sound', true),
  kanbanWide: readBoolean('wv-kanban-wide', false)
})

function applyModalAnimationsPreference() {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.modalAnimations = String(uiPreferences.modalAnimationsEnabled)
  }
}

applyModalAnimationsPreference()

export function setUiPreference(key, value) {
  if (!(key in uiPreferences)) return
  uiPreferences[key] = Boolean(value)
  try {
    const storageKey = {
      animationsEnabled: 'wv-animations-enabled',
      modalAnimationsEnabled: 'wv-modal-animations-enabled',
      doneSoundEnabled: 'wv-kanban-done-sound',
      kanbanWide: 'wv-kanban-wide'
    }[key]
    localStorage.setItem(storageKey, String(uiPreferences[key]))
    if (key === 'modalAnimationsEnabled') applyModalAnimationsPreference()
  } catch {
    // Preferences still apply for the current session if storage is unavailable.
    if (key === 'modalAnimationsEnabled') applyModalAnimationsPreference()
  }
}
