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
const https = require('https')
const crypto = require('crypto')
const dnsCb = require('dns')
const net = require('net')

const config = require('./config')
const db = require('./db')
const {
  requireAuth, requireAdmin, verifyAccessToken,
  setAuthCookies, clearAuthCookies, issueRefreshToken, signAccessToken,
  loginRateLimit, registerFailedLogin, clearFailedLogins
} = require('./auth')

// ─── CORS / ORIGIN ALLOWLIST ──────────────────────────────────────────
// Раньше было origin:true + credentials:true — любой сайт мог делать запросы
// с куками пользователя и читать ответ. Теперь — только свои адреса.
const ALLOWED_ORIGINS = new Set([
  config.APP_URL.replace(/\/$/, ''),
  'http://localhost:5173', // vite dev
  ...(config.CORS_ORIGINS || []),
])
function isAllowedOrigin(origin) {
  if (!origin) return true
  if (ALLOWED_ORIGINS.has(origin)) return true
  // Electron, загруженный с file:// — шлёт Origin: null / file://
  if (config.CORS_ALLOW_ELECTRON && (origin === 'null' || origin === 'file://')) return true
  return false
}
const corsOrigin = (origin, cb) => cb(null, isAllowedOrigin(origin))

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  // origin:'*' вместе с credentials:true — невалидная по спеке комбинация
  // (в отличие от обычного REST-cors чуть ниже, тут раньше стояло именно
  // так). Приводим к тому же виду: true отражает реальный Origin запроса,
  // а не буквальную звёздочку.
  cors: { origin: corsOrigin, methods: ['GET', 'POST'], credentials: true },
  maxHttpBufferSize: 1e6
})

// За nginx — без этого req.ip показывал бы IP самого nginx-контейнера для
// всех запросов разом, а не реального клиента (важно для rate-limit на логин)
app.set('trust proxy', 1)

app.disable('x-powered-by')
app.use(cors({ origin: corsOrigin, credentials: true }))
// Базовые заголовки безопасности (дублируются в nginx, но пусть будут и без него)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  next()
})
// CSRF: изменяющие запросы с чужого Origin отбиваем до всякой логики
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const origin = req.get('origin')
  if (isAllowedOrigin(origin)) return next()
  try { if (new URL(origin).host === req.get('host')) return next() } catch { }
  return res.status(403).json({ error: 'Запрос с чужого сайта отклонён' })
})
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

// ─── UPLOADS ─────────────────────────────────────────────
const UPLOADS_DIR = config.UPLOADS_DIR
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

// Раньше хватало mime ИЛИ расширения: evil.html с Content-Type image/png проходил
// и отдавался как text/html с нашего домена (stored XSS → кража сессий).
// Теперь расширение обязано быть из списка, mime — совпадать с ним (или быть
// «неизвестным»), а у картинок дополнительно проверяем «магические байты».
const EXT_MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
  '.pdf': 'application/pdf', '.zip': 'application/zip', '.txt': 'text/plain',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}
const MIME_ALIASES = { 'image/jpg': 'image/jpeg', 'application/x-zip-compressed': 'application/zip', 'application/x-zip': 'application/zip' }
const GENERIC_MIME = new Set(['', 'application/octet-stream'])
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.mkv'])
const INLINE_EXT = new Set([...IMAGE_EXT, ...VIDEO_EXT, '.pdf'])

function sniffImageMime(filePath) {
  const b = Buffer.alloc(16)
  const fd = fs.openSync(filePath, 'r')
  try { fs.readSync(fd, b, 0, 16, 0) } finally { fs.closeSync(fd) }
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg'
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png'
  if (b.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif'
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  return null
}
const randomName = (prefix, ext) => `${prefix}${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext}`

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  // Расширение уже проверено в fileFilter, имя — непредсказуемое (crypto, а не Math.random)
  filename: (_, file, cb) => cb(null, randomName('', path.extname(file.originalname).toLowerCase()))
})

const upload = multer({
  storage,
  limits: { fileSize: config.MAX_FILE_BYTES, files: 1 }, // из MAX_FILE_MB в .env, по умолчанию 100MB
  fileFilter: (req, file, cb) => {
    // Запрет папок — браузер шлёт папки как пустые файлы с mime = ''
    if (file.originalname.includes('/') || file.originalname.includes('\\')) {
      return cb(new Error('Папки не поддерживаются'), false)
    }
    const ext = path.extname(file.originalname).toLowerCase()
    const expected = EXT_MIME[ext]
    if (!expected) return cb(new Error(`Тип файла не поддерживается: ${ext || 'без расширения'}`), false)
    const mime = String(file.mimetype || '').toLowerCase()
    const mimeOk = GENERIC_MIME.has(mime) || (MIME_ALIASES[mime] || mime) === expected
    if (!mimeOk) return cb(new Error(`Расширение ${ext} не совпадает с типом файла (${mime})`), false)
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

app.use('/uploads', express.static(UPLOADS_DIR, {
  dotfiles: 'deny',
  index: false,
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase()
    res.setHeader('X-Content-Type-Options', 'nosniff')
    // Даже если какой-то файл откроют напрямую — скрипты в нём не выполнятся
    if (ext !== '.pdf') res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox")
    if (!INLINE_EXT.has(ext)) res.setHeader('Content-Disposition', 'attachment')
  }
}))

// ─── ХЕЛПЕР — строим полное сообщение из строки БД ───────
// db.getMessages уже парсит attachment и link_meta.
// Этот хелпер только добирает реакции.
function withReactions(msg) {
  return { ...msg, reactions: db.getReactions(msg.id) }
}
// Чипы личных задач: в общей выдаче их нет (их не должны видеть другие),
// дорисовываем только тому, чья это личная зона
function withPrivateTasks(list, userId) {
  const need = list.filter(m => m && !m.task).map(m => m.id)
  if (!need.length) return list
  const byMsg = new Map()
  for (const t of db.privateTasksForMessages(need, userId)) {
    if (!byMsg.has(t.source_message_id)) byMsg.set(t.source_message_id, t)
  }
  return list.map(m => (m && !m.task && byMsg.has(m.id)) ? { ...m, task: byMsg.get(m.id) } : m)
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
    res.status(500).json({ error: 'Внутренняя ошибка сервера' })
  }
})

