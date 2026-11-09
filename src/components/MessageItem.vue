<template>
  <div class="msg-wrap" @contextmenu="onContextMenu" :data-msg-id="msg.id" :class="{ own: isOwn, 'msg-enter': uiPreferences.animationsEnabled && store.isMessageEntering(msg.id), flash: store.flashMsgId === msg.id, 'thread-open': !inThread && store.threadParentId === msg.id, 'mentions-me': mentionsMe }">
    <div class="msg-avatar"
      :style="{ background: msg.user_color + '22', color: msg.user_color }"
      @click="openProfile(msg.user_id)"
      style="cursor: pointer"
      :title="msg.user_name"
    >
      {{ msg.user_avatar }}
    </div>
    <div class="msg-body">
      <div class="msg-meta">
        <span class="msg-name" :style="{ color: msg.user_color }">{{ msg.user_name }}</span>
        <span v-if="authorStatus" class="msg-status" :title="authorStatus.text || 'Статус'">{{ authorStatus.emoji || '💬' }}</span>
        <span class="msg-time">{{ formatTime(msg.created_at) }}</span>
        <span v-if="msg.edited" class="msg-edited">(ред.)</span>
      </div>

      <!-- Text -->
      <div v-if="!editing" class="msg-text" v-html="renderText(msg.text)" />
      <div v-else class="edit-wrap">
        <textarea v-model="editText" class="edit-input"
          @keydown.enter.exact.prevent="submitEdit"
          @keydown.escape="editing = false"
          autofocus
        />
        <div class="edit-actions">
          <button class="edit-btn" @click="editing = false">Отмена</button>
          <button class="edit-btn accent" @click="submitEdit">Сохранить</button>
        </div>
      </div>

      <!-- Image -->
      <div v-if="msg.attachment?.isImage" class="msg-img-wrap">
        <img :src="attachUrl" :alt="msg.attachment.name" class="msg-img" loading="lazy"
          @click="emit('open-image', { url: attachUrl, alt: msg.attachment.name })" />
      </div>

      <!-- Video — встроенный плеер -->
      <div v-else-if="msg.attachment?.isVideo" class="msg-video-wrap">
        <video :src="attachUrl" class="msg-video" controls preload="metadata" />
        <div class="attach-footer">
          <span class="attach-name">{{ msg.attachment.name }}</span>
          <span class="attach-size">{{ formatSize(msg.attachment.size) }}</span>
          <button class="dl-btn" title="Скачать" @click="download(msg.attachment)"><Download :size="14" :stroke-width="2" /></button>
        </div>
      </div>

      <!-- File — иконка по типу + скачать -->
      <div v-else-if="msg.attachment && !msg.attachment.isImage && !msg.attachment.isVideo"
        class="msg-file">
        <component :is="fileIcon(msg.attachment)" class="file-icon" :size="24" :stroke-width="1.6" />
        <div class="file-info">
          <span class="file-name">{{ msg.attachment.name }}</span>
          <span class="file-size">{{ formatSize(msg.attachment.size) }}</span>
        </div>
        <button class="dl-btn" title="Скачать" @click="download(msg.attachment)"><Download :size="14" :stroke-width="2" /></button>
      </div>

      <!-- Link preview -->
      <div v-if="parsedLinkMeta?.title" class="link-preview">
        <img v-if="parsedLinkMeta.image" :src="parsedLinkMeta.image" class="link-img" loading="lazy"
          @error="e => e.target.style.display='none'"
          @click="emit('open-image', { url: parsedLinkMeta.image, alt: parsedLinkMeta.title })" />
        <div class="link-info">
          <div class="link-site">{{ parsedLinkMeta.siteName }}</div>
          <a :href="parsedLinkMeta.url" target="_blank" rel="noopener" class="link-title">
            {{ parsedLinkMeta.title }}
          </a>
          <div v-if="parsedLinkMeta.description" class="link-desc">{{ parsedLinkMeta.description }}</div>
        </div>
      </div>

      <!-- Привязанная задача с канбана -->
      <Transition name="task-chip">
        <button v-if="msg.task" type="button" class="task-chip"
          :class="{ done: taskDone, archived: !!msg.task.archived_at }"
          :style="{ '--chip-c': msg.task.column_color || 'var(--accent)' }"
          title="Открыть задачу"
          @click="openTask"
        >
          <span class="tc-icon">
            <Check v-if="taskDone" :size="11" :stroke-width="3" />
            <ListChecks v-else :size="11" :stroke-width="2.4" />
          </span>
          <span class="tc-title">{{ msg.task.title }}</span>
          <Transition name="tc-swap" mode="out-in">
            <span :key="taskStatus" class="tc-status">{{ taskStatus }}</span>
          </Transition>
        </button>
      </Transition>

      <!-- Reactions -->
      <div v-if="msg.reactions?.length" class="reactions">
        <button v-for="group in groupedReactions" :key="group.emoji"
          class="reaction-btn" :class="{ active: group.mine }"
          :title="group.users.join(', ')"
          @click="store.toggleReaction(msg.id, group.emoji)"
        >{{ group.emoji }} <span class="reaction-count">{{ group.count }}</span></button>
      </div>

      <!-- Сводка треда -->
      <Transition name="task-chip">
        <button v-if="!inThread && msg.reply_count" type="button" class="thread-summary"
          :class="{ active: store.threadParentId === msg.id }"
          @click="store.openThread(msg.id)"
        >
          <span class="ts-avatars">
            <span v-for="u in msg.reply_users || []" :key="u.id" class="ts-av"
              :style="{ background: u.color + '22', color: u.color }" :title="u.name">{{ u.avatar }}</span>
          </span>
          <Transition name="tc-swap" mode="out-in">
            <span :key="msg.reply_count" class="ts-count">{{ replyLabel }}</span>
          </Transition>
          <span class="ts-last">{{ lastReplyLabel }}</span>
          <ChevronRight class="ts-go" :size="13" :stroke-width="2.4" />
        </button>
      </Transition>
    </div>

    <!-- Actions -->
    <div class="msg-actions">
      <button class="act-btn" title="Реакция" @click.stop="showPicker = !showPicker"><SmilePlus :size="15" :stroke-width="2" /></button>
      <button v-if="!inThread" class="act-btn" title="Ответить в треде" @click="store.openThread(msg.id)"><MessagesSquare :size="15" :stroke-width="2" /></button>
      <button v-if="!msg.task" class="act-btn" title="Создать задачу" :disabled="creatingTask" @click="makeTask"><ListPlus :size="15" :stroke-width="2" /></button>
      <button v-if="isOwn" class="act-btn" title="Редактировать" @click="startEdit"><Pencil :size="14" :stroke-width="2" /></button>
      <button v-if="isOwn" class="act-btn red" title="Удалить" @click="store.deleteMessage(msg.id)"><Trash2 :size="14" :stroke-width="2" /></button>
    </div>

    <!-- Emoji picker -->
    <div v-if="showPicker" class="emoji-picker">
      <button v-for="e in EMOJIS" :key="e" class="ep-btn" @click="pick(e)">{{ e }}</button>
    </div>
  </div>
  <ProfileModal
    v-if="viewingUser"
    :user="viewingUser"
    :view-only="true"
    @close="viewingUser = null"
  />
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { getApiBase } from '@/lib/apiBase'
import { uiPreferences } from '@/composables/useUiPreferences'
import { openContextMenu, shouldUseNativeMenu, copyText } from '@/composables/useContextMenu'
import ProfileModal from './ProfileModal.vue'
import {
  Download, SmilePlus, Pencil, Trash2, ListPlus, ListChecks, Check, MessagesSquare, ChevronRight, Copy, AtSign, User,
  FileArchive, FileText, FileSpreadsheet, Music, Film, Image as ImageIcon, File as FileIcon
} from 'lucide-vue-next'

