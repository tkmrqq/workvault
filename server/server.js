const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const cookie = require('cookie')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const ogs = require('open-graph-scraper')

const config = require('./config')
const db = require('./db')
const {
  requireAuth, requireAdmin, verifyAccessToken,
  setAuthCookies, clearAuthCookies, issueRefreshToken, signAccessToken,
  loginRateLimit, registerFailedLogin, clearFailedLogins
} = require('./auth')

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  // origin:'*' вместе с credentials:true — невалидная по спеке комбинация
  // (в отличие от обычного REST-cors чуть ниже, тут раньше стояло именно
  // так). Приводим к тому же виду: true отражает реальный Origin запроса,
  // а не буквальную звёздочку.
  cors: { origin: true, methods: ['GET', 'POST'], credentials: true }
})

// За nginx — без этого req.ip показывал бы IP самого nginx-контейнера для
// всех запросов разом, а не реального клиента (важно для rate-limit на логин)
app.set('trust proxy', 1)

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())
app.use(cookieParser())

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
const ALLOWED_EXT = /\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|mkv|pdf|zip|txt|doc|docx)$/i

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
    const extOk = ALLOWED_EXT.test(path.extname(file.originalname).toLowerCase())
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

// ─── AUTH ───────────────────────────────────────────────────
// Публичные роуты — регистрация нового имени, вход, миграция старых
// беспарольных аккаунтов, refresh/logout. Всё, что ниже requireAuth
// (см. app.use('/api', requireAuth) чуть дальше) — уже защищено.

app.post('/api/auth/register', (req, res, next) => {
  const { name, password, avatar, color } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Имя обязательно' })
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' })
  }
  const normalizedName = name.trim()
  if (db.getUserByName(normalizedName)) {
    return res.status(409).json({ error: 'Это имя уже занято' })
  }
  try {
    const result = db.createUser(normalizedName, avatar || '🧑', color || '#7c6af7', password)
    const user = db.getUserById(result.lastInsertRowid)
    setAuthCookies(res, user)
    res.json(user)
  } catch (e) {
    if (String(e.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: 'Это имя уже занято' })
    }
    next(e)
  }
})

app.post('/api/auth/login', loginRateLimit, (req, res) => {
  const { name, password } = req.body
  const auth = db.getUserAuthByName((name || '').trim())
  if (!auth) {
    registerFailedLogin(req)
    return res.status(401).json({ error: 'Неверное имя или пароль' })
  }
  // Старый юзер без пароля (мигрировал из PIN-системы или создан до неё) —
  // это не "неверный пароль", а отдельный флоу: фронт должен показать
  // "задай пароль", а не "войти"
  if (!auth.password_hash) {
    return res.status(409).json({ error: 'Для этого имени ещё не задан пароль', code: 'NEEDS_PASSWORD_SETUP' })
  }
  if (!db.verifyUserPassword(auth.id, password || '')) {
    registerFailedLogin(req)
    return res.status(401).json({ error: 'Неверное имя или пароль' })
  }
  clearFailedLogins(req)
  const user = db.getUserById(auth.id)
  setAuthCookies(res, user)
  res.json(user)
})

// Миграция: существующее (беспарольное) имя получает пароль первым, кто его
// задаст. Слабое место — тут нет более сильного доказательства "это тот же
// человек", кроме знания точного имени (ровно тот же риск, что был раньше
// у обычного создания юзера без пароля вообще). Ужесточать стоит отдельно
// (например, звать админа подтвердить) — сейчас это просто перекрывает
// самый частый случай "мы обновились, всем нужны пароли".
app.post('/api/auth/set-password', loginRateLimit, (req, res) => {
  const { name, password } = req.body
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' })
  }
  const auth = db.getUserAuthByName((name || '').trim())
  if (!auth) return res.status(404).json({ error: 'Пользователь не найден' })
  if (auth.password_hash) {
    return res.status(409).json({ error: 'У этого аккаунта уже есть пароль — используй вход' })
  }
  db.setUserPassword(auth.id, password)
  clearFailedLogins(req)
  const user = db.getUserById(auth.id)
  setAuthCookies(res, user)
  res.json(user)
})

