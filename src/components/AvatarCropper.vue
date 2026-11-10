<template>
  <div class="cropper">
    <div class="cr-stage" :class="{ grabbing: drag }" :style="{ width: SW + 'px', height: SH + 'px' }"
      @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up"
      @wheel.prevent="wheel" @dblclick="reset">
      <img v-if="url" ref="imgEl" :src="url" class="cr-img" :style="imgStyle" draggable="false" alt="" @load="onLoad" />
      <div class="cr-mask" :class="{ round }" />
      <div v-if="!ready" class="cr-loading"><span class="cr-spin" /></div>
    </div>

    <div class="cr-zoom" :style="{ width: SW + 'px' }">
      <button type="button" class="cr-z" @click="setZoom(zoom - 0.25)" aria-label="Отдалить"><ZoomOut :size="15" :stroke-width="2" /></button>
      <input type="range" min="1" max="4" step="0.01" :value="zoom" @input="setZoom(Number($event.target.value))" aria-label="Масштаб" />
      <button type="button" class="cr-z" @click="setZoom(zoom + 0.25)" aria-label="Приблизить"><ZoomIn :size="15" :stroke-width="2" /></button>
    </div>

    <div class="cr-actions">
      <button type="button" class="cr-btn" @click="emit('cancel')">Отмена</button>
      <button type="button" class="cr-btn primary" :disabled="!ready" @click="apply">
        <Check :size="15" :stroke-width="2.5" /> Применить
      </button>
    </div>
  </div>
</template>

<script setup>
// Простое кадрирование: перетаскивание, колесо/ползунок — масштаб, двойной
// клик — сброс. По умолчанию — круглый аватар 320×320; для баннера передаём
// aspect=3, round=false, outWidth=1200. На выходе WebP (иначе PNG).
import { ref, computed, onUnmounted } from 'vue'
import { ZoomIn, ZoomOut, Check } from 'lucide-vue-next'

const props = defineProps({
  file:     { type: Object,  required: true },
  aspect:   { type: Number,  default: 1 },    // ширина / высота области
  round:    { type: Boolean, default: true }, // круглая маска (аватар) или прямоугольник
  outWidth: { type: Number,  default: 320 }   // ширина результата, px
})
const emit  = defineEmits(['cancel', 'done'])

// Размер области на экране: квадрат 240px, широкие кадры — до 360px в ширину
const SW    = props.aspect >= 1 ? Math.min(360, Math.round(240 * props.aspect)) : 240
const SH    = Math.round(SW / props.aspect)
const OUT_W = props.outWidth
const OUT_H = Math.round(props.outWidth / props.aspect)

const url   = ref(URL.createObjectURL(props.file))
const imgEl = ref(null)
const ready = ref(false)
const nat   = ref({ w: 1, h: 1 })
const zoom  = ref(1)
const pos   = ref({ x: 0, y: 0 })
const drag  = ref(null)

onUnmounted(() => URL.revokeObjectURL(url.value))

const scale = computed(() => Math.max(SW / nat.value.w, SH / nat.value.h) * zoom.value)
const dims  = computed(() => ({ w: nat.value.w * scale.value, h: nat.value.h * scale.value }))
const imgStyle = computed(() => ({
  width:  dims.value.w + 'px',
  height: dims.value.h + 'px',
  transform: `translate3d(${pos.value.x}px, ${pos.value.y}px, 0)`,
  opacity: ready.value ? 1 : 0
}))

function clamp(p) {
  const { w, h } = dims.value
  return {
    x: Math.min(0, Math.max(SW - w, p.x)),
    y: Math.min(0, Math.max(SH - h, p.y))
  }
}
function reset() {
  zoom.value = 1
  pos.value = clamp({ x: (SW - dims.value.w) / 2, y: (SH - dims.value.h) / 2 })
}
function onLoad() {
  const img = imgEl.value
  nat.value = { w: img.naturalWidth || 1, h: img.naturalHeight || 1 }
  reset()
  ready.value = true
}
// Масштабируем относительно центра области, чтобы картинка не «уезжала»
function setZoom(z) {
  const nz = Math.min(4, Math.max(1, z))
  const k = nz / zoom.value
  const cx = SW / 2, cy = SH / 2
  const next = { x: cx - (cx - pos.value.x) * k, y: cy - (cy - pos.value.y) * k }
  zoom.value = nz
  pos.value = clamp(next)
}
function wheel(e) { setZoom(zoom.value - e.deltaY * 0.0025) }

