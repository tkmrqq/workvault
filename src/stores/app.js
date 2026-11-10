import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { io } from 'socket.io-client'
import { installAuthFetch } from '@/lib/authFetch'
import { getApiBase } from '@/lib/apiBase'

const API = getApiBase()

function resolveUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  const base = getApiBase()
  return base ? `${base}${url}` : url
}

const messageEnterIds = ref({})
function markMessageEnter(id) {
  messageEnterIds.value = { ...messageEnterIds.value, [id]: true }
  setTimeout(() => {
    const next = { ...messageEnterIds.value }
    delete next[id]
    messageEnterIds.value = next
  }, 180)
}
function isMessageEntering(id) {
  return !!messageEnterIds.value[id]
}

export const useAppStore = defineStore('app', () => {
  // ── State ──────────────────────────────────────────────
  // user больше не хранится в localStorage — источник правды теперь
  // httpOnly-кука на сервере (JS её даже прочитать не может). При старте
  // приложения сессию восстанавливаем через checkSession() → GET /api/auth/me.
  const user          = ref(null)
  const sessionChecked = ref(false) // true после первой проверки — используется роут-гардом
  const theme       = ref(localStorage.getItem('wv-theme') || 'dark')
  const folders     = ref([])
  const activeChId  = ref(null)
  const messages    = ref({})
  const hasMore     = ref({})
  const onlineList  = ref([])
  const typingMap   = ref({})
  // Непрочитанные по каналам: { [channelId]: count }. Сокет-комнаты есть только
  // у активного канала, поэтому сервер шлёт всем лёгкое channel:activity.
  const unread      = ref({})
  // Переход «к исходному сообщению» из карточки: MessageList ждёт, пока канал
  // загрузится, скроллит к сообщению и подсвечивает его (flashMsgId)
  const focusTarget = ref(null) // { channelId, messageId, replyId? }

  // ── Пользователи и @упоминания ──
  const users = ref([])
  const usersById = computed(() => {
    const m = {}
    for (const u of users.value) m[u.id] = u
    return m
  })
  function statusActive(u) {
    if (!u || !(u.status_text || u.status_emoji)) return false
    return !u.status_until || u.status_until * 1000 > Date.now()
  }
  const myStatusLine = computed(() => statusActive(user.value)
    ? [user.value.status_emoji, user.value.status_text].filter(Boolean).join(' ')
    : '')

  // Вставка текста в поле ввода извне (контекстное меню, профиль).
  // parentId: null — основное поле канала, id — поле в панели треда.
  const composerInsert = ref(null)
  function insertIntoComposer(text, parentId = null) {
    composerInsert.value = { text, parentId, nonce: Date.now() + Math.random() }
  }
  async function loadUsers(force = false) {
    if (users.value.length && !force) return users.value
    try { users.value = await fetchUsers() } catch { }
    return users.value
  }
  const _escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const _escRe   = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Ищем @Имя в уже экранированном HTML; длинные имена первыми, чтобы
  // «@Иван Петров» не подсветилось как «@Иван» + « Петров»
  const mentionRegex = computed(() => {
    const names = users.value.map(u => u.name).filter(Boolean)
      .map(_escHtml).sort((a, b) => b.length - a.length).map(_escRe)
    if (!names.length) return null
    return new RegExp(String.raw`(^|[\s(>])@(` + names.join('|') + String.raw`)(?![\p{L}\p{N}_])`, 'gu')
  })
  const myMentionName = computed(() => user.value?.name ? _escHtml(user.value.name) : '')
  function mentionsMe(text) {
    const n = user.value?.name
    if (!text || !n || !text.includes('@')) return false
    return new RegExp(String.raw`(^|[\s(])@` + _escRe(n) + String.raw`(?![\p{L}\p{N}_])`, 'u').test(text)
  }
  function _notify(title, body) {
    if (window.electronAPI) window.electronAPI.notify?.(title, body)
    else if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body })
  }
  // Открытый тред (правая панель в чате)
  const threadParentId = ref(null)
  const threadParent   = ref(null)
  const threadReplies  = ref([])
  const threadLoading  = ref(false)
  const threadFocusId  = ref(null) // к какому ответу прокрутить после загрузки
  let threadReq        = 0
  const flashMsgId  = ref(null)
  let flashTimer    = null
  // Фильтр вложений — свой на каждый канал, по умолчанию 'all'
  const attachmentFilters = ref(JSON.parse(localStorage.getItem('wv-attach-filters') || '{}'))
  let socket        = null
  let typingTimeout = null
  let refreshTimer  = null

  installAuthFetch(API, () => {
    // Refresh не удался — сессия реально мертва (истёк refresh-токен,
    // logout с другого устройства и т.п.). Тихо разлогиниваем на фронте,
    // роут-гард сам уведёт на /, как только увидит user === null.
    if (user.value) logout()
  })

  // ── Computed ───────────────────────────────────────────
  const allChannels    = computed(() => folders.value.flatMap(f => f.channels || []))
  const activeChannel  = computed(() => allChannels.value.find(c => c.id === activeChId.value))
  const activeMessages = computed(() => messages.value[activeChId.value] || [])
  const activeAttachmentFilter = computed(() => attachmentFilters.value[activeChId.value] || 'all')
  const filteredActiveMessages = computed(() => {
    const filter = activeAttachmentFilter.value
    if (filter === 'all') return activeMessages.value
    return activeMessages.value.filter(m => {
      if (filter === 'image') return m.attachment?.isImage
      if (filter === 'document') return m.attachment && !m.attachment.isImage
      if (filter === 'link') return !!m.link_meta
      return true
    })
  })
  const typingNames    = computed(() => {
    const ch = typingMap.value[activeChId.value]
    return ch ? Object.keys(ch) : []
  })

  function setAttachmentFilter(chId, filter) {
    attachmentFilters.value = { ...attachmentFilters.value, [chId]: filter }
    localStorage.setItem('wv-attach-filters', JSON.stringify(attachmentFilters.value))
  }

  // ── Theme ──────────────────────────────────────────────
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t)
    document.getElementById('app')?.setAttribute('data-theme', t)
  }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    localStorage.setItem('wv-theme', theme.value)
    applyTheme(theme.value)
  }

  // Применяем тему при старте
  applyTheme(theme.value)

  // ── Auth ───────────────────────────────────────────────
  async function fetchUsers() {
    const res = await fetch(`${API}/api/users`)
    return res.json()
  }

  // Проверяем текущую сессию по httpOnly-куке — вызывается один раз при
  // старте приложения (main.js, перед первым рендером роутов)
  async function checkSession() {
    try {
      const res = await fetch(`${API}/api/auth/me`, { credentials: 'include' })
      if (res.ok) {
        user.value = await res.json()
        _afterLogin()
      }
    } catch {}
    sessionChecked.value = true
  }

  async function register(name, password, avatar, color) {
    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, password, avatar, color })
    })
    const data = await res.json()
    if (!res.ok) throw data
    user.value = data
    _afterLogin()
    return data
  }

  // Возвращает { ok: true, user } либо { ok: false, needsPasswordSetup: true }
  // для старых аккаунтов без пароля — бросает только на реальную ошибку
  // (неверный пароль, rate limit и т.п.)
  async function login(name, password) {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, password })
    })
    const data = await res.json()
    if (!res.ok) {
      if (data.code === 'NEEDS_PASSWORD_SETUP') return { ok: false, needsPasswordSetup: true }
      throw data
    }
    user.value = data
    _afterLogin()
    return { ok: true, user: data }
  }

  async function setPassword(name, password) {
    const res = await fetch(`${API}/api/auth/set-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, password })
    })
    const data = await res.json()
    if (!res.ok) throw data
    user.value = data
    _afterLogin()
    return data
  }

  function _afterLogin() {
    initSocket()
    // Access-токен живёт 15 мин — обновляем каждые 10, чтобы сессия не
    // рвалась посреди работы; 401-retry в authFetch — подстраховка
    // на случай, если запрос всё же попал в узкое окно между обновлениями
    clearInterval(refreshTimer)
    refreshTimer = setInterval(() => {
      fetch(`${API}/api/auth/refresh`, { method: 'POST', credentials: 'include' }).catch(() => {})
    }, 10 * 60 * 1000)
  }

  async function logout() {
    try {
      await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' })
    } catch {}
    user.value = null
    clearInterval(refreshTimer)
    socket?.disconnect()
    socket = null
  }

  // ── Socket ─────────────────────────────────────────────
  function initSocket() {
    if (socket?.connected) return

    const socketOrigin = getApiBase() || window.location.origin
    socket = io(socketOrigin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true // личность теперь проверяется по httpOnly-куке на хендшейке, не по emit('auth', ...)
    })

    socket.on('connect', () => {
      if (activeChId.value) {
        socket.emit('channel:join', { channelId: activeChId.value })
      }
    })

    socket.on('connect_error', (err) => {
      // Хендшейк отклонён (протухшая кука) — ничего специально не делаем,
      // socket.io сам ретраит с backoff, а очередная попытка подхватит
      // уже свежую куку после ближайшего фонового refresh (см. _afterLogin)
      if (err.message === 'unauthorized') console.warn('Socket: сессия истекла, жду обновления токена...')
    })

    socket.on('online:update', list => { onlineList.value = list })
    socket.on('stickers:update', () => { if (stickersLoaded) loadStickers(true) })

    socket.on('message:new', msg => { _pushMessage(msg) })

    // Новый ответ в треде — показываем, только если этот тред сейчас открыт;
    // счётчик под корнем обновляется отдельным message:thread
    socket.on('thread:reply', msg => {
      if (msg.user_id !== user.value?.id && mentionsMe(msg.text) && (document.hidden || msg.parent_id !== threadParentId.value)) {
        _notify(`${msg.user_name} упоминает вас в треде`, msg.text || '')
      }
      if (msg.parent_id !== threadParentId.value) return
      if (!threadReplies.value.find(m => m.id === msg.id)) {
        threadReplies.value = [...threadReplies.value, msg]
        markMessageEnter(msg.id)
      }
    })

    socket.on('message:thread', ({ messageId, ...meta }) => {
      _patchMessage(messageId, m => ({ ...m, ...meta }))
    })

    socket.on('message:edited', ({ messageId, text }) => {
      _patchMessage(messageId, m => ({ ...m, text, edited: 1 }))
    })

    socket.on('message:deleted', ({ messageId }) => { _removeMessage(messageId) })

    socket.on('channel:activity', ({ channelId, userId } = {}) => {
      if (!channelId || userId === user.value?.id || channelId === activeChId.value) return
      unread.value = { ...unread.value, [channelId]: (unread.value[channelId] || 0) + 1 }
    })

    socket.on('reaction:update', ({ messageId, reactions }) => {
      _patchMessage(messageId, m => ({ ...m, reactions }))
    })

    socket.on('poll:update', ({ messageId, poll }) => {
      _patchMessage(messageId, m => ({ ...m, poll }))
    })

    // Задача, привязанная к сообщению, создана / переехала в другую колонку /
    // ушла в архив / удалена (task === null)
    socket.on('message:task', ({ messageId, task }) => {
      _patchMessage(messageId, m => ({ ...m, task: task || null }))
    })

    socket.on('user:updated', u => {
      if (!u?.id) return
      users.value = users.value.some(x => x.id === u.id)
        ? users.value.map(x => x.id === u.id ? { ...x, ...u } : x)
        : [...users.value, u]
      if (user.value?.id === u.id) user.value = { ...user.value, ...u }
      const patch = m => m.user_id === u.id ? { ...m, user_name: u.name, user_avatar: u.avatar, user_color: u.color } : m
      for (const chId of Object.keys(messages.value)) {
        if (messages.value[chId].some(m => m.user_id === u.id)) messages.value[chId] = messages.value[chId].map(patch)
      }
      if (threadReplies.value?.some?.(m => m.user_id === u.id)) threadReplies.value = threadReplies.value.map(patch)
      if (threadParent.value?.user_id === u.id) threadParent.value = patch(threadParent.value)
    })

    socket.on('typing:update', ({ userName, typing }) => {
      if (!activeChId.value) return
      if (!typingMap.value[activeChId.value]) typingMap.value[activeChId.value] = {}
      const ch = typingMap.value[activeChId.value]
      if (typing) {
        clearTimeout(ch[userName])
        ch[userName] = setTimeout(() => {
          delete ch[userName]
          typingMap.value = { ...typingMap.value }
        }, 3000)
      } else {
        clearTimeout(ch[userName])
        delete ch[userName]
      }
      typingMap.value = { ...typingMap.value }
    })
  }

  // ── Message helpers ────────────────────────────────────
  function _pushMessage(msg) {
    const chId = msg.channel_id
    if (!messages.value[chId]) messages.value[chId] = []
    if (!messages.value[chId].find(m => m.id === msg.id)) {
      messages.value[chId].push(msg)
      if (chId === activeChId.value) markMessageEnter(msg.id)
    }
    if (user.value?.id !== msg.user_id) {
      const mentioned = mentionsMe(msg.text)
      // Чужой канал — как раньше; активный — только если упомянули, а окно свёрнуто
      if (chId !== activeChId.value || (mentioned && document.hidden)) {
        const body = msg.text || (msg.attachment ? '📎 файл' : '')
        _notify(mentioned ? `${msg.user_name} упоминает вас` : msg.user_name, body)
      }
    }
  }

  function _patchMessage(id, fn) {
    for (const chId in messages.value) {
      const idx = messages.value[chId].findIndex(m => m.id === id)
      if (idx !== -1) {
        messages.value[chId] = messages.value[chId].map((m, i) => i === idx ? fn(m) : m)
        break
      }
    }
    // То же сообщение может быть в открытом треде (корень или ответ)
    const ti = threadReplies.value.findIndex(m => m.id === id)
    if (ti !== -1) threadReplies.value = threadReplies.value.map((m, i) => i === ti ? fn(m) : m)
    if (threadParent.value?.id === id) threadParent.value = fn(threadParent.value)
  }

  function _removeMessage(id) {
    for (const chId in messages.value) {
      messages.value[chId] = messages.value[chId].filter(m => m.id !== id)
    }
    if (threadParentId.value === id) closeThread()
    else threadReplies.value = threadReplies.value.filter(m => m.id !== id)
  }

  // ── Треды ─────────────────────────────────────────────────
  async function openThread(parentId, focusReplyId = null) {
    parentId = Number(parentId)
    threadFocusId.value = focusReplyId ? Number(focusReplyId) : null
    if (threadParentId.value === parentId && threadParent.value && !threadLoading.value) return
    const req = ++threadReq
    threadParentId.value = parentId
    // Пока грузим — показываем корень из уже загруженной ленты, чтобы панель не мигала
    threadParent.value  = (messages.value[activeChId.value] || []).find(m => m.id === parentId) || null
    threadReplies.value = []
    threadLoading.value = true
    try {
      const res = await fetch(`${API}/api/messages/${parentId}/thread`)
      if (!res.ok) throw new Error('thread load failed')
      const data = await res.json()
      if (req !== threadReq) return
      threadParentId.value = data.parent.id
      threadParent.value   = data.parent
      threadReplies.value  = data.replies
    } catch {
      if (req === threadReq) closeThread()
    } finally {
      if (req === threadReq) threadLoading.value = false
    }
  }

  function closeThread() {
    threadReq++
    threadParentId.value = null
    threadParent.value   = null
    threadReplies.value  = []
    threadLoading.value  = false
    threadFocusId.value  = null
  }

  // ── API ────────────────────────────────────────────────
  async function fetchFolders() {
    const res = await fetch(`${API}/api/folders`)
    folders.value = await res.json()
  }

  async function setChannel(chId) {
    if (threadParentId.value && chId !== activeChId.value) closeThread()
    activeChId.value = chId
    if (unread.value[chId]) {
      const { [chId]: _, ...rest } = unread.value
      unread.value = rest
    }
    socket?.emit('channel:join', { channelId: chId })
    if (!messages.value[chId]) {
      const res = await fetch(`${API}/api/messages/${chId}`)
      const data = await res.json()
      messages.value[chId] = data.messages
      hasMore.value[chId] = data.hasMore
    }
  }

  async function loadMore(chId) {
    const list = messages.value[chId] || []
    if (!list.length) {
      hasMore.value[chId] = false
      return false
    }
    const before = list[0].id
    const res = await fetch(`${API}/api/messages/${chId}?before=${before}`)
    const data = await res.json()
    hasMore.value[chId] = data.hasMore
    if (data.messages.length) {
      messages.value[chId] = [...data.messages, ...list]
      return true
    }
    return false
  }

  // Возвращает промис, который резолвится по ack от сервера — раньше здесь было
  // "выстрелил и забыл": если сервер не смог сохранить сообщение (протухшая
  // сессия, невалидный channelId и т.п.), фронт об этом никак не узнавал —
  // текст уже очищался в MessageInput, и сообщение просто исчезало без следа.
  async function sendMessage({ text, attachment, linkMeta, parentId = null, poll = null, stickerId = null }) {
    if (!activeChId.value || !user.value) throw new Error('Нет активного канала')
    if (!socket?.connected) throw new Error('Нет соединения с сервером — сообщение не отправлено')
    return new Promise((resolve, reject) => {
      socket.timeout(8000).emit('message:send', {
        channelId:  activeChId.value,
        text:       text || null,
        attachment: attachment || null,
        linkMeta:   linkMeta || null,
        parentId:   parentId || null,
        poll:       poll || null,
        stickerId:  stickerId ?? null
      }, (err, ack) => {
        // err — таймаут/дисконнект самого socket.io (см. .timeout() выше)
        if (err) return reject(new Error('Сервер не ответил — проверь соединение'))
        if (!ack?.ok) return reject(new Error(ack?.error || 'Не удалось отправить сообщение'))
        resolve(ack)
      })
    })
  }

  // ─── Стикеры ──────────────────────────────────────────────
  const stickers = ref([])
  let stickersLoaded = false
  async function loadStickers(force = false) {
    if (stickersLoaded && !force) return stickers.value
    const res = await fetch(`${API}/api/stickers`, { credentials: 'include' })
    if (res.ok) { stickers.value = await res.json(); stickersLoaded = true }
    return stickers.value
  }
  async function uploadSticker(file, emoji = '') {
    const fd = new FormData()
    fd.append('file', file)
    if (emoji) fd.append('emoji', emoji)
    const res = await fetch(`${API}/api/stickers`, { method: 'POST', body: fd, credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Не удалось загрузить стикер')
    await loadStickers(true)
    return data
  }
  async function deleteSticker(id) {
    const res = await fetch(`${API}/api/stickers/${id}`, { method: 'DELETE', credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Не удалось удалить стикер')
    stickers.value = stickers.value.filter(s => s.id !== id) // сразу из UI
    await loadStickers(true)
  }
  function sendSticker(sticker, parentId = null) {
    return sendMessage({ stickerId: sticker.id, parentId })
  }

  async function uploadFile(file) {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`${API}/api/upload`, { method: 'POST', body: fd })
    return res.json()
  }

  async function unfurlUrl(url) {
    const res = await fetch(`${API}/api/unfurl`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url })
    })
    return res.json()
  }

  function editMessage(messageId, text) {
    socket?.emit('message:edit', {
      messageId,
      text,
      channelId: activeChId.value
    })
  }

  // Убираем сообщение локально сразу по ack — не ждём эха message:deleted
  // из комнаты канала (его может не быть, если сокет переподключился и ещё
  // не вернулся в комнату, или сообщение открыто в треде другого канала)
  function deleteMessage(messageId) {
    if (!socket?.connected) return Promise.resolve(false)
    return new Promise(resolve => {
      socket.timeout(8000).emit('message:delete', {
        messageId,
        channelId: activeChId.value
      }, (err, ack) => {
        if (!err && ack?.ok) { _removeMessage(messageId); resolve(true) }
        else resolve(false)
      })
    })
  }

  function votePoll(messageId, option) {
    socket?.emit('poll:vote', { messageId, option })
  }

  function toggleReaction(messageId, emoji) {
    socket?.emit('reaction:toggle', {
      messageId,
      emoji,
      channelId: activeChId.value
    })
  }

  // Сообщение → задача на канбане. Зона — последняя открытая на канбане
  // (KanbanView кладёт её в localStorage), колонка — первая в этой зоне.
  async function createTaskFromMessage(messageId, { title } = {}) {
    const workspaceId = Number(localStorage.getItem('wv-kanban-workspace')) || null
    const res = await fetch(`${API}/api/messages/${messageId}/task`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title: title || null, workspace_id: workspaceId })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Не удалось создать задачу')
    const { existed, ...task } = data
    _patchMessage(messageId, m => ({ ...m, task }))
    return data
  }

  // replyId — если цель внутри треда: скроллим к корню и открываем тред на нужном ответе
  function jumpToMessage(channelId, messageId, replyId = null) {
    focusTarget.value = { channelId: Number(channelId), messageId: Number(messageId), replyId: replyId ? Number(replyId) : null }
  }

  function flashMessage(id) {
    flashMsgId.value = id
    clearTimeout(flashTimer)
    flashTimer = setTimeout(() => { flashMsgId.value = null }, 2200)
  }

  function getSocket() { return socket }

  function sendTyping() {
    if (!activeChId.value || !user.value) return
    socket?.emit('typing:start', { channelId: activeChId.value })
    clearTimeout(typingTimeout)
    typingTimeout = setTimeout(() => {
      socket?.emit('typing:stop', { channelId: activeChId.value })
    }, 2000)
  }

  // Сессию восстанавливаем через checkSession() из main.js (роут-гард ждёт
  // sessionChecked), а не сразу здесь — иначе будет гонка с установкой роутов

  return {
    stickers, loadStickers, uploadSticker, deleteSticker, sendSticker,
    users, loadUsers, mentionRegex, myMentionName, mentionsMe,
    usersById, statusActive, myStatusLine, composerInsert, insertIntoComposer,
    user, sessionChecked, theme, folders, activeChId, activeChannel, allChannels,
    activeMessages, filteredActiveMessages, activeAttachmentFilter, setAttachmentFilter,
    hasMore, onlineList, typingNames,
    fetchUsers, checkSession, register, login, setPassword, logout, toggleTheme, getSocket,
    fetchFolders, setChannel, loadMore,
    sendMessage, uploadFile, unfurlUrl,
    unread,
    editMessage, deleteMessage, toggleReaction, votePoll, sendTyping,
    isMessageEntering,
    createTaskFromMessage, focusTarget, jumpToMessage, flashMsgId, flashMessage,
    threadParentId, threadParent, threadReplies, threadLoading, threadFocusId, openThread, closeThread
  }
})