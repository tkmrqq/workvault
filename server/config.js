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

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''
const KANBAN_ARCHIVE_AFTER_DAYS = Number(process.env.KANBAN_ARCHIVE_AFTER_DAYS) || 3

module.exports = {
  PORT, HOST, APP_URL,
  UPLOADS_DIR, MAX_FILE_MB, MAX_FILE_BYTES,
  ADMIN_PASSWORD, KANBAN_ARCHIVE_AFTER_DAYS
}
