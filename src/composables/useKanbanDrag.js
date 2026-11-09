import { reactive, nextTick } from 'vue'

// Drag & drop карточек канбана на pointer-событиях (вместо нативного HTML5 DnD).
// Что это даёт по сравнению с draggable="true":
//  • свой «призрак» карточки — с наклоном по скорости курсора и лёгким подъёмом;
//  • на месте вставки — слот высотой с карточку, соседи плавно раздвигаются
//    (FLIP делает уже существующий TransitionGroup .k-card-move);
//  • при отпускании призрак «долетает» в слот, а не просто исчезает;
//  • автоскролл доски и колонки у краёв;
//  • работает на тач-устройствах (тянем за ручку), Esc — отмена.
//
// Позиция вставки считается по layout-координатам (offsetTop), а не по
// getBoundingClientRect(): во время FLIP-анимации у карточек есть transform,
// и расчёт по «визуальным» координатам начинает дрожать между двумя индексами.

const DRAG_THRESHOLD = 5 // px — меньше считается обычным кликом
const EDGE = 64          // px — зона автоскролла у края
const MAX_SPEED = 16     // px за кадр
const LIFT_SCALE = 1.035
const MAX_TILT = 6       // градусов

const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

function edgeSpeed(p, min, max) {
  if (p < min + EDGE) return -Math.ceil(MAX_SPEED * clamp((min + EDGE - p) / EDGE, 0, 1))
  if (p > max - EDGE) return Math.ceil(MAX_SPEED * clamp((p - (max - EDGE)) / EDGE, 0, 1))
  return 0
}

/**
 * @param {object} opts
 * @param {() => boolean} opts.canDrag   — можно ли сейчас таскать (ручная сортировка, без фильтров)
 * @param {() => boolean} opts.animated  — включены ли анимации в настройках
 * @param {(card, colId: string, index: number, fromColId: string) => void} opts.onDrop
 *        — СИНХРОННО применяет перенос к локальному board (запрос на сервер можно отправить внутри асинхронно)
 */
