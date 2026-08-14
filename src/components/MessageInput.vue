<template>
  <div class="input-area" :class="{ dragging }"
    @dragover.prevent="onDragOver"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
  >
    <!-- Link preview -->
    <div v-if="linkPreview" class="link-card">
      <img v-if="linkPreview.image" :src="linkPreview.image" class="lc-img" />
      <div class="lc-info">
        <div class="lc-site">{{ linkPreview.siteName }}</div>
        <div class="lc-title">{{ linkPreview.title }}</div>
      </div>
      <button class="lc-close" @click="linkPreview = null"><X :size="11" :stroke-width="2.5" /></button>
    </div>

    <!-- Attachment preview -->
    <div v-if="pendingFile" class="attach-preview">
      <img v-if="pendingFile.isImage" :src="pendingFile.localUrl" class="ap-img" />
      <video v-else-if="pendingFile.isVideo" :src="pendingFile.localUrl" class="ap-img" muted />
      <span v-else class="ap-file"><component :is="fileIcon(pendingFile)" :size="14" :stroke-width="2" style="vertical-align:-2px;margin-right:4px" />{{ pendingFile.name }}</span>
      <button class="lc-close" @click="clearFile"><X :size="11" :stroke-width="2.5" /></button>
    </div>

    <!-- Error -->
    <div v-if="fileError" class="file-error"><AlertTriangle :size="14" :stroke-width="2" style="vertical-align:-2px;margin-right:4px" />{{ fileError }}</div>

    <!-- Input row -->
    <div class="input-row">
      <label class="attach-btn" title="Прикрепить файл">
        <Paperclip :size="16" :stroke-width="2" />
        <input
          type="file"
          ref="fileInput"
          @change="onFileChange"
          accept="image/*,video/mp4,video/webm,video/quicktime,.pdf,.zip,.doc,.docx,.txt"
        />
      </label>
      <textarea
        ref="taRef"
        v-model="text"
        class="msg-input"
        :placeholder="`Написать в #${store.activeChannel?.name || ''}...`"
        :disabled="!store.activeChId"
        rows="1"
        @keydown="onKeydown"
        @input="onInput"
        @paste="onPaste"
      />
      <button class="send-btn" :disabled="!canSend" @click="send">
        <Send :size="16" :stroke-width="2.5" />
      </button>
    </div>

    <div class="input-hint">
      Enter — отправить · Shift+Enter — новая строка · Ctrl+V — вставить картинку
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useAppStore } from '@/stores/app'
import { X, Paperclip, AlertTriangle, Send, FileArchive, FileText, File as FileIcon, Film } from 'lucide-vue-next'

const store      = useAppStore()
const text       = ref('')
const pendingFile = ref(null)
const linkPreview = ref(null)
const dragging    = ref(false)
const fileError   = ref('')
const taRef       = ref(null)
const fileInput   = ref(null)
const linkTimer   = ref(null)
const uploading   = ref(false)

const MAX_SIZE = 100 * 1024 * 1024 // 100MB

const ACCEPTED_MIME = /^(image\/(jpeg|jpg|png|gif|webp)|video\/(mp4|webm|quicktime|x-matroska)|application\/(pdf|zip|x-zip-compressed|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)|text\/plain)$/
const ACCEPTED_EXT  = /\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|mkv|pdf|zip|txt|doc|docx)$/i

const canSend = computed(() =>
  !!store.activeChId && !uploading.value && (text.value.trim() || pendingFile.value)
)

function fileIcon(att) {
  const ext = att.name?.split('.').pop()?.toLowerCase() || ''
  if (/zip|rar/.test(ext)) return FileArchive
  if (/pdf/.test(ext))     return FileText
  if (/doc/.test(ext))     return FileText
  if (/mp4|webm|mov/.test(ext)) return Film
  if (/txt|md/.test(ext))  return FileText
  return FileIcon
}

function validateFile(file) {
  // Запрет папок
  if (file.size === 0 && !file.type) {
    return 'Папки не поддерживаются'
  }
  if (file.name.includes('/') || file.name.includes('\\')) {
    return 'Папки не поддерживаются'
  }
  if (file.size > MAX_SIZE) {
    return `Файл слишком большой (макс. 100 МБ)`
  }
  const mimeOk = ACCEPTED_MIME.test(file.type)
  const extOk  = ACCEPTED_EXT.test(file.name)
  if (!mimeOk && !extOk) {
    return `Тип не поддерживается: ${file.type || file.name.split('.').pop()}`
  }
  return null
}

function autoResize() {
  const ta = taRef.value
  if (!ta) return
  ta.style.height = 'auto'
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
}

async function onInput() {
  autoResize()
  store.sendTyping()
  detectLink()
}

function detectLink() {
  clearTimeout(linkTimer.value)
  const match = text.value.match(/(https?:\/\/[^\s]+)/)
  if (!match) { linkPreview.value = null; return }
  linkTimer.value = setTimeout(async () => {
    try {
      const meta = await store.unfurlUrl(match[1])
      if (meta?.title) linkPreview.value = meta
    } catch {}
  }, 800)
}

async function onPaste(e) {
  const items = Array.from(e.clipboardData.items || [])
  const imgItem = items.find(i => i.type.startsWith('image/'))
  if (!imgItem) return
  e.preventDefault()
  await attachFile(imgItem.getAsFile())
}

