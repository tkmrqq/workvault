<template>
  <div class="card-page-root">
    <TitleBar />
    <div class="card-page-layout">
      <Sidebar />
      <div class="card-page-main" v-if="card">

        <!-- Breadcrumb -->
        <div class="breadcrumb">
          <button class="breadcrumb-back" @click="router.push('/kanban')">
            <span>←</span> Канбан
          </button>
          <span class="breadcrumb-sep">/</span>
          <span class="breadcrumb-col" :style="{ color: colColor }">{{ colTitle }}</span>
          <span class="breadcrumb-sep">/</span>
          <span class="breadcrumb-current">{{ card.title }}</span>
        </div>

        <div class="card-page-content">
          <!-- LEFT: card info -->
          <div class="card-info">
            <div class="card-info-header">
              <div class="card-priority-badge" :class="card.priority">
                {{ priorityLabel(card.priority) }}
              </div>
              <div class="card-info-actions">
                <button class="btn-edit-card" @click="editMode = !editMode">
                  {{ editMode ? 'Отмена' : '✏️ Редактировать' }}
                </button>
              </div>
            </div>

            <!-- View mode -->
            <template v-if="!editMode">
              <h1 class="card-page-title">{{ card.title }}</h1>
              <p v-if="card.description" class="card-page-desc">{{ card.description }}</p>
              <p v-else class="card-page-desc empty">Нет описания</p>
            </template>

            <!-- Edit mode -->
            <template v-else>
              <input v-model="edit.title" class="field-input" placeholder="Название" />
              <textarea v-model="edit.description" class="field-textarea" placeholder="Описание..." rows="4" />
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
              <button class="btn-add-subtask" @click="openAddSubtask">+ Добавить</button>
            </div>

            <div class="subtasks-board">
              <div
                v-for="col in subtaskCols"
                :key="col.status"
                class="sub-col"
                @dragover.prevent="subDragOverCol = col.status"
                @drop="onSubDrop($event, col.status)"
                :class="{ 'drag-over': subDragOverCol === col.status }"
              >
                <div class="sub-col-header">
                  <div class="col-dot" :style="{ background: col.color }"></div>
                  <span class="sub-col-title">{{ col.label }}</span>
                  <span class="col-count">{{ col.items.length }}</span>
                </div>

                <div class="sub-col-cards">
                  <div
                    v-for="sub in col.items"
                    :key="sub.id"
                    class="sub-card"
                    draggable="true"
                    @dragstart="onSubDragStart($event, sub)"
                    @dragend="subDragging = null; subDragOverCol = null"
                    :class="{ dragging: subDragging?.id === sub.id }"
                    @click="openEditSubtask(sub)"
                  >
                    <div class="sub-card-priority" :class="sub.priority">
                      {{ priorityLabel(sub.priority) }}
                    </div>
                    <div class="sub-card-title">{{ sub.title }}</div>
                    <div v-if="sub.assignee_name" class="sub-card-assignee">
                      <span class="assignee-avatar-sm"
                        :style="{ background: sub.assignee_color + '22', color: sub.assignee_color }">
                        {{ sub.assignee_avatar }}
                      </span>
                      {{ sub.assignee_name }}
                    </div>
                  </div>
                  <div v-if="subDragOverCol === col.status && subDragging" class="drop-placeholder"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="loading">Загружаем задачу...</div>
    </div>

    <!-- Subtask modal -->
    <Teleport to="body">
      <div v-if="subModal.open" class="modal-overlay" @click.self="subModal.open = false">
        <div class="modal">
          <div class="modal-header">
            <h2>{{ subModal.mode === 'create' ? 'Новая подзадача' : 'Редактировать подзадачу' }}</h2>
            <button class="modal-close" @click="subModal.open = false">✕</button>
          </div>
          <div class="modal-body">
            <label class="field-label">Название *</label>
            <input v-model="subModal.title" class="field-input" placeholder="Что нужно сделать?" autofocus @keydown.enter="saveSubtask" />
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
          </div>
          <div class="modal-footer">
            <button v-if="subModal.mode === 'edit'" class="btn-delete-card" @click="deleteSubtask">Удалить</button>
            <div class="modal-footer-right">
              <button class="btn-cancel" @click="subModal.open = false">Отмена</button>
              <button class="btn-save" :disabled="!subModal.title.trim()" @click="saveSubtask">
                {{ subModal.mode === 'create' ? 'Создать' : 'Сохранить' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import TitleBar from '@/components/TitleBar.vue'
import Sidebar  from '@/components/Sidebar.vue'

const store  = useAppStore()
const route  = useRoute()
const router = useRouter()
const API    = import.meta.env.VITE_API_URL || ''

const card    = ref(null)
const users   = ref([])
const columns = ref([])
const editMode = ref(false)
const edit = reactive({ title: '', description: '', priority: 'medium', assignee_id: null, column_id: null })

// ─── Subtask columns ──────────────────────────────────────
const STATUSES = [
  { status: 'todo',        label: 'To Do',       color: '#61afef' },
  { status: 'in_progress', label: 'In Progress',  color: '#e8af34' },
  { status: 'done',        label: 'Done',         color: '#4caf7d' },
]

const subtaskCols = computed(() => STATUSES.map(s => ({
  ...s,
  items: (card.value?.subtasks || []).filter(t => t.status === s.status)
})))

const doneCount   = computed(() => (card.value?.subtasks || []).filter(s => s.status === 'done').length)
const progressPct = computed(() => {
  const total = card.value?.subtasks?.length || 0
  return total ? Math.round(doneCount.value / total * 100) : 0
})

const colTitle = computed(() => columns.value.find(c => c.id === card.value?.column_id)?.title || '')
const colColor = computed(() => columns.value.find(c => c.id === card.value?.column_id)?.color || 'var(--accent)')

// ─── Drag & Drop subtasks ─────────────────────────────────
const subDragging    = ref(null)
const subDragOverCol = ref(null)

function onSubDragStart(e, sub) {
  subDragging.value = sub
  e.dataTransfer.effectAllowed = 'move'
}
async function onSubDrop(e, status) {
  if (!subDragging.value) return
  const sub = subDragging.value
  subDragging.value = null; subDragOverCol.value = null

  // Оптимистично
  card.value.subtasks = card.value.subtasks.map(s =>
    s.id === sub.id ? { ...s, status } : s
  )
  // Реорганизуем позиции
  const payload = []
  STATUSES.forEach(col => {
    card.value.subtasks.filter(s => s.status === col.status)
      .forEach((s, i) => payload.push({ id: s.id, status: s.status, card_id: s.card_id }))
  })
  await fetch(`${API}/api/kanban/subtasks/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
}

// ─── Card edit ────────────────────────────────────────────
function startEdit() {
  edit.title       = card.value.title
  edit.description = card.value.description || ''
  edit.priority    = card.value.priority
  edit.assignee_id = card.value.assignee_id
  edit.column_id   = card.value.column_id
}
async function saveCard() {
  await fetch(`${API}/api/kanban/cards/${card.value.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(edit)
  })
  editMode.value = false
  await loadCard()
}
async function deleteCard() {
  if (!confirm('Удалить задачу и все подзадачи?')) return
  await fetch(`${API}/api/kanban/cards/${card.value.id}`, { method: 'DELETE' })
  router.push('/kanban')
}

// ─── Subtask modal ────────────────────────────────────────
const subModal = reactive({
  open: false, mode: 'create', id: null,
  title: '', priority: 'medium', assignee_id: null
})

function openAddSubtask() {
  subModal.open = true; subModal.mode = 'create'
  subModal.id = null; subModal.title = ''
  subModal.priority = 'medium'; subModal.assignee_id = null
}
function openEditSubtask(sub) {
  subModal.open = true; subModal.mode = 'edit'
  subModal.id = sub.id; subModal.title = sub.title
  subModal.priority = sub.priority; subModal.assignee_id = sub.assignee_id
}
async function saveSubtask() {
  if (!subModal.title.trim()) return
  if (subModal.mode === 'create') {
    await fetch(`${API}/api/kanban/cards/${card.value.id}/subtasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: subModal.title.trim(), priority: subModal.priority, assignee_id: subModal.assignee_id })
    })
  } else {
    await fetch(`${API}/api/kanban/subtasks/${subModal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: subModal.title.trim(), priority: subModal.priority, assignee_id: subModal.assignee_id })
    })
  }
  subModal.open = false
  await loadCard()
}
async function deleteSubtask() {
  await fetch(`${API}/api/kanban/subtasks/${subModal.id}`, { method: 'DELETE' })
  subModal.open = false
  await loadCard()
}