app.post('/api/auth/refresh', (req, res) => {
  const token = req.cookies?.refresh_token
  const stored = token && db.findRefreshToken(token)
  if (!stored) return res.status(401).json({ error: 'Сессия истекла, войди заново' })
  // Ротация: старый refresh сразу гасим, выдаём новую пару — если этот
  // токен когда-нибудь всплывёт повторно (украден и переигран), findRefreshToken
  // его уже не найдёт и вернёт 401, что как минимум заметно на фронте
  db.deleteRefreshToken(token)
  const user = db.getUserById(stored.user_id)
  if (!user) { clearAuthCookies(res); return res.status(401).json({ error: 'Пользователь не найден' }) }
  setAuthCookies(res, user)
  res.json(user)
})

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.refresh_token
  if (token) db.deleteRefreshToken(token)
  clearAuthCookies(res)
  res.json({ ok: true })
})

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = db.getUserById(req.user.id)
  if (!user) return res.status(404).json({ error: 'Не найден' })
  res.json(user)
})

// Одноразовый бутстрап первого админа: пока ни у кого нет role='admin',
// любой залогиненный (с паролем) может назначить себя, назвав ADMIN_PASSWORD
// из .env. После первого использования — считай это разовым мастер-ключом,
// имеет смысл сменить/убрать ADMIN_PASSWORD, дальше роли выдаются из /admin.
app.post('/api/auth/bootstrap-admin', requireAuth, (req, res) => {
  if (!config.ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'ADMIN_PASSWORD не задан в .env — бутстрап недоступен' })
  }
  if (req.body.master_password !== config.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Неверный мастер-пароль' })
  }
  db.setUserRole(req.user.id, 'admin')
  res.json({ ok: true })
})

// ── Всё, что ниже — уже требует валидной сессии ─────────────
app.use('/api', requireAuth)

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
      hasMore: messages.length === limit
    })
  } catch (e) {
    console.error('getMessages error:', e)
    res.status(500).json({ error: e.message })
  }
})

// ─── СООБЩЕНИЕ → ЗАДАЧА ───────────────────────────────────
// Одна задача на сообщение: повторный вызов вернёт уже созданную.
function taskTitleFromMessage(msg) {
  const firstLine = (msg.text || '').split('\n').map(l => l.trim()).find(Boolean)
  if (firstLine) return firstLine.length > 120 ? firstLine.slice(0, 117) + '…' : firstLine
  if (msg.attachment) {
    try { return 'Файл: ' + (JSON.parse(msg.attachment).name || 'вложение') } catch { }
  }
  return 'Задача из чата'
}