function onDragOver(e) {
  // Проверяем что это файл а не текст
  if (e.dataTransfer.types.includes('Files')) dragging.value = true
}

async function onDrop(e) {
  dragging.value = false
  const item = e.dataTransfer.items?.[0]
  // Проверяем что не папка
  if (item?.webkitGetAsEntry?.()?.isDirectory) {
    fileError.value = 'Папки не поддерживаются'
    setTimeout(() => fileError.value = '', 3000)
    return
  }
  const file = e.dataTransfer.files[0]
  if (file) await attachFile(file)
}

async function onFileChange(e) {
  const file = e.target.files[0]
  if (file) await attachFile(file)
  fileInput.value.value = ''
}

async function attachFile(file) {
  fileError.value = ''
  const err = validateFile(file)
  if (err) {
    fileError.value = err
    setTimeout(() => fileError.value = '', 4000)
    return
  }
  const localUrl = URL.createObjectURL(file)
  pendingFile.value = {
    localUrl,
    name:    file.name,
    size:    file.size,
    mime:    file.type,
    isImage: file.type.startsWith('image/'),
    isVideo: file.type.startsWith('video/'),
    _file:   file
  }
}

function clearFile() {
  if (pendingFile.value?.localUrl) URL.revokeObjectURL(pendingFile.value.localUrl)
  pendingFile.value = null
}

function onKeydown(e) {
  if (e.key === 'Enter') {
    if (e.shiftKey) {
      e.preventDefault()
      const ta = taRef.value
      const start = ta.selectionStart
      text.value = text.value.slice(0, start) + '\n' + text.value.slice(ta.selectionEnd)
      nextTick(() => { ta.selectionStart = ta.selectionEnd = start + 1; autoResize() })
    } else {
      e.preventDefault()
      send()
    }
  }
}

async function send() {
  if (!canSend.value) return
  const msgText = text.value.trim()
  text.value = ''
  const meta = linkPreview.value ? { ...linkPreview.value } : null
  linkPreview.value = null
  await nextTick(); autoResize()

  let attachment = null
  if (pendingFile.value) {
    uploading.value = true
    try {
      attachment = await store.uploadFile(pendingFile.value._file)
    } finally {
      clearFile()
      uploading.value = false
    }
  }

  await store.sendMessage({ text: msgText || null, attachment, linkMeta: meta })
  taRef.value?.focus()
}
</script>

<style scoped>
.input-area {
  border-top: 1px solid var(--divider);
  background: var(--surface);
  padding: var(--space-3) var(--space-5) var(--space-2);
  transition: background var(--transition);
}
.input-area.dragging { background: var(--accent-soft); }

.link-card, .attach-preview {
  display: flex; align-items: center; gap: var(--space-3);
  margin-bottom: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--surface-3); border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-md);
}
.lc-img, .ap-img {
  width: 48px; height: 36px; object-fit: cover;
  border-radius: var(--radius-sm); flex-shrink: 0;
}
.lc-info { flex: 1; min-width: 0; }
.lc-site { font-size: 10px; color: var(--text-faint); text-transform: uppercase; }
.lc-title { font-size: var(--text-xs); font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lc-close {
  width: 20px; height: 20px; border-radius: var(--radius-full);
  display: flex; align-items: center; justify-content: center;
  font-size: .6rem; color: var(--text-faint); background: var(--hover); flex-shrink: 0;
  transition: all var(--transition);
}
.lc-close:hover { background: var(--red, #e06c75); color: white; }
.ap-file { font-size: var(--text-xs); color: var(--text-muted); flex: 1; }

.file-error {
  margin-bottom: var(--space-2); padding: var(--space-2) var(--space-3);
  background: rgba(224,108,117,.12); border: 1px solid rgba(224,108,117,.3);
  border-radius: var(--radius-md); font-size: var(--text-xs); color: #e06c75;
}

.input-row {
  display: flex; align-items: flex-end; gap: var(--space-2);
  background: var(--surface-3); border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
  transition: border-color var(--transition);
}
.input-row:focus-within { border-color: var(--accent-line); }

.attach-btn {
  width: 30px; height: 30px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: .9rem; border-radius: var(--radius-md); cursor: pointer;
  transition: background var(--transition);
}
.attach-btn:hover { background: var(--hover); }
.attach-btn input { display: none; }

.msg-input {
  flex: 1; background: none; border: none; outline: none;
  font-size: var(--text-sm); color: var(--text); line-height: 1.5;
  resize: none; max-height: 160px; overflow-y: auto;
  padding: var(--space-1) 0;
}
.msg-input::placeholder { color: var(--text-faint); }

.send-btn {
  width: 34px; height: 34px; flex-shrink: 0;
  background: var(--accent); color: white; border-radius: var(--radius-lg);
  display: flex; align-items: center; justify-content: center;
  transition: all var(--transition);
}
.send-btn:hover:not(:disabled) { background: var(--accent-hover); }
.send-btn:disabled { opacity: .4; cursor: not-allowed; }

.input-hint { padding: var(--space-1) var(--space-2) 0; font-size: 10px; color: var(--text-faint); }
</style>