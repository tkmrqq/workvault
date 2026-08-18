const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const ogs = require('open-graph-scraper')

const config = require('./config')

const db = require('./db')

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
})

app.use(cors())
app.use(express.json())

// ─── UPLOADS ─────────────────────────────────────────────
const UPLOADS_DIR = config.UPLOADS_DIR
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`)
  }
})

const ALLOWED_MIME = /^(image\/(jpeg|jpg|png|gif|webp)|video\/(mp4|webm|quicktime|x-matroska)|application\/(pdf|zip|x-zip-compressed|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)|text\/plain)$/
const ALLOWED_EXT  = /\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|mkv|pdf|zip|txt|doc|docx)$/i

const upload = multer({
  storage,
  limits: { fileSize: config.MAX_FILE_BYTES }, // из MAX_FILE_MB в .env, по умолчанию 100MB
  fileFilter: (req, file, cb) => {
    // Запрет папок — браузер шлёт папки как пустые файлы с mime = ''
    // или webkitRelativePath содержит /
    if (file.originalname.includes('/') || file.originalname.includes('\\\\')) {
      return cb(new Error('Папки не поддерживаются'), false)
    }
    const mimeOk = ALLOWED_MIME.test(file.mimetype)
    const extOk  = ALLOWED_EXT.test(path.extname(file.originalname).toLowerCase())
    if (!mimeOk && !extOk) {
      return cb(new Error(`Тип файла не поддерживается: ${file.mimetype}`), false)
    }
    cb(null, true)
  }
})

app.get('/health', (_, res) => res.json({ ok: true, uptime: process.uptime() }))
// Graceful shutdown — docker stop шлёт SIGTERM, даём 5 сек завершить запросы
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...')
  server.close(() => {
    db.close()          // закрываем SQLite
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 5000)
})

app.use('/uploads', express.static(UPLOADS_DIR))

// ─── ХЕЛПЕР — строим полное сообщение из строки БД ───────
// db.getMessages уже парсит attachment и link_meta.
// Этот хелпер только добирает реакции.
function withReactions(msg) {
  return { ...msg, reactions: db.getReactions(msg.id) }
}

const DOWNLOADS_DIR = path.join(__dirname, '../data/downloads')
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true })
app.use('/downloads', express.static(DOWNLOADS_DIR))

// ─── LATEST RELEASE ───────────────────────────────────────
app.get('/api/latest-release', (_, res) => {
  try {
    const files = fs.readdirSync(DOWNLOADS_DIR)
      .filter(f => f.endsWith('.exe'))
      .sort()
      .reverse()
    if (!files.length) return res.status(404).json({ error: 'Нет релизов' })
    res.json({ filename: files[0], url: `/downloads/${encodeURIComponent(files[0])}` })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── REST API ─────────────────────────────────────────────

app.get('/api/users', (_, res) => res.json(db.getUsers()))

app.post('/api/users', (req, res, next) => {
  const { name, avatar, color } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Имя обязательно' })

  const normalizedName = name.trim()
  const existing = db.getUserByName(normalizedName)
  if (existing) {
    return res.status(409).json({ error: 'Пользователь с таким именем уже есть', user: existing })
  }

  try {
    const result = db.createUser(normalizedName, avatar || '🧑', color || '#7c6af7')
    res.json(db.getUserById(result.lastInsertRowid))
  } catch (e) {
    if (String(e.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: 'Пользователь с таким именем уже есть' })
    }
    next(e)
  }
})

app.post('/api/users/:id/set-pin', (req, res) => {
  const { pin } = req.body
  if (!/^\d{4}$/.test(String(pin || ''))) {
    return res.status(400).json({ error: 'PIN должен состоять из 4 цифр' })
  }
  const result = db.setUserPin(req.params.id, pin)
  if (!result.changes) return res.status(404).json({ error: 'Не найдено' })
  res.json({ ok: true })
})

app.post('/api/users/:id/verify-pin', (req, res) => {
  const { pin } = req.body
  if (!/^\d{4}$/.test(String(pin || ''))) return res.json({ ok: false })
  res.json({ ok: db.verifyUserPin(req.params.id, pin) })
})

app.get('/api/folders', (_, res) => res.json(db.getFolders()))

// ─── СООБЩЕНИЯ ────────────────────────────────────────────
// db.getMessages уже делает JSON.parse для attachment и link_meta
// поэтому здесь просто добавляем реакции и отдаём
app.get('/api/messages/:channelId', (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50
    const messages = db.getMessages(
      Number(req.params.channelId),
      limit,
      req.query.before ? Number(req.query.before) : null
    )
    res.json({
      messages: messages.map(withReactions),
      hasMore:  messages.length === limit
    })
  } catch (e) {
    console.error('getMessages error:', e)
    res.status(500).json({ error: e.message })
  }
})

// ─── UPLOAD ───────────────────────────────────────────────
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не получен' })
  res.json({
    url:     `/uploads/${req.file.filename}`,
    name:    req.file.originalname,
    size:    req.file.size,
    mime:    req.file.mimetype,
    isImage: req.file.mimetype.startsWith('image/')
  })
})

// ─── UNFURL ───────────────────────────────────────────────
app.post('/api/unfurl', async (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'URL обязателен' })
  try {
    const result = await ogs({ url, timeout: 5000 })
    if (result.error) return res.json({ url })
    const d = result.result
    res.json({
      url,
      title:       d.ogTitle       || d.twitterTitle              || '',
      description: d.ogDescription || d.twitterDescription        || '',
      image:       d.ogImage?.[0]?.url || d.twitterImage?.[0]?.url || '',
      siteName:    d.ogSiteName    || new URL(url).hostname
    })
  } catch {
    res.json({ url })
  }
})

// ─── FOLDERS UPDATE ───────────────────────────────────────
app.post('/api/folders/update', (req, res) => {
  try {
    db.updateFolders(req.body)
    res.json(db.getFolders())
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── KANBAN: РАБОЧИЕ ЗОНЫ ──────────────────────────────────
app.get('/api/kanban/workspaces', (_, res) => {
  res.json(db.kanban.getWorkspaces())
})

app.post('/api/kanban/workspaces', (req, res) => {
  const { name, icon } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Название обязательно' })
  const ws = db.kanban.createWorkspace(name.trim(), icon)
  io.emit('kanban:workspaces:update')
  res.json(ws)
})

app.patch('/api/kanban/workspaces/:id', (req, res) => {
  const ws = db.kanban.updateWorkspace(req.params.id, req.body)
  io.emit('kanban:workspaces:update')
  res.json(ws)
})

app.delete('/api/kanban/workspaces/:id', (req, res) => {
  const result = db.kanban.deleteWorkspace(req.params.id)
  if (!result.ok) return res.status(400).json(result)
  io.emit('kanban:workspaces:update')
  res.json(result)
})

// ─── KANBAN: ДОСКА ──────────────────────────────────────────
function emitBoardUpdate(workspaceId) {
  io.emit('kanban:update', { workspace_id: Number(workspaceId) || null, board: db.kanban.getBoard(workspaceId) })
}

app.get('/api/kanban', (req, res) => {
  res.json(db.kanban.getBoard(req.query.workspace_id ? Number(req.query.workspace_id) : null))
})

app.get('/api/kanban/archive', (req, res) => {
  res.json(db.kanban.getArchivedCards(req.query.workspace_id ? Number(req.query.workspace_id) : null))
})

app.post('/api/kanban/cards', (req, res) => {
  const { column_id, title, description, assignee_id, priority, due_date, workspace_id } = req.body
  if (!title?.trim()) return res.status(400).json({ error: 'Название обязательно' })
  const card = db.kanban.createCard(column_id, title.trim(), description, assignee_id, priority, due_date)
  emitBoardUpdate(workspace_id)
  res.json(card)
})

app.patch('/api/kanban/cards/:id', (req, res) => {
  const { workspace_id, ...rest } = req.body
  const card = db.kanban.updateCard(req.params.id, rest)
  emitBoardUpdate(workspace_id)
  res.json(card)
})

app.post('/api/kanban/cards/reorder', (req, res) => {
  // body: { workspace_id, cards: [{ id, column_id }] } — весь список карточек в новом порядке
  const { workspace_id, cards } = Array.isArray(req.body) ? { workspace_id: null, cards: req.body } : req.body
  db.kanban.reorderCards(cards)
  emitBoardUpdate(workspace_id)
  res.json({ ok: true })
})

app.delete('/api/kanban/cards/:id', (req, res) => {
  db.kanban.deleteCard(req.params.id)
  emitBoardUpdate(req.query.workspace_id)
  res.json({ ok: true })
})

app.post('/api/kanban/cards/:id/archive', (req, res) => {
  db.kanban.archiveCard(req.params.id)
  emitBoardUpdate(req.body?.workspace_id)
  res.json({ ok: true })
})

app.post('/api/kanban/cards/:id/unarchive', (req, res) => {
  db.kanban.unarchiveCard(req.params.id)
  emitBoardUpdate(req.body?.workspace_id)
  res.json({ ok: true })
})

// Автоархив завершённых карточек — проверяем раз в час
setInterval(() => {
  try {
    const n = db.kanban.autoArchiveStale()
    if (n > 0) {
      console.log(`Автоархив: перенесено карточек — ${n}`)
      io.emit('kanban:update', { workspace_id: null, board: null })
    }
  } catch (e) {
    console.error('autoArchiveStale error:', e)
  }
}, 60 * 60 * 1000)

// ─── KANBAN CARD PAGE ─────────────────────────────────────
app.get('/api/kanban/cards/:id', (req, res) => {
  const card = db.kanban.getCard(req.params.id)
  if (!card) return res.status(404).json({ error: 'Не найдено' })
  res.json(card)
})

// ─── SUBTASKS ─────────────────────────────────────────────
app.post('/api/kanban/cards/:id/subtasks', (req, res) => {
  const { title, assignee_id, priority, description } = req.body
  if (!title?.trim()) return res.status(400).json({ error: 'Название обязательно' })
  const subtask = db.kanban.createSubtask(req.params.id, title.trim(), assignee_id, priority, description)
  io.emit('kanban:card:update', req.params.id)
  res.json(subtask)
})

app.patch('/api/kanban/subtasks/:id', (req, res) => {
  const subtask = db.kanban.updateSubtask(req.params.id, req.body)
  io.emit('kanban:card:update', subtask.card_id)
  res.json(subtask)
})

app.post('/api/kanban/subtasks/reorder', (req, res) => {
  db.kanban.reorderSubtasks(req.body)
  if (req.body.length) io.emit('kanban:card:update', req.body[0].card_id)
  res.json({ ok: true })
})

app.delete('/api/kanban/subtasks/:id', (req, res) => {
  db.kanban.deleteSubtask(req.params.id)
  res.json({ ok: true })
})

// ─── SOCKET.IO ────────────────────────────────────────────
const onlineUsers = new Map() // socketId → { userId, userName, channelId }

io.on('connection', (socket) => {
  console.log('connect', socket.id)

  socket.on('auth', ({ userId }) => {
    const user = db.getUserById(userId)
    if (!user) return socket.emit('error', 'Пользователь не найден')
    onlineUsers.set(socket.id, { userId, userName: user.name, channelId: null })
    io.emit('online:update', getOnlineList())
  })

  socket.on('channel:join', ({ channelId }) => {
    const prev = onlineUsers.get(socket.id)
    if (prev?.channelId) socket.leave(`channel:${prev.channelId}`)
    socket.join(`channel:${channelId}`)
    if (prev) {
      prev.channelId = channelId
      onlineUsers.set(socket.id, prev)
    }
    io.emit('online:update', getOnlineList())
  })

  // ─ Новое сообщение ──────────────────────────────────────
  // attachment и linkMeta приходят с фронта уже как объекты —
  // в БД пишем через JSON.stringify, из БД читаем через getMessages (парсит сам)
  socket.on('message:send', ({ channelId, userId, text, attachment, linkMeta }) => {
    try {
      const type = attachment ? (attachment.isImage ? 'image' : 'file') : 'text'
      const result = db.createMessage(
        channelId, userId, text || null, type,
        attachment ? JSON.stringify(attachment) : null,
        linkMeta   ? JSON.stringify(linkMeta)   : null
      )
      // getMessages парсит JSON — берём последнее сообщение по id
      const msgs = db.getMessages(channelId, 1)
      const msg  = msgs.find(m => m.id === result.lastInsertRowid)
      if (!msg) return
      io.to(`channel:${channelId}`).emit('message:new', withReactions(msg))
    } catch (e) {
      console.error('message:send error:', e)
      socket.emit('error', e.message)
    }
  })

  socket.on('message:edit', ({ messageId, userId, text, channelId }) => {
    db.editMessage(messageId, text, userId)
    io.to(`channel:${channelId}`).emit('message:edited', { messageId, text })
  })

  socket.on('message:delete', ({ messageId, userId, channelId }) => {
    db.deleteMessage(messageId, userId)
    io.to(`channel:${channelId}`).emit('message:deleted', { messageId })
  })

  socket.on('reaction:toggle', ({ messageId, userId, emoji, channelId }) => {
    db.toggleReaction(messageId, userId, emoji)
    const reactions = db.getReactions(messageId)
    io.to(`channel:${channelId}`).emit('reaction:update', { messageId, reactions })
  })

  socket.on('typing:start', ({ channelId, userName }) => {
    socket.to(`channel:${channelId}`).emit('typing:update', { userName, typing: true })
  })
  socket.on('typing:stop', ({ channelId, userName }) => {
    socket.to(`channel:${channelId}`).emit('typing:update', { userName, typing: false })
  })

  socket.on('disconnect', () => {
    const info = onlineUsers.get(socket.id)
    onlineUsers.delete(socket.id)
    io.emit('online:update', getOnlineList())
    if (info?.channelId) {
      io.to(`channel:${info.channelId}`).emit('typing:update', { userName: info.userName, typing: false })
    }
  })
})

function getOnlineList() {
  const map = {}
  for (const [, v] of onlineUsers) {
    map[v.userId] = { userId: v.userId, userName: v.userName, channelId: v.channelId }
  }
  return Object.values(map)
}

// ─── PROFILE ──────────────────────────────────────────────
app.patch('/api/users/:id', (req, res) => {
  const { name, avatar, color, description, banner } = req.body
  try {
    db.db.prepare(`
      UPDATE users SET
        name        = COALESCE(?, name),
        avatar      = COALESCE(?, avatar),
        color       = COALESCE(?, color),
        description = COALESCE(?, description),
        banner      = COALESCE(?, banner)
      WHERE id = ?
    `).run(name || null, avatar || null, color || null,
           description !== undefined ? description : null,
           banner || null, req.params.id)
    res.json(db.getUserById(req.params.id))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/users/:id', (req, res) => {
  const u = db.getUserById(req.params.id)
  if (!u) return res.status(404).json({ error: 'Не найден' })
  res.json(u)
})

// ─── ADMIN ────────────────────────────────────────────────
// Логика вынесена в server/admin/ (auth.js, view.js, router.js) —
// так проще редактировать HTML или права доступа отдельно от остального API.
app.use("/admin", require("./admin/router")(io))

// ─── STATIC FRONTEND (раздача Vue SPA) ───────────────────
const DIST_DIR = path.join(__dirname, '../dist')
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))
  // SPA fallback — все неизвестные GET → index.html (для Vue Router)
  app.get('*', (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'))
  })
} else {
  console.warn('⚠️  dist/ not found — frontend not served')
}

server.listen(config.PORT, config.HOST, () => console.log(`WorkVault server → ${config.APP_URL}`))
