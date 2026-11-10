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

    <!-- Slash-команды -->
    <Transition name="slash-pop">
      <div v-if="slashOpen" class="slash-menu" role="listbox">
        <div class="slash-head">Команды</div>
        <button v-for="(c, i) in slashMatches" :key="c.name" type="button"
          class="slash-item" :class="{ active: i === slashIndex }" role="option"
          @mousedown.prevent="applyCommand(c)" @mouseenter="slashIndex = i"
        >
          <span class="slash-ic"><component :is="c.icon" :size="14" :stroke-width="2" /></span>
          <span class="slash-name">/{{ c.name }} <span class="slash-arg">{{ c.hint }}</span></span>
          <span class="slash-desc">{{ c.desc }}</span>
        </button>
        <div class="slash-foot">↑↓ выбрать · Enter/Tab — подставить · Esc — закрыть</div>
      </div>
    </Transition>

    <!-- Активная команда -->
    <Transition name="slash-pop">
      <div v-if="commandMatch" class="cmd-badge">
        <component :is="commandMatch.cmd.icon" :size="13" :stroke-width="2.2" />
        <span>{{ commandMatch.cmd.badge }}</span>
        <template v-if="commandMatch.cmd.name === 'poll'">
          <span class="cmd-warn">{{ pollDraft.question
            ? `· вариантов: ${pollDraft.options.length}${pollDraft.options.length < 2 ? ' (нужно ≥ 2)' : ''}`
            : '— вопрос, дальше варианты с новой строки (Shift+Enter) или через |' }}</span>
          <button type="button" class="cmd-toggle" :class="{ on: pollMulti }" :aria-pressed="pollMulti"
            @mousedown.prevent="pollMulti = !pollMulti">несколько ответов</button>
        </template>
        <span v-else-if="!commandMatch.arg && !pendingFile" class="cmd-warn">— добавь название</span>
      </div>
    </Transition>

    <!-- @упоминания -->
    <Transition name="slash-pop">
      <div v-if="mentionOpen" class="slash-menu mention-menu" role="listbox">
        <div class="slash-head">Упомянуть</div>
        <button v-for="(u, i) in mentionMatches" :key="u.id" type="button"
          class="slash-item" :class="{ active: i === mentionIndex }" role="option"
          @mousedown.prevent="applyMention(u)" @mouseenter="mentionIndex = i"
        >
          <span class="mm-avatar" :style="{ background: (u.color || '#8a8f98') + '22', color: u.color || '#8a8f98' }">
            <AvatarContent :value="u.avatar" :name="u.name" />
            <span v-if="isOnline(u.id)" class="mm-online" />
          </span>
          <span class="slash-name">{{ u.name }}</span>
        </button>
        <div class="slash-foot">↑↓ выбрать · Enter/Tab — подставить · Esc — закрыть</div>
      </div>
    </Transition>

    <!-- Стикеры -->
    <Transition name="slash-pop">
      <div v-if="stickerOpen" class="sticker-panel" @click.stop>
        <div class="sticker-head">
          <span>Стикеры</span>
          <label class="sticker-add" title="Добавить стикер (PNG/WebP/GIF до 1 МБ)">
            <Plus :size="13" :stroke-width="2.5" /> {{ stickerUploading ? 'Загружаю…' : 'Добавить' }}
            <input type="file" accept="image/png,image/webp,image/gif" @change="onStickerFile" :disabled="stickerUploading" />
          </label>
        </div>
        <div v-if="!store.stickers.length" class="sticker-empty">Пока пусто — добавь первый стикер</div>
        <div v-else class="sticker-grid">
          <div v-for="st in store.stickers" :key="st.id" class="sticker-cell">
            <button type="button" class="sticker-btn" :title="st.emoji || ''" @click="pickSticker(st)">
              <img :src="resolveStickerUrl(st.url)" :alt="st.emoji || 'стикер'" loading="lazy" draggable="false" />
            </button>
            <button v-if="st.user_id === store.user?.id || store.user?.role === 'admin'" type="button"
              class="sticker-del" title="Удалить из набора" @click="removeSticker(st)"><X :size="10" :stroke-width="3" /></button>
          </div>
        </div>
      </div>
    </Transition>

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
        :placeholder="parentId ? 'Ответить в треде...' : `Написать в #${store.activeChannel?.name || ''}...`"
        :disabled="!store.activeChId"
        rows="1"
        @keydown="onKeydown"
        @input="(e) => { onInput(e); syncCaret() }"
        @click="syncCaret"
        @keyup="syncCaret"
        @paste="onPaste"
      />
      <button type="button" class="sticker-toggle" :class="{ on: stickerOpen }" title="Стикеры"
        :disabled="!store.activeChId" @click.stop="toggleStickers">
        <Sticker :size="16" :stroke-width="2" />
      </button>
      <button class="send-btn" :disabled="!canSend" @click="send">
        <Send :size="16" :stroke-width="2.5" />
      </button>
    </div>

    <div class="input-hint">
      Enter — отправить · Shift+Enter — новая строка · Ctrl+V — вставить картинку · / — команды · @ — упомянуть
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'
import { getApiBase } from '@/lib/apiBase'
import { useAppStore } from '@/stores/app'
import { X, Paperclip, AlertTriangle, Send, FileArchive, FileText, File as FileIcon, Film, ListPlus, ListChecks, Sticker, Plus } from 'lucide-vue-next'

