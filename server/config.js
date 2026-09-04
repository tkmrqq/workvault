const path = require('path')

// Единственный источник .env — корень проекта. Локально там localhost,
// на проде — 172.16.99.37. Файл не в гите, так что окружения не пересекаются
// и никакого переключения через код/аргументы не нужно.
require('dotenv').config({ path: path.join(__dirname, '../.env') })

const PORT    = Number(process.env.PORT) || 3000
const HOST    = process.env.HOST || '0.0.0.0'
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`

const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? (path.isAbsolute(process.env.UPLOADS_DIR)
      ? process.env.UPLOADS_DIR
      : path.join(__dirname, '..', process.env.UPLOADS_DIR))
  : path.join(__dirname, '../data/uploads')

const MAX_FILE_MB = Number(process.env.MAX_FILE_MB) || 100
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024

// ADMIN_PASSWORD теперь используется только как одноразовый "мастер-ключ"
// для назначения самого первого админа (POST /api/auth/bootstrap-admin) —
// не для входа в саму панель, вход туда общий с остальным приложением.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''
const KANBAN_ARCHIVE_AFTER_DAYS = Number(process.env.KANBAN_ARCHIVE_AFTER_DAYS) || 3

// ─── Auth (JWT) ─────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || ''
if (!JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET не задан в .env — вход в приложение работать не будет.')
  console.warn('   Сгенерировать: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"')
}
const JWT_ACCESS_EXPIRES_IN  = process.env.JWT_ACCESS_EXPIRES_IN  || '15m'
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d'
const JWT_REFRESH_EXPIRES_MS = 30 * 24 * 60 * 60 * 1000 // держим в мс отдельно — удобнее для Date-математики и cookie maxAge
// secure-флаг для cookie — включать только когда сервер реально висит за TLS
// (nginx/прод); пока HTTP — secure=true просто не даст браузеру отправить cookie вообще
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true'

module.exports = {
  PORT, HOST, APP_URL,
  UPLOADS_DIR, MAX_FILE_MB, MAX_FILE_BYTES,
  ADMIN_PASSWORD, KANBAN_ARCHIVE_AFTER_DAYS,
  JWT_SECRET, JWT_ACCESS_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN, JWT_REFRESH_EXPIRES_MS,
  COOKIE_SECURE
}