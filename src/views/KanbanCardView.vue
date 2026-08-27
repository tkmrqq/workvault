<template>
  <div class="card-page-root">
    <TitleBar />
    <div class="card-page-layout">
      <Sidebar />
      <div class="card-page-main" v-if="card">

        <!-- Breadcrumb -->
        <div class="breadcrumb">
          <MobileMenuButton />
          <button class="breadcrumb-back" @click="router.push('/kanban')">
            <ArrowLeft :size="14" :stroke-width="2.2" /> Канбан
          </button>
          <span class="breadcrumb-sep">/</span>
          <span class="breadcrumb-col" :style="{ color: colColor }">{{ colTitle }}</span>
          <span class="breadcrumb-sep">/</span>
          <span class="breadcrumb-current">{{ card.title }}</span>
        </div>

        <div v-if="card.archived_at" class="archived-banner">
          <Archive :size="15" :stroke-width="2" /> Эта задача в архиве
          <button class="btn-restore-inline" @click="unarchive"><RotateCcw :size="12" :stroke-width="2.2" /> Восстановить</button>
        </div>

        <div class="card-page-content">
          <!-- LEFT: card info -->
          <div class="card-info">
            <div class="card-info-header">
              <div class="card-priority-badge" :class="card.priority">
                <component :is="priorityIcon(card.priority)" :size="11" :stroke-width="3" />{{ priorityLabel(card.priority) }}
              </div>
              <div class="card-info-actions">
                <button v-if="!card.archived_at" class="btn-edit-card btn-archive-card btn-icon-only" @click="archive" title="В архив"><Archive :size="13" :stroke-width="2" /></button>
                <button class="btn-edit-card" @click="toggleEdit">
                  <template v-if="editMode">Отмена</template>
                  <template v-else><Pencil :size="12" :stroke-width="2" /> Редактировать</template>
                </button>
              </div>
            </div>

            <!-- View mode -->
            <template v-if="!editMode">
              <h1 class="card-page-title">{{ card.title }}</h1>
              <div v-if="card.description" class="card-page-desc markdown-body" v-html="renderMarkdown(card.description)"></div>
              <p v-else class="card-page-desc empty">Нет описания</p>
            </template>

            <!-- Edit mode -->
            <template v-else>
              <input v-model="edit.title" class="field-input" placeholder="Название" />
              <MarkdownEditor v-model="edit.description" placeholder="Описание..." :rows="4" />
              <div class="edit-row">
                <div class="edit-group">
                  <label class="field-label">Приоритет</label>
                  <select v-model="edit.priority" class="field-select">
                    <option value="low">🟢 Низкий</option>
                    <option value="medium">🟡 Средний</option>
                    <option value="high">🔴 Высокий</option>
                  </select>
                </div>
                <div class="edit-group">
                  <label class="field-label">Исполнитель</label>
                  <select v-model="edit.assignee_id" class="field-select">
                    <option :value="null">— Не назначено</option>
                    <option v-for="u in users" :key="u.id" :value="u.id">{{ u.avatar }} {{ u.name }}</option>
                  </select>
                </div>
              </div>
              <div class="edit-row">
                <div class="edit-group">
                  <label class="field-label">Колонка</label>
                  <select v-model="edit.column_id" class="field-select">
                    <option v-for="col in columns" :key="col.id" :value="col.id">{{ col.title }}</option>
                  </select>
                </div>
                <div class="edit-group">
                  <label class="field-label">Дедлайн</label>
                  <input type="date" v-model="edit.due_date" class="field-input" />
                </div>
              </div>
              <div class="edit-actions">
                <button class="btn-save" @click="saveCard">Сохранить</button>
                <button class="btn-delete-card" @click="deleteCard">Удалить задачу</button>
              </div>
            </template>

            <!-- Meta -->
            <div class="card-meta">
              <div class="meta-item">
                <span class="meta-label">Исполнитель</span>
                <div v-if="card.assignee_name" class="meta-assignee">
                  <span class="assignee-avatar"
                    :style="{ background: card.assignee_color + '22', color: card.assignee_color }">
                    {{ card.assignee_avatar }}
                  </span>
                  {{ card.assignee_name }}
                </div>
                <span v-else class="meta-empty">Не назначено</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Дедлайн</span>
                <span v-if="card.due_date" class="meta-val" :class="{ overdue: isOverdue }">{{ formatDate(card.due_date) }}</span>
                <span v-else class="meta-empty">Не установлен</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Создано</span>
                <span class="meta-val">{{ formatDate(card.created_at) }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Подзадачи</span>
                <span class="meta-val">
                  {{ doneCount }} / {{ card.subtasks?.length || 0 }}
                </span>
              </div>
            </div>

            <!-- Progress bar -->
            <div v-if="card.subtasks?.length" class="progress-wrap">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: progressPct + '%' }"></div>
              </div>
              <span class="progress-label">{{ progressPct }}%</span>
            </div>
          </div>

          <!-- RIGHT: subtasks mini-kanban -->
          <div class="subtasks-area">
            <div class="subtasks-header">
              <h2 class="subtasks-title">Подзадачи</h2>
              <div class="subtasks-header-actions">
                <button class="btn-list-count" @click="openSubListModal" title="Экспорт / импорт списком">
                  <ListChecks :size="13" :stroke-width="2" /> {{ card.subtasks?.length || 0 }}
                </button>
                <button class="btn-add-subtask" @click="openAddSubtask"><Plus :size="13" :stroke-width="2.5" /> Добавить</button>
              </div>
            </div>

            <div v-if="filterableTags.length" class="tags-filter-row">
              <Tag :size="12" :stroke-width="2" class="tags-filter-icon" />
              <button
                v-for="tag in filterableTags" :key="tag.id"
                class="tag-chip filter-chip-tag"
                :class="{ active: activeTagFilters.includes(tag.id) }"
                :style="activeTagFilters.includes(tag.id) ? { background: tag.color, color: '#fff' } : { background: tag.color + '22', color: tag.color }"
                @click="toggleTagFilter(tag.id)"
              >{{ tag.name }}</button>
              <button v-if="activeTagFilters.length" class="tags-filter-clear" @click="activeTagFilters = []">Сбросить</button>
            </div>

            <div class="subtasks-board">
              <div
                v-for="col in subtaskCols"
                :key="col.status"
                class="sub-col"
                @dragover.prevent="onSubColDragOver($event, col)"
                @drop.prevent="onSubDrop($event, col.status)"
                :class="{ 'drag-over': subDragOverCol.status === col.status }"
              >
                <div class="sub-col-header">
                  <div class="col-dot" :style="{ background: col.color }"></div>
                  <span class="sub-col-title">{{ col.label }}</span>
                  <span class="col-count">{{ col.items.length }}</span>
                </div>

                <div class="sub-col-cards">
                  <div v-if="subDragOverCol.status === col.status && col.items.length" class="drop-line" :style="{ top: subDragOverCol.y + 'px' }"></div>
                  <div
                    v-for="sub in col.items"
                    :key="sub.id"
                    class="sub-card"
                    :draggable="!activeTagFilters.length"
                    @dragstart="onSubDragStart($event, sub)"
                    @dragend="onSubDragEnd"
                    :class="{ dragging: subDragging?.id === sub.id }"
                    @click="openEditSubtask(sub)"
                  >
                    <div v-if="!activeTagFilters.length" class="sub-card-drag-handle" @mousedown="subDragHandleGrabbed = true" title="Потяни, чтобы переместить">
                      <GripVertical :size="11" :stroke-width="2" />
                    </div>
                    <div class="sub-card-priority" :class="sub.priority">
                      <component :is="priorityIcon(sub.priority)" :size="9" :stroke-width="3" />{{ priorityLabel(sub.priority) }}
                    </div>
                    <div class="sub-card-title">{{ sub.title }}</div>
                    <div v-if="sub.description" class="sub-card-desc">{{ sub.description }}</div>
                    <div v-if="sub.tags?.length" class="sub-card-tags">
                      <span v-for="tag in sub.tags" :key="tag.id" class="tag-chip" :style="{ background: tag.color + '22', color: tag.color }">{{ tag.name }}</span>
                    </div>
                    <div v-if="sub.assignee_name" class="sub-card-assignee">
                      <span class="assignee-avatar-sm"
                        :style="{ background: sub.assignee_color + '22', color: sub.assignee_color }">
                        {{ sub.assignee_avatar }}
                      </span>
                      {{ sub.assignee_name }}
                    </div>
                  </div>
                  <div v-if="!col.items.length" class="sub-col-empty" :class="{ 'drag-over': subDragOverCol.status === col.status }">Перетащите сюда</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="loading">Загружаем задачу...</div>
    </div>

    <!-- Error toast -->
    <Teleport to="body">
      <Transition name="toast-fade">
        <div v-if="apiError" class="api-error-toast">{{ apiError }}</div>
      </Transition>
    </Teleport>

    <!-- Subtask modal -->
    <Teleport to="body">
      <div v-if="subModal.open" class="modal-overlay" @click.self="closeSubModal">
        <div class="modal">
          <div class="modal-header">
            <h2>{{ subModal.mode === 'create' ? 'Новая подзадача' : 'Редактировать подзадачу' }}</h2>
            <button class="modal-close" @click="closeSubModal"><X :size="14" :stroke-width="2.5" /></button>
          </div>
          <div class="modal-body">
            <label class="field-label">Название *</label>
            <input v-model="subModal.title" class="field-input" placeholder="Что нужно сделать?" autofocus @keydown.enter="saveSubtask" @keydown.esc="closeSubModal" />

            <label class="field-label">Описание</label>
            <MarkdownEditor v-model="subModal.description" placeholder="Подробности..." :rows="3" />

            <div class="edit-row">
              <div class="edit-group">
                <label class="field-label">Приоритет</label>
                <select v-model="subModal.priority" class="field-select">
                  <option value="low">🟢 Низкий</option>
                  <option value="medium">🟡 Средний</option>
                  <option value="high">🔴 Высокий</option>
                </select>
              </div>
              <div class="edit-group">
                <label class="field-label">Исполнитель</label>
                <select v-model="subModal.assignee_id" class="field-select">
                  <option :value="null">— Не назначено</option>
                  <option v-for="u in users" :key="u.id" :value="u.id">{{ u.avatar }} {{ u.name }}</option>
                </select>
              </div>
            </div>

            <label class="field-label">Теги</label>
            <div v-if="subModal.mode === 'create'" class="tags-hint">Теги можно добавить после создания подзадачи</div>
            <template v-else>
              <div class="tags-current">
                <span v-for="tag in subModal.tags" :key="tag.id" class="tag-chip removable" :style="{ background: tag.color + '22', color: tag.color }">
                  {{ tag.name }}
                  <button class="tag-remove" @click="removeSubtaskTag(tag)"><X :size="10" :stroke-width="3" /></button>
                </span>
                <span v-if="!subModal.tags.length" class="tags-empty">Пока нет тегов</span>
              </div>
              <div class="tags-input-row">
                <input
                  v-model="tagInput"
                  class="field-input tags-input"
                  placeholder="Название тега + Enter"
                  maxlength="30"
                  @keydown.enter.prevent="submitTagInput"
                  @focus="showTagSuggestions = true"
                  @blur="onTagInputBlur"
                />
                <div v-if="showTagSuggestions && tagSuggestions.length" class="tags-suggestions">
                  <button
                    v-for="tag in tagSuggestions" :key="tag.id"
                    class="tag-suggestion"
                    @mousedown.prevent="addSubtaskTag(tag.name)"
                  ><span class="tag-suggestion-dot" :style="{ background: tag.color }"></span>{{ tag.name }}</button>
                </div>
              </div>
            </template>
          </div>
          <div class="modal-footer">
            <button v-if="subModal.mode === 'edit'" class="btn-delete-card" @click="deleteSubtask">Удалить</button>
            <div class="modal-footer-right">
              <button class="btn-cancel" @click="closeSubModal">Отмена</button>
              <button class="btn-save" :disabled="!subModal.title.trim()" @click="saveSubtask">
                {{ subModal.mode === 'create' ? 'Создать' : 'Сохранить' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Modal: Subtasks list export/import -->
    <Teleport to="body">
      <div v-if="subListModal.open" class="modal-overlay" @click.self="subListModal.open = false">
        <div class="modal list-modal">
          <div class="modal-header">
            <h2 class="modal-title-row"><ListChecks :size="17" :stroke-width="2" /> Список подзадач</h2>
            <button class="modal-close" @click="subListModal.open = false"><X :size="14" :stroke-width="2.5" /></button>
          </div>
          <div class="modal-body list-modal-body">
            <div class="list-section">
              <div class="list-section-header">
                <span class="field-label">Экспорт — все подзадачи этой карточки</span>
                <div class="list-section-actions">
                  <button class="btn-cancel btn-sm" @click="copySubExportText"><Copy :size="12" :stroke-width="2.2" /> Копировать</button>
                  <button class="btn-cancel btn-sm" @click="downloadSubExportText"><Download :size="12" :stroke-width="2.2" /> .txt</button>
                </div>
              </div>
              <textarea ref="subExportTextarea" class="field-textarea list-textarea" readonly :value="subExportText" rows="6" @click="$event.target.select()"></textarea>
            </div>

            <div class="list-section">
              <label class="field-label">Импорт — вставь список, каждая подзадача с новой строки (можно с «- » в начале)</label>
              <textarea
                v-model="subImportText"
                class="field-textarea list-textarea"
                rows="6"
                placeholder="- Первая подзадача&#10;- Вторая подзадача"
              ></textarea>
              <div class="import-controls">
                <select v-model="subImportStatus" class="field-select">
                  <option v-for="s in STATUSES" :key="s.status" :value="s.status">{{ s.label }}</option>
                </select>
                <button
                  class="btn-save"
                  :disabled="!subImportLines.length || subImporting"
                  @click="runSubImport"
                >{{ subImporting ? 'Добавляю...' : `Добавить ${subImportLines.length || ''} подзадач` }}</button>
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
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { confirmDialog } from '@/composables/useConfirm'
import TitleBar from '@/components/TitleBar.vue'
import Sidebar  from '@/components/Sidebar.vue'
import MobileMenuButton from '@/components/MobileMenuButton.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import { renderMarkdown } from '@/composables/useMarkdown'
import {
  ArrowLeft, Archive, RotateCcw, Pencil, X, Plus,
  ArrowDown, ArrowRight as ArrowRightIcon, ArrowUp as ArrowUpIcon, Tag, GripVertical,
  ListChecks, Copy, Download
} from 'lucide-vue-next'

const store  = useAppStore()
const route  = useRoute()
const router = useRouter()
const API    = import.meta.env.VITE_API_URL || ''

// ─── Сетевые запросы с обработкой ошибок ───────────────────
const apiError = ref('')
let apiErrorTimer = null
function showApiError(msg) {
  apiError.value = msg
  clearTimeout(apiErrorTimer)
  apiErrorTimer = setTimeout(() => { apiError.value = '' }, 4000)
}
async function apiFetch(url, options) {
  try {
    const r = await fetch(url, options)
    if (!r.ok) {
      showApiError('Не удалось сохранить изменения. Проверьте соединение.')
      return null
    }
    return r
  } catch (e) {
    showApiError('Не удалось сохранить изменения. Проверьте соединение.')
    return null
  }
}

const card    = ref(null)
const users   = ref([])
const columns = ref([])
const editMode = ref(false)
const edit = reactive({ title: '', description: '', priority: 'medium', assignee_id: null, column_id: null, due_date: '' })

// ─── Subtask columns ──────────────────────────────────────
const STATUSES = [
  { status: 'todo',        label: 'To Do',       color: '#61afef' },
  { status: 'in_progress', label: 'In Progress',  color: '#e8af34' },
  { status: 'done',        label: 'Done',         color: '#4caf7d' },
]

const activeTagFilters = ref([])
const filterableTags = computed(() => {
  const map = new Map()
  ;(card.value?.subtasks || []).forEach(s => (s.tags || []).forEach(t => map.set(t.id, t)))
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
})
function toggleTagFilter(tagId) {
  const i = activeTagFilters.value.indexOf(tagId)
  if (i === -1) activeTagFilters.value.push(tagId)
  else activeTagFilters.value.splice(i, 1)
}

const subtaskCols = computed(() => STATUSES.map(s => ({
  ...s,
  items: (card.value?.subtasks || [])
    .filter(t => t.status === s.status)
    .filter(t => !activeTagFilters.value.length || (t.tags || []).some(tag => activeTagFilters.value.includes(tag.id)))
})))

const doneCount   = computed(() => (card.value?.subtasks || []).filter(s => s.status === 'done').length)

// ─── Subtasks list export/import ────────────────────────────
const subListModal = reactive({ open: false })
const subImportText = ref('')
const subImportStatus = ref('todo')
const subImporting = ref(false)
const subExportTextarea = ref(null)

const subExportText = computed(() => {
  return STATUSES
    .map(s => {
      const items = (card.value?.subtasks || []).filter(t => t.status === s.status)
      if (!items.length) return null
      return `## ${s.label}\n${items.map(t => `- ${t.title}`).join('\n')}`
    })
    .filter(Boolean)
    .join('\n\n')
})
const subImportLines = computed(() => {
  return subImportText.value
    .split('\n')
    .map(l => l.replace(/^[\s]*[-*•]\s*/, '').trim())
    .filter(l => l && !l.startsWith('#'))
})

function openSubListModal() {
  subListModal.open = true
  subImportText.value = ''
  subImportStatus.value = 'todo'
}
async function copySubExportText() {
  try {
    await navigator.clipboard.writeText(subExportText.value)
  } catch (e) {
    subExportTextarea.value?.select()
  }
}
function downloadSubExportText() {
  const blob = new Blob([subExportText.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `subtasks-card-${card.value?.id ?? ''}.txt`
  a.click()
  URL.revokeObjectURL(url)
}
async function runSubImport() {
  if (!subImportLines.value.length) return
  subImporting.value = true
  try {
    for (const title of subImportLines.value) {
      await apiFetch(`${API}/api/kanban/cards/${card.value.id}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, status: subImportStatus.value })
      })
    }
    subImportText.value = ''
    subListModal.open = false
    await loadCard()
  } finally {
    subImporting.value = false
  }
}

const progressPct = computed(() => {
  const total = card.value?.subtasks?.length || 0
  return total ? Math.round(doneCount.value / total * 100) : 0
})

const colTitle = computed(() => columns.value.find(c => c.id === card.value?.column_id)?.title || '')
const colColor = computed(() => columns.value.find(c => c.id === card.value?.column_id)?.color || 'var(--accent)')
const isOverdue = computed(() => card.value?.due_date && card.value.due_date * 1000 < Date.now())

// ─── Drag & Drop subtasks ─────────────────────────────────
const subDragging    = ref(null)
const subDragOverCol = reactive({ status: null, index: null, y: 0 })

const subDragHandleGrabbed = ref(false)

function onSubDragStart(e, sub) {
  if (!subDragHandleGrabbed.value) { e.preventDefault(); return }
  subDragging.value = sub
  e.dataTransfer.effectAllowed = 'move'
}
function onSubDragEnd() {
  subDragging.value = null
  subDragOverCol.status = null
  subDragHandleGrabbed.value = false
}
function onSubColDragOver(e, col) {
  if (!subDragging.value || activeTagFilters.value.length) return
  const container = e.currentTarget.querySelector('.sub-col-cards')
  const containerRect = container.getBoundingClientRect()
  const cardEls = [...container.querySelectorAll('.sub-card:not(.dragging)')]
  let index = cardEls.length
  let y = null
  for (let i = 0; i < cardEls.length; i++) {
    const rect = cardEls[i].getBoundingClientRect()
    if (e.clientY < rect.top + rect.height / 2) {
      index = i
      y = rect.top - containerRect.top + container.scrollTop - 4
      break
    }
  }
  if (y === null) {
    y = cardEls.length
      ? cardEls[cardEls.length - 1].getBoundingClientRect().bottom - containerRect.top + container.scrollTop + 4
      : 8
  }
  subDragOverCol.status = col.status
  subDragOverCol.index = index
  subDragOverCol.y = y
}
async function onSubDrop(e, status) {
  if (!subDragging.value) return
  const sub = subDragging.value
  const targetStatus = subDragOverCol.status ?? status
  let insertIndex = subDragOverCol.index ?? 0
  subDragging.value = null; subDragOverCol.status = null

  const previousSubtasks = card.value.subtasks

  // Оптимистично: убираем подзадачу из старого места и вставляем в новое,
  // индекс уже посчитан по карточкам БЕЗ учёта перетаскиваемой (см. onSubColDragOver)
  const all = [...card.value.subtasks]
  const sourceIdx = all.findIndex(s => s.id === sub.id)
  if (sourceIdx !== -1) all.splice(sourceIdx, 1)

  const targetItems = all.filter(s => s.status === targetStatus)
  insertIndex = Math.max(0, Math.min(insertIndex, targetItems.length))
  const targetBefore = targetItems[insertIndex]
  const updatedSub = { ...sub, status: targetStatus }
  const insertAt = targetBefore ? all.findIndex(s => s.id === targetBefore.id) : all.length
  all.splice(insertAt, 0, updatedSub)
  card.value.subtasks = all

  // Реорганизуем позиции
  const payload = []
  STATUSES.forEach(col => {
    card.value.subtasks.filter(s => s.status === col.status)
      .forEach((s, i) => payload.push({ id: s.id, status: s.status, card_id: s.card_id }))
  })
  const r = await apiFetch(`${API}/api/kanban/subtasks/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!r) card.value.subtasks = previousSubtasks // откат при ошибке сети/сервера
}

// ─── Card edit ────────────────────────────────────────────
function tsToDate(ts) {
  if (!ts) return ''
  return new Date(ts * 1000).toISOString().slice(0, 10)
}
function dateToTs(dateStr) {
  if (!dateStr) return null
  return Math.floor(new Date(dateStr + 'T00:00:00').getTime() / 1000)
}

function startEdit() {
  edit.title       = card.value.title
  edit.description = card.value.description || ''
  edit.priority    = card.value.priority
  edit.assignee_id = card.value.assignee_id
  edit.column_id   = card.value.column_id
  edit.due_date    = tsToDate(card.value.due_date)
}

// Несохранённые изменения — сравниваем форму с последними сохранёнными данными карточки
const isDirty = computed(() => {
  if (!editMode.value || !card.value) return false
  return edit.title !== card.value.title
    || edit.description !== (card.value.description || '')
    || edit.priority !== card.value.priority
    || edit.assignee_id !== card.value.assignee_id
    || edit.column_id !== card.value.column_id
    || edit.due_date !== tsToDate(card.value.due_date)
})

async function toggleEdit() {
  if (editMode.value && isDirty.value) {
    if (!await confirmDialog('Есть несохранённые данные. Закрыть без сохранения?')) return
    startEdit() // возвращаем форму к последним сохранённым значениям
  }
  editMode.value = !editMode.value
}

function handleBeforeUnload(e) {
  if (!isDirty.value) return
  e.preventDefault()
  e.returnValue = ''
}
window.addEventListener('beforeunload', handleBeforeUnload)

onBeforeRouteLeave(async () => {
  if (!isDirty.value) return true
  return await confirmDialog('Есть несохранённые данные. Уйти со страницы без сохранения?')
})
async function saveCard() {
  const r = await apiFetch(`${API}/api/kanban/cards/${card.value.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...edit, due_date: dateToTs(edit.due_date) })
  })
  if (!r) return // оставляем форму открытой, чтобы не потерять введённое
  editMode.value = false
  await loadCard()
}
async function deleteCard() {
  if (!await confirmDialog('Удалить задачу и все подзадачи?', { danger: true, confirmLabel: 'Удалить' })) return
  const r = await apiFetch(`${API}/api/kanban/cards/${card.value.id}`, { method: 'DELETE' })
  if (!r) return
  router.push('/kanban')
}
async function archive() {
  const r = await apiFetch(`${API}/api/kanban/cards/${card.value.id}/archive`, { method: 'POST' })
  if (!r) return
  await loadCard()
}
async function unarchive() {
  const r = await apiFetch(`${API}/api/kanban/cards/${card.value.id}/unarchive`, { method: 'POST' })
  if (!r) return
  await loadCard()
}

// ─── Subtask modal ────────────────────────────────────────
const subModal = reactive({
  open: false, mode: 'create', id: null,
  title: '', description: '', priority: 'medium', assignee_id: null, tags: []
})
let subModalSnapshot = null

// Все теги, когда-либо созданные в проекте — для автокомплита при вводе.
const allTags = ref([])
const tagInput = ref('')
const showTagSuggestions = ref(false)
const tagSuggestions = computed(() => {
  const q = tagInput.value.trim().toLowerCase()
  if (!q) return []
  const existingNames = new Set(subModal.tags.map(t => t.name.toLowerCase()))
  return allTags.value
    .filter(t => t.name.toLowerCase().includes(q) && !existingNames.has(t.name.toLowerCase()))
    .slice(0, 6)
})

function openAddSubtask() {
  subModal.open = true; subModal.mode = 'create'
  subModal.id = null; subModal.title = ''; subModal.description = ''
  subModal.priority = 'medium'; subModal.assignee_id = null; subModal.tags = []
  subModalSnapshot = { title: '', description: '' }
}
function openEditSubtask(sub) {
  subModal.open = true; subModal.mode = 'edit'
  subModal.id = sub.id; subModal.title = sub.title; subModal.description = sub.description || ''
  subModal.priority = sub.priority; subModal.assignee_id = sub.assignee_id
  subModal.tags = sub.tags ? [...sub.tags] : []
  subModalSnapshot = { title: subModal.title, description: subModal.description }
}
function onTagInputBlur() {
  // небольшая задержка, чтобы успел сработать @mousedown на подсказке —
  // иначе blur закрывает список раньше клика по нему
  setTimeout(() => { showTagSuggestions.value = false }, 150)
}
async function submitTagInput() {
  const name = tagInput.value.trim()
  if (!name) return
  await addSubtaskTag(name)
}
async function addSubtaskTag(name) {
  const r = await apiFetch(`${API}/api/kanban/subtasks/${subModal.id}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
  if (!r) return
  subModal.tags = await r.json()
  tagInput.value = '' // tagSuggestions сам опустеет на пустом запросе — дропдаун скроется естественно
  const known = allTags.value.some(t => t.name.toLowerCase() === name.trim().toLowerCase())
  if (!known) allTags.value = await (await apiFetch(`${API}/api/kanban/tags`))?.json() || allTags.value
}
async function removeSubtaskTag(tag) {
  const r = await apiFetch(`${API}/api/kanban/subtasks/${subModal.id}/tags/${tag.id}`, { method: 'DELETE' })
  if (!r) return
  subModal.tags = await r.json()
}
async function closeSubModal() {
  const dirty = subModalSnapshot && (
    subModal.title !== subModalSnapshot.title ||
    subModal.description !== subModalSnapshot.description
  )
  if (dirty && !await confirmDialog('Есть несохранённые данные. Закрыть без сохранения?')) return
  subModal.open = false
}
async function saveSubtask() {
  if (!subModal.title.trim()) return
  const body = {
    title: subModal.title.trim(),
    description: subModal.description || null,
    priority: subModal.priority,
    assignee_id: subModal.assignee_id
  }
  const r = subModal.mode === 'create'
    ? await apiFetch(`${API}/api/kanban/cards/${card.value.id}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    : await apiFetch(`${API}/api/kanban/subtasks/${subModal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
  if (!r) return // модалка остаётся открытой, ничего не потеряно
  subModal.open = false // напрямую — уже сохранено, спрашивать не о чем
  await loadCard()
}
async function deleteSubtask() {
  const r = await apiFetch(`${API}/api/kanban/subtasks/${subModal.id}`, { method: 'DELETE' })
  if (!r) return
  subModal.open = false
  await loadCard()
}

// ─── Data ─────────────────────────────────────────────────
async function loadCard() {
  const r = await apiFetch(`${API}/api/kanban/cards/${route.params.cardId}`)
  if (!r) return
  card.value = await r.json()
}

function priorityLabel(p) {
  return { low: 'Низкий', medium: 'Средний', high: 'Высокий' }[p] || p
}
function priorityIcon(p) {
  return { low: ArrowDown, medium: ArrowRightIcon, high: ArrowUpIcon }[p] || ArrowRightIcon
}
function formatDate(ts) {
  return new Date(ts * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

let offSocket
function resetSubDragHandle() { subDragHandleGrabbed.value = false }
onMounted(async () => {
  if (!store.user) { router.push('/'); return }
  if (!store.folders.length) await store.fetchFolders()
  await loadCard()
  if (card.value) startEdit()
  const [ur, br, tr] = await Promise.all([
    apiFetch(`${API}/api/users`),
    apiFetch(`${API}/api/kanban`),
    apiFetch(`${API}/api/kanban/tags`)
  ])
  if (ur) users.value   = await ur.json()
  if (br) columns.value = await br.json()
  if (tr) allTags.value = await tr.json()
  window.addEventListener('mouseup', resetSubDragHandle)
  const socket = store.getSocket()
  if (socket) {
    socket.on('kanban:card:update', (cardId) => {
      if (String(cardId) !== String(route.params.cardId)) return
      if (subDragging.value) return // не дёргаем карточку во время перетаскивания подзадачи
      loadCard()
    })
    offSocket = () => socket.off('kanban:card:update')
  }
})
onUnmounted(() => {
  offSocket?.()
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('mouseup', resetSubDragHandle)
})
</script>

<style scoped>
.card-page-root { display: flex; flex-direction: column; height: 100dvh; overflow: hidden; }
.card-page-layout {
  display: grid; grid-template-columns: 240px 1fr;
  flex: 1; min-height: 0; overflow: hidden;
}
.card-page-main { display: flex; flex-direction: column; overflow: hidden; background: var(--bg); }
.loading { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); }

/* ── Breadcrumb ── */
.breadcrumb {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0; font-size: var(--text-sm);
}
.breadcrumb-back {
  display: flex; align-items: center; gap: 6px;
  color: var(--accent); font-weight: 600;
  transition: opacity var(--transition);
}
.breadcrumb-back:hover { opacity: .75; }
.breadcrumb-sep { color: var(--text-faint); }
.breadcrumb-col { font-weight: 600; }
.breadcrumb-current { color: var(--text-muted); }

/* ── Archived banner ── */
.archived-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 20px;
  background: rgba(232,175,52,.12); color: #e8af34;
  font-size: var(--text-sm); font-weight: 600;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.btn-restore-inline {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: var(--radius-md);
  font-size: var(--text-xs); font-weight: 700;
  background: rgba(232,175,52,.2); color: #e8af34;
  transition: all var(--transition);
}
.btn-restore-inline:hover { background: rgba(232,175,52,.35); }

.card-page-content {
  display: grid; grid-template-columns: 360px 1fr;
  flex: 1; min-height: 0; overflow: hidden;
}
.card-info {
  padding: 20px; overflow-y: auto;
  border-right: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 14px;
}
.card-info-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.card-info-actions { display: flex; gap: 6px; }
.card-priority-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 20px;
  text-transform: uppercase; letter-spacing: .04em;
}
.card-priority-badge.low    { background: rgba(76,175,125,.15); color: #4caf7d; }
.card-priority-badge.medium { background: rgba(232,175,52,.15); color: #e8af34; }
.card-priority-badge.high   { background: rgba(224,108,117,.15); color: #e06c75; }

.btn-edit-card {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: var(--text-xs); font-weight: 600; color: var(--text-muted);
  padding: 5px 10px; border-radius: var(--radius-md); border: 1px solid var(--border);
  transition: all var(--transition);
}
.btn-edit-card:hover { border-color: var(--accent-line); color: var(--accent); }
.btn-archive-card:hover { border-color: #e8af34; color: #e8af34; }
.btn-icon-only { padding: 5px; }

.card-page-title { font-size: var(--text-xl); font-weight: 700; line-height: 1.3; }
.card-page-desc { font-size: var(--text-sm); color: var(--text-muted); line-height: 1.6; white-space: pre-wrap; }
.card-page-desc.empty { color: var(--text-faint); font-style: italic; }

/* Edit form */
.edit-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.edit-group { display: flex; flex-direction: column; gap: 4px; }
.edit-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* Meta */
.card-meta { display: flex; flex-direction: column; gap: 12px; border-top: 1px solid var(--border); padding-top: 16px; }
.meta-item { display: flex; flex-direction: column; gap: 4px; }
.meta-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-faint); }
.meta-val { font-size: var(--text-sm); color: var(--text-muted); }
.meta-val.overdue { color: #e06c75; font-weight: 700; }
.meta-empty { font-size: var(--text-sm); color: var(--text-faint); font-style: italic; }
.meta-assignee { display: flex; align-items: center; gap: 8px; font-size: var(--text-sm); color: var(--text); }
.assignee-avatar {
  width: 26px; height: 26px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; font-size: .9rem; flex-shrink: 0;
}

/* Progress */
.progress-wrap { display: flex; align-items: center; gap: 10px; }
.progress-bar { flex: 1; height: 6px; background: var(--surface-3); border-radius: 3px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width .3s ease; }
.progress-label { font-size: 12px; font-weight: 700; color: var(--text-muted); min-width: 34px; text-align: right; }

/* Buttons */
.btn-save {
  padding: 8px 18px; border-radius: var(--radius-md);
  font-size: var(--text-sm); font-weight: 600;
  background: var(--accent); color: #fff;
  transition: background var(--transition);
}
.btn-save:hover:not(:disabled) { background: var(--accent-hover); }
.btn-save:disabled { opacity: .45; cursor: not-allowed; }
.btn-cancel {
  padding: 8px 16px; border-radius: var(--radius-md);
  font-size: var(--text-sm); font-weight: 600;
  background: var(--surface-3); color: var(--text-muted);
  border: 1px solid var(--border); transition: all var(--transition);
}
.btn-cancel:hover { background: var(--hover); }
.btn-delete-card {
  padding: 8px 14px; border-radius: var(--radius-md);
  font-size: var(--text-sm); font-weight: 600;
  background: rgba(224,108,117,.12); color: #e06c75;
  transition: all var(--transition);
}
.btn-delete-card:hover { background: rgba(224,108,117,.25); }

/* ── Subtasks board ── */
.subtasks-area { display: flex; flex-direction: column; overflow: hidden; padding: 20px; gap: 16px; min-height: 0; }
.subtasks-header { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
.subtasks-title { font-size: var(--text-base); font-weight: 700; }
.subtasks-header-actions { display: flex; align-items: center; gap: 8px; }
.btn-list-count {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 10px; border-radius: var(--radius-md);
  font-size: var(--text-xs); font-weight: 700;
  background: var(--surface-3); color: var(--text-muted);
  border: 1px solid var(--border);
  transition: all var(--transition);
}
.btn-list-count:hover { background: var(--hover); color: var(--text); }
.btn-add-subtask {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 14px; border-radius: var(--radius-md);
  font-size: var(--text-xs); font-weight: 600;
  background: var(--accent); color: #fff;
  transition: background var(--transition);
}
.btn-add-subtask:hover { background: var(--accent-hover); }

.subtasks-board { display: flex; gap: 12px; overflow-x: auto; flex: 1; min-height: 0; align-items: stretch; }
.subtasks-board::-webkit-scrollbar { height: 6px; } /* горизонтальный скролл толще — легче ухватить */

.sub-col {
  flex: 1; min-width: 200px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  display: flex; flex-direction: column;
  max-height: 100%;
  transition: border-color .15s;
}
.sub-col.drag-over { border-color: var(--accent); background: var(--accent-soft); }
.sub-col-header {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px 8px; flex-shrink: 0;
}
.col-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.sub-col-title { font-weight: 700; font-size: var(--text-xs); flex: 1; color: var(--text); }
.col-count {
  font-size: 10px; font-weight: 600;
  background: var(--surface-3); color: var(--text-muted);
  padding: 1px 6px; border-radius: 20px;
}
.sub-col-cards {
  position: relative;
  display: flex; flex-direction: column; gap: 6px;
  padding: 4px 8px 10px; overflow-y: auto; flex: 1;
}

.drop-line {
  position: absolute; left: 8px; right: 8px;
  height: 3px; border-radius: 2px;
  background: var(--accent);
  pointer-events: none;
  z-index: 5;
  transition: top .08s ease;
}
.sub-col-empty {
  margin: 4px 4px 8px; padding: 14px 8px;
  border: 1.5px dashed var(--border); border-radius: var(--radius-md);
  text-align: center; font-size: 11px; color: var(--text-faint);
  transition: all var(--transition);
}
.sub-col-empty.drag-over {
  border-color: var(--accent); border-style: solid;
  background: var(--accent-soft); color: var(--accent);
}

/* Error toast */
.api-error-toast {
  position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%);
  background: #e06c75; color: #fff; font-size: var(--text-sm); font-weight: 600;
  padding: 10px 18px; border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg); z-index: 2000;
}
.toast-fade-enter-active, .toast-fade-leave-active { transition: opacity .2s ease, transform .2s ease; }
.toast-fade-enter-from, .toast-fade-leave-to { opacity: 0; transform: translateX(-50%) translateY(6px); }

.sub-card {
  position: relative;
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 8px 24px 8px 10px;
  cursor: pointer; transition: box-shadow .18s ease, border-color .18s ease, transform .18s ease;
  user-select: none;
  will-change: transform;
}
.sub-card:hover { box-shadow: var(--shadow-md); border-color: var(--accent-line); transform: translateY(-2px); }
.sub-card:active { transform: translateY(0) scale(.99); }
.sub-card.dragging { opacity: .4; transition: none; }
.sub-card-drag-handle {
  position: absolute; top: 6px; right: 6px;
  width: 15px; height: 15px; display: flex; align-items: center; justify-content: center;
  color: var(--text-faint); cursor: grab;
  opacity: 0; transition: opacity var(--transition), color var(--transition);
}
.sub-card:hover .sub-card-drag-handle { opacity: 1; }
.sub-card-drag-handle:hover { color: var(--accent); }
.sub-card-drag-handle:active { cursor: grabbing; }
@media (hover: none) {
  .sub-card-drag-handle { opacity: 1; }
}
.sub-card-priority {
  font-size: 9px; font-weight: 700; padding: 1px 6px;
  border-radius: 20px; display: inline-flex; align-items: center; gap: 3px; margin-bottom: 4px;
  text-transform: uppercase; letter-spacing: .04em;
}
.sub-card-priority.low    { background: rgba(76,175,125,.15);  color: #4caf7d; }
.sub-card-priority.medium { background: rgba(232,175,52,.15);  color: #e8af34; }
.sub-card-priority.high   { background: rgba(224,108,117,.15); color: #e06c75; }
.sub-card-title { font-size: 12px; font-weight: 600; color: var(--text); line-height: 1.4; margin-bottom: 4px; }
.sub-card-desc {
  font-size: 11px; color: var(--text-muted); line-height: 1.4; margin-bottom: 4px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.sub-card-assignee { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-muted); }
.assignee-avatar-sm {
  width: 18px; height: 18px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; font-size: .7rem; flex-shrink: 0;
}

/* Tag filter row */
.tags-filter-row {
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
  padding: 0 0 10px;
}
.tags-filter-icon { color: var(--text-faint); flex-shrink: 0; }
.filter-chip-tag {
  cursor: pointer; border: 1px solid transparent;
  transition: all var(--transition);
}
.filter-chip-tag.active { border-color: rgba(255,255,255,.3); }
.tags-filter-clear {
  font-size: var(--text-xs); color: var(--text-faint); font-weight: 600;
  padding: 2px 6px; transition: color var(--transition);
}
.tags-filter-clear:hover { color: var(--text); }

/* Tags */
.sub-card-tags { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0 6px; }
.tag-chip {
  font-size: 10px; font-weight: 600; padding: 2px 8px;
  border-radius: var(--radius-full); white-space: nowrap;
  display: inline-flex; align-items: center; gap: 4px;
}
.tag-chip.removable { padding-right: 4px; }
.tag-remove {
  display: flex; align-items: center; justify-content: center;
  width: 14px; height: 14px; border-radius: 50%;
  opacity: .7; transition: opacity var(--transition), background var(--transition);
}
.tag-remove:hover { opacity: 1; background: rgba(0,0,0,.12); }
.tags-hint { font-size: var(--text-xs); color: var(--text-faint); padding: 4px 0 8px; }
.tags-current { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; min-height: 22px; }
.tags-empty { font-size: var(--text-xs); color: var(--text-faint); }
.tags-input-row { position: relative; }
.tags-input { width: 100%; }
.tags-suggestions {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md);
  box-shadow: var(--shadow-md); z-index: 10; overflow: hidden;
}
.tag-suggestion {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 7px 10px; font-size: var(--text-xs); color: var(--text);
  transition: background var(--transition);
}
.tag-suggestion:hover { background: var(--hover); }
.tag-suggestion-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.55);
  display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px;
}
.modal {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-xl); width: min(460px, 100%);
  box-shadow: var(--shadow-lg); display: flex; flex-direction: column;
  animation: modalIn .2s ease forwards;
}
@keyframes modalIn { from { opacity: 0; transform: scale(.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
.modal-title-row { display: flex; align-items: center; gap: 8px; font-size: var(--text-base); font-weight: 700; }
.list-modal { width: min(560px, 100%); max-height: 86vh; }
.list-modal-body { max-height: 74vh; overflow-y: auto; display: flex; flex-direction: column; gap: 18px; }
.list-section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.list-section-actions { display: flex; gap: 6px; }
.btn-sm { padding: 5px 10px; font-size: var(--text-xs); display: flex; align-items: center; gap: 5px; }
.list-textarea { width: 100%; font-family: var(--font-mono, monospace); font-size: var(--text-xs); resize: vertical; }
.import-controls { display: flex; gap: 8px; margin-top: 10px; }
.import-controls .field-select { flex: 1; }
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 12px; border-bottom: 1px solid var(--border);
}
.modal-header h2 { font-size: var(--text-base); font-weight: 700; }
.modal-close {
  width: 28px; height: 28px; border-radius: var(--radius-md);
  font-size: 13px; color: var(--text-faint);
  display: flex; align-items: center; justify-content: center;
  transition: all var(--transition);
}
.modal-close:hover { background: var(--hover); color: var(--text); }
.modal-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
.modal-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 20px 16px; border-top: 1px solid var(--border);
}
.modal-footer-right { display: flex; gap: 8px; }

@media (max-width: 860px) {
  .card-page-layout { grid-template-columns: 1fr; }

  .breadcrumb {
    flex-wrap: wrap;
    padding: 10px 12px;
    gap: 6px;
  }
  .breadcrumb-current {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .card-page-content {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .card-info {
    flex-shrink: 0;
    max-height: 42dvh;
    overflow-y: auto;
    border-right: none;
    border-bottom: 1px solid var(--border);
  }
  .card-info-header { flex-wrap: wrap; }
  .card-info-actions { flex-wrap: wrap; }

  .subtasks-area {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 16px 12px;
  }
  .subtasks-board {
    flex: 1;
    min-height: 0;
    align-items: stretch;
    padding-bottom: 4px;
  }
  .sub-col {
    flex: 0 0 auto;
    width: min(260px, calc(100vw - 40px));
    min-width: min(260px, calc(100vw - 40px));
    max-height: 100%;
  }

  .edit-row { grid-template-columns: 1fr; }
  .modal-footer { flex-direction: column; align-items: stretch; gap: 10px; }
  .modal-footer-right { justify-content: flex-end; }
}
</style>