// ─── REST API ─────────────────────────────────────────────

// Без сессии (экран входа) — только минимум для списка имён, без ролей и профилей.
// PUBLIC_USER_LIST=false — вообще не показывать список до входа (имя вводится руками).
app.get('/api/users', (req, res) => {
  const token = req.cookies?.access_token
  if (token && verifyAccessToken(token)) return res.json(db.getUsers())
  if (!config.PUBLIC_USER_LIST) return res.status(401).json({ error: 'Не авторизован', code: 'UNAUTHORIZED' })
  res.json(db.getUsers().map(u => ({ id: u.id, name: u.name, avatar: u.avatar, color: u.color, has_password: u.has_password })))
})

// ─── AUTH ───────────────────────────────────────────────────
// Публичные роуты — регистрация нового имени, вход, миграция старых
// беспарольных аккаунтов, refresh/logout. Всё, что ниже requireAuth
// (см. app.use('/api', requireAuth) чуть дальше) — уже защищено.

app.post('/api/auth/register', loginRateLimit, (req, res, next) => {
  if (!config.ALLOW_REGISTRATION) {
    return res.status(403).json({ error: 'Регистрация закрыта — попроси админа создать аккаунт' })
  }
  const { name, password, avatar, color } = req.body || {}
  if (!name?.trim()) return res.status(400).json({ error: 'Имя обязательно' })
  if (String(name).trim().length > 40) return res.status(400).json({ error: 'Имя слишком длинное' })
  registerFailedLogin(req) // считаем и регистрации — иначе можно наплодить тысячи аккаунтов
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' })
  }
  const normalizedName = name.trim()
  if (db.getUserByName(normalizedName)) {
    return res.status(409).json({ error: 'Это имя уже занято' })
  }
  try {
    const result = db.createUser(normalizedName, String(avatar || '🧑').slice(0, 300), /^#[0-9a-fA-F]{3,8}$/.test(color || '') ? color : '#7c6af7', password)
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
// БЕЗОПАСНОСТЬ: по умолчанию выключено. Кто первым ввёл чужое имя — тот и забирал
// аккаунт (включая админский). Включай ALLOW_LEGACY_PASSWORD_SETUP=true только на
// время миграции, либо задавай пароли из /admin («Сбросить пароль»).
app.post('/api/auth/set-password', loginRateLimit, (req, res) => {
  if (!config.ALLOW_LEGACY_PASSWORD_SETUP) {
    return res.status(403).json({ error: 'Самостоятельно задать пароль нельзя — попроси админа задать его в админке', code: 'PASSWORD_SETUP_DISABLED' })
  }
  const { name, password } = req.body || {}
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
const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest()
app.post('/api/auth/bootstrap-admin', requireAuth, loginRateLimit, (req, res) => {
  // Раньше работало и после появления админа — любой, узнавший ADMIN_PASSWORD, становился админом
  if (db.hasAnyAdmin()) {
    return res.status(409).json({ error: 'Администратор уже есть — роли выдаются в /admin' })
  }
  if (!config.ADMIN_PASSWORD || config.ADMIN_PASSWORD === 'change-me' || config.ADMIN_PASSWORD.length < 12) {
    return res.status(503).json({ error: 'ADMIN_PASSWORD не задан или слишком простой (нужно ≥ 12 символов) — бутстрап недоступен' })
  }
  if (!crypto.timingSafeEqual(sha256(req.body?.master_password ?? ''), sha256(config.ADMIN_PASSWORD))) {
    registerFailedLogin(req)
    return res.status(401).json({ error: 'Неверный мастер-пароль' })
  }
  db.setUserRole(req.user.id, 'admin')
  db.logAdmin('bootstrap-admin', { userId: req.user.id })
  // Перевыпускаем токены — иначе роль в JWT обновится только через 15 минут
  setAuthCookies(res, db.getUserById(req.user.id))
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
    // Раньше limit не ограничивался: ?limit=10000000 вытаскивал всю историю и клал сервер
    const limit = Math.min(Math.max(Math.trunc(Number(req.query.limit)) || 50, 1), 200)
    const messages = db.getMessages(
      Number(req.params.channelId),
      limit,
      req.query.before ? Number(req.query.before) : null
    )
    res.json({
      messages: withPrivateTasks(messages, req.user.id).map(withReactions),
      hasMore: messages.length === limit
    })
  } catch (e) {
    console.error('getMessages error:', e)
    res.status(500).json({ error: 'Внутренняя ошибка сервера' })
  }
})

// ─── СООБЩЕНИЕ → ЗАДАЧА ───────────────────────────────────
// Одна задача на сообщение: повторный вызов вернёт уже созданную.
function taskTitleFromMessage(msg) {
  const firstLine = (msg.text || '').split('\n').map(l => l.trim()).find(Boolean)
  if (firstLine) return firstLine.length > 120 ? firstLine.slice(0, 117) + '…' : firstLine
  if (msg.attachment) {
    try {
      const a = JSON.parse(msg.attachment)
      if (a.isSticker) return 'Стикер' + (a.emoji ? ' ' + a.emoji : '')
      return 'Файл: ' + (a.name || 'вложение')
    } catch { }
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
      parent:  withReactions(withPrivateTasks([parent], req.user.id)[0]),
      replies: withPrivateTasks(db.getReplies(parent.id), req.user.id).map(withReactions)
    })
  } catch (e) {
    console.error('thread error:', e)
    res.status(500).json({ error: 'Внутренняя ошибка сервера' })
  }
})

app.post('/api/messages/:id/task', (req, res) => {
  try {
    const msg = db.getMessageById(Number(req.params.id))
    if (!msg) return res.status(404).json({ error: 'Сообщение не найдено' })

    const { title, workspace_id, column_id } = req.body || {}
    const wsHint = Number(workspace_id) || null
    if (wsHint && !canAccessWorkspace(req.user, wsHint)) return notFound(res)
    const column = column_id ? db.kanban.getColumn(Number(column_id)) : db.kanban.defaultColumn(wsHint)
    if (!column) return res.status(400).json({ error: 'На канбане нет колонок' })
    if (!canAccessWorkspace(req.user, column.workspace_id)) return notFound(res)

    // Личная зона: чип под сообщением видит только владелец, в канал не шлём
    const ws = db.kanban.getWorkspace(column.workspace_id)
    const isPrivate = ws?.owner_id != null
    const findTask = () => isPrivate ? db.privateTaskForMessage(msg.id, req.user.id) : db.taskForMessage(msg.id)

    const existing = findTask()
    if (existing) return res.json({ ...existing, existed: true })

    const cardTitle = (title && String(title).trim()) ? String(title).trim().slice(0, 200) : taskTitleFromMessage(msg)
    // Текст сообщения в описание больше не копируем: в карточке есть блок
    // «Из чата», а снимок сообщения сохраняем отдельно (на случай удаления)
    db.kanban.createCard(column.id, cardTitle, '', null, 'medium', null,
      { message_id: msg.id, channel_id: msg.channel_id })

    emitBoardUpdate(column.workspace_id)
    const task = findTask()
    if (task?.id) db.setCardSourceSnapshot(task.id, db.messageSnapshot(msg.id))
    if (isPrivate) io.to(`user:${req.user.id}`).emit('message:task', { messageId: msg.id, task })
    else io.to(`channel:${msg.channel_id}`).emit('message:task', { messageId: msg.id, task })
    res.json(task)
  } catch (e) {
    console.error('message→task error:', e)
    res.status(500).json({ error: 'Внутренняя ошибка сервера' })
  }
})

// ─── UPLOAD ───────────────────────────────────────────────
app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `Файл больше ${config.MAX_FILE_MB} МБ` : (err.message || 'Не удалось загрузить файл') })
    if (!req.file) return res.status(400).json({ error: 'Файл не получен' })
    const ext = path.extname(req.file.filename).toLowerCase()
    const mime = EXT_MIME[ext]
    const isImage = IMAGE_EXT.has(ext)
    // Картинка должна быть картинкой по содержимому, а не только по имени
    if (isImage && sniffImageMime(req.file.path) !== mime) {
      fs.unlink(req.file.path, () => { })
      return res.status(400).json({ error: 'Файл повреждён или не является изображением' })
    }
    res.json({
      url: `/uploads/${req.file.filename}`,
      name: String(req.file.originalname).slice(0, 255),
      size: req.file.size,
      mime,
      isImage,
      isVideo: VIDEO_EXT.has(ext)
    })
  })
})

