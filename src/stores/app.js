import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { io } from 'socket.io-client'

const BASE = window.electronAPI?.serverUrl || ''

function resolveUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${BASE}${url}`
}

const API = import.meta.env.VITE_API_URL || ''

export const useAppStore = defineStore('app', () => {
  // ── State ──────────────────────────────────────────────
  const user        = ref(JSON.parse(localStorage.getItem('wv-user') || 'null'))
  const theme       = ref(localStorage.getItem('wv-theme') || 'dark')
  const folders     = ref([])
  const activeChId  = ref(null)
  const messages    = ref({})
  const onlineList  = ref([])
  const typingMap   = ref({})
  let socket        = null
  let typingTimeout = null

  // ── Computed ───────────────────────────────────────────
  const allChannels    = computed(() => folders.value.flatMap(f => f.channels || []))
  const activeChannel  = computed(() => allChannels.value.find(c => c.id === activeChId.value))
  const activeMessages = computed(() => messages.value[activeChId.value] || [])
  const typingNames    = computed(() => {
    const ch = typingMap.value[activeChId.value]
    return ch ? Object.keys(ch) : []
  })

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

  // ── Users ──────────────────────────────────────────────
  async function fetchUsers() {
    const res = await fetch(`${API}/api/users`)
    return res.json()
  }

  async function login(name, avatar, color) {
    const res = await fetch(`${API}/api/users`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, avatar, color })
    })
    if (!res.ok) throw await res.json()
    const u = await res.json()
    setUser(u)
    return u
  }

  function setUser(u) {
    user.value = u
    localStorage.setItem('wv-user', JSON.stringify(u))
    initSocket()
    return u
  }

  function logout() {
    user.value = null
    localStorage.removeItem('wv-user')
    socket?.disconnect()
    socket = null
  }

  // ── Socket ─────────────────────────────────────────────
  function initSocket() {
    if (socket?.connected) return

    socket = io(API || window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling']
    })

    socket.on('connect', () => {
      if (user.value) {
        socket.emit('auth', { userId: user.value.id })
        if (activeChId.value) {
          socket.emit('channel:join', { channelId: activeChId.value })
        }
      }
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

    socket.on('message:crm', ({ messageId, crm_done }) => {
      _patchMessage(messageId, m => ({ ...m, crm_done }))
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
      messages.value[chId] = await res.json()
    }
  }

  async function loadMore(chId) {
    const list = messages.value[chId] || []
    if (!list.length) return false
    const before = list[0].id
    const res = await fetch(`${API}/api/messages/${chId}?before=${before}`)
    const older = await res.json()
    if (older.length) {
      messages.value[chId] = [...older, ...list]
      return true
    }
    return false
  }

  async function sendMessage({ text, attachment, linkMeta }) {
    if (!activeChId.value || !user.value) return
    socket?.emit('message:send', {
      channelId:  activeChId.value,
      userId:     user.value.id,
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
      userId:    user.value?.id,
      text,
      channelId: activeChId.value
    })
  }

  function deleteMessage(messageId) {
    socket?.emit('message:delete', {
      messageId,
      userId:    user.value?.id,
      channelId: activeChId.value
    })
  }

  function toggleReaction(messageId, emoji) {
    socket?.emit('reaction:toggle', {
      messageId,
      userId:    user.value?.id,
      emoji,
      channelId: activeChId.value
    })
  }

  async function toggleCrm(messageId) {
    await fetch(`${API}/api/messages/${messageId}/crm`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ channelId: activeChId.value })
    })
  }

  function sendTyping() {
    if (!activeChId.value || !user.value) return
    socket?.emit('typing:start', { channelId: activeChId.value, userName: user.value.name })
    clearTimeout(typingTimeout)
    typingTimeout = setTimeout(() => {
      socket?.emit('typing:stop', { channelId: activeChId.value, userName: user.value.name })
    }, 2000)
  }

  // Восстанавливаем сокет если юзер уже залогинен
  if (user.value) initSocket()

  return {
    user, theme, folders, activeChId, activeChannel, allChannels,
    activeMessages, onlineList, typingNames,
    fetchUsers, login, setUser, logout, toggleTheme,
    fetchFolders, setChannel, loadMore,
    sendMessage, uploadFile, unfurlUrl,
    editMessage, deleteMessage, toggleReaction, toggleCrm, sendTyping
  }
})
