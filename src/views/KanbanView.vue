<template>
  <div class="kanban-root">
    <TitleBar />
    <div class="kanban-layout">
      <Sidebar />
      <div class="kanban-main">

        <!-- Header -->
        <div class="kanban-header">
          <div class="kanban-header-left">
            <MobileMenuButton />
            <LayoutDashboard class="kanban-icon" :size="20" :stroke-width="2" />
            <h1 class="kanban-title">Канбан</h1>
          </div>
          <div class="kanban-header-right">
            <select v-model="sortBy" class="sort-select" title="Сортировка карточек">
              <option value="manual">Ручной порядок</option>
              <option value="date">По дате</option>
              <option value="title">По названию</option>
              <option value="priority">По приоритету</option>
            </select>
            <button class="btn-list-count" @click="openListModal" title="Экспорт / импорт списком">
              <ListChecks :size="14" :stroke-width="2" /> {{ totalCardsCount }}
            </button>
            <button class="btn-archive" @click="openArchive"><Archive :size="14" :stroke-width="2" /> Архив</button>
            <button class="btn-add-card" @click="openCreate(null)" title="Новая задача">
              <Plus :size="15" :stroke-width="2.5" />
              <span class="btn-add-label">Новая задача</span>
            </button>
          </div>
        </div>

        <!-- Workspace tabs -->
        <div class="ws-tabs">
          <button
            v-for="ws in workspaces" :key="ws.id"
            class="ws-tab" :class="{ active: ws.id === activeWorkspaceId }"
            @click="switchWorkspace(ws.id)"
            @dblclick="renameWorkspace(ws)"
          >
            <span>{{ ws.icon }}</span> {{ ws.name }}
            <X v-if="workspaces.length > 1" class="ws-tab-del" @click.stop="removeWorkspace(ws)" :size="11" :stroke-width="2.5" />
          </button>
          <button class="ws-tab ws-tab-add" @click="addWorkspace" title="Новая рабочая зона"><Plus :size="13" :stroke-width="2.5" /></button>
        </div>

        <!-- Board -->
        <div class="kanban-board" v-if="board.length">
          <div
            v-for="col in board"
            :key="col.id"
            class="kanban-col"
            @dragover.prevent="onColDragOver($event, col)"
            @drop.prevent="onDrop($event, col.id)"
            :class="{ 'drag-over': dragOverInfo.colId === col.id }"
          >
            <!-- Column header -->
            <div class="col-header">
              <div class="col-dot" :style="{ background: col.color }"></div>
              <span class="col-title">{{ col.title }}</span>
              <span v-if="col.is_terminal" class="col-terminal-badge" title="Завершённые карточки из этой колонки автоматически уедут в архив"><Check :size="10" :stroke-width="3" /> авто-архив</span>
              <span class="col-count">{{ col.cards.length }}</span>
              <button class="col-add-btn" @click="openCreate(col.id)" title="Добавить карточку"><Plus :size="15" :stroke-width="2.5" /></button>
            </div>

            <!-- Cards -->
            <div class="col-cards">
              <div v-if="dragOverInfo.colId === col.id && col.cards.length" class="drop-line" :style="{ top: dragOverInfo.y + 'px' }"></div>
              <div v-if="!col.cards.length" class="col-empty-drop" :class="{ 'drag-over': dragOverInfo.colId === col.id }">Перетащите сюда</div>
              <div
                v-for="card in sortedCards(col.cards)" :key="card.id"
                class="kanban-card"
                :draggable="sortBy === 'manual'"
                @dragstart="onDragStart($event, card)"
                @dragend="onDragEnd"
                :class="{ dragging: draggingCard?.id === card.id }"
                @click="openEdit(card)"
              >
                  <div v-if="sortBy === 'manual'" class="card-drag-handle" @mousedown="dragHandleGrabbed = true" title="Потяни, чтобы переместить">
                    <GripVertical :size="13" :stroke-width="2" />
                  </div>
                  <div class="card-top-row">
                    <div class="card-priority" :class="card.priority">
                      <component :is="priorityIcon(card.priority)" :size="10" :stroke-width="3" />{{ priorityLabel(card.priority) }}
                    </div>
                    <div v-if="card.due_date" class="card-due" :class="{ overdue: isOverdue(card) }">
                      <Calendar :size="11" :stroke-width="2.2" /> {{ formatDueDate(card.due_date) }}
                    </div>
                  </div>
                  <div class="card-title">{{ card.title }}</div>
                  <div v-if="card.description" class="card-desc">{{ card.description }}</div>
                  <div v-if="card.subtasks_total" class="card-progress">
                    <div class="card-progress-bar">
                      <div class="card-progress-fill" :style="{ width: (card.subtasks_done / card.subtasks_total * 100) + '%' }"></div>
                    </div>
                    <span class="card-progress-label">{{ card.subtasks_done }}/{{ card.subtasks_total }}</span>
                  </div>
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
            </div>
          </div>
        </div>

        <div v-else class="kanban-empty">
          <LayoutDashboard class="empty-icon" :size="48" :stroke-width="1.5" />
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
            <button class="modal-close" @click="closeModal"><X :size="14" :stroke-width="2.5" /></button>
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

            <div class="field-row">
              <div class="field-group">
                <label class="field-label">Исполнитель</label>
                <select v-model="modal.assignee_id" class="field-select">
                  <option :value="null">— Не назначено</option>
                  <option v-for="u in users" :key="u.id" :value="u.id">{{ u.avatar }} {{ u.name }}</option>
                </select>
              </div>
              <div class="field-group">
                <label class="field-label">Дедлайн</label>
                <input type="date" v-model="modal.due_date" class="field-input" />
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button
              v-if="modal.mode === 'edit'"
              class="btn-delete"
              @click="deleteCard"
            >Удалить</button>
            <div class="modal-footer-right">
              <button v-if="modal.mode === 'edit'" class="btn-archive-card" @click="archiveCard"><Archive :size="13" :stroke-width="2" /> В архив</button>
              <button class="btn-cancel" @click="closeModal">Отмена</button>
              <button class="btn-save" :disabled="!modal.title.trim() || modal.submitting" @click="saveCard">
                {{ modal.submitting ? 'Сохраняю...' : (modal.mode === 'create' ? 'Создать' : 'Сохранить') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Modal: Archive -->
    <Teleport to="body">
      <div v-if="archiveModal.open" class="modal-overlay" @click.self="archiveModal.open = false">
        <div class="modal archive-modal">
          <div class="modal-header">
            <h2 class="modal-title-row"><Archive :size="17" :stroke-width="2" /> Архив завершённых задач</h2>
            <button class="modal-close" @click="archiveModal.open = false"><X :size="14" :stroke-width="2.5" /></button>
          </div>
          <div class="modal-body archive-body">
            <p v-if="!archivedCards.length" class="archive-empty">Пока пусто. Завершённые карточки попадают сюда автоматически через несколько дней после переноса в терминальную колонку — либо вручную, кнопкой «В архив».</p>
            <div v-else class="archive-list">
              <div v-for="card in archivedCards" :key="card.id" class="archive-item">
                <div class="archive-item-info">
                  <div class="card-priority" :class="card.priority"><component :is="priorityIcon(card.priority)" :size="10" :stroke-width="3" />{{ priorityLabel(card.priority) }}</div>
                  <div class="archive-item-title">{{ card.title }}</div>
                  <div class="archive-item-date">В архиве с {{ formatDueDate(card.archived_at) }}</div>
                </div>
                <button class="btn-restore" @click="restoreCard(card)"><RotateCcw :size="12" :stroke-width="2.2" /> Восстановить</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Modal: List export/import -->
    <Teleport to="body">
      <div v-if="listModal.open" class="modal-overlay" @click.self="listModal.open = false">
        <div class="modal list-modal">
          <div class="modal-header">
            <h2 class="modal-title-row"><ListChecks :size="17" :stroke-width="2" /> Список задач</h2>
            <button class="modal-close" @click="listModal.open = false"><X :size="14" :stroke-width="2.5" /></button>
          </div>
          <div class="modal-body list-modal-body">
            <div class="list-section">
              <div class="list-section-header">
                <span class="field-label">Экспорт — все карточки текущей зоны</span>
                <div class="list-section-actions">
                  <button class="btn-cancel btn-sm" @click="copyExportText"><Copy :size="12" :stroke-width="2.2" /> Копировать</button>
                  <button class="btn-cancel btn-sm" @click="downloadExportText"><Download :size="12" :stroke-width="2.2" /> .txt</button>
                </div>
              </div>
              <textarea ref="exportTextarea" class="field-textarea list-textarea" readonly :value="exportText" rows="8" @click="$event.target.select()"></textarea>
            </div>

            <div class="list-section">
              <label class="field-label">Импорт — вставь список, каждая задача с новой строки (можно с «- » в начале)</label>
              <textarea
                v-model="importText"
                class="field-textarea list-textarea"
                rows="8"
                placeholder="- Первая задача&#10;- Вторая задача&#10;- Третья задача"
              ></textarea>
              <div class="import-controls">
                <select v-model="importColumnId" class="field-select">
                  <option :value="null" disabled>— Выбери колонку —</option>
                  <option v-for="col in board" :key="col.id" :value="col.id">{{ col.title }}</option>
                </select>
                <button
                  class="btn-save"
                  :disabled="!importLines.length || !importColumnId || importing"
                  @click="runImport"
                >{{ importing ? 'Добавляю...' : `Добавить ${importLines.length || ''} карточек` }}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { confirmDialog } from '@/composables/useConfirm'
import TitleBar from '@/components/TitleBar.vue'
import Sidebar  from '@/components/Sidebar.vue'
import MobileMenuButton from '@/components/MobileMenuButton.vue'
import {
  Archive, Plus, X, Check, Calendar, RotateCcw,
  LayoutDashboard, ArrowDown, ArrowRight, ArrowUp,
  ListChecks, Copy, Download, GripVertical
} from 'lucide-vue-next'

const store  = useAppStore()
const router = useRouter()
const route  = useRoute()
const API    = import.meta.env.VITE_API_URL || ''

const board  = ref([])
const users  = ref([])
const workspaces = ref([])
const activeWorkspaceId = ref(null)
const sortBy = ref('manual') // 'manual' | 'date' | 'title' | 'priority'
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 }

function sortedCards(cards) {
  if (sortBy.value === 'manual') return cards
  const arr = [...cards]
  if (sortBy.value === 'date') {
    // без даты — в конец, а не в начало (Infinity вместо 0)
    arr.sort((a, b) => (a.due_date ?? Infinity) - (b.due_date ?? Infinity))
  } else if (sortBy.value === 'title') {
    arr.sort((a, b) => a.title.localeCompare(b.title, 'ru'))
  } else if (sortBy.value === 'priority') {
    arr.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99))
  }
  return arr
}

