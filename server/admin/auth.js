// Раньше здесь был отдельный Basic Auth только для /admin (общий ADMIN_PASSWORD
// на всех). Теперь админка использует ту же авторизацию, что и всё
// приложение — просто с проверкой role === 'admin'. Логика живёт в
// server/auth.js, здесь только реэкспорт, чтобы не трогать импорты в router.js.
const { requireAdmin } = require('../auth')

module.exports = { requireAdminAuth: requireAdmin }