function down(e) {
  if (!ready.value) return
  e.currentTarget.setPointerCapture?.(e.pointerId)
  drag.value = { sx: e.clientX, sy: e.clientY, ox: pos.value.x, oy: pos.value.y }
}
function move(e) {
  const d = drag.value
  if (!d) return
  pos.value = clamp({ x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy })
}
function up() { drag.value = null }

function apply() {
  const canvas = document.createElement('canvas')
  canvas.width = OUT_W
  canvas.height = OUT_H
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  const s = scale.value
  ctx.drawImage(imgEl.value, -pos.value.x / s, -pos.value.y / s, SW / s, SH / s, 0, 0, OUT_W, OUT_H)
  canvas.toBlob(blob => {
    if (blob && blob.type === 'image/webp') return emit('done', blob)
    canvas.toBlob(png => png && emit('done', png), 'image/png')
  }, 'image/webp', props.round ? 0.9 : 0.85)
}
</script>

<style scoped>
.cropper { display: flex; flex-direction: column; align-items: center; gap: var(--space-4); }
.cr-stage {
  position: relative;
  max-width: 100%;
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: repeating-conic-gradient(var(--surface-3) 0 25%, var(--surface-2) 0 50%) 0 0 / 16px 16px;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.cr-stage.grabbing { cursor: grabbing; }
.cr-img {
  position: absolute; top: 0; left: 0;
  max-width: none;
  pointer-events: none;
  transition: opacity .2s ease;
  will-change: transform;
}
.cr-mask {
  position: absolute; inset: 0;
  border-radius: var(--radius-lg);
  box-shadow: 0 0 0 999px oklch(0 0 0 / 0.55);
  outline: 2px solid oklch(1 0 0 / 0.85);
  outline-offset: -2px;
  pointer-events: none;
}
.cr-mask.round { border-radius: 50%; }
.cr-loading { position: absolute; inset: 0; display: grid; place-items: center; }
.cr-spin {
  width: 22px; height: 22px; border-radius: 50%;
  border: 2px solid oklch(1 0 0 / 0.3); border-top-color: #fff;
  animation: crspin .7s linear infinite;
}
@keyframes crspin { to { transform: rotate(360deg); } }

.cr-zoom { display: flex; align-items: center; gap: var(--space-2); max-width: 100%; }
.cr-zoom input { flex: 1; accent-color: var(--accent); }
.cr-z {
  width: 28px; height: 28px; border-radius: var(--radius-full);
  display: grid; place-items: center;
  color: var(--text-muted);
  transition: background .15s ease, color .15s ease;
}
.cr-z:hover { background: var(--hover); color: var(--text); }

.cr-actions { display: flex; gap: var(--space-2); width: 100%; justify-content: flex-end; }
.cr-btn {
  display: inline-flex; align-items: center; gap: 6px;
  height: 34px; padding: 0 14px;
  border-radius: var(--radius-md);
  font-size: var(--text-sm); font-weight: 600;
  color: var(--text-muted);
  border: 1px solid var(--border);
  background: var(--surface-2);
  transition: background .15s ease, color .15s ease, opacity .15s ease;
}
.cr-btn:hover { background: var(--hover); color: var(--text); }
.cr-btn.primary { background: var(--accent); border-color: transparent; color: #fff; }
.cr-btn.primary:hover { background: var(--accent-hover, var(--accent)); }
.cr-btn:disabled { opacity: .5; cursor: not-allowed; }
</style>