const store      = useAppStore()
// parentId задан — это поле ввода в панели треда, сообщения уходят ответами
const props      = defineProps({ parentId: { type: Number, default: null } })
const text       = ref('')
const pendingFile = ref(null)
const linkPreview = ref(null)
const dragging    = ref(false)
const fileError   = ref('')

// ── Стикеры ──
const stickerOpen = ref(false)
const stickerUploading = ref(false)
function resolveStickerUrl(u) {
  if (!u) return ''
  return /^https?:/.test(u) ? u : getApiBase() + u
}
async function toggleStickers() {
  stickerOpen.value = !stickerOpen.value
  if (stickerOpen.value) {
    try { await store.loadStickers() } catch { showError('Не удалось загрузить стикеры') }
  }
}
async function pickSticker(st) {
  stickerOpen.value = false
  try { await store.sendSticker(st, props.parentId) }
  catch (e) { showError(e?.message || 'Не удалось отправить стикер') }
}
async function onStickerFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  if (file.size > 1024 * 1024) { showError('Стикер — максимум 1 МБ'); return }
  stickerUploading.value = true
  try { await store.uploadSticker(file) }
  catch (err) { showError(err?.message || 'Не удалось загрузить стикер') }
  finally { stickerUploading.value = false }
}
async function removeSticker(st) {
  try { await store.deleteSticker(st.id) }
  catch (err) { showError(err?.message || 'Не удалось удалить') }
}
function closeStickers() { stickerOpen.value = false }
onMounted(() => document.addEventListener('click', closeStickers))
onBeforeUnmount(() => document.removeEventListener('click', closeStickers))
const taRef       = ref(null)
const fileInput   = ref(null)
const linkTimer   = ref(null)
const uploading   = ref(false)

const MAX_SIZE = 100 * 1024 * 1024 // 100MB

// ─── Slash-команды ───────────────────────────────────────────
// Реестр расширяемый: добавляешь объект — команда появляется в меню,
// а обработка живёт в send() (см. runCommandAfterSend).
// Неизвестные /что-то уходят обычным текстом — чтобы не ломать пути вроде /etc/hosts.
const COMMANDS = [
  {
    name:  'task',
    hint:  '<название>',
    desc:  'Отправить и сразу создать задачу на канбане',
    badge: 'Сообщение станет задачей на канбане',
    icon:  ListPlus
  },
  {
    name:  'poll',
    hint:  '<вопрос> ↵ <варианты>',
    desc:  'Создать опрос',
    badge: 'Опрос',
    icon:  ListChecks
  }
]

// Опрос: первая строка — вопрос, остальные — варианты. В одну строку можно через |
function parsePoll(arg) {
  const src = arg || ''
  const parts = (src.includes('\n') ? src.split('\n') : src.split('|')).map(s => s.trim()).filter(Boolean)
  return { question: parts[0] || '', options: [...new Set(parts.slice(1))] }
}
const pollMulti = ref(false)