export function useKanbanDrag({ canDrag, animated, onDrop }) {
  const state = reactive({
    active: false,     // идёт перетаскивание
    instant: false,    // на один кадр выключаем CSS-переходы TransitionGroup (подмена карточка ↔ слот)
    card: null,
    fromColId: null,
    fromIndex: 0,
    colId: null,       // колонка, где сейчас стоит слот (строка — из data-col-id)
    index: 0,          // индекс слота среди карточек колонки (без перетаскиваемой)
    height: 0
  })

  let pending = null
  let ghost = null
  let boardEl = null
  let currentColEl = null
  let offX = 0, offY = 0
  let curX = 0, curY = 0, lastX = 0
  let vx = 0, tilt = 0, scale = 1
  let rafId = 0
  let settling = false

  // ── старт ────────────────────────────────────────────────
  function onPointerDown(e, card, colId) {
    if (state.active || settling) return
    if (e.button !== 0 || !canDrag()) return
    if (e.target.closest('button, a, input, textarea, select, [contenteditable]')) return
    // На тач-экранах свайп по карточке — это скролл колонки, поэтому тянем только за ручку.
    if (e.pointerType !== 'mouse' && !e.target.closest('.card-drag-handle')) return

    pending = { card, colId: String(colId), el: e.currentTarget, startX: e.clientX, startY: e.clientY }
    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
  }

  async function begin(e) {
    const { el, card, colId } = pending
    pending = null
    const rect = el.getBoundingClientRect()
    offX = curX - rect.left
    offY = curY - rect.top
    lastX = curX
    vx = 0; tilt = 0; scale = 1

    // Клон сохраняет data-v-* атрибуты, поэтому scoped-стили карточки работают и на призраке.
    ghost = el.cloneNode(true)
    ghost.removeAttribute('data-card-id')
    ghost.classList.add('drag-ghost')
    ghost.style.width = `${rect.width}px`
    ghost.style.height = `${rect.height}px`
    ghost.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`
    document.body.appendChild(ghost)

    boardEl = el.closest('.kanban-board')
    currentColEl = el.closest('[data-col-id]')
    const siblings = [...(currentColEl?.querySelectorAll('.kanban-card[data-card-id]') || [])]

    // Карточка мгновенно превращается в слот, призрак ровно поверх неё — визуально «подняли».
    state.instant = true
    Object.assign(state, {
      active: true,
      card,
      fromColId: colId,
      fromIndex: Math.max(0, siblings.indexOf(el)),
      colId,
      index: Math.max(0, siblings.indexOf(el)),
      height: rect.height
    })
    document.body.classList.add('is-dragging')
    window.addEventListener('keydown', onKeyDown)
    rafId = requestAnimationFrame(loop)
    await nextTick()
    requestAnimationFrame(() => { state.instant = false })
  }

  // ── движение ─────────────────────────────────────────────
  function onPointerMove(e) {
    curX = e.clientX
    curY = e.clientY
    if (pending) {
      if (Math.hypot(curX - pending.startX, curY - pending.startY) < DRAG_THRESHOLD) return
      e.preventDefault()
      begin(e)
      return
    }
    if (!state.active || settling) return
    e.preventDefault()
    vx = vx * 0.6 + (curX - lastX) * 0.4
    lastX = curX
    hitTest()
  }

  function loop() {
    if (!ghost) return
    const anim = animated()
    vx *= 0.88
    const targetTilt = anim ? clamp(vx * 0.55, -MAX_TILT, MAX_TILT) : 0
    tilt += (targetTilt - tilt) * 0.2
    scale += ((anim ? LIFT_SCALE : 1) - scale) * 0.25
    ghost.style.transform =
      `translate3d(${curX - offX}px, ${curY - offY}px, 0) rotate(${tilt.toFixed(2)}deg) scale(${scale.toFixed(4)})`
    autoScroll()
    rafId = requestAnimationFrame(loop)
  }

  function autoScroll() {
    let moved = false
    if (boardEl) {
      const r = boardEl.getBoundingClientRect()
      const dx = edgeSpeed(curX, r.left, r.right)
      if (dx) {
        const before = boardEl.scrollLeft
        boardEl.scrollLeft += dx
        moved ||= boardEl.scrollLeft !== before
      }
    }
    const scroller = currentColEl?.querySelector('.col-cards')
    if (scroller) {
      const r = scroller.getBoundingClientRect()
      if (curX >= r.left && curX <= r.right) {
        const dy = edgeSpeed(curY, r.top, r.bottom)
        if (dy) {
          const before = scroller.scrollTop
          scroller.scrollTop += dy
          moved ||= scroller.scrollTop !== before
        }
      }
    }
    if (moved) hitTest()
  }

  function hitTest() {
    // Призрак с pointer-events: none, так что под курсором — реальная колонка.
    const colEl = document.elementFromPoint(curX, curY)?.closest('[data-col-id]')
    if (!colEl) return // вне колонок — слот остаётся на последнем месте, так приятнее
    currentColEl = colEl
    const list = colEl.querySelector('.col-cards-list')
    if (!list) return
    const listTop = list.getBoundingClientRect().top
    const cards = [...list.querySelectorAll(':scope > .kanban-card[data-card-id]')]
      .filter(el => !el.classList.contains('k-card-leave-active'))
    let index = cards.length
    for (let i = 0; i < cards.length; i++) {
      const el = cards[i]
      if (curY < listTop + el.offsetTop + el.offsetHeight / 2) { index = i; break }
    }
    const colId = colEl.dataset.colId
    if (colId !== state.colId) state.colId = colId
    if (index !== state.index) state.index = index
  }

  // ── завершение ───────────────────────────────────────────
  function onPointerUp() {
    if (pending) { cleanupListeners(); pending = null; return } // обычный клик
    if (state.active) finish(true)
  }
  function onPointerCancel() {
    if (pending) { cleanupListeners(); pending = null; return }
    if (state.active) finish(false)
  }
  function onKeyDown(e) {
    if (e.key === 'Escape' && state.active) { e.preventDefault(); finish(false) }
  }

  async function finish(commit) {
    if (settling) return
    settling = true
    cleanupListeners()
    cancelAnimationFrame(rafId)

    if (!commit) {
      // Отмена: возвращаем слот на исходное место и «сажаем» призрак туда.
      state.colId = state.fromColId
      state.index = state.fromIndex
      await nextTick()
    }

    await settleGhost()

    const { card, colId, index, fromColId } = state
    state.instant = true
    if (commit) {
      try { onDrop(card, colId, index, fromColId) } catch (err) { console.error(err) }
    }
    Object.assign(state, { active: false, card: null, colId: null, fromColId: null })
    await nextTick()
    requestAnimationFrame(() => {
      ghost?.remove()
      ghost = null
      state.instant = false
      settling = false
      document.body.classList.remove('is-dragging')
    })
  }

  async function settleGhost() {
    if (!ghost) return
    const slot = document.querySelector(`[data-col-id="${CSS.escape(String(state.colId))}"] .card-placeholder`)
    if (!slot || !animated() || !ghost.animate) return
    const to = slot.getBoundingClientRect()
    const from = ghost.style.transform
    const target = `translate3d(${to.left}px, ${to.top}px, 0) rotate(0deg) scale(1)`
    try {
      await ghost.animate(
        [{ transform: from }, { transform: target }],
        { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }
      ).finished
    } catch { /* анимацию могли прервать — не страшно */ }
    ghost.style.transform = target
    ghost.classList.add('drag-ghost-landed')
  }

  function cleanupListeners() {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerCancel)
    window.removeEventListener('keydown', onKeyDown)
  }

  /** Список для рендера колонки: без перетаскиваемой карточки, со слотом на месте вставки. */
  function renderCards(col) {
    if (!state.active) return col.visibleCards
    const list = col.visibleCards.filter(c => c.id !== state.card?.id)
    if (state.colId === String(col.id)) {
      list.splice(clamp(state.index, 0, list.length), 0, { id: '__placeholder__', placeholder: true })
    }
    return list
  }

  function isOver(col) {
    return state.active && state.colId === String(col.id)
  }

  function destroy() {
    cleanupListeners()
    cancelAnimationFrame(rafId)
    ghost?.remove()
    ghost = null
    document.body.classList.remove('is-dragging')
  }

  return { state, onPointerDown, renderCards, isOver, destroy }
}