const viewingUser = ref(null)

// Данные автора в самом сообщении — снапшот на момент отправки (имя/аватар/цвет
// могли с тех пор поменяться в профиле). При открытии всегда подтягиваем
// актуальную запись; если юзер удалён или запрос не прошёл — падаем обратно
// на то, что есть в сообщении, чтобы модалка не осталась пустой.
async function openProfile(userId) {
  viewingUser.value = { id: props.msg.user_id, name: props.msg.user_name, avatar: props.msg.user_avatar, color: props.msg.user_color }
  try {
    const r = await fetch(`${API}/api/users/${userId}`)
    if (r.ok) viewingUser.value = await r.json()
  } catch (e) {
    // офлайн/ошибка сети — остаёмся на снапшоте из сообщения
  }
}

// inThread — сообщение рисуется внутри панели треда (без кнопки «Ответить в треде» и сводки)
const props = defineProps({ msg: Object, inThread: { type: Boolean, default: false } })
const emit  = defineEmits(['open-image'])
const store = useAppStore()
const router = useRouter()

const editing    = ref(false)
const editText   = ref('')
const showPicker = ref(false)

const EMOJIS = ['👍','❤️','🔥','😂','👀','✅','😮','🤔','👏','💯']

const API = getApiBase()

function resolveUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${API}${url}`
}

const attachUrl = computed(() => resolveUrl(props.msg.attachment?.url))
const isOwn     = computed(() => props.msg.user_id === store.user?.id)
const authorStatus = computed(() => {
  const u = store.usersById?.[props.msg.user_id]
  return store.statusActive(u) ? { emoji: u.status_emoji, text: u.status_text || '' } : null
})
const mentionsMe = computed(() => !isOwn.value && store.mentionsMe(props.msg.text))

const parsedLinkMeta = computed(() => {
  const m = props.msg.link_meta
  if (!m) return null
  if (typeof m === 'string') { try { return JSON.parse(m) } catch { return null } }
  return m
})

const groupedReactions = computed(() => {
  const map = {}
  for (const r of (props.msg.reactions || [])) {
    if (!map[r.emoji]) map[r.emoji] = { emoji: r.emoji, count: 0, users: [], mine: false }
    map[r.emoji].count++
    map[r.emoji].users.push(r.user_name)
    if (r.user_id === store.user?.id) map[r.emoji].mine = true
  }
  return Object.values(map)
})

// Иконки по расширению/mime
function fileIcon(att) {
  const ext  = att.name?.split('.').pop()?.toLowerCase() || ''
  const mime = att.mime || ''
  if (/zip|rar|7z|gz|tar/.test(ext))             return FileArchive
  if (/pdf/.test(ext) || /pdf/.test(mime))        return FileText
  if (/doc|docx/.test(ext))                       return FileText
  if (/xls|xlsx/.test(ext))                       return FileSpreadsheet
  if (/mp3|wav|ogg|flac|aac/.test(ext))           return Music
  if (/mp4|webm|mov|mkv|avi/.test(ext))           return Film
  if (/txt|md|csv/.test(ext))                     return FileText
  if (/jpg|jpeg|png|gif|webp|svg/.test(ext))      return ImageIcon
  return FileIcon
}

// Скачивание: через Electron диалог или обычный <a download>
async function download(att) {
  const fullUrl = resolveUrl(att.url)
  
  if (window.electronAPI?.downloadFile) {
    const result = await window.electronAPI.downloadFile(fullUrl, att.name)
    if (!result?.ok && result?.reason !== 'cancelled') {
      alert('Ошибка скачивания: ' + result?.reason)
    }
  } else {
    const res  = await fetch(fullUrl)
    const blob = await res.blob()
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = att.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10000)
  }
}

function onDocClick(e) {
  if (showPicker.value && !e.target.closest('.emoji-picker') && !e.target.closest('.act-btn')) {
    showPicker.value = false
  }
}
onMounted(()       => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

function formatTime(ts) {
  const d = new Date(ts * 1000), now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024)            return `${bytes} B`
  if (bytes < 1024 * 1024)     return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3)       return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function renderText(text) {
  if (!text) return ''
  return highlightMentions(baseRender(text))
}
// @упоминания подсвечиваем уже в готовом (экранированном) HTML
function highlightMentions(html) {
  const re = store.mentionRegex
  if (!re) return html
  return html.replace(re, (_, pre, name) =>
    `${pre}<span class="mention${name === store.myMentionName ? ' me' : ''}">@${name}</span>`)
}
function baseRender(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>')
}

// ─── Сводка треда ────────────────────────────────────────
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
const replyLabel = computed(() => {
  const n = props.msg.reply_count || 0
  return `${n} ${plural(n, 'ответ', 'ответа', 'ответов')}`
})
const lastReplyLabel = computed(() => {
  const ts = props.msg.last_reply_at
  if (!ts) return ''
  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff < 60)    return 'только что'
  if (diff < 3600)  return `${Math.floor(diff / 60)} мин назад`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`
  return 'последний ' + new Date(ts * 1000).toLocaleDateString('ru', { day: 'numeric', month: 'short' })
})

