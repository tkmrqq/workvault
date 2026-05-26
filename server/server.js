const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const ogs = require('open-graph-scraper')

const db = require('./db')

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
})

app.use(cors())
app.use(express.json())

// ─── UPLOADS ─────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, '../data/uploads')
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
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB — для видео
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

// ─── REST API ─────────────────────────────────────────────

app.get('/api/users', (_, res) => res.json(db.getUsers()))

app.post('/api/users', (req, res) => {
  const { name, avatar, color } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Имя обязательно' })
  try {
    const result = db.createUser(name.trim(), avatar || '🧑', color || '#7c6af7')
    res.json(db.getUserById(result.lastInsertRowid))
  } catch {
    const existing = db.db.prepare('SELECT * FROM users WHERE name = ?').get(name.trim())
    if (existing) return res.json(existing)
    res.status(500).json({ error: 'Ошибка создания' })
  }
})

app.get('/api/folders', (_, res) => res.json(db.getFolders()))

// ─── СООБЩЕНИЯ ────────────────────────────────────────────
// db.getMessages уже делает JSON.parse для attachment и link_meta
// поэтому здесь просто добавляем реакции и отдаём
app.get('/api/messages/:channelId', (req, res) => {
  try {
    const messages = db.getMessages(
      Number(req.params.channelId),
      Number(req.query.limit) || 50,
      req.query.before ? Number(req.query.before) : null
    )
    res.json(messages.map(withReactions))
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

// ─── CRM ──────────────────────────────────────────────────
app.post('/api/messages/:id/crm', (req, res) => {
  db.toggleCrm(req.params.id)
  const msg = db.db.prepare('SELECT crm_done FROM messages WHERE id=?').get(req.params.id)
  io.to(`channel:${req.body.channelId}`).emit('message:crm', {
    messageId: parseInt(req.params.id),
    crm_done:  msg.crm_done
  })
  res.json({ ok: true })
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
  const { name, avatar, color, description } = req.body
  try {
    db.db.prepare(`
      UPDATE users SET
        name        = COALESCE(?, name),
        avatar      = COALESCE(?, avatar),
        color       = COALESCE(?, color),
        description = COALESCE(?, description)
      WHERE id = ?
    `).run(name || null, avatar || null, color || null, description || null, req.params.id)
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
app.get('/admin', (_, res) => {
  const stats = {
    users:    db.db.prepare('SELECT COUNT(*) as c FROM users').get().c,
    messages: db.db.prepare('SELECT COUNT(*) as c FROM messages').get().c,
    channels: db.db.prepare('SELECT COUNT(*) as c FROM channels').get().c,
    uploads:  fs.readdirSync(UPLOADS_DIR).length,
    dbSize:   (fs.statSync(path.join(__dirname, '../data/workvault.db')).size / 1024 / 1024).toFixed(2) + ' MB',
    uptime:   Math.floor(process.uptime() / 60) + ' min',
  }
  const users    = db.db.prepare('SELECT id, name, avatar, color FROM users').all()
  const channels = db.db.prepare(`
    SELECT c.id, c.name, f.name as folder, COUNT(m.id) as msg_count
    FROM channels c
    LEFT JOIN folders f ON f.id = c.folder_id
    LEFT JOIN messages m ON m.channel_id = c.id
    GROUP BY c.id
  `).all()

  res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>WorkVault Admin</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0 }
    body { font-family: system-ui, sans-serif; background: #0f0f0f; color: #ccc; padding: 32px; }
    h1 { color: #fff; margin-bottom: 24px; font-size: 20px }
    h2 { color: #aaa; font-size: 13px; text-transform: uppercase; letter-spacing: .08em; margin: 32px 0 12px }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-bottom: 8px }
    .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 10px; padding: 16px }
    .card-val { font-size: 28px; font-weight: 700; color: #fff }
    .card-label { font-size: 12px; color: #666; margin-top: 4px }
    table { width: 100%; border-collapse: collapse; font-size: 13px }
    th { text-align: left; padding: 8px 12px; background: #1a1a1a; color: #666; font-weight: 600 }
    td { padding: 8px 12px; border-bottom: 1px solid #1e1e1e }
    tr:hover td { background: #161616 }
    .btn { padding: 4px 10px; border-radius: 6px; border: none; cursor: pointer; font-size: 12px; font-weight: 600 }
    .btn-red { background: rgba(224,108,117,.15); color: #e06c75 }
    .btn-red:hover { background: rgba(224,108,117,.3) }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 11px; background: #1e1e1e; color: #888 }
    .health { display: inline-flex; align-items: center; gap: 6px; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 8px 14px; font-size: 13px }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #4caf7d }
  </style>
</head>
<body>
  <h1>⚙️ WorkVault Admin</h1>

  <div class="health">
    <div class="dot"></div>
    Server healthy · uptime ${stats.uptime}
  </div>

  <h2>Статистика</h2>
  <div class="grid">
    <div class="card"><div class="card-val">${stats.users}</div><div class="card-label">Пользователей</div></div>
    <div class="card"><div class="card-val">${stats.messages}</div><div class="card-label">Сообщений</div></div>
    <div class="card"><div class="card-val">${stats.channels}</div><div class="card-label">Каналов</div></div>
    <div class="card"><div class="card-val">${stats.uploads}</div><div class="card-label">Файлов</div></div>
    <div class="card"><div class="card-val">${stats.dbSize}</div><div class="card-label">Размер БД</div></div>
  </div>

  <h2>Каналы</h2>
  <table>
    <thead><tr><th>ID</th><th>Канал</th><th>Папка</th><th>Сообщений</th><th>Действия</th></tr></thead>
    <tbody>
      ${channels.map(c => `
        <tr>
          <td><span class="badge">${c.id}</span></td>
          <td>${c.name}</td>
          <td>${c.folder || '—'}</td>
          <td>${c.msg_count}</td>
          <td>
            <button class="btn btn-red" onclick="clearHistory(${c.id}, '${c.name}')">
              Очистить историю
            </button>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <h2>Пользователи</h2>
  <table>
    <thead><tr><th>ID</th><th>Аватар</th><th>Имя</th><th>Действия</th></tr></thead>
    <tbody>
      ${users.map(u => `
        <tr>
          <td><span class="badge">${u.id}</span></td>
          <td>${u.avatar}</td>
          <td style="color:${u.color}">${u.name}</td>
          <td>
            <button class="btn btn-red" onclick="deleteUser(${u.id}, '${u.name}')">
              Удалить
            </button>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <script>
    async function clearHistory(channelId, name) {
      if (!confirm('Очистить всю историю канала #' + name + '?')) return
      const r = await fetch('/admin/api/clear-history/' + channelId, { method: 'POST' })
      const d = await r.json()
      if (d.ok) { alert('Удалено сообщений: ' + d.deleted); location.reload() }
      else alert('Ошибка: ' + d.error)
    }
    async function deleteUser(id, name) {
      if (!confirm('Удалить пользователя ' + name + '?')) return
      const r = await fetch('/admin/api/delete-user/' + id, { method: 'POST' })
      const d = await r.json()
      if (d.ok) { alert('Удалён'); location.reload() }
      else alert('Ошибка: ' + d.error)
    }
  <\/script>
</body>
</html>`)
})

app.post('/admin/api/clear-history/:channelId', (req, res) => {
  try {
    const result = db.db.prepare('DELETE FROM messages WHERE channel_id = ?')
      .run(req.params.channelId)
    res.json({ ok: true, deleted: result.changes })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/admin/api/delete-user/:id', (req, res) => {
  try {
    db.db.prepare('DELETE FROM messages WHERE user_id = ?').run(req.params.id)
    db.db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

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

const PORT = process.env.PORT || 3000
server.listen(PORT, () => console.log(`WorkVault server → http://localhost:${PORT}`))