// ─── Drag & Drop ─────────────────────────────────────────
const draggingCard = ref(null)
const dragOverInfo  = reactive({ colId: null, index: null, y: 0 })

const dragHandleGrabbed = ref(false)

function onDragStart(e, card) {
  if (!dragHandleGrabbed.value) { e.preventDefault(); return }
  draggingCard.value = card
  e.dataTransfer.effectAllowed = 'move'
  // Firefox не начнёт drag без setData — Chrome/Electron обычно и без этого работают,
  // но лучше подстраховаться для кросс-браузерности
  e.dataTransfer.setData('text/plain', String(card.id))
}
function onDragEnd() {
  draggingCard.value = null
  dragOverInfo.colId = null
  dragOverInfo.index = null
  dragHandleGrabbed.value = false
}
// Единый обработчик на колонку. Раньше был ещё отдельный на каждую карточку,
// но плейсхолдер-вставка сам оказывался под курсором и перехватывал dragover,
// сбрасывая позицию на "конец колонки" — из-за этого сортировка внутри одной
// колонки постоянно сбивалась. Теперь просто меряем позиции карточек напрямую.
function onColDragOver(e, col) {
  if (!draggingCard.value || sortBy.value !== 'manual') return
  const container = e.currentTarget.querySelector('.col-cards')
  const containerRect = container.getBoundingClientRect()
  const cardEls = [...container.querySelectorAll('.kanban-card:not(.dragging)')]
  let index = cardEls.length
  let y = null
  for (let i = 0; i < cardEls.length; i++) {
    const rect = cardEls[i].getBoundingClientRect()
    if (e.clientY < rect.top + rect.height / 2) {
      index = i
      // + container.scrollTop: getBoundingClientRect() даёт координаты относительно
      // окна, а .drop-line — абсолютно спозиционированный ребёнок скроллящегося
      // .col-cards, поэтому его top должен быть в системе координат прокрученного
      // контента, а не видимой области. Без этого линия "уезжала" при скролле колонки.
      y = rect.top - containerRect.top + container.scrollTop - 4
      break
    }
  }
  if (y === null) {
    y = cardEls.length
      ? cardEls[cardEls.length - 1].getBoundingClientRect().bottom - containerRect.top + container.scrollTop + 4
      : 8
  }
  dragOverInfo.colId = col.id
  dragOverInfo.index = index
  dragOverInfo.y = y
}
async function onDrop(e, colId) {
  if (!draggingCard.value) return
  const card = draggingCard.value
  const targetColId = dragOverInfo.colId ?? colId
  let insertIndex = dragOverInfo.index ?? 0
  draggingCard.value = null
  dragOverInfo.colId = null
  dragOverInfo.index = null

  // Индекс уже посчитан по карточкам БЕЗ учёта перетаскиваемой (см. onColDragOver),
  // поэтому просто убираем её из старого места и вставляем в новое — без дополнительной
  // подгонки индекса.
  const sourceCol = board.value.find(c => c.cards.some(cc => cc.id === card.id))
  if (sourceCol) {
    const sourceIdx = sourceCol.cards.findIndex(cc => cc.id === card.id)
    sourceCol.cards.splice(sourceIdx, 1)
  }
  const targetCol = board.value.find(c => c.id === targetColId)
  if (targetCol) {
    insertIndex = Math.max(0, Math.min(insertIndex, targetCol.cards.length))
    targetCol.cards.splice(insertIndex, 0, { ...card, column_id: targetColId })
  }

  const payload = []
  board.value.forEach(col => col.cards.forEach(c => payload.push({ id: c.id, column_id: col.id })))
  await fetch(`${API}/api/kanban/cards/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: activeWorkspaceId.value, cards: payload })
  })
}

// ─── Modal ────────────────────────────────────────────────
const modal = reactive({
  open: false, mode: 'create', submitting: false,
  id: null, column_id: null,
  title: '', description: '', priority: 'medium', assignee_id: null, due_date: ''
})

function openCreate(colId) {
  modal.open = true; modal.mode = 'create'; modal.submitting = false
  modal.id = null
  modal.column_id = colId || board.value[0]?.id
  modal.title = ''; modal.description = ''
  modal.priority = 'medium'; modal.assignee_id = null; modal.due_date = ''
}
function openEdit(card) {
  router.push(`/kanban/${card.id}`)
}
async function closeModal() {
  if (modal.title.trim() || modal.description.trim()) {
    if (!await confirmDialog('Есть несохранённые данные. Закрыть без сохранения?')) return
  }
  modal.open = false
}

function dateToTs(dateStr) {
  if (!dateStr) return null
  return Math.floor(new Date(dateStr + 'T00:00:00').getTime() / 1000)
}

async function saveCard() {
  if (!modal.title.trim() || modal.submitting) return
  modal.submitting = true
  const body = {
    column_id:   modal.column_id,
    title:       modal.title.trim(),
    description: modal.description || null,
    priority:    modal.priority,
    assignee_id: modal.assignee_id,
    due_date:    dateToTs(modal.due_date),
    workspace_id: activeWorkspaceId.value
  }
  try {
    if (modal.mode === 'create') {
      await fetch(`${API}/api/kanban/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    } else {
      await fetch(`${API}/api/kanban/cards/${modal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    }
    modal.open = false // напрямую, не через closeModal() — данные уже сохранены, спрашивать не о чем
    await loadBoard()
  } finally {
    modal.submitting = false
  }
}

async function deleteCard() {
  if (!await confirmDialog('Удалить задачу?', { danger: true, confirmLabel: 'Удалить' })) return
  await fetch(`${API}/api/kanban/cards/${modal.id}`, { method: 'DELETE' })
  modal.open = false // напрямую — удаление уже подтверждено выше
  await loadBoard()
}

async function archiveCard() {
  await fetch(`${API}/api/kanban/cards/${modal.id}/archive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: activeWorkspaceId.value })
  })
  closeModal()
  await loadBoard()
}