// ─── ТРЕДЫ ──────────────────────────────────────────────────
app.get('/api/messages/:id/thread', (req, res) => {
  try {
    let parent = db.getMessageFull(Number(req.params.id))
    if (parent?.parent_id) parent = db.getMessageFull(parent.parent_id) // открыли ответ — показываем весь тред
    if (!parent) return res.status(404).json({ error: 'Сообщение не найдено' })
    res.json({
      parent:  withReactions(parent),
      replies: db.getReplies(parent.id).map(withReactions)
    })
  } catch (e) {
    console.error('thread error:', e)
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/messages/:id/task', (req, res) => {
  try {
    const msg = db.getMessageById(Number(req.params.id))
    if (!msg) return res.status(404).json({ error: 'Сообщение не найдено' })

    const existing = db.taskForMessage(msg.id)
    if (existing) return res.json({ ...existing, existed: true })

    const { title, workspace_id, column_id } = req.body || {}
    const column = column_id ? db.kanban.getColumn(Number(column_id)) : db.kanban.defaultColumn(Number(workspace_id) || null)
    if (!column) return res.status(400).json({ error: 'На канбане нет колонок' })

    const cardTitle = (title && String(title).trim()) ? String(title).trim().slice(0, 200) : taskTitleFromMessage(msg)
    // Текст сообщения в описание больше не копируем: в карточке есть блок
    // «Из чата», а снимок сообщения сохраняем отдельно (на случай удаления)
    const description = ''

    db.kanban.createCard(column.id, cardTitle, description, null, 'medium', null,
      { message_id: msg.id, channel_id: msg.channel_id })

    emitBoardUpdate(column.workspace_id)
    const task = db.taskForMessage(msg.id)
    if (task?.id) db.setCardSourceSnapshot(task.id, db.messageSnapshot(msg.id))
    io.to(`channel:${msg.channel_id}`).emit('message:task', { messageId: msg.id, task })
    res.json(task)
  } catch (e) {
    console.error('message→task error:', e)
    res.status(500).json({ error: e.message })
  }
})

// ─── UPLOAD ───────────────────────────────────────────────
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не получен' })
  res.json({
    url: `/uploads/${req.file.filename}`,
    name: req.file.originalname,
    size: req.file.size,
    mime: req.file.mimetype,
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
      title: d.ogTitle || d.twitterTitle || '',
      description: d.ogDescription || d.twitterDescription || '',
      image: d.ogImage?.[0]?.url || d.twitterImage?.[0]?.url || '',
      siteName: d.ogSiteName || new URL(url).hostname
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
  const { name, icon, color } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Название обязательно' })
  const ws = db.kanban.createWorkspace(name.trim(), icon, color)
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

// Обновляем чипы задач под сообщениями в чате (статус/колонка/архив/удаление).
// links — результат db.kanban.linkedMessages(), берём его ДО удаления карточки.
function emitTaskLinks(links) {
  for (const l of links || []) {
    io.to(`channel:${l.source_channel_id}`).emit('message:task', {
      messageId: l.source_message_id,
      task: db.taskForMessage(l.source_message_id)
    })
  }
}
const emitTasksForCards = (ids) => emitTaskLinks(db.kanban.linkedMessages(ids))

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
  emitTasksForCards([req.params.id])
  res.json(card)
})

app.post('/api/kanban/cards/:id/move', (req, res) => {
  const { column_id } = req.body
  if (!column_id) return res.status(400).json({ error: 'column_id обязателен' })
  const result = db.kanban.moveCardToColumn(req.params.id, column_id)
  if (!result) return res.status(404).json({ error: 'Карточка не найдена' })
  // Если перенесли в другую рабочую зону — у обеих досок (и старой, и новой)
  // должно обновиться содержимое для всех, кто сейчас на них смотрит
  emitBoardUpdate(result.oldWorkspaceId)
  if (result.newWorkspaceId !== result.oldWorkspaceId) emitBoardUpdate(result.newWorkspaceId)
  emitTasksForCards([req.params.id])
  res.json(result.card)
})

app.post('/api/kanban/cards/reorder', (req, res) => {
  // body: { workspace_id, cards: [{ id, column_id }] } — весь список карточек в новом порядке
  const { workspace_id, cards } = Array.isArray(req.body) ? { workspace_id: null, cards: req.body } : req.body
  db.kanban.reorderCards(cards)
  emitBoardUpdate(workspace_id)
  emitTasksForCards((cards || []).map(c => c.id))
  res.json({ ok: true })
})

app.delete('/api/kanban/cards/:id', (req, res) => {
  const links = db.kanban.linkedMessages([req.params.id])
  db.kanban.deleteCard(req.params.id)
  emitBoardUpdate(req.query.workspace_id)
  emitTaskLinks(links)
  res.json({ ok: true })
})

app.post('/api/kanban/cards/:id/archive', (req, res) => {
  db.kanban.archiveCard(req.params.id)
  emitBoardUpdate(req.body?.workspace_id)
  emitTasksForCards([req.params.id])
  res.json({ ok: true })
})

app.post('/api/kanban/cards/:id/unarchive', (req, res) => {
  db.kanban.unarchiveCard(req.params.id)
  emitBoardUpdate(req.body?.workspace_id)
  emitTasksForCards([req.params.id])
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

// ─── TAGS (свободные, создаются на лету) ───────────────────
app.get('/api/kanban/tags', (_, res) => res.json(db.kanban.getAllTags()))

app.post('/api/kanban/subtasks/:id/tags', (req, res) => {
  const name = (req.body.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Название тега обязательно' })
  if (name.length > 30) return res.status(400).json({ error: 'Слишком длинное название тега' })
  const tags = db.kanban.addTagToSubtask(req.params.id, name)
  const cardId = db.kanban.getSubtaskCardId(req.params.id)
  if (cardId) io.emit('kanban:card:update', cardId)
  res.json(tags)
})

app.delete('/api/kanban/subtasks/:id/tags/:tagId', (req, res) => {
  const tags = db.kanban.removeTagFromSubtask(req.params.id, req.params.tagId)
  const cardId = db.kanban.getSubtaskCardId(req.params.id)
  if (cardId) io.emit('kanban:card:update', cardId)
  res.json(tags)
})

// ─── SOCKET.IO ────────────────────────────────────────────
// Раньше клиент сам присылал userId в socket.emit('auth', {userId}) —
// можно было представиться кем угодно. Теперь личность проверяется по
// тому же access-cookie, что и обычные HTTP-запросы, прямо на хендшейке —
// клиенту вообще не нужно ничего слать, cookie летит автоматически.
io.use((socket, next) => {
  try {
    const rawCookieHeader = socket.handshake.headers.cookie || ''
    // cookie@2 exposes parseCookie(); parse() existed in older major versions.
    const parseCookies = cookie.parseCookie || cookie.parse
    if (typeof parseCookies !== 'function') {
      throw new Error('cookie package does not expose a cookie parser')
    }
    const cookies = parseCookies(rawCookieHeader)
    if (!cookies.access_token) {
      // Кука вообще не долетела до сервера — не проблема самого токена,
      // а проблема транспорта/CORS/secure-флага. Печатаем origin запроса,
      // чтобы сразу было видно, с какого адреса реально пришёл хендшейк.
      console.warn(
        `[socket auth] нет access_token в куках хендшейка. ` +
        `Origin: ${socket.handshake.headers.origin || '—'}, ` +
        `есть ли Cookie-заголовок вообще: ${rawCookieHeader ? 'да, но без access_token' : 'нет совсем'}`
      )
      return next(new Error('unauthorized'))
    }
    const payload = verifyAccessToken(cookies.access_token)
    if (!payload) {
      // Кука долетела, но verify не прошёл — почти всегда просто истёк
      // access_token (живёт 15 мин) и клиент ещё не успел обновить его
      // через /api/auth/refresh
      console.warn('[socket auth] access_token есть, но не прошёл verify (истёк или подписан другим JWT_SECRET)')
      return next(new Error('unauthorized'))
    }
    socket.user = { id: payload.sub, name: payload.name, role: payload.role }
    next()
  } catch (e) {
    console.warn('[socket auth] исключение при разборе куки:', e.message)
    next(new Error('unauthorized'))
  }
})

const onlineUsers = new Map() // socketId → { userId, userName, channelId }

io.on('connection', (socket) => {
  console.log('connect', socket.id, socket.user.name)

  onlineUsers.set(socket.id, { userId: socket.user.id, userName: socket.user.name, channelId: null })
  io.emit('online:update', getOnlineList())

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
  // userId больше не берём из тела события — только из проверенного socket.user,
  // иначе любой клиент мог отправить сообщение "от имени" произвольного userId.
  // ack — необязательный callback, если клиент его передал (io.emit с колбэком
  // на клиенте). Так фронт узнаёт результат отправки напрямую по этому конкретному
  // сообщению, а не гадает по общему socket.on('error') (который раньше вообще
  // никто не слушал — сообщение просто пропадало без следа при любой ошибке).
  socket.on('message:send', ({ channelId, text, attachment, linkMeta, parentId, poll }, ack) => {
    try {
      // Ответ в треде: корень должен быть в том же канале; ответ на ответ
      // поднимаем до корня — треды плоские
      let parent = null
      if (parentId) {
        parent = db.getMessageById(Number(parentId))
        if (parent?.parent_id) parent = db.getMessageById(parent.parent_id)
        if (!parent || parent.channel_id !== Number(channelId)) {
          ack?.({ ok: false, error: 'Тред не найден — возможно, сообщение удалили' })
          return
        }
      }
      // Опрос: текст сообщения = вопрос, от 2 до 10 уникальных вариантов, без файлов
      let pollJson = null
      if (poll) {
        const options = [...new Set((Array.isArray(poll.options) ? poll.options : [])
          .map(o => String(o ?? '').trim().slice(0, 100)).filter(Boolean))]
        if (!String(text || '').trim() || attachment || options.length < 2 || options.length > 10) {
          ack?.({ ok: false, error: 'Опросу нужен вопрос и от 2 до 10 вариантов' })
          return
        }
        pollJson = JSON.stringify({ options, multi: !!poll.multi })
      }
      const type = pollJson ? 'poll' : attachment ? (attachment.isImage ? 'image' : 'file') : 'text'
      const result = db.createMessage(
        channelId, socket.user.id, text || null, type,
        attachment ? JSON.stringify(attachment) : null,
        linkMeta ? JSON.stringify(linkMeta) : null,
        parent?.id || null
      )
      if (pollJson) db.setMessagePoll(result.lastInsertRowid, pollJson)
      const msg = db.getMessageFull(result.lastInsertRowid)
      if (!msg) {
        ack?.({ ok: false, error: 'Сообщение не найдено после сохранения' })
        return
      }
      if (parent) {
        io.to(`channel:${channelId}`).emit('thread:reply', withReactions(msg))
        io.to(`channel:${channelId}`).emit('message:thread', { messageId: parent.id, ...db.threadMeta(parent.id) })
      } else {
        io.to(`channel:${channelId}`).emit('message:new', withReactions(msg))
      }
      ack?.({ ok: true, id: msg.id })
    } catch (e) {
      console.error('message:send error:', e)
      ack?.({ ok: false, error: e.message })
      socket.emit('error', e.message)
    }
  })

  socket.on('message:edit', ({ messageId, text, channelId }) => {
    const r = db.editMessage(messageId, text, socket.user.id) // WHERE user_id=? в самом запросе — чужое не отредактирует
    // Раньше событие улетало всем даже если в БД ничего не поменялось
    if (r.changes) io.to(`channel:${channelId}`).emit('message:edited', { messageId, text })
  })

  socket.on('message:delete', ({ messageId, channelId }) => {
    const before = db.getMessageById(messageId)
    const r = db.deleteMessage(messageId, socket.user.id) // та же защита на уровне SQL
    if (!r.changes) return
    io.to(`channel:${channelId}`).emit('message:deleted', { messageId })
    // Удалили ответ — пересчитываем сводку треда под корнем
    if (before?.parent_id) {
      io.to(`channel:${channelId}`).emit('message:thread', { messageId: before.parent_id, ...db.threadMeta(before.parent_id) })
    }
  })

  socket.on('reaction:toggle', ({ messageId, emoji, channelId }) => {
    db.toggleReaction(messageId, socket.user.id, emoji)
    const reactions = db.getReactions(messageId)
    io.to(`channel:${channelId}`).emit('reaction:update', { messageId, reactions })
  })

  // Голос в опросе. Канал берём из самого сообщения, а не с клиента
  socket.on('poll:vote', ({ messageId, option }) => {
    try {
      const m = db.getMessageById(Number(messageId))
      if (!m?.poll) return
      const p = JSON.parse(m.poll)
      const i = Number(option)
      if (!Number.isInteger(i) || i < 0 || i >= p.options.length) return
      db.votePoll(m.id, socket.user.id, i, !!p.multi)
      io.to(`channel:${m.channel_id}`).emit('poll:update', { messageId: m.id, poll: db.pollFor(m.id, m.poll) })
    } catch (e) {
      console.error('poll:vote error:', e)
    }
  })

  socket.on('typing:start', ({ channelId }) => {
    socket.to(`channel:${channelId}`).emit('typing:update', { userName: socket.user.name, typing: true })
  })
  socket.on('typing:stop', ({ channelId }) => {
    socket.to(`channel:${channelId}`).emit('typing:update', { userName: socket.user.name, typing: false })
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
  // Раньше тут не проверялось вообще ничего — залогиненный юзер мог
  // поправить чужой профиль, просто зная чужой id. Разрешаем только себя
  // (или админа — мало ли понадобится поправить чей-то профиль руками).
  if (Number(req.params.id) !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Можно редактировать только свой профиль' })
  }
  const { name, avatar, color, description, banner } = req.body
  // Баннер — только из известного списка (см. BANNERS в ProfileModal.vue), иначе в БД можно записать что угодно
  // Или путь к своей картинке, загруженной через /banner, — и только к своей.
  const ALLOWED_BANNERS = ['auto', 'violet', 'aurora', 'cosmos', 'ocean', 'forest', 'mint', 'sunset', 'peach', 'rose', 'mono']
  const bannerIn = ALLOWED_BANNERS.includes(banner) || isOwnUpload(banner, 'banner', req.params.id) ? banner : null
  const b = req.body || {}
  // Аватар — либо эмодзи, либо путь к фото, загруженному через /avatar. Чужие URL не принимаем.
  let avatarIn = typeof avatar === 'string' ? avatar.trim() : null
  if (avatarIn && avatarIn.includes('/')) {
    if (!isOwnUpload(avatarIn, 'avatar', req.params.id)) avatarIn = null
  } else if (avatarIn) {
    avatarIn = avatarIn.slice(0, 16)
  }
  const prev = db.getUserById(req.params.id)
  const prevAvatar = prev?.avatar
  const prevBanner = prev?.banner
  const clip = (v, n) => (v == null ? null : (String(v).trim().slice(0, n) || null))
  const validTz = (tz) => {
    if (!tz) return null
    try { new Intl.DateTimeFormat('en-US', { timeZone: String(tz) }); return String(tz) } catch { return null }
  }
  try {
    db.db.prepare(`
      UPDATE users SET
        name        = COALESCE(?, name),
        avatar      = COALESCE(?, avatar),
        color       = COALESCE(?, color),
        description = COALESCE(?, description),
        banner      = COALESCE(?, banner)
      WHERE id = ?
    `).run(name || null, avatarIn || null, color || null,
      description !== undefined ? description : null,
      bannerIn, req.params.id)

    // Поля, которые можно и очистить — трогаем, только если они пришли в запросе
    const sets = [], vals = []
    if ('title' in b)    { sets.push('title = ?');    vals.push(clip(b.title, 40)) }
    if ('timezone' in b) { sets.push('timezone = ?'); vals.push(validTz(b.timezone)) }
    if ('status_text' in b || 'status_emoji' in b) {
      const text  = clip(b.status_text, 80)
      const emoji = clip(b.status_emoji, 16)
      const until = Number(b.status_until) > 0 ? Math.floor(Number(b.status_until)) : null
      sets.push('status_emoji = ?', 'status_text = ?', 'status_until = ?')
      vals.push(emoji, text, (text || emoji) ? until : null)
    }
    if (sets.length) db.db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals, req.params.id)

    const updated = db.getUserById(req.params.id)
    // Остальные клиенты обновят имя/аватар/статус без перезагрузки
    // Старое фото больше нигде не нужно — удаляем, чтобы не копить мусор в uploads
    if (prevAvatar && prevAvatar !== updated?.avatar && prevAvatar.startsWith('/uploads/avatar-')) {
      fs.unlink(path.join(UPLOADS_DIR, path.basename(prevAvatar)), () => {})
    }
    if (prevBanner && prevBanner !== updated?.banner && prevBanner.startsWith('/uploads/banner-')) {
      fs.unlink(path.join(UPLOADS_DIR, path.basename(prevBanner)), () => {})
    }
    io.emit('user:updated', updated)
    res.json(updated)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── AVATAR / BANNER UPLOAD ─────────────────────────────
// Клиент уже кадрирует и сжимает картинку (аватар 320×320, фон 1200×400),
// поэтому лимит небольшой. В БД путь попадает только через PATCH /api/users/:id.
const PROFILE_IMG_MIME = { 'image/webp': '.webp', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif' }
const profileImageUpload = (kind) => multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, `${kind}-${Number(req.params.id)}-${Date.now()}${PROFILE_IMG_MIME[file.mimetype] || '.png'}`)
  }),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (_, file, cb) => PROFILE_IMG_MIME[file.mimetype]
    ? cb(null, true)
    : cb(new Error('Нужна картинка: PNG, JPG, WebP или GIF'), false)
})

// Путь вида /uploads/<kind>-<userId>-<ts>.<ext>, загруженный именно этим юзером.
// Чужой файл подставить нельзя — иначе при следующей смене мы бы его удалили.
function isOwnUpload(v, kind, userId) {
  return typeof v === 'string'
    && new RegExp(`^/uploads/${kind}-${Number(userId)}-\\d+\\.(webp|png|jpg|gif)$`).test(v)
}

for (const [kind, label] of [['avatar', 'аватар'], ['banner', 'фон профиля']]) {
  const uploader = profileImageUpload(kind)
  app.post(`/api/users/:id/${kind}`, (req, res) => {
    if (!req.user || (Number(req.params.id) !== req.user.id && req.user.role !== 'admin')) {
      return res.status(403).json({ error: `Можно менять только свой ${label}` })
    }
    uploader.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Файл больше 4 МБ' : err.message })
      if (!req.file) return res.status(400).json({ error: 'Файл не получен' })
      res.json({ url: `/uploads/${req.file.filename}` })
    })
  })
}

app.get('/api/users/:id/stats', (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ error: 'Некорректный id' })
  res.json(db.getUserStats(id))
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