const slashIndex     = ref(0)
const slashDismissed = ref(false)
// Меню видно, пока печатается само имя команды (до первого пробела)
const slashQuery   = computed(() => {
  const m = text.value.match(/^\/(\w*)$/)
  return m ? m[1].toLowerCase() : null
})
const slashMatches = computed(() =>
  slashQuery.value === null ? [] : COMMANDS.filter(c => c.name.startsWith(slashQuery.value))
)
const slashOpen = computed(() => !slashDismissed.value && slashMatches.value.length > 0)
watch(slashQuery, () => { slashIndex.value = 0; slashDismissed.value = false })

// ─── @упоминания ─────────────────────────────────────────────
const caret = ref(0)
function syncCaret() { caret.value = taRef.value?.selectionStart ?? text.value.length }
const mentionQuery = computed(() => {
  const m = text.value.slice(0, caret.value).match(/(^|\s)@([\p{L}\p{N}_.-]{0,30})$/u)
  return m ? m[2].toLowerCase() : null
})
const mentionIndex     = ref(0)
const mentionDismissed = ref(false)
const mentionMatches = computed(() => {
  const q = mentionQuery.value
  if (q === null) return []
  return store.users
    .filter(u => u.id !== store.user?.id && u.name?.toLowerCase().includes(q))
    .sort((a, b) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q))
    .slice(0, 6)
})
const mentionOpen = computed(() => !mentionDismissed.value && !slashOpen.value && mentionMatches.value.length > 0)
watch(mentionQuery, () => { mentionIndex.value = 0; mentionDismissed.value = false })
function isOnline(id) { return store.onlineList.some(o => o.userId === id) }
// Вставка из контекстного меню / профиля («Упомянуть»)
watch(() => store.composerInsert, ci => {
  if (!ci || (ci.parentId ?? null) !== (props.parentId ?? null)) return
  const ta = taRef.value
  const pos = ta && document.activeElement === ta ? ta.selectionStart : text.value.length
  const before = text.value.slice(0, pos), after = text.value.slice(pos)
  const sep = before.length && before[before.length - 1].trim() !== '' ? ' ' : ''
  text.value = before + sep + ci.text + after
  const np = (before + sep + ci.text).length
  nextTick(() => { ta?.focus(); ta?.setSelectionRange(np, np); caret.value = np })
})

function applyMention(u) {
  if (!u) return
  const pos = caret.value
  const before = text.value.slice(0, pos).replace(/@[\p{L}\p{N}_.-]*$/u, '@' + u.name + ' ')
  text.value = before + text.value.slice(pos)
  nextTick(() => {
    const ta = taRef.value
    if (!ta) return
    ta.focus()
    ta.setSelectionRange(before.length, before.length)
    caret.value = before.length
  })
}

// Команда уже введена целиком: "/task Купить домен"
const commandMatch = computed(() => {
  const m = text.value.match(/^\/(\w+)(\s[\s\S]*)?$/)
  if (!m || m[2] === undefined) return null
  const cmd = COMMANDS.find(c => c.name === m[1].toLowerCase())
  return cmd ? { cmd, arg: m[2].trim() } : null
})
const pollDraft = computed(() => parsePoll(commandMatch.value?.cmd.name === 'poll' ? commandMatch.value.arg : ''))

function applyCommand(c) {
  if (!c) return
  text.value = `/${c.name} `
  nextTick(() => {
    const ta = taRef.value
    if (!ta) return
    ta.focus()
    ta.selectionStart = ta.selectionEnd = text.value.length
    autoResize()
  })
}