// ─── STICKERS ─────────────────────────────────────────────
// Общая библиотека стикеров команды. Загрузить может любой, удалить — автор или админ.
const STICKER_MIME = { 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/jpeg': '.jpg' }
const stickerUpload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, UPLOADS_DIR),
    filename: (_, file, cb) => cb(null, randomName('sticker-', STICKER_MIME[file.mimetype]))
  }),
  limits: { fileSize: 1024 * 1024, files: 1 },
  fileFilter: (_, file, cb) => STICKER_MIME[file.mimetype]
    ? cb(null, true)
    : cb(new Error('Стикер: только PNG, WebP, GIF или JPEG'), false)
})

app.get('/api/stickers', (_, res) => res.json(db.stickers.list()))

app.post('/api/stickers', (req, res) => {
  stickerUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Стикер должен быть не больше 1 МБ' : err.message })
    if (!req.file) return res.status(400).json({ error: 'Файл не получен' })
    if (sniffImageMime(req.file.path) !== req.file.mimetype) {
      fs.unlink(req.file.path, () => { })
      return res.status(400).json({ error: 'Файл не является изображением' })
    }
    const pack = String(req.body?.pack || 'Общие').trim().slice(0, 40) || 'Общие'
    const emoji = String(req.body?.emoji || '').trim().slice(0, 8) || null
    const sticker = db.stickers.create(pack, `/uploads/${req.file.filename}`, emoji, req.user.id)
    io.emit('stickers:update')
    res.json(sticker)
  })
})

app.delete('/api/stickers/:id', (req, res) => {
  const sticker = db.stickers.get(Number(req.params.id))
  if (!sticker) return res.status(404).json({ error: 'Стикер не найден' })
  if (sticker.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Удалить стикер может только автор или админ' })
  }
  db.stickers.remove(sticker.id)
  // Файл не трогаем: старые сообщения со стикером должны продолжать отображаться
  io.emit('stickers:update')
  res.json({ ok: true })
})