// ─── Archive modal ──────────────────────────────────────────
const archiveModal   = reactive({ open: false })
const archivedCards  = ref([])

async function openArchive() {
  archiveModal.open = true
  await loadArchive()
}
async function loadArchive() {
  const r = await fetch(`${API}/api/kanban/archive?workspace_id=${activeWorkspaceId.value}`)
  archivedCards.value = await r.json()
}
async function restoreCard(card) {
  await fetch(`${API}/api/kanban/cards/${card.id}/unarchive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: activeWorkspaceId.value })
  })
  await Promise.all([loadArchive(), loadBoard()])
}

// ─── List export/import ─────────────────────────────────────
const listModal = reactive({ open: false })
const importText = ref('')
const importColumnId = ref(null)
const importing = ref(false)

const totalCardsCount = computed(() => board.value.reduce((sum, col) => sum + col.cards.length, 0))

const exportText = computed(() => {
  return board.value
    .map(col => {
      if (!col.cards.length) return null
      const lines = col.cards.map(c => `- ${c.title}`).join('\n')
      return `## ${col.title}\n${lines}`
    })
    .filter(Boolean)
    .join('\n\n')
})

// Строки для импорта: убираем маркер списка (-, *, •) и пропускаем markdown-заголовки
// (## Колонка) — так экспортированный текст можно вставить обратно без мусорных карточек.
const importLines = computed(() => {
  return importText.value
    .split('\n')
    .map(l => l.replace(/^[\s]*[-*•]\s*/, '').trim())
    .filter(l => l && !l.startsWith('#'))
})

