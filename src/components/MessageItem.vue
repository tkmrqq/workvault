<template>
  <div class="msg-wrap" :class="{ own: isOwn }">
    <div class="msg-avatar"
      :style="{ background: msg.user_color + '22', color: msg.user_color }"
      @click="viewingUser = { id: msg.user_id, name: msg.user_name, avatar: msg.user_avatar, color: msg.user_color }"
      style="cursor: pointer"
      :title="msg.user_name"
    >
      {{ msg.user_avatar }}
    </div>
    <div class="msg-body">
      <div class="msg-meta">
        <span class="msg-name" :style="{ color: msg.user_color }">{{ msg.user_name }}</span>
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

      <!-- Reactions -->
      <div v-if="msg.reactions?.length" class="reactions">
        <button v-for="group in groupedReactions" :key="group.emoji"
          class="reaction-btn" :class="{ active: group.mine }"
          :title="group.users.join(', ')"
          @click="store.toggleReaction(msg.id, group.emoji)"
        >{{ group.emoji }} <span class="reaction-count">{{ group.count }}</span></button>
      </div>
    </div>

    <!-- Actions -->
    <div class="msg-actions">
      <button class="act-btn" title="Реакция" @click.stop="showPicker = !showPicker"><SmilePlus :size="15" :stroke-width="2" /></button>
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
import { useAppStore } from '@/stores/app'
import ProfileModal from './ProfileModal.vue'
import {
  Download, SmilePlus, Pencil, Trash2,
  FileArchive, FileText, FileSpreadsheet, Music, Film, Image as ImageIcon, File as FileIcon
} from 'lucide-vue-next'

const viewingUser = ref(null)

const props = defineProps({ msg: Object })
const emit  = defineEmits(['open-image'])
const store = useAppStore()

const editing    = ref(false)
const editText   = ref('')
const showPicker = ref(false)

const EMOJIS = ['👍','❤️','🔥','😂','👀','✅','😮','🤔','👏','💯']

const API = import.meta.env.VITE_API_URL || ''

function resolveUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${API}${url}`
}

const attachUrl = computed(() => resolveUrl(props.msg.attachment?.url))
const isOwn     = computed(() => props.msg.user_id === store.user?.id)

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
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>')
}

function startEdit() { editText.value = props.msg.text || ''; editing.value = true }
function submitEdit() {
  if (editText.value.trim()) store.editMessage(props.msg.id, editText.value.trim())
  editing.value = false
}
function pick(emoji) { store.toggleReaction(props.msg.id, emoji); showPicker.value = false }
</script>

<style scoped>
.msg-wrap {
  display: flex; gap: var(--space-3);
  padding: var(--space-2) var(--space-5);
  border-radius: var(--radius-lg); position: relative;
  transition: background var(--transition);
  animation: fadeUp .2s ease both;
}
.msg-wrap:hover { background: var(--surface); }
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