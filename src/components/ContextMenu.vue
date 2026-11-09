<template>
  <Teleport to="body">
    <Transition name="cm">
      <div v-if="menu.open" ref="el" class="ctx-menu" role="menu"
        :style="{ left: pos.x + 'px', top: pos.y + 'px', transformOrigin: pos.origin }"
        @mousedown.stop @contextmenu.prevent @mouseleave="activeIdx = -1">
        <template v-for="(it, i) in menu.items" :key="menu.seq + '-' + i">
          <div v-if="it.type === 'separator'" class="cm-sep" />
          <div v-else-if="it.type === 'reactions'" class="cm-reacts">
            <button v-for="e in it.emojis" :key="e" type="button" class="cm-react" @click="run(() => it.action(e))">{{ e }}</button>
          </div>
          <button v-else type="button" class="cm-item" role="menuitem"
            :class="{ danger: it.danger, active: activeIdx === i }"
            :disabled="it.disabled"
            @mouseenter="activeIdx = it.disabled ? -1 : i"
            @click="run(it.action)">
            <component :is="it.icon" v-if="it.icon" :size="14" :stroke-width="2" class="cm-ic" />
            <span class="cm-label">{{ it.label }}</span>
            <span v-if="it.hint" class="cm-hint">{{ it.hint }}</span>
          </button>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, reactive, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { menu, closeContextMenu } from '@/composables/useContextMenu'

const el = ref(null)
const pos = reactive({ x: 0, y: 0, origin: 'top left' })
const activeIdx = ref(-1)

const actionable = () => menu.items
  .map((it, i) => (!it.type && !it.disabled ? i : -1))
  .filter(i => i >= 0)

// Позиционирование: открываемся от курсора, у края экрана — «переворачиваемся».
// Меряем offsetWidth/Height — на них не влияет scale() из анимации появления.
watch(() => menu.seq, async () => {
  if (!menu.open) return
  activeIdx.value = -1
  pos.x = menu.x; pos.y = menu.y; pos.origin = 'top left'
  await nextTick()
  const node = el.value
  if (!node) return
  const w = node.offsetWidth, h = node.offsetHeight, M = 8
  let x = menu.x, y = menu.y, ox = 'left', oy = 'top'
  if (x + w > window.innerWidth - M)  { x = Math.max(M, x - w); ox = 'right' }
  if (y + h > window.innerHeight - M) { y = Math.max(M, y - h); oy = 'bottom' }
  pos.x = x; pos.y = y; pos.origin = oy + ' ' + ox
})

function run(fn) {
  closeContextMenu()
  try { fn?.() } catch (e) { console.error(e) }
}

function onDown() { if (menu.open) closeContextMenu() }
function onScroll(e) { if (menu.open && !el.value?.contains(e.target)) closeContextMenu() }
function onClose() { if (menu.open) closeContextMenu() }

function onKey(e) {
  if (!menu.open) return
  if (e.key === 'Escape') {
    e.preventDefault(); e.stopPropagation(); closeContextMenu(); return
  }
  const ids = actionable()
  if (!ids.length) return
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); e.stopPropagation()
    const d = e.key === 'ArrowDown' ? 1 : -1
    const cur = ids.indexOf(activeIdx.value)
    const n = cur < 0 ? (d > 0 ? 0 : ids.length - 1) : (cur + d + ids.length) % ids.length
    activeIdx.value = ids[n]
  } else if (e.key === 'Enter' && activeIdx.value >= 0) {
    e.preventDefault(); e.stopPropagation()
    run(menu.items[activeIdx.value]?.action)
  }
}

onMounted(() => {
  window.addEventListener('mousedown', onDown)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', onClose)
  window.addEventListener('blur', onClose)
})
onUnmounted(() => {
  window.removeEventListener('mousedown', onDown)
  window.removeEventListener('keydown', onKey, true)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', onClose)
  window.removeEventListener('blur', onClose)
})
</script>

<style scoped>
.ctx-menu {
  position: fixed;
  z-index: 1000;
  min-width: 212px;
  max-width: 280px;
  padding: 5px;
  background: color-mix(in oklab, var(--surface) 92%, transparent);
  backdrop-filter: blur(14px) saturate(1.4);
  -webkit-backdrop-filter: blur(14px) saturate(1.4);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-md), 0 12px 32px oklch(0 0 0 / 0.22);
  user-select: none;
}
.cm-item {
  display: flex; align-items: center; gap: 10px;
  width: 100%;
  padding: 7px 10px;
  border: 0; background: transparent;
  color: var(--text);
  font: inherit; font-size: var(--text-sm, 13px);
  text-align: left;
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  transition: background var(--dur-fast, .12s) ease, color var(--dur-fast, .12s) ease;
}
.cm-item.active { background: var(--accent-soft); color: var(--accent); }
.cm-item:disabled { opacity: .45; cursor: default; }
.cm-item.danger { color: var(--danger, #e5484d); }
.cm-item.danger.active { background: color-mix(in oklab, var(--danger, #e5484d) 14%, transparent); color: var(--danger, #e5484d); }
.cm-ic { flex: none; opacity: .85; }
.cm-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cm-hint { font-size: 11px; color: var(--text-faint); }
.cm-sep { height: 1px; margin: 5px 6px; background: var(--divider, var(--border)); }
.cm-reacts {
  display: flex; justify-content: space-between; gap: 2px;
  padding: 2px 2px 6px; margin-bottom: 4px;
  border-bottom: 1px solid var(--divider, var(--border));
}
.cm-react {
  width: 32px; height: 32px;
  border: 0; background: transparent;
  border-radius: var(--radius-full, 999px);
  font-size: 17px; line-height: 1;
  cursor: pointer;
  transition: transform .16s var(--ease-out, ease), background .16s ease;
}
.cm-react:hover { background: var(--surface-3, var(--surface-2)); transform: scale(1.18); }

.cm-enter-active { transition: opacity .12s ease, transform .16s var(--ease-out, ease); }
.cm-leave-active { transition: opacity .08s ease; }
.cm-enter-from { opacity: 0; transform: scale(.95); }
.cm-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .cm-enter-active, .cm-leave-active, .cm-react { transition: none; }
}
</style>
