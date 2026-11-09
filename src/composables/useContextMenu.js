import { reactive, markRaw } from 'vue'

// Единое контекстное меню приложения (одно на всё окно, рисует ContextMenu.vue).
// items: { label, icon, action, danger, disabled, hint } | { type: 'separator' }
//        | { type: 'reactions', emojis, action(emoji) }
// Ложные значения в списке пропускаются — удобно для условных пунктов.
export const menu = reactive({ open: false, x: 0, y: 0, items: [], seq: 0 })

export function openContextMenu(e, items) {
  const list = []
  for (const it of items) {
    if (!it) continue
    if (it.type === 'separator' && (!list.length || list[list.length - 1].type === 'separator')) continue
    list.push(it)
  }
  while (list.length && list[list.length - 1].type === 'separator') list.pop()
  if (!list.length) return
  menu.items = markRaw(list) // иконки — компоненты, их нельзя делать реактивными
  menu.x = e.clientX
  menu.y = e.clientY
  menu.open = true
  menu.seq++
}

export function closeContextMenu() { menu.open = false }

// Когда оставить системное меню: Shift+ПКМ, поля ввода, ссылки, картинки/видео
// и выделенный текст внутри элемента. В браузере это обычное меню браузера,
// в Electron — нативное меню из electron/main.js.
export function shouldUseNativeMenu(e) {
  if (e.shiftKey) return true
  const t = e.target
  if (t?.closest?.('input, textarea, [contenteditable="true"], a[href], img, video')) return true
  const sel = window.getSelection?.()
  if (sel && !sel.isCollapsed && sel.toString().trim() && e.currentTarget?.contains?.(sel.anchorNode)) return true
  return false
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch { /* http без secure context */ }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { }
  ta.remove()
  return ok
}