// ─── UNFURL (превью ссылок) ───────────────────────────────
// Раньше сервер ходил по ЛЮБОМУ URL от клиента — SSRF: можно было дёрнуть
// cadvisor:8080, blackbox:9115/probe, роутер в 172.16.x.x, облачные метаданные
// 169.254.169.254 и т.д. Теперь: только http(s), стандартные порты, без логина в URL,
// и IP проверяется В МОМЕНТ СОЕДИНЕНИЯ (кастомный lookup) — это закрывает и
// DNS-rebinding, и редиректы на внутренние адреса (каждый хоп проверяется заново).
const BLOCKED_NETS = new net.BlockList()
for (const c of ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12',
  '192.0.0.0/24', '192.0.2.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24',
  '224.0.0.0/4', '240.0.0.0/4']) {
  const [a, bits] = c.split('/'); BLOCKED_NETS.addSubnet(a, Number(bits), 'ipv4')
}
for (const [a, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2001:db8::', 32]]) {
  BLOCKED_NETS.addSubnet(a, bits, 'ipv6')
}
function isBlockedIp(ip) {
  let addr = String(ip || '')
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(addr)
  if (mapped) addr = mapped[1]
  if (net.isIPv4(addr)) return BLOCKED_NETS.check(addr, 'ipv4')
  if (net.isIPv6(addr)) return BLOCKED_NETS.check(addr, 'ipv6')
  return true
}
function safeLookup(hostname, options, cb) {
  if (typeof options === 'function') { cb = options; options = {} }
  dnsCb.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err)
    if (!addrs.length || addrs.some(a => isBlockedIp(a.address))) {
      return cb(Object.assign(new Error('Адрес во внутренней сети — запрещено'), { code: 'EBLOCKED' }))
    }
    if (options && options.all) return cb(null, addrs)
    cb(null, addrs[0].address, addrs[0].family)
  })
}
const UNFURL_PORTS = new Set(['', '80', '443', '8080', '8443'])
const UNFURL_MAX_BYTES = 1024 * 1024
function assertPublicUrl(raw) {
  const u = new URL(raw)
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('protocol')
  if (u.username || u.password) throw new Error('credentials in url')
  if (!UNFURL_PORTS.has(u.port)) throw new Error('port')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host) && isBlockedIp(host)) throw new Error('blocked ip')
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.lan)$/i.test(host)) throw new Error('internal host')
  if (!host.includes('.') && !net.isIP(host)) throw new Error('single-label host') // docker-имена: cadvisor, blackbox…
  return u
}
function requestOnce(u) {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http
    const req = mod.get(u, {
      lookup: safeLookup,
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WorkVaultBot/1.0; link preview)',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        'Accept-Language': 'ru,en;q=0.8'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); return resolve({ redirect: res.headers.location })
      }
      const ct = String(res.headers['content-type'] || '')
      if (res.statusCode !== 200 || !/text\/html|application\/xhtml\+xml/i.test(ct)) { res.resume(); return resolve(null) }
      const chunks = []; let size = 0
      res.on('data', (c) => {
        size += c.length
        if (size > UNFURL_MAX_BYTES) { req.destroy(); resolve({ html: Buffer.concat(chunks).toString('utf8') }) }
        else chunks.push(c)
      })
      res.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8') }))
      res.on('error', reject)
    })
    const deadline = setTimeout(() => req.destroy(new Error('deadline')), 8000)
    req.on('close', () => clearTimeout(deadline))
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
  })
}
async function fetchPublicHtml(raw) {
  let current = raw
  for (let hop = 0; hop < 4; hop++) {
    const u = assertPublicUrl(current)
    const r = await requestOnce(u)
    if (!r) return null
    if (r.redirect) { current = new URL(r.redirect, u).toString(); continue }
    return { html: r.html, finalUrl: u.toString() }
  }
  return null
}

app.post('/api/unfurl', async (req, res) => {
  const url = String(req.body?.url || '').trim()
  if (!url) return res.status(400).json({ error: 'URL обязателен' })
  if (url.length > 2048 || !safeHttpUrl(url)) return res.json({ url: safeHttpUrl(url) || '' })
  try {
    const page = await fetchPublicHtml(url)
    if (!page?.html) return res.json({ url })
    const result = await ogs({ html: page.html })
    if (result.error) return res.json({ url })
    const d = result.result
    const rawImg = d.ogImage?.[0]?.url || d.twitterImage?.[0]?.url || ''
    let image = ''
    try { image = rawImg ? safeHttpUrl(new URL(rawImg, page.finalUrl).toString()) : '' } catch { }
    res.json(sanitizeLinkMeta({
      url,
      title: d.ogTitle || d.twitterTitle || '',
      description: d.ogDescription || d.twitterDescription || '',
      image,
      siteName: d.ogSiteName || new URL(page.finalUrl).hostname
    }) || { url })
  } catch {
    res.json({ url })
  }
})

// ─── FOLDERS UPDATE ───────────────────────────────────────
// Структура сайдбара общая для всех — менять её может только админ
app.post('/api/folders/update', requireAdmin, (req, res) => {
  try {
    db.updateFolders(req.body)
    io.emit('folders:update')
    res.json(db.getFolders())
  } catch (e) {
    console.error('folders/update error:', e)
    res.status(500).json({ error: 'Внутренняя ошибка сервера' })
  }
})

