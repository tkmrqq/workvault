import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { io } from 'socket.io-client'
import { installAuthFetch } from '@/lib/authFetch'

const BASE = window.electronAPI?.serverUrl || ''

function resolveUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${BASE}${url}`
}

const API = import.meta.env.VITE_API_URL || ''

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

    socket = io(API || window.location.origin, {
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

    socket.on('message:new', msg => { _pushMessage(msg) })

    socket.on('message:edited', ({ messageId, text }) => {
      _patchMessage(messageId, m => ({ ...m, text, edited: 1 }))
    })

    socket.on('message:deleted', ({ messageId }) => { _removeMessage(messageId) })

    socket.on('reaction:update', ({ messageId, reactions }) => {
      _patchMessage(messageId, m => ({ ...m, reactions }))
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
    }
    if (chId !== activeChId.value && user.value?.id !== msg.user_id) {
      const body = msg.text || (msg.attachment ? '📎 файл' : '')
      if (window.electronAPI) {
        window.electronAPI.notify?.(msg.user_name, body)
      } else if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(msg.user_name, { body })
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
  }

  function _removeMessage(id) {
    for (const chId in messages.value) {
      messages.value[chId] = messages.value[chId].filter(m => m.id !== id)
    }
  }

  // ── API ────────────────────────────────────────────────
  async function fetchFolders() {
    const res = await fetch(`${API}/api/folders`)
    folders.value = await res.json()
  }

  async function setChannel(chId) {
    activeChId.value = chId
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

  async function sendMessage({ text, attachment, linkMeta }) {
    if (!activeChId.value || !user.value) return
    socket?.emit('message:send', {
      channelId:  activeChId.value,
      text:       text || null,
      attachment: attachment || null,
      linkMeta:   linkMeta || null
    })
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

  function deleteMessage(messageId) {
    socket?.emit('message:delete', {
      messageId,
      channelId: activeChId.value
    })
  }

  function toggleReaction(messageId, emoji) {
    socket?.emit('reaction:toggle', {
      messageId,
      emoji,
      channelId: activeChId.value
    })
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
    user, sessionChecked, theme, folders, activeChId, activeChannel, allChannels,
    activeMessages, filteredActiveMessages, activeAttachmentFilter, setAttachmentFilter,
    hasMore, onlineList, typingNames,
    fetchUsers, checkSession, register, login, setPassword, logout, toggleTheme, getSocket,
    fetchFolders, setChannel, loadMore,
    sendMessage, uploadFile, unfurlUrl,
    editMessage, deleteMessage, toggleReaction, sendTyping
  }
})