// ─── Сообщение ↔ задача ──────────────────────────────────
const creatingTask = ref(false)
const taskDone   = computed(() => !!props.msg.task?.is_terminal)
const taskStatus = computed(() => {
  const t = props.msg.task
  if (!t) return ''
  if (t.archived_at) return 'В архиве'
  return t.column_title || 'Задача'
})
async function makeTask() {
  if (creatingTask.value) return
  creatingTask.value = true
  try {
    await store.createTaskFromMessage(props.msg.id)
  } catch (e) {
    alert(e.message || 'Не удалось создать задачу')
  } finally {
    creatingTask.value = false
  }
}
function openTask() {
  if (props.msg.task?.id) router.push(`/kanban/${props.msg.task.id}`)
}

function startEdit() { editText.value = props.msg.text || ''; editing.value = true }
function submitEdit() {
  if (editText.value.trim()) store.editMessage(props.msg.id, editText.value.trim())
  editing.value = false
}
function pick(emoji) { store.toggleReaction(props.msg.id, emoji); showPicker.value = false }

// ПКМ по сообщению: своё меню (и в браузере, и в Electron). Для ссылок, картинок,
// выделенного текста и по Shift+ПКМ остаётся системное меню.
function onContextMenu(e) {
  if (editing.value || shouldUseNativeMenu(e)) return
  e.preventDefault()
  const m = props.msg
  const own = isOwn.value
  openContextMenu(e, [
    { type: 'reactions', emojis: EMOJIS.slice(0, 6), action: em => store.toggleReaction(m.id, em) },
    !props.inThread && { label: 'Ответить в треде', icon: MessagesSquare, action: () => store.openThread(m.id) },
    m.task
      ? { label: 'Открыть задачу', icon: ListChecks, action: openTask }
      : { label: 'Создать задачу', icon: ListPlus, action: makeTask, disabled: creatingTask.value },
    !own && { label: 'Упомянуть автора', icon: AtSign,
      action: () => store.insertIntoComposer('@' + m.user_name + ' ', props.inThread ? (m.parent_id || m.id) : null) },
    m.text && { label: 'Копировать текст', icon: Copy, action: () => copyText(m.text) },
    { label: 'Профиль автора', icon: User, action: () => openProfile(m.user_id) },
    own && { type: 'separator' },
    own && { label: 'Редактировать', icon: Pencil, action: startEdit },
    own && { label: 'Удалить', icon: Trash2, danger: true, action: () => store.deleteMessage(m.id) },
  ])
}
</script>

