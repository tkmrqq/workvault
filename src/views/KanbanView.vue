<template>
  <div class="kanban-root">
    <TitleBar />
    <div class="kanban-layout">
      <Sidebar />
      <div class="kanban-main">

        <!-- Header -->
        <div class="kanban-header">
          <div class="kanban-header-left">
            <span class="kanban-icon">📋</span>
            <h1 class="kanban-title">Канбан</h1>
          </div>
          <button class="btn-add-card" @click="openCreate(null)">
            <span>+</span> Новая задача
          </button>
        </div>

        <!-- Board -->
        <div class="kanban-board" v-if="board.length">
          <div
            v-for="col in board"
            :key="col.id"
            class="kanban-col"
            @dragover.prevent="onDragOver($event, col.id)"
            @drop="onDrop($event, col.id)"
            :class="{ 'drag-over': dragOverCol === col.id }"
          >
            <!-- Column header -->
            <div class="col-header">
              <div class="col-dot" :style="{ background: col.color }"></div>
              <span class="col-title">{{ col.title }}</span>
              <span class="col-count">{{ col.cards.length }}</span>
              <button class="col-add-btn" @click="openCreate(col.id)" title="Добавить карточку">+</button>
            </div>

            <!-- Cards -->
            <div class="col-cards">
              <div
                v-for="card in col.cards"
                :key="card.id"
                class="kanban-card"
                draggable="true"
                @dragstart="onDragStart($event, card)"
                @dragend="onDragEnd"
                :class="{ dragging: draggingCard?.id === card.id }"
                @click="openEdit(card)"
              >
                <div class="card-priority" :class="card.priority">
                  {{ priorityLabel(card.priority) }}
                </div>
                <div class="card-title">{{ card.title }}</div>
                <div v-if="card.description" class="card-desc">{{ card.description }}</div>
                <div class="card-footer">
                  <div v-if="card.assignee_name" class="card-assignee">
                    <span class="assignee-avatar"
                      :style="{ background: card.assignee_color + '22', color: card.assignee_color }">
                      {{ card.assignee_avatar }}
                    </span>
                    <span class="assignee-name">{{ card.assignee_name }}</span>
                  </div>
                  <div v-else class="card-assignee-empty">Не назначено</div>
                </div>
              </div>

              <!-- Drop placeholder -->
              <div v-if="dragOverCol === col.id && draggingCard" class="drop-placeholder"></div>
            </div>
          </div>
        </div>

        <div v-else class="kanban-empty">
          <div class="empty-icon">📋</div>
          <p>Загружаем доску...</p>
        </div>
      </div>
    </div>

    <!-- Modal: Create / Edit card -->
    <Teleport to="body">
      <div v-if="modal.open" class="modal-overlay" @click.self="closeModal">
        <div class="modal" :class="{ 'modal-in': modal.open }">
          <div class="modal-header">
            <h2>{{ modal.mode === 'create' ? 'Новая задача' : 'Редактировать задачу' }}</h2>
            <button class="modal-close" @click="closeModal">✕</button>
          </div>

          <div class="modal-body">
            <label class="field-label">Название *</label>
            <input
              v-model="modal.title"
              class="field-input"
              placeholder="Что нужно сделать?"
              autofocus
              @keydown.enter="saveCard"
            />

            <label class="field-label">Описание</label>
            <textarea
              v-model="modal.description"
              class="field-textarea"
              placeholder="Подробности..."
              rows="3"
            />

            <div class="field-row">
              <div class="field-group">
                <label class="field-label">Колонка</label>
                <select v-model="modal.column_id" class="field-select">
                  <option v-for="col in board" :key="col.id" :value="col.id">{{ col.title }}</option>
                </select>
              </div>
              <div class="field-group">
                <label class="field-label">Приоритет</label>
                <select v-model="modal.priority" class="field-select">
                  <option value="low">🟢 Низкий</option>
                  <option value="medium">🟡 Средний</option>
                  <option value="high">🔴 Высокий</option>
                </select>
              </div>
            </div>

            <label class="field-label">Исполнитель</label>
            <select v-model="modal.assignee_id" class="field-select">
              <option :value="null">— Не назначено</option>
              <option v-for="u in users" :key="u.id" :value="u.id">{{ u.avatar }} {{ u.name }}</option>
            </select>
          </div>

          <div class="modal-footer">
            <button
              v-if="modal.mode === 'edit'"
              class="btn-delete"
              @click="deleteCard"
            >Удалить</button>
            <div class="modal-footer-right">
              <button class="btn-cancel" @click="closeModal">Отмена</button>
              <button class="btn-save" :disabled="!modal.title.trim()" @click="saveCard">
                {{ modal.mode === 'create' ? 'Создать' : 'Сохранить' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import TitleBar from '@/components/TitleBar.vue'
import Sidebar  from '@/components/Sidebar.vue'

const store  = useAppStore()
const router = useRouter()
const API    = import.meta.env.VITE_API_URL || ''

const board  = ref([])
const users  = ref([])

// ─── Drag & Drop ─────────────────────────────────────────
const draggingCard = ref(null)
const dragOverCol  = ref(null)

function onDragStart(e, card) {
  draggingCard.value = card
  e.dataTransfer.effectAllowed = 'move'
}
function onDragEnd() {
  draggingCard.value = null
  dragOverCol.value  = null
}
function onDragOver(e, colId) {
  dragOverCol.value = colId
}
async function onDrop(e, colId) {
  if (!draggingCard.value) return
  const card = draggingCard.value
  draggingCard.value = null
  dragOverCol.value  = null

  // Оптимистично перемещаем
  board.value = board.value.map(col => ({
    ...col,
    cards: col.cards.filter(c => c.id !== card.id)
  }))
  const targetCol = board.value.find(c => c.id === colId)
  if (targetCol) targetCol.cards.push({ ...card, column_id: colId })

  // Сохраняем порядок
  const payload = []
  board.value.forEach(col => {
    col.cards.forEach(c => payload.push({ id: c.id, column_id: col.id }))
  })
  await fetch(`${API}/api/kanban/cards/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
}

// ─── Modal ────────────────────────────────────────────────
const modal = reactive({
  open: false, mode: 'create',
  id: null, column_id: null,
  title: '', description: '', priority: 'medium', assignee_id: null
})

function openCreate(colId) {
  modal.open = true; modal.mode = 'create'
  modal.id = null
  modal.column_id = colId || board.value[0]?.id
  modal.title = ''; modal.description = ''
  modal.priority = 'medium'; modal.assignee_id = null
}
function openEdit(card) {
  router.push(`/kanban/${card.id}`)
}
function closeModal() { modal.open = false }

async function saveCard() {
  if (!modal.title.trim()) return
  if (modal.mode === 'create') {
    await fetch(`${API}/api/kanban/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        column_id:   modal.column_id,
        title:       modal.title.trim(),
        description: modal.description || null,
        priority:    modal.priority,
        assignee_id: modal.assignee_id
      })
    })
  } else {
    await fetch(`${API}/api/kanban/cards/${modal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        column_id:   modal.column_id,
        title:       modal.title.trim(),
        description: modal.description || null,
        priority:    modal.priority,
        assignee_id: modal.assignee_id
      })
    })
  }
  closeModal()
  await loadBoard()
}

async function deleteCard() {
  if (!confirm('Удалить задачу?')) return
  await fetch(`${API}/api/kanban/cards/${modal.id}`, { method: 'DELETE' })
  closeModal()
  await loadBoard()
}

// ─── Data ─────────────────────────────────────────────────
async function loadBoard() {
  const r = await fetch(`${API}/api/kanban`)
  board.value = await r.json()
}

function priorityLabel(p) {
  return { low: '↓ Низкий', medium: '→ Средний', high: '↑ Высокий' }[p] || p
}

// ─── Socket realtime ──────────────────────────────────────
let offKanban
onMounted(async () => {
  if (!store.user) { router.push('/'); return }
  if (!store.folders.length) await store.fetchFolders()
  await loadBoard()
  const r = await fetch(`${API}/api/users`)
  users.value = await r.json()

  // Слушаем обновления через socket (если store.socket доступен)
  if (store.socket) {
    store.socket.on('kanban:update', (newBoard) => {
      board.value = newBoard
    })
    offKanban = () => store.socket.off('kanban:update')
  }
})
onUnmounted(() => offKanban?.())
</script>

<style scoped>
.kanban-root {
  display: flex; flex-direction: column;
  height: 100dvh; overflow: hidden;
}
.kanban-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  flex: 1; min-height: 0; overflow: hidden;
}
.kanban-main {
  display: flex; flex-direction: column;
  overflow: hidden; background: var(--bg);
}

/* ── Header ── */
.kanban-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.kanban-header-left { display: flex; align-items: center; gap: 10px; }
.kanban-icon { font-size: 1.3rem; }
.kanban-title { font-size: var(--text-lg); font-weight: 700; color: var(--text); }
.btn-add-card {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px;
  background: var(--accent); color: #fff;
  border-radius: var(--radius-md);
  font-size: var(--text-sm); font-weight: 600;
  transition: background var(--transition);
}
.btn-add-card:hover { background: var(--accent-hover); }

/* ── Board ── */
.kanban-board {
  display: flex; gap: 16px;
  padding: 20px;
  overflow-x: auto; overflow-y: hidden;
  flex: 1; align-items: flex-start;
}
.kanban-board::-webkit-scrollbar { height: 6px; }
.kanban-board::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

/* ── Column ── */
.kanban-col {
  width: 280px; min-width: 280px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  display: flex; flex-direction: column;
  max-height: calc(100vh - 130px);
  transition: border-color .15s;
}
.kanban-col.drag-over {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.col-header {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 14px 10px;
  flex-shrink: 0;
}
.col-dot {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
}
.col-title { font-weight: 700; font-size: var(--text-sm); flex: 1; color: var(--text); }
.col-count {
  font-size: 11px; font-weight: 600;
  background: var(--surface-3); color: var(--text-muted);
  padding: 1px 7px; border-radius: 20px;
}
.col-add-btn {
  width: 24px; height: 24px; border-radius: var(--radius-md);
  font-size: 1.1rem; color: var(--text-faint);
  display: flex; align-items: center; justify-content: center;
  transition: all var(--transition);
}
.col-add-btn:hover { background: var(--hover); color: var(--accent); }
.col-cards {
  display: flex; flex-direction: column; gap: 8px;
  padding: 4px 10px 12px;
  overflow-y: auto; flex: 1;
}
.col-cards::-webkit-scrollbar { width: 4px; }
.col-cards::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

/* ── Card ── */
.kanban-card {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  cursor: grab;
  transition: box-shadow .15s, opacity .15s, transform .15s;
  user-select: none;
}
.kanban-card:hover { box-shadow: var(--shadow-md); border-color: var(--accent-line); }
.kanban-card:active { cursor: grabbing; }
.kanban-card.dragging { opacity: .4; transform: scale(.97); }

.card-priority {
  display: inline-block;
  font-size: 10px; font-weight: 700;
  padding: 2px 7px; border-radius: 20px;
  margin-bottom: 6px;
  text-transform: uppercase; letter-spacing: .04em;
}
.card-priority.low    { background: rgba(76,175,125,.15); color: #4caf7d; }
.card-priority.medium { background: rgba(232,175,52,.15); color: #e8af34; }
.card-priority.high   { background: rgba(224,108,117,.15); color: #e06c75; }

.card-title {
  font-size: var(--text-sm); font-weight: 600;
  color: var(--text); line-height: 1.4;
  margin-bottom: 4px;
}
.card-desc {
  font-size: 12px; color: var(--text-muted);
  line-height: 1.4; margin-bottom: 8px;
  display: -webkit-box; -webkit-line-clamp: 2;
  -webkit-box-orient: vertical; overflow: hidden;
}
.card-footer { margin-top: 8px; }
.card-assignee {
  display: flex; align-items: center; gap: 6px;
}
.assignee-avatar {
  width: 22px; height: 22px; border-radius: 50%;
  font-size: .85rem;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.assignee-name { font-size: 11px; color: var(--text-muted); }
.card-assignee-empty { font-size: 11px; color: var(--text-faint); }

.drop-placeholder {
  height: 60px; border-radius: var(--radius-md);
  border: 2px dashed var(--accent-line);
  background: var(--accent-soft);
  flex-shrink: 0;
}

/* ── Empty ── */
.kanban-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px; color: var(--text-muted);
}
.empty-icon { font-size: 3rem; }

/* ── Modal ── */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.55);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; padding: 16px;
}
.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  width: min(480px, 100%);
  box-shadow: var(--shadow-lg);
  display: flex; flex-direction: column;
  opacity: 0; transform: scale(.96) translateY(8px);
  animation: modalIn .2s ease forwards;
}
@keyframes modalIn {
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--border);
}
.modal-header h2 { font-size: var(--text-base); font-weight: 700; }
.modal-close {
  width: 28px; height: 28px; border-radius: var(--radius-md);
  font-size: 13px; color: var(--text-faint);
  display: flex; align-items: center; justify-content: center;
  transition: all var(--transition);
}
.modal-close:hover { background: var(--hover); color: var(--text); }
.modal-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; }
.field-label { font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px; display: block; }
.field-input, .field-select {
  width: 100%;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 9px 12px;
  font-size: var(--text-sm);
  color: var(--text);
  transition: border-color var(--transition);
}
.field-input:focus, .field-select:focus { outline: none; border-color: var(--accent-line); }
.field-textarea {
  width: 100%; resize: vertical; min-height: 72px;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 9px 12px;
  font-size: var(--text-sm); font-family: inherit;
  color: var(--text);
  transition: border-color var(--transition);
}
.field-textarea:focus { outline: none; border-color: var(--accent-line); }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field-group { display: flex; flex-direction: column; }
.modal-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px 18px;
  border-top: 1px solid var(--border);
}
.modal-footer-right { display: flex; gap: 8px; }
.btn-cancel {
  padding: 8px 16px; border-radius: var(--radius-md);
  font-size: var(--text-sm); font-weight: 600;
  background: var(--surface-3); color: var(--text-muted);
  border: 1px solid var(--border);
  transition: all var(--transition);
}
.btn-cancel:hover { background: var(--hover); }
.btn-save {
  padding: 8px 18px; border-radius: var(--radius-md);
  font-size: var(--text-sm); font-weight: 600;
  background: var(--accent); color: #fff;
  transition: background var(--transition);
}
.btn-save:hover:not(:disabled) { background: var(--accent-hover); }
.btn-save:disabled { opacity: .45; cursor: not-allowed; }
.btn-delete {
  padding: 8px 14px; border-radius: var(--radius-md);
  font-size: var(--text-sm); font-weight: 600;
  background: rgba(224,108,117,.12); color: #e06c75;
  transition: all var(--transition);
}
.btn-delete:hover { background: rgba(224,108,117,.25); }
</style>