// ─── KANBAN: ДОСТУП ───────────────────────────────────────
// Раньше ни один kanban-роут не проверял, чья это зона, а workspace_id для
// рассылки брался из тела запроса. Теперь: общие зоны (owner_id = NULL) видят
// все, личные — только владелец; рассылка идёт в комнату user:<id> владельца.
function canAccessWorkspace(user, wsId) {
  if (wsId == null || wsId === '') return false
  const ws = db.kanban.getWorkspace(Number(wsId))
  return !!ws && (ws.owner_id == null || ws.owner_id === user.id)
}
function resolveWorkspaceId(user, raw) {
  const id = raw != null && raw !== '' ? Number(raw) : db.kanban.firstSharedWorkspaceId()
  return canAccessWorkspace(user, id) ? id : null
}
const notFound = (res) => res.status(404).json({ error: 'Не найдено' })
function cardWorkspace(req, cardId) {
  const ws = db.kanban.workspaceIdOfCard(Number(cardId))
  return canAccessWorkspace(req.user, ws) ? ws : null
}
function columnWorkspace(req, colId) {
  const ws = db.kanban.workspaceIdOfColumn(Number(colId))
  return canAccessWorkspace(req.user, ws) ? ws : null
}
function subtaskCard(req, subtaskId) {
  const cardId = db.kanban.cardIdOfSubtask(Number(subtaskId))
  return cardId != null && cardWorkspace(req, cardId) != null ? cardId : null
}
function emitToWorkspace(wsId, event, payload) {
  const ws = wsId != null ? db.kanban.getWorkspace(Number(wsId)) : null
  if (!ws) return
  if (ws.owner_id != null) io.to(`user:${ws.owner_id}`).emit(event, payload)
  else io.emit(event, payload)
}
function emitWorkspacesUpdate(ownerId) {
  if (ownerId) io.to(`user:${ownerId}`).emit('kanban:workspaces:update')
  else io.emit('kanban:workspaces:update')
}
const cleanColor = (c) => (typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c)) ? c : undefined
const cleanIcon = (i) => (typeof i === 'string' && i.length <= 40) ? i : undefined

// ─── KANBAN: РАБОЧИЕ ЗОНЫ ──────────────────────────────────
app.get('/api/kanban/workspaces', (req, res) => {
  res.json(db.kanban.getWorkspaces(req.user.id))
})

app.post('/api/kanban/workspaces', (req, res) => {
  const { name, icon, color, is_private } = req.body || {}
  if (!name?.trim()) return res.status(400).json({ error: 'Название обязательно' })
  const ws = db.kanban.createWorkspace(String(name).trim().slice(0, 60), cleanIcon(icon), cleanColor(color), is_private ? req.user.id : null)
  emitWorkspacesUpdate(ws.owner_id)
  res.json(ws)
})

app.patch('/api/kanban/workspaces/:id', (req, res) => {
  if (!canAccessWorkspace(req.user, req.params.id)) return notFound(res)
  const { name, icon, color } = req.body || {}
  const ws = db.kanban.updateWorkspace(Number(req.params.id), {
    name: name != null ? String(name).trim().slice(0, 60) : undefined,
    icon: cleanIcon(icon),
    color: cleanColor(color)
  })
  emitWorkspacesUpdate(ws?.owner_id)
  res.json(ws)
})

app.delete('/api/kanban/workspaces/:id', (req, res) => {
  if (!canAccessWorkspace(req.user, req.params.id)) return notFound(res)
  const id = Number(req.params.id)
  const ws = db.kanban.getWorkspace(id)
  try {
    const links = linksFor(db.kanban.cardIdsOfWorkspace(id)) // до удаления — потом карточек уже нет
    const result = db.kanban.deleteWorkspace(id)
    if (!result.ok) return res.status(400).json(result)
    emitWorkspacesUpdate(ws?.owner_id)
    emitTaskLinks(links) // у сообщений в чате пропадает плашка задачи
    res.json(result)
  } catch (e) {
    console.error('delete workspace failed:', e)
    res.status(500).json({ ok: false, error: 'Не удалось удалить зону' })
  }
})

// ─── KANBAN: ДОСКА ──────────────────────────────────────────
function emitBoardUpdate(workspaceId) {
  if (workspaceId == null) return
  const id = Number(workspaceId)
  emitToWorkspace(id, 'kanban:update', { workspace_id: id, board: db.kanban.getBoard(id) })
}

// links с владельцем зоны — берём ДО удаления/после переноса карточки
function linksFor(ids) {
  return db.kanban.linkedMessages(ids).map(l => {
    const ws = db.kanban.getWorkspace(db.kanban.workspaceIdOfCard(l.id))
    return { ...l, owner_id: ws?.owner_id ?? null }
  })
}
// Обновляем чипы задач под сообщениями в чате. В канал уходит только
// «общий» чип (личные задачи остальным не видны), владельцу личной — его чип.
function emitTaskLinks(links) {
  for (const l of links || []) {
    io.to(`channel:${l.source_channel_id}`).emit('message:task', {
      messageId: l.source_message_id,
      task: db.taskForMessage(l.source_message_id)
    })
    if (l.owner_id) {
      io.to(`user:${l.owner_id}`).emit('message:task', {
        messageId: l.source_message_id,
        task: db.privateTaskForMessage(l.source_message_id, l.owner_id) || db.taskForMessage(l.source_message_id)
      })
    }
  }
}
const emitTasksForCards = (ids) => emitTaskLinks(linksFor(ids))

app.get('/api/kanban', (req, res) => {
  const wsId = resolveWorkspaceId(req.user, req.query.workspace_id)
  if (wsId == null) return notFound(res)
  res.json(db.kanban.getBoard(wsId))
})