<style scoped>
.msg-wrap {
  display: flex; gap: var(--space-3);
  padding: var(--space-2) var(--space-5);
  border-radius: var(--radius-lg); position: relative;
  transition: background var(--transition);
}
.msg-wrap.msg-enter {
  animation: msgArrive .15s ease both;
}
@keyframes msgArrive {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.msg-wrap:hover { background: var(--surface); }

/* Подсветка при переходе «к исходному сообщению» из карточки */
.msg-wrap.flash { animation: msgFlash 2.2s var(--ease-out, ease) both; }
@keyframes msgFlash {
  0%, 35% { background: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent); }
  100%    { background: transparent;        box-shadow: inset 3px 0 0 transparent; }
}

/* Корень открытого сейчас треда */
.msg-wrap.thread-open { background: var(--accent-soft); }

/* ── Упоминания ── */
.msg-wrap.mentions-me {
  background: color-mix(in srgb, var(--warning, #f5a524) 8%, transparent);
  box-shadow: inset 3px 0 0 var(--warning, #f5a524);
}
.msg-text :deep(.mention) {
  padding: 0 4px; border-radius: 5px;
  background: var(--accent-soft); color: var(--accent);
  font-weight: 600; white-space: nowrap;
}
.msg-text :deep(.mention.me) {
  background: color-mix(in srgb, var(--warning, #f5a524) 26%, transparent);
  color: var(--text);
}

/* ── Сводка треда ── */
.thread-summary {
  display: flex; align-items: center; gap: 8px;
  width: fit-content; max-width: 100%; margin-top: 6px;
  padding: 3px 8px 3px 3px;
  border: 1px solid transparent; border-radius: var(--radius-md);
  font-size: var(--text-xs); color: var(--text-muted);
  cursor: pointer;
  transition: background var(--dur-fast, .15s) var(--ease-out, ease),
              border-color var(--dur-fast, .15s) var(--ease-out, ease);
}
.thread-summary:hover, .thread-summary.active {
  background: var(--surface-2, var(--surface)); border-color: var(--border);
}
.ts-avatars { display: flex; }
.ts-av {
  width: 20px; height: 20px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; box-shadow: 0 0 0 2px var(--bg);
}
.ts-av + .ts-av { margin-left: -4px; }
.ts-count { font-weight: 700; color: var(--accent); }
.ts-last  { color: var(--text-faint); white-space: nowrap; }
.ts-go {
  color: var(--text-faint); opacity: 0; transform: translateX(-4px);
  transition: opacity var(--dur-fast, .15s) ease, transform var(--dur, .25s) var(--ease-out, ease);
}
.thread-summary:hover .ts-go, .thread-summary.active .ts-go { opacity: 1; transform: none; }

/* ── Чип привязанной задачи ── */
.task-chip {
  display: inline-flex; align-items: center; gap: 6px;
  max-width: 100%; margin-top: 6px;
  padding: 3px 10px 3px 4px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--chip-c) 35%, transparent);
  background: color-mix(in srgb, var(--chip-c) 12%, transparent);
  font-size: var(--text-xs); color: var(--text);
  cursor: pointer;
  transition: background var(--dur-fast, .15s) var(--ease-out, ease),
              border-color var(--dur-fast, .15s) var(--ease-out, ease),
              transform var(--dur-fast, .15s) var(--ease-out, ease);
}
.task-chip:hover {
  background: color-mix(in srgb, var(--chip-c) 22%, transparent);
  border-color: color-mix(in srgb, var(--chip-c) 60%, transparent);
  transform: translateY(-1px);
}
.task-chip:active { transform: translateY(0) scale(.98); }
.tc-icon {
  width: 18px; height: 18px; flex-shrink: 0; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--chip-c); color: #fff;
  transition: transform var(--dur, .25s) var(--ease-spring, ease);
}
.task-chip:hover .tc-icon { transform: rotate(-8deg) scale(1.08); }
.tc-title {
  font-weight: 600; min-width: 0; max-width: 340px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tc-status { color: var(--text-muted); white-space: nowrap; }
.tc-status::before { content: '·'; margin-right: 6px; color: var(--text-faint); }
.task-chip.done .tc-title { text-decoration: line-through; color: var(--text-muted); }
.task-chip.archived { opacity: .6; }

.task-chip-enter-active { transition: opacity var(--dur, .25s) var(--ease-out, ease), transform var(--dur-slow, .35s) var(--ease-spring, ease); }
.task-chip-leave-active { transition: opacity var(--dur-fast, .15s) ease, transform var(--dur-fast, .15s) ease; }
.task-chip-enter-from   { opacity: 0; transform: translateY(4px) scale(.9); }
.task-chip-leave-to     { opacity: 0; transform: scale(.95); }

.tc-swap-enter-active, .tc-swap-leave-active { transition: opacity var(--dur-fast, .15s) ease, transform var(--dur-fast, .15s) var(--ease-out, ease); }
.tc-swap-enter-from { opacity: 0; transform: translateY(5px); }
.tc-swap-leave-to   { opacity: 0; transform: translateY(-5px); }
.msg-wrap:hover .msg-actions { opacity: 1; pointer-events: all; }

.msg-avatar {
  width: 34px; height: 34px; border-radius: var(--radius-full);
  display: flex; align-items: center; justify-content: center;
  font-size: 1rem; flex-shrink: 0; margin-top: 2px;
}
.msg-body { flex: 1; min-width: 0; }
.msg-meta { display: flex; align-items: baseline; gap: var(--space-2); margin-bottom: var(--space-1); }
.msg-name { font-size: var(--text-sm); font-weight: 700; }
.msg-time { font-size: var(--text-xs); color: var(--text-faint); }
.msg-edited { font-size: 10px; color: var(--text-faint); }
.msg-status { font-size: 13px; line-height: 1; cursor: default; }

.msg-text { font-size: var(--text-sm); line-height: 1.6; color: var(--text); word-break: break-word; }
.msg-text :deep(code) {
  font-family: var(--font-mono, monospace); font-size: .85em;
  background: var(--surface-3); padding: 1px 5px;
  border-radius: var(--radius-sm); color: var(--accent-hover);
}
.msg-text :deep(a) { color: var(--accent); }
.msg-text :deep(strong) { font-weight: 700; }
.msg-text :deep(em) { font-style: italic; }

/* Edit */
.edit-wrap { display: flex; flex-direction: column; gap: var(--space-2); }
.edit-input {
  background: var(--surface-3); border: 1px solid var(--accent-line);
  border-radius: var(--radius-md); padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm); resize: vertical; min-height: 60px; color: var(--text);
}
.edit-input:focus { outline: none; }
.edit-actions { display: flex; gap: var(--space-2); }
.edit-btn {
  font-size: var(--text-xs); font-weight: 600;
  padding: var(--space-1) var(--space-3); border-radius: var(--radius-md);
  border: 1px solid var(--border); color: var(--text-muted); transition: all var(--transition);
}
.edit-btn:hover { background: var(--hover); color: var(--text); }
.edit-btn.accent { background: var(--accent); color: white; border-color: var(--accent); }

/* Image */
.msg-img-wrap { margin-top: var(--space-2); }
.msg-img {
  max-width: min(400px, 100%); max-height: 300px;
  border-radius: var(--radius-lg); cursor: zoom-in;
  border: 1px solid var(--border); object-fit: cover;
  transition: opacity var(--transition);
}
.msg-img:hover { opacity: .88; }

/* Video */
.msg-video-wrap {
  margin-top: var(--space-2);
  max-width: min(480px, 100%);
}
.msg-video {
  width: 100%; border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: #000;
  display: block;
}

/* File */
.msg-file {
  display: inline-flex; align-items: center; gap: var(--space-3);
  margin-top: var(--space-2); padding: var(--space-3) var(--space-4);
  background: var(--surface-3); border: 1px solid var(--border);
  border-radius: var(--radius-lg); max-width: min(360px, 100%);
  transition: background var(--transition);
}
.file-icon { color: var(--accent); flex-shrink: 0; }
.file-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.file-name { font-size: var(--text-xs); font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-size { font-size: 10px; color: var(--text-faint); }

/* Видео footer */
.attach-footer {
  display: flex; align-items: center; gap: var(--space-2);
  margin-top: var(--space-1);
}
.attach-name { font-size: var(--text-xs); color: var(--text-muted); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.attach-size { font-size: 10px; color: var(--text-faint); flex-shrink: 0; }

/* Download button */
.dl-btn {
  width: 28px; height: 28px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-md); font-size: .85rem;
  color: var(--text-muted); transition: all var(--transition);
}
.dl-btn:hover { background: var(--accent-soft); color: var(--accent); }

/* Link preview */
.link-preview {
  display: flex; gap: var(--space-3);
  margin-top: var(--space-2); padding: var(--space-3);
  background: var(--surface-2); border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-lg); max-width: 480px;
}
.link-img {
  width: 80px; height: 60px; object-fit: cover;
  border-radius: var(--radius-md); flex-shrink: 0;
  cursor: zoom-in; transition: opacity var(--transition);
}
.link-img:hover { opacity: .85; }
.link-info { flex: 1; min-width: 0; }
.link-site { font-size: 10px; color: var(--text-faint); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 2px; }
.link-title { font-size: var(--text-xs); font-weight: 700; color: var(--text); display: block; margin-bottom: 2px; }
.link-title:hover { color: var(--accent); }
.link-desc { font-size: 11px; color: var(--text-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

/* Reactions */
.reactions { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-top: var(--space-2); }
.reaction-btn {
  display: flex; align-items: center; gap: 3px;
  padding: 2px 8px; border-radius: var(--radius-full);
  background: var(--surface-3); border: 1px solid var(--border);
  font-size: var(--text-xs); transition: all var(--transition);
}
.reaction-btn:hover { background: var(--hover); border-color: var(--accent-line); }
.reaction-btn.active { background: var(--accent-soft); border-color: var(--accent-line); }
.reaction-count { font-weight: 700; font-size: 11px; color: var(--text-muted); }

/* Actions */
.msg-actions {
  position: absolute; top: var(--space-2); right: var(--space-3);
  display: flex; gap: 2px; background: var(--surface-2);
  border: 1px solid var(--border); border-radius: var(--radius-lg);
  padding: 2px; box-shadow: var(--shadow-sm);
  opacity: 0; pointer-events: none; transition: opacity var(--transition);
}
.act-btn {
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-md); font-size: .85rem; transition: background var(--transition);
}
.act-btn:hover { background: var(--hover); }
.act-btn.red:hover { background: rgba(224,108,117,.15); }

.emoji-picker {
  position: absolute; top: -52px; right: var(--space-3); z-index: 50;
  display: flex; gap: 2px; flex-wrap: wrap; max-width: 220px;
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--radius-xl); padding: var(--space-2);
  box-shadow: var(--shadow-md); animation: scaleIn .15s ease;
}
.ep-btn {
  width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-md); font-size: 1rem; transition: background var(--transition);
}
.ep-btn:hover { background: var(--hover); }
</style>