function openListModal() {
  listModal.open = true
  importText.value = ''
  importColumnId.value = board.value[0]?.id ?? null
}
const exportTextarea = ref(null)

async function copyExportText() {
  try {
    await navigator.clipboard.writeText(exportText.value)
  } catch (e) {
    // Clipboard API недоступен (старый браузер/небезопасный контекст) — просто
    // выделяем текст в поле, дальше пользователь скопирует сам через Ctrl+C
    exportTextarea.value?.select()
  }
}
function downloadExportText() {
  const blob = new Blob([exportText.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'workvault-tasks.txt'
  a.click()
  URL.revokeObjectURL(url)
}
async function runImport() {
  if (!importLines.value.length || !importColumnId.value) return
  importing.value = true
  try {
    // Последовательно, не Promise.all — так сохраняется порядок вставки
    // (позиция карточки на сервере считается по количеству уже существующих).
    for (const title of importLines.value) {
      await fetch(`${API}/api/kanban/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column_id: importColumnId.value, title, workspace_id: activeWorkspaceId.value })
      })
    }
    importText.value = ''
    listModal.open = false
    await loadBoard()
  } finally {
    importing.value = false
  }
}

// ─── Workspaces ───────────────────────────────────────────
async function loadWorkspaces() {
  const r = await fetch(`${API}/api/kanban/workspaces`)
  workspaces.value = await r.json()
  if (!activeWorkspaceId.value && workspaces.value.length) {
    activeWorkspaceId.value = workspaces.value[0].id
  }
}
function switchWorkspace(id) {
  if (id === activeWorkspaceId.value) return
  activeWorkspaceId.value = id
  loadBoard()
}
async function addWorkspace() {
  const name = prompt('Название рабочей зоны')
  if (!name?.trim()) return
  const r = await fetch(`${API}/api/kanban/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() })
  })
  const ws = await r.json()
  await loadWorkspaces()
  switchWorkspace(ws.id)
}
async function renameWorkspace(ws) {
  const name = prompt('Новое название зоны', ws.name)
  if (!name?.trim() || name.trim() === ws.name) return
  await fetch(`${API}/api/kanban/workspaces/${ws.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() })
  })
  await loadWorkspaces()
}
async function removeWorkspace(ws) {
  if (!await confirmDialog(`Удалить зону «${ws.name}» вместе со всеми её колонками и задачами?`, { danger: true, confirmLabel: 'Удалить' })) return
  const r = await fetch(`${API}/api/kanban/workspaces/${ws.id}`, { method: 'DELETE' })
  const d = await r.json()
  if (!d.ok) { alert(d.error || 'Не удалось удалить'); return }
  if (activeWorkspaceId.value === ws.id) activeWorkspaceId.value = null
  await loadWorkspaces()
  await loadBoard()
}

// ─── Data ─────────────────────────────────────────────────
async function loadBoard() {
  const r = await fetch(`${API}/api/kanban?workspace_id=${activeWorkspaceId.value}`)
  board.value = await r.json()
}

function priorityLabel(p) {
  return { low: 'Низкий', medium: 'Средний', high: 'Высокий' }[p] || p
}
function priorityIcon(p) {
  return { low: ArrowDown, medium: ArrowRight, high: ArrowUp }[p] || ArrowRight
}
function formatDueDate(ts) {
  return new Date(ts * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}
function isOverdue(card) {
  return card.due_date && card.due_date * 1000 < Date.now()
}

// ─── Socket realtime ──────────────────────────────────────
let offKanban, offWs
function resetDragHandle() { dragHandleGrabbed.value = false }
onMounted(async () => {
  if (!store.user) { router.push('/'); return }
  if (!store.folders.length) await store.fetchFolders()
  await loadWorkspaces()
  await loadBoard()
  const r = await fetch(`${API}/api/users`)
  users.value = await r.json()

  if (route.query.new) {
    openCreate(null)
    router.replace({ query: {} }) // подчищаем URL, чтобы обновление страницы не открывало модалку повторно
  }

  // Клик по ручке без реального перетаскивания не порождает dragend —
  // без этого следующий обычный клик по телу карточки ошибочно считался бы разрешённым
  window.addEventListener('mouseup', resetDragHandle)

  const socket = store.getSocket()
  if (socket) {
    socket.on('kanban:update', (payload) => {
      // payload может прийти без board (после автоархива) — просто перезагружаем
      if (!payload || payload.workspace_id === activeWorkspaceId.value || payload.workspace_id == null) {
        loadBoard()
      }
    })
    socket.on('kanban:workspaces:update', () => loadWorkspaces())
    offKanban = () => socket.off('kanban:update')
    offWs = () => socket.off('kanban:workspaces:update')
  }
})
onUnmounted(() => { offKanban?.(); offWs?.(); window.removeEventListener('mouseup', resetDragHandle) })
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
  position: relative;
  display: flex; flex-direction: column;
  overflow: hidden; background: var(--bg);
}
.kanban-main::before {
  content: '';
  position: absolute;
  top: -120px; right: -120px;
  width: 420px; height: 420px;
  border-radius: 50%;
  background: var(--accent);
  opacity: .12;
  filter: blur(90px);
  pointer-events: none;
  z-index: 0;
}

/* ── Header ── */
.kanban-header {
  position: relative; z-index: 1;
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.kanban-header-left { display: flex; align-items: center; gap: 10px; }
.kanban-header-right { display: flex; align-items: center; gap: 8px; }
.kanban-icon { color: var(--accent); flex-shrink: 0; }
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
.btn-add-label { white-space: nowrap; }
.sort-select {
  padding: 7px 10px; border-radius: var(--radius-md);
  font-size: var(--text-sm); font-weight: 600;
  background: var(--surface-3); color: var(--text-muted);
  border: 1px solid var(--border);
  cursor: pointer;
}
.btn-archive {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: var(--radius-md);
  font-size: var(--text-sm); font-weight: 600;
  background: var(--surface-3); color: var(--text-muted);
  border: 1px solid var(--border);
  transition: all var(--transition);
}
.btn-archive:hover { background: var(--hover); color: var(--text); }

.btn-list-count {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 12px; border-radius: var(--radius-md);
  font-size: var(--text-sm); font-weight: 700;
  background: var(--surface-3); color: var(--text-muted);
  border: 1px solid var(--border);
  transition: all var(--transition);
}
.btn-list-count:hover { background: var(--hover); color: var(--text); }

/* ── Workspace tabs ── */
.ws-tabs {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 20px; overflow-x: auto;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.ws-tab {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: var(--radius-full);
  font-size: var(--text-xs); font-weight: 600; color: var(--text-muted);
  background: var(--surface-2); border: 1px solid var(--border);
  white-space: nowrap; transition: all var(--transition);
}
.ws-tab:hover { background: var(--hover); }
.ws-tab.active { background: var(--accent-soft); color: var(--accent); border-color: var(--accent-line); }
.ws-tab-del {
  margin-left: 2px; opacity: .5; font-size: 10px;
  transition: opacity var(--transition);
}
.ws-tab-del:hover { opacity: 1; color: #e06c75; }
.ws-tab-add { font-size: 14px; font-weight: 700; padding: 6px 10px; }

/* ── Board ── */
.kanban-board {
  position: relative; z-index: 1;
  display: flex; gap: 16px;
  padding: 20px;
  overflow-x: auto; overflow-y: hidden;
  flex: 1; min-height: 0;
  align-items: stretch;
}
.kanban-board::-webkit-scrollbar { height: 6px; } /* горизонтальный скролл толще — легче ухватить */

/* ── Column ── */
.kanban-col {
  width: 280px; min-width: 280px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  display: flex; flex-direction: column;
  max-height: 100%;
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
.col-terminal-badge {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 9px; font-weight: 700; color: var(--green);
  background: rgba(76,175,125,.12); padding: 2px 6px; border-radius: 20px;
  white-space: nowrap;
}
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
  position: relative;
  display: flex; flex-direction: column; gap: 8px;
  padding: 4px 10px 12px;
  overflow-y: auto; flex: 1;
}

/* ── Card ── */
.kanban-card {
  position: relative;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 30px 10px 12px;
  cursor: pointer;
  transition: box-shadow .18s ease, border-color .18s ease, transform .18s ease;
  user-select: none;
  will-change: transform;
}
.kanban-card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--accent-line);
  transform: translateY(-2px);
}
.kanban-card:active { transform: translateY(0) scale(.99); }
.kanban-card.dragging { opacity: .4; transform: scale(.97); transition: none; }

.card-drag-handle {
  position: absolute; top: 8px; right: 8px;
  width: 18px; height: 18px; display: flex; align-items: center; justify-content: center;
  color: var(--text-faint); cursor: grab;
  opacity: 0; pointer-events: none; transition: opacity var(--transition), color var(--transition);
}
.kanban-card:hover .card-drag-handle { opacity: 1; pointer-events: auto; }
.card-drag-handle:hover { color: var(--accent); }
.card-drag-handle:active { cursor: grabbing; }
@media (hover: none) {
  .card-drag-handle { opacity: 1; pointer-events: auto; } /* тач-устройства: hover ненадёжен, держим ручку видимой всегда */
}

.card-top-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 6px; }
.card-priority {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 10px; font-weight: 700;
  padding: 2px 7px; border-radius: 20px;
  text-transform: uppercase; letter-spacing: .04em;
}
.card-priority.low    { background: rgba(76,175,125,.15); color: #4caf7d; }
.card-priority.medium { background: rgba(232,175,52,.15); color: #e8af34; }
.card-priority.high   { background: rgba(224,108,117,.15); color: #e06c75; }

.card-due {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 10px; font-weight: 600; color: var(--text-muted);
  white-space: nowrap;
}
.card-due.overdue { color: #e06c75; font-weight: 700; }

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
.card-progress { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.card-progress-bar { flex: 1; height: 4px; background: var(--surface-3); border-radius: 2px; overflow: hidden; }
.card-progress-fill { height: 100%; background: var(--accent); border-radius: 2px; }
.card-progress-label { font-size: 10px; font-weight: 700; color: var(--text-faint); }

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

.drop-line {
  position: absolute; left: 10px; right: 10px;
  height: 3px; border-radius: 2px;
  background: var(--accent);
  pointer-events: none;
  z-index: 5;
  transition: top .08s ease;
}

.col-empty-drop {
  margin: 4px 2px;
  padding: 22px 8px;
  border: 1.5px dashed var(--border);
  border-radius: var(--radius-md);
  text-align: center;
  font-size: var(--text-xs);
  color: var(--text-faint);
  transition: all var(--transition);
}
.col-empty-drop.drag-over {
  border-color: var(--accent);
  border-style: solid;
  background: var(--accent-soft);
  color: var(--accent);
}

/* ── Empty ── */
.kanban-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px; color: var(--text-muted);
}
.empty-icon { color: var(--text-faint); }

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
  max-height: 90vh;
  box-shadow: var(--shadow-lg);
  display: flex; flex-direction: column;
  opacity: 0; transform: scale(.96) translateY(8px);
  animation: modalIn .2s ease forwards;
}
.archive-modal { width: min(520px, 100%); max-height: 80vh; }
.list-modal { width: min(620px, 100%); max-height: 86vh; }
.list-modal-body { max-height: 74vh; overflow-y: auto; display: flex; flex-direction: column; gap: 18px; }
.list-section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.list-section-actions { display: flex; gap: 6px; }
.btn-sm { padding: 5px 10px; font-size: var(--text-xs); display: flex; align-items: center; gap: 5px; }
.list-textarea { width: 100%; font-family: var(--font-mono, monospace); font-size: var(--text-xs); resize: vertical; }
.import-controls { display: flex; gap: 8px; margin-top: 10px; }
.import-controls .field-select { flex: 1; }

@keyframes modalIn {
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--border);
}
.modal-header h2 { font-size: var(--text-base); font-weight: 700; }
.modal-title-row { display: flex; align-items: center; gap: 8px; }
.modal-close {
  width: 28px; height: 28px; border-radius: var(--radius-md);
  font-size: 13px; color: var(--text-faint);
  display: flex; align-items: center; justify-content: center;
  transition: all var(--transition);
}
.modal-close:hover { background: var(--hover); color: var(--text); }
.modal-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; overflow-x: hidden; min-height: 0; min-width: 0; }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field-group { display: flex; flex-direction: column; }
.modal-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px 18px;
  border-top: 1px solid var(--border);
}
.modal-footer-right { display: flex; gap: 8px; align-items: center; }
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
.btn-archive-card {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-radius: var(--radius-md);
  font-size: var(--text-sm); font-weight: 600;
  background: var(--surface-3); color: var(--text-muted);
  border: 1px solid var(--border);
  transition: all var(--transition);
}
.btn-archive-card:hover { background: var(--hover); color: var(--text); }

/* ── Archive list ── */
.archive-body { max-height: 60vh; overflow-y: auto; }
.archive-empty { font-size: var(--text-sm); color: var(--text-faint); text-align: center; padding: 20px 0; }
.archive-list { display: flex; flex-direction: column; gap: 8px; }
.archive-item {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 10px 12px; border-radius: var(--radius-md);
  background: var(--surface-2); border: 1px solid var(--border);
}
.archive-item-info { display: flex; flex-direction: column; gap: 4px; }
.archive-item-title { font-size: var(--text-sm); font-weight: 600; color: var(--text); }
.archive-item-date { font-size: 11px; color: var(--text-faint); }
.btn-restore {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 12px; border-radius: var(--radius-md);
  font-size: var(--text-xs); font-weight: 600;
  background: var(--accent-soft); color: var(--accent);
  white-space: nowrap;
  transition: all var(--transition);
}
.btn-restore:hover { background: var(--accent); color: #fff; }

@media (max-width: 860px) {
  .kanban-layout { grid-template-columns: 1fr; }

  .kanban-header {
    flex-wrap: wrap;
    gap: 10px;
    padding: 10px 12px;
  }
  .kanban-header-right {
    flex: 1 1 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: nowrap;
  }
  .sort-select,
  .btn-archive,
  .btn-add-card {
    height: 36px;
    box-sizing: border-box;
  }
  .sort-select { flex: 1; min-width: 0; padding: 0 10px; }
  .btn-archive { flex-shrink: 0; padding: 0 12px; }
  .btn-add-card {
    flex-shrink: 0;
    width: 36px;
    padding: 0;
    justify-content: center;
    gap: 0;
  }
  .btn-add-label { display: none; }

  .ws-tabs { padding: 10px 12px; gap: 8px; }
  .ws-tab {
    padding: 10px 16px;
    font-size: var(--text-sm);
  }
  .ws-tab-add { padding: 10px 14px; }

  .kanban-board { padding: 12px; gap: 12px; }
  .kanban-col {
    width: min(280px, calc(100vw - 48px));
    min-width: min(280px, calc(100vw - 48px));
  }

  .col-terminal-badge { display: none; }
  .field-row { grid-template-columns: 1fr; }
  .modal-footer { flex-direction: column; align-items: stretch; gap: 10px; }
  .modal-footer-right { justify-content: flex-end; }
}
</style>