app.get('/api/kanban/archive', (req, res) => {
  const wsId = resolveWorkspaceId(req.user, req.query.workspace_id)
  if (wsId == null) return notFound(res)
  res.json(db.kanban.getArchivedCards(wsId))
})

app.post('/api/kanban/cards', (req, res) => {
  const { column_id, title, description, assignee_id, priority, due_date } = req.body || {}
  if (!title?.trim()) return res.status(400).json({ error: 'Название обязательно' })
  const wsId = columnWorkspace(req, column_id)
  if (wsId == null) return notFound(res)
  const card = db.kanban.createCard(column_id, String(title).trim().slice(0, 300), description, assignee_id, priority, due_date)
  emitBoardUpdate(wsId)
  res.json(card)
})

app.patch('/api/kanban/cards/:id', (req, res) => {
  const wsId = cardWorkspace(req, req.params.id)
  if (wsId == null) return notFound(res)
  const { title, description, assignee_id, priority, column_id, due_date } = req.body || {}
  let newWs = wsId
  if (column_id != null) {
    newWs = columnWorkspace(req, column_id)
    if (newWs == null) return notFound(res)
  }
  const card = db.kanban.updateCard(req.params.id, { title, description, assignee_id, priority, column_id, due_date })
  emitBoardUpdate(wsId)
  if (newWs !== wsId) emitBoardUpdate(newWs)
  emitTasksForCards([req.params.id])
  res.json(card)
})

app.post('/api/kanban/cards/:id/move', (req, res) => {
  const { column_id } = req.body || {}
  if (!column_id) return res.status(400).json({ error: 'column_id обязателен' })
  if (cardWorkspace(req, req.params.id) == null || columnWorkspace(req, column_id) == null) return notFound(res)
  const result = db.kanban.moveCardToColumn(req.params.id, column_id)
  if (!result) return res.status(404).json({ error: 'Карточка не найдена' })
  emitBoardUpdate(result.oldWorkspaceId)
  if (result.newWorkspaceId !== result.oldWorkspaceId) emitBoardUpdate(result.newWorkspaceId)
  emitTasksForCards([req.params.id])
  res.json(result.card)
})

app.post('/api/kanban/cards/reorder', (req, res) => {
  // body: { workspace_id, cards: [{ id, column_id }] } — весь список карточек в новом порядке
  const { cards } = Array.isArray(req.body) ? { cards: req.body } : (req.body || {})
  if (!Array.isArray(cards) || cards.length > 5000) return res.status(400).json({ error: 'Некорректный список' })
  const touched = new Set()
  for (const c of cards) {
    const a = cardWorkspace(req, c?.id)
    const b = columnWorkspace(req, c?.column_id)
    if (a == null || b == null) return notFound(res)
    touched.add(a); touched.add(b)
  }
  db.kanban.reorderCards(cards)
  touched.forEach(emitBoardUpdate)
  emitTasksForCards(cards.map(c => c.id))
  res.json({ ok: true })
})

app.delete('/api/kanban/cards/:id', (req, res) => {
  const wsId = cardWorkspace(req, req.params.id)
  if (wsId == null) return notFound(res)
  const links = linksFor([req.params.id])
  db.kanban.deleteCard(req.params.id)
  emitBoardUpdate(wsId)
  emitTaskLinks(links)
  res.json({ ok: true })
})

app.post('/api/kanban/cards/:id/archive', (req, res) => {
  const wsId = cardWorkspace(req, req.params.id)
  if (wsId == null) return notFound(res)
  db.kanban.archiveCard(req.params.id)
  emitBoardUpdate(wsId)
  emitTasksForCards([req.params.id])
  res.json({ ok: true })
})

app.post('/api/kanban/cards/:id/unarchive', (req, res) => {
  const wsId = cardWorkspace(req, req.params.id)
  if (wsId == null) return notFound(res)
  db.kanban.unarchiveCard(req.params.id)
  emitBoardUpdate(wsId)
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
  if (cardWorkspace(req, req.params.id) == null) return notFound(res)
  const card = db.kanban.getCard(req.params.id)
  if (!card) return notFound(res)
  res.json(card)
})

function emitCardUpdate(cardId) {
  emitToWorkspace(db.kanban.workspaceIdOfCard(Number(cardId)), 'kanban:card:update', cardId)
}

// ─── SUBTASKS ─────────────────────────────────────────────
app.post('/api/kanban/cards/:id/subtasks', (req, res) => {
  if (cardWorkspace(req, req.params.id) == null) return notFound(res)
  const { title, assignee_id, priority, description } = req.body || {}
  if (!title?.trim()) return res.status(400).json({ error: 'Название обязательно' })
  const subtask = db.kanban.createSubtask(req.params.id, String(title).trim().slice(0, 300), assignee_id, priority, description)
  emitCardUpdate(req.params.id)
  res.json(subtask)
})

app.patch('/api/kanban/subtasks/:id', (req, res) => {
  if (subtaskCard(req, req.params.id) == null) return notFound(res)
  const subtask = db.kanban.updateSubtask(req.params.id, req.body || {})
  emitCardUpdate(subtask.card_id)
  res.json(subtask)
})

app.post('/api/kanban/subtasks/reorder', (req, res) => {
  if (!Array.isArray(req.body) || req.body.length > 2000) return res.status(400).json({ error: 'Некорректный список' })
  for (const st of req.body) if (subtaskCard(req, st?.id) == null) return notFound(res)
  db.kanban.reorderSubtasks(req.body)
  if (req.body.length) emitCardUpdate(db.kanban.cardIdOfSubtask(Number(req.body[0].id)))
  res.json({ ok: true })
})

app.delete('/api/kanban/subtasks/:id', (req, res) => {
  const cardId = subtaskCard(req, req.params.id)
  if (cardId == null) return notFound(res)
  db.kanban.deleteSubtask(req.params.id)
  emitCardUpdate(cardId)
  res.json({ ok: true })
})

// ─── TAGS (свободные, создаются на лету) ───────────────────
app.get('/api/kanban/tags', (_, res) => res.json(db.kanban.getAllTags()))

app.post('/api/kanban/subtasks/:id/tags', (req, res) => {
  const cardId = subtaskCard(req, req.params.id)
  if (cardId == null) return notFound(res)
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Название тега обязательно' })
  if (name.length > 30) return res.status(400).json({ error: 'Слишком длинное название тега' })
  const tags = db.kanban.addTagToSubtask(req.params.id, name)
  emitCardUpdate(cardId)
  res.json(tags)
})

app.delete('/api/kanban/subtasks/:id/tags/:tagId', (req, res) => {
  const cardId = subtaskCard(req, req.params.id)
  if (cardId == null) return notFound(res)
  const tags = db.kanban.removeTagFromSubtask(req.params.id, req.params.tagId)
  emitCardUpdate(cardId)
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

// ─── ВАЛИДАЦИЯ ВХОДНЫХ ДАННЫХ СОКЕТА ──────────────────────
// Раньше channelId/attachment/linkMeta принимались как есть: можно было
// писать в чужие каналы, подсунуть javascript:-ссылку в превью или
// «вложение» с произвольным url, а edit/delete/reaction рассылались в канал,
// который назвал сам клиент.
const MAX_MESSAGE_LEN = 10000
const toId = (v) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null }
const clip = (v, n) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, n)
function safeHttpUrl(v, max = 2048) {
  if (typeof v !== 'string' || !v || v.length > max) return ''
  try { const u = new URL(v); return ['http:', 'https:'].includes(u.protocol) ? u.toString() : '' } catch { return '' }
}
function sanitizeLinkMeta(m) {
  if (!m || typeof m !== 'object') return null
  const url = safeHttpUrl(m.url)
  if (!url) return null
  return { url, title: clip(m.title, 300), description: clip(m.description, 1000), image: safeHttpUrl(m.image), siteName: clip(m.siteName, 100) }
}
function sanitizeAttachment(a) {
  if (!a || typeof a !== 'object') return null
  const m = /^\/uploads\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(typeof a.url === 'string' ? a.url : '')
  if (!m) return null
  const ext = path.extname(m[1]).toLowerCase()
  if (!EXT_MIME[ext]) return null
  if (!fs.existsSync(path.join(UPLOADS_DIR, m[1]))) return null
  return {
    url: a.url,
    name: clip(a.name || m[1], 255),
    size: Math.max(0, Number(a.size) || 0),
    mime: EXT_MIME[ext],
    isImage: IMAGE_EXT.has(ext),
    isVideo: VIDEO_EXT.has(ext)
  }
}
const REACTION_RE = /^[^\s<>"'&`]{1,16}$/u
// Простой лимит на сокет: не больше max событий за windowMs
function allowSocketEvent(socket, key, max, windowMs) {
  const now = Date.now()
  socket.data.rl ??= {}
  const e = socket.data.rl[key]
  if (!e || now - e.start > windowMs) { socket.data.rl[key] = { start: now, n: 1 }; return true }
  return ++e.n <= max
}

io.on('connection', (socket) => {
  console.log('connect', socket.id, socket.user.name)
  // Личная комната — сюда уходят события личных канбан-зон и личных чипов задач
  socket.join(`user:${socket.user.id}`)

  onlineUsers.set(socket.id, { userId: socket.user.id, userName: socket.user.name, channelId: null })
  io.emit('online:update', getOnlineList())

  socket.on('channel:join', (payload) => {
    const channelId = toId(payload?.channelId)
    if (!channelId || !db.channelExists(channelId)) return
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
  // userId — только из проверенного socket.user. ack — необязательный callback.
  socket.on('message:send', (payload, ack) => {
    if (typeof ack !== 'function') ack = null
    try {
      const { text, attachment, linkMeta, parentId, poll, stickerId } = payload || {}
      const channelId = toId(payload?.channelId)
      if (!channelId || !db.channelExists(channelId)) {
        ack?.({ ok: false, error: 'Канал не найден' }); return
      }
      if (!allowSocketEvent(socket, 'send', 30, 10_000)) {
        ack?.({ ok: false, error: 'Слишком часто — подожди пару секунд' }); return
      }
      const cleanText = text == null ? '' : String(text)
      if (cleanText.length > MAX_MESSAGE_LEN) {
        ack?.({ ok: false, error: `Сообщение слишком длинное (максимум ${MAX_MESSAGE_LEN} символов)` }); return
      }
      // Ответ в треде: корень должен быть в том же канале; ответ на ответ
      // поднимаем до корня — треды плоские
      let parent = null
      if (parentId) {
        parent = db.getMessageById(Number(parentId))
        if (parent?.parent_id) parent = db.getMessageById(parent.parent_id)
        if (!parent || parent.channel_id !== channelId) {
          ack?.({ ok: false, error: 'Тред не найден — возможно, сообщение удалили' })
          return
        }
      }
      // Стикер: url берём из БД по id — клиент не может подсунуть свой
      let sticker = null
      if (stickerId != null) {
        sticker = db.stickers.get(toId(stickerId))
        if (!sticker) { ack?.({ ok: false, error: 'Стикер не найден — возможно, его удалили' }); return }
      }
      const cleanAttachment = sticker
        ? { url: sticker.url, name: 'Стикер', isSticker: true, stickerId: sticker.id, emoji: sticker.emoji || null, mime: EXT_MIME[path.extname(sticker.url).toLowerCase()] || 'image/png', isImage: true }
        : sanitizeAttachment(attachment)
      if (attachment && !sticker && !cleanAttachment) {
        ack?.({ ok: false, error: 'Вложение не прошло проверку — загрузи файл заново' }); return
      }
      // Опрос: текст сообщения = вопрос, от 2 до 10 уникальных вариантов, без файлов
      let pollJson = null
      if (poll) {
        const options = [...new Set((Array.isArray(poll.options) ? poll.options : [])
          .map(o => String(o ?? '').trim().slice(0, 100)).filter(Boolean))]
        if (!cleanText.trim() || cleanAttachment || options.length < 2 || options.length > 10) {
          ack?.({ ok: false, error: 'Опросу нужен вопрос и от 2 до 10 вариантов' })
          return
        }
        pollJson = JSON.stringify({ options, multi: !!poll.multi })
      }
      if (!cleanText.trim() && !cleanAttachment) {
        ack?.({ ok: false, error: 'Пустое сообщение' }); return
      }
      const cleanMeta = sticker ? null : sanitizeLinkMeta(linkMeta)
      const type = pollJson ? 'poll' : sticker ? 'sticker' : cleanAttachment ? (cleanAttachment.isImage ? 'image' : 'file') : 'text'
      const result = db.createMessage(
        channelId, socket.user.id, sticker ? null : (cleanText || null), type,
        cleanAttachment ? JSON.stringify(cleanAttachment) : null,
        cleanMeta ? JSON.stringify(cleanMeta) : null,
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
        // Только id канала/автора — без текста, для счётчиков непрочитанного
        io.emit('channel:activity', { channelId, userId: socket.user.id })
      }
      ack?.({ ok: true, id: msg.id })
    } catch (e) {
      console.error('message:send error:', e)
      ack?.({ ok: false, error: 'Не удалось отправить сообщение' })
    }
  })

  // Канал для рассылки берём из самого сообщения в БД, а не от клиента
  socket.on('message:edit', (payload) => {
    const messageId = toId(payload?.messageId)
    const text = payload?.text == null ? '' : String(payload.text)
    if (!messageId || !text.trim() || text.length > MAX_MESSAGE_LEN) return
    const msg = db.getMessageById(messageId)
    if (!msg) return
    const r = db.editMessage(messageId, text, socket.user.id) // WHERE user_id=? — чужое не отредактирует
    if (r.changes) io.to(`channel:${msg.channel_id}`).emit('message:edited', { messageId, text })
  })

  socket.on('message:delete', (payload, ack) => {
    if (typeof ack !== 'function') ack = null
    try {
      const messageId = toId(payload?.messageId)
      if (!messageId) { ack?.({ ok: false, error: 'Нет id' }); return }
      const before = db.getMessageById(messageId)
      if (!before) { ack?.({ ok: true }); return } // уже удалено — клиенту можно убрать
      const r = db.deleteMessage(messageId, socket.user.id) // та же защита на уровне SQL
      if (!r.changes) { ack?.({ ok: false, error: 'Нельзя удалить чужое сообщение' }); return }
      io.to(`channel:${before.channel_id}`).emit('message:deleted', { messageId })
      if (before.parent_id) {
        io.to(`channel:${before.channel_id}`).emit('message:thread', { messageId: before.parent_id, ...db.threadMeta(before.parent_id) })
      }
      ack?.({ ok: true })
    } catch (e) {
      console.error('message:delete error:', e)
      ack?.({ ok: false, error: 'Не удалось удалить сообщение' })
    }
  })

  socket.on('reaction:toggle', (payload) => {
    const messageId = toId(payload?.messageId)
    const emoji = typeof payload?.emoji === 'string' ? payload.emoji : ''
    if (!messageId || !REACTION_RE.test(emoji)) return
    if (!allowSocketEvent(socket, 'reaction', 40, 10_000)) return
    const msg = db.getMessageById(messageId)
    if (!msg) return
    db.toggleReaction(messageId, socket.user.id, emoji)
    io.to(`channel:${msg.channel_id}`).emit('reaction:update', { messageId, reactions: db.getReactions(messageId) })
  })

  // Голос в опросе. Канал берём из самого сообщения, а не с клиента
  socket.on('poll:vote', (payload) => {
    try {
      const m = db.getMessageById(toId(payload?.messageId))
      if (!m?.poll) return
      const p = JSON.parse(m.poll)
      const i = Number(payload?.option)
      if (!Number.isInteger(i) || i < 0 || i >= p.options.length) return
      db.votePoll(m.id, socket.user.id, i, !!p.multi)
      io.to(`channel:${m.channel_id}`).emit('poll:update', { messageId: m.id, poll: db.pollFor(m.id, m.poll) })
    } catch (e) {
      console.error('poll:vote error:', e)
    }
  })

  socket.on('typing:start', (payload) => {
    const channelId = toId(payload?.channelId)
    if (!channelId || !allowSocketEvent(socket, 'typing', 20, 10_000)) return
    socket.to(`channel:${channelId}`).emit('typing:update', { userName: socket.user.name, typing: true })
  })
  socket.on('typing:stop', (payload) => {
    const channelId = toId(payload?.channelId)
    if (!channelId) return
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
    res.status(500).json({ error: 'Внутренняя ошибка сервера' })
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