let errorTimer = null
function showError(msg, ms = 4000) {
  fileError.value = msg
  clearTimeout(errorTimer)
  errorTimer = setTimeout(() => fileError.value = '', ms)
}

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
  if (mentionOpen.value) {
    const n = mentionMatches.value.length
    if (e.key === 'ArrowDown') { e.preventDefault(); mentionIndex.value = (mentionIndex.value + 1) % n; return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); mentionIndex.value = (mentionIndex.value - 1 + n) % n; return }
    if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
      e.preventDefault()
      applyMention(mentionMatches.value[mentionIndex.value])
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); mentionDismissed.value = true; return }
  }
  if (slashOpen.value) {
    const n = slashMatches.value.length
    if (e.key === 'ArrowDown') { e.preventDefault(); slashIndex.value = (slashIndex.value + 1) % n; return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); slashIndex.value = (slashIndex.value - 1 + n) % n; return }
    if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
      e.preventDefault()
      applyCommand(slashMatches.value[slashIndex.value])
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); slashDismissed.value = true; return }
  }
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
  const rawText = text.value
  const cmd     = commandMatch.value
  // Для /task в чат уходит только само название, без префикса
  let msgText = cmd ? cmd.arg : text.value.trim()
  let poll = null
  if (cmd?.cmd.name === 'poll') {
    const d = parsePoll(cmd.arg)
    if (pendingFile.value) { showError('К опросу нельзя прикрепить файл'); return }
    if (!d.question || d.options.length < 2) {
      showError('Опрос: вопрос и минимум 2 варианта — каждый с новой строки (Shift+Enter) или через |', 6000)
      return
    }
    if (d.options.length > 10) { showError('Максимум 10 вариантов'); return }
    msgText = d.question
    poll = { options: d.options, multi: pollMulti.value }
  }
  if (cmd && !msgText && !pendingFile.value) {
    showError('Добавь название: /task Купить домен')
    return
  }
  text.value = ''
  const meta = linkPreview.value ? { ...linkPreview.value } : null
  linkPreview.value = null
  await nextTick(); autoResize()

  let attachment = null
  if (pendingFile.value) {
    uploading.value = true
    try {
      attachment = await store.uploadFile(pendingFile.value._file)
    } catch {
      fileError.value = 'Не удалось загрузить файл'
      setTimeout(() => fileError.value = '', 4000)
      uploading.value = false
      // Восстанавливаем текст — раз файл не улетел, всё сообщение не отправлено
      text.value = rawText
      await nextTick(); autoResize()
      return
    } finally {
      clearFile()
      uploading.value = false
    }
  }

  let ack
  try {
    ack = await store.sendMessage({ text: msgText || null, attachment, linkMeta: meta, parentId: props.parentId, poll })
    if (poll) pollMulti.value = false
  } catch (e) {
    // Сообщение реально не сохранилось на сервере — не даём тексту молча
    // пропасть: возвращаем его в поле и показываем причину
    showError(e.message || 'Не удалось отправить сообщение', 5000)
    text.value = rawText
    await nextTick(); autoResize()
    return
  }
  await runCommandAfterSend(cmd, ack, msgText)
  taRef.value?.focus()
}

// Пост-обработка slash-команд: сообщение уже сохранено, теперь привязываем к нему действие
async function runCommandAfterSend(cmd, ack, msgText) {
  if (!cmd || !ack?.id) return
  if (cmd.cmd.name === 'task') {
    try {
      await store.createTaskFromMessage(ack.id, { title: msgText || null })
    } catch (e) {
      showError('Сообщение отправлено, но задачу создать не удалось: ' + (e.message || 'ошибка'), 6000)
    }
  }
}
</script>