// ─── Data ─────────────────────────────────────────────────
async function loadCard() {
  const r = await fetch(`${API}/api/kanban/cards/${route.params.cardId}`)
  card.value = await r.json()
}

function priorityLabel(p) {
  return { low: '↓ Низкий', medium: '→ Средний', high: '↑ Высокий' }[p] || p
}
function formatDate(ts) {
  return new Date(ts * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

let offSocket
onMounted(async () => {
  if (!store.user) { router.push('/'); return }
  if (!store.folders.length) await store.fetchFolders()
  await loadCard()
  startEdit()
  const [ur, br] = await Promise.all([
    fetch(`${API}/api/users`),
    fetch(`${API}/api/kanban`)
  ])
  users.value   = await ur.json()
  columns.value = (await br.json())
  if (store.socket) {
    store.socket.on('kanban:card:update', (cardId) => {
      if (String(cardId) === String(route.params.cardId)) loadCard()
    })
    offSocket = () => store.socket.off('kanban:card:update')
  }
})
onUnmounted(() => offSocket?.())
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

/* ── Content ── */
.card-page-content {
  display: grid; grid-template-columns: 340px 1fr;
  gap: 0; flex: 1; overflow: hidden;
}

/* ── Card info ── */
.card-info {
  border-right: 1px solid var(--border);
  padding: 24px 20px;
  overflow-y: auto; display: flex; flex-direction: column; gap: 16px;
}
.card-info::-webkit-scrollbar { width: 4px; }
.card-info::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

.card-info-header { display: flex; align-items: center; justify-content: space-between; }
.card-priority-badge {
  font-size: 11px; font-weight: 700; padding: 3px 10px;
  border-radius: 20px; text-transform: uppercase; letter-spacing: .04em;
}
.card-priority-badge.low    { background: rgba(76,175,125,.15); color: #4caf7d; }
.card-priority-badge.medium { background: rgba(232,175,52,.15);  color: #e8af34; }
.card-priority-badge.high   { background: rgba(224,108,117,.15); color: #e06c75; }

.btn-edit-card {
  font-size: var(--text-xs); font-weight: 600; color: var(--text-muted);
  padding: 5px 10px; border-radius: var(--radius-md); border: 1px solid var(--border);
  transition: all var(--transition);
}
.btn-edit-card:hover { border-color: var(--accent-line); color: var(--accent); }

.card-page-title { font-size: var(--text-xl); font-weight: 700; line-height: 1.3; }
.card-page-desc { font-size: var(--text-sm); color: var(--text-muted); line-height: 1.6; white-space: pre-wrap; }
.card-page-desc.empty { color: var(--text-faint); font-style: italic; }

/* Edit form */
.field-label { font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px; display: block; }
.field-input, .field-select {
  width: 100%; background: var(--surface-3); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 8px 12px; font-size: var(--text-sm);
  color: var(--text); transition: border-color var(--transition);
}
.field-input:focus, .field-select:focus { outline: none; border-color: var(--accent-line); }
.field-textarea {
  width: 100%; resize: vertical; min-height: 80px;
  background: var(--surface-3); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 8px 12px;
  font-size: var(--text-sm); font-family: inherit; color: var(--text);
  transition: border-color var(--transition);
}
.field-textarea:focus { outline: none; border-color: var(--accent-line); }
.edit-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.edit-group { display: flex; flex-direction: column; gap: 4px; }
.edit-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* Meta */
.card-meta { display: flex; flex-direction: column; gap: 12px; border-top: 1px solid var(--border); padding-top: 16px; }
.meta-item { display: flex; flex-direction: column; gap: 4px; }
.meta-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-faint); }
.meta-val { font-size: var(--text-sm); color: var(--text-muted); }
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
.subtasks-area { display: flex; flex-direction: column; overflow: hidden; padding: 20px; gap: 16px; }
.subtasks-header { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
.subtasks-title { font-size: var(--text-base); font-weight: 700; }
.btn-add-subtask {
  padding: 6px 14px; border-radius: var(--radius-md);
  font-size: var(--text-xs); font-weight: 600;
  background: var(--accent); color: #fff;
  transition: background var(--transition);
}
.btn-add-subtask:hover { background: var(--accent-hover); }

.subtasks-board { display: flex; gap: 12px; overflow-x: auto; flex: 1; align-items: flex-start; }
.subtasks-board::-webkit-scrollbar { height: 6px; }
.subtasks-board::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

.sub-col {
  flex: 1; min-width: 200px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  display: flex; flex-direction: column;
  max-height: calc(100vh - 200px);
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
  display: flex; flex-direction: column; gap: 6px;
  padding: 4px 8px 10px; overflow-y: auto; flex: 1;
}
.sub-col-cards::-webkit-scrollbar { width: 3px; }
.sub-col-cards::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

.sub-card {
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 8px 10px;
  cursor: grab; transition: box-shadow .15s, opacity .15s;
  user-select: none;
}
.sub-card:hover { box-shadow: var(--shadow-md); border-color: var(--accent-line); }
.sub-card.dragging { opacity: .4; }
.sub-card-priority {
  font-size: 9px; font-weight: 700; padding: 1px 6px;
  border-radius: 20px; display: inline-block; margin-bottom: 4px;
  text-transform: uppercase; letter-spacing: .04em;
}
.sub-card-priority.low    { background: rgba(76,175,125,.15);  color: #4caf7d; }
.sub-card-priority.medium { background: rgba(232,175,52,.15);  color: #e8af34; }
.sub-card-priority.high   { background: rgba(224,108,117,.15); color: #e06c75; }
.sub-card-title { font-size: 12px; font-weight: 600; color: var(--text); line-height: 1.4; margin-bottom: 4px; }
.sub-card-assignee { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-muted); }
.assignee-avatar-sm {
  width: 18px; height: 18px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; font-size: .7rem; flex-shrink: 0;
}

.drop-placeholder {
  height: 48px; border-radius: var(--radius-md);
  border: 2px dashed var(--accent-line); background: var(--accent-soft); flex-shrink: 0;
}

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
</style>