<style scoped>
.sticker-toggle {
  flex-shrink: 0; width: 34px; height: 34px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted, #8a8f98); background: transparent; border: none; cursor: pointer;
}
.sticker-toggle:hover, .sticker-toggle.on { color: var(--accent, #7c6af7); background: var(--surface-2, rgba(255,255,255,.05)); }
.sticker-toggle:disabled { opacity: .4; cursor: default; }
.sticker-panel {
  position: absolute; right: 12px; bottom: calc(100% - 4px); z-index: 30;
  width: min(340px, calc(100% - 24px)); max-height: 320px; display: flex; flex-direction: column;
  background: var(--surface, #16161a); border: 1px solid var(--border, #2a2a30);
  border-radius: 12px; box-shadow: var(--shadow-lg, 0 10px 30px rgba(0,0,0,.4)); overflow: hidden;
}
.sticker-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px; font-size: 12px; font-weight: 600; border-bottom: 1px solid var(--border, #2a2a30);
}
.sticker-add { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; color: var(--accent, #7c6af7); font-weight: 500; }
.sticker-add input { display: none; }
.sticker-empty { padding: 24px 12px; text-align: center; font-size: 12px; color: var(--text-muted, #8a8f98); }
.sticker-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 8px; overflow-y: auto; }
.sticker-cell { position: relative; }
.sticker-btn {
  width: 100%; aspect-ratio: 1; padding: 4px; border: none; border-radius: 8px;
  background: transparent; cursor: pointer;
}
.sticker-btn:hover { background: var(--surface-2, rgba(255,255,255,.06)); }
.sticker-btn img { width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
.sticker-del {
  position: absolute; top: 0; right: 0; width: 16px; height: 16px; border-radius: 50%;
  display: none; align-items: center; justify-content: center; border: none; cursor: pointer;
  background: var(--danger, #e5484d); color: #fff;
}
.sticker-cell:hover .sticker-del { display: flex; }

.input-area {
  position: relative;
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

/* ── Slash-меню ── */
.mm-avatar {
  position: relative; width: 24px; height: 24px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  font-size: 12px;
}
.mm-online {
  position: absolute; right: -1px; bottom: -1px; width: 8px; height: 8px; border-radius: 50%;
  background: var(--success, #22c55e); box-shadow: 0 0 0 2px var(--surface);
}
.mention-menu .slash-item { grid-template-columns: auto 1fr; }
.slash-menu {
  position: absolute; z-index: 30;
  left: var(--space-5); right: var(--space-5); bottom: calc(100% - 2px);
  max-width: 460px;
  padding: 6px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-md);
  transform-origin: bottom left;
}
.slash-head {
  padding: 4px 8px 6px; font-size: 10px; font-weight: 700;
  letter-spacing: .06em; text-transform: uppercase; color: var(--text-faint);
}
.slash-item {
  width: 100%; display: grid; grid-template-columns: 26px auto 1fr; align-items: center; gap: 8px;
  padding: 6px 8px; border-radius: var(--radius-md); text-align: left;
  color: var(--text); font-size: var(--text-sm);
  transition: background var(--dur-fast, .15s) var(--ease-out, ease);
}
.slash-item.active { background: var(--accent-soft); }
.slash-ic {
  width: 26px; height: 26px; border-radius: var(--radius-md);
  display: flex; align-items: center; justify-content: center;
  background: var(--surface-3); color: var(--accent);
  transition: transform var(--dur, .25s) var(--ease-spring, ease);
}
.slash-item.active .slash-ic { transform: scale(1.08); }
.slash-name { font-weight: 700; white-space: nowrap; }
.slash-arg  { font-weight: 400; color: var(--text-faint); }
.slash-desc { color: var(--text-muted); font-size: var(--text-xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.slash-foot { padding: 6px 8px 2px; font-size: 10px; color: var(--text-faint); border-top: 1px solid var(--divider); margin-top: 4px; }

.cmd-badge {
  display: inline-flex; align-items: center; gap: 6px;
  margin-bottom: var(--space-2); padding: 3px 10px;
  border-radius: 999px; background: var(--accent-soft); color: var(--accent);
  font-size: var(--text-xs); font-weight: 600;
}
.cmd-warn { color: var(--text-muted); font-weight: 400; }
.cmd-toggle {
  margin-left: 4px; padding: 1px 8px;
  border-radius: 999px; border: 1px solid color-mix(in oklab, var(--accent) 40%, transparent);
  color: var(--accent); font-size: inherit; font-weight: 500;
  transition: background .15s ease, color .15s ease;
}
.cmd-toggle.on { background: var(--accent); color: #fff; }

.slash-pop-enter-active { transition: opacity var(--dur-fast, .15s) var(--ease-out, ease), transform var(--dur, .25s) var(--ease-spring, ease); }
.slash-pop-leave-active { transition: opacity var(--dur-fast, .15s) ease, transform var(--dur-fast, .15s) ease; }
.slash-pop-enter-from, .slash-pop-leave-to { opacity: 0; transform: translateY(6px) scale(.97); }
</style>