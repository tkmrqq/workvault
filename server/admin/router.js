const express = require('express')
const fs = require('fs')
const path = require('path')
const db = require('../db')
const { requireAdmin, verifyAccessToken, setAuthCookies, loginRateLimit, registerFailedLogin, clearFailedLogins } = require('../auth')
const { renderAdminPage, renderAdminLoginPage } = require('./view')

const config = require('../config')
const UPLOADS_DIR = config.UPLOADS_DIR

// Экспортируем фабрику, а не готовый роутер — админке нужен io,
// чтобы разослать клиентам обновление после удаления рабочей зоны.
module.exports = function createAdminRouter(io) {
  const router = express.Router()

  // ── Страница логина в саму админку (доступна без авторизации) ──
  // Та же проверка пароля, что и в общем /api/auth/login, но здесь ещё
  // сверяем role === 'admin' — без своей страницы входа сюда просто
  // некуда было бы попасть, не залогинившись сначала в самом приложении.
  router.get('/login', (req, res) => {
    res.send(renderAdminLoginPage({ error: null }))
  })

  router.post('/login', loginRateLimit, (req, res) => {
    const { name, password } = req.body
    const user = db.getUserAuthByName((name || '').trim())
    const ok = user && user.password_hash && db.verifyUserPassword(user.id, password || '')
    if (!ok) {
      registerFailedLogin(req)
      return res.status(401).send(renderAdminLoginPage({ error: 'Неверное имя или пароль' }))
    }
    if (user.role !== 'admin') {
      return res.status(403).send(renderAdminLoginPage({ error: 'У этого аккаунта нет прав администратора' }))
    }
    clearFailedLogins(req)
    setAuthCookies(res, user)
    res.redirect('/admin')
  })

  // GET / — обычная навигация браузером, поэтому при отсутствии валидной
  // сессии редиректим на страницу логина, а не отдаём JSON-ошибку
  // (в отличие от /admin/api/*, которые дёргает fetch с самой этой страницы).
  router.get('/', (req, res) => {
    const payload = req.cookies?.access_token && verifyAccessToken(req.cookies.access_token)
    if (!payload || payload.role !== 'admin') return res.redirect('/admin/login')

    const stats = {
      users:      db.db.prepare('SELECT COUNT(*) as c FROM users').get().c,
      messages:   db.db.prepare('SELECT COUNT(*) as c FROM messages').get().c,
      channels:   db.db.prepare('SELECT COUNT(*) as c FROM channels').get().c,
      uploads:    fs.readdirSync(UPLOADS_DIR).length,
      dbSize:     (fs.statSync(path.join(__dirname, '../../data/workvault.db')).size / 1024 / 1024).toFixed(2) + ' MB',
      uptime:     Math.floor(process.uptime() / 60) + ' min',
      cards:      db.db.prepare('SELECT COUNT(*) as c FROM kanban_cards WHERE archived_at IS NULL').get().c,
      archived:   db.db.prepare('SELECT COUNT(*) as c FROM kanban_cards WHERE archived_at IS NOT NULL').get().c,
      workspaces: db.db.prepare('SELECT COUNT(*) as c FROM kanban_workspaces').get().c,
    }
    const users = db.getUsers() // теперь включает role и has_password
    const channels = db.db.prepare(`
      SELECT c.id, c.name, f.name as folder, COUNT(m.id) as msg_count
      FROM channels c
      LEFT JOIN folders f ON f.id = c.folder_id
      LEFT JOIN messages m ON m.channel_id = c.id
      GROUP BY c.id
    `).all()
    const workspaces = db.db.prepare(`
      SELECT w.id, w.name, w.icon,
        (SELECT COUNT(*) FROM kanban_columns col WHERE col.workspace_id = w.id) as col_count,
        (SELECT COUNT(*) FROM kanban_cards k JOIN kanban_columns col ON k.column_id = col.id WHERE col.workspace_id = w.id AND k.archived_at IS NULL) as card_count
      FROM kanban_workspaces w ORDER BY w.sort
    `).all()
    const log = db.getAdminLog(30)

    res.send(renderAdminPage({ stats, users, channels, workspaces, log, me: payload }))
  })

  router.post('/api/clear-history/:channelId', requireAdmin, (req, res) => {
    try {
      const result = db.db.prepare('DELETE FROM messages WHERE channel_id = ?')
        .run(req.params.channelId)
      db.logAdmin('clear-history', { channelId: req.params.channelId, deleted: result.changes })
      res.json({ ok: true, deleted: result.changes })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  router.post('/api/delete-user/:id', requireAdmin, (req, res) => {
    try {
      db.db.prepare('DELETE FROM messages WHERE user_id = ?').run(req.params.id)
      db.db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id)
      db.logAdmin('delete-user', { userId: req.params.id })
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  router.post('/api/set-role/:id', requireAdmin, (req, res) => {
    const { role } = req.body
    if (!['member', 'admin'].includes(role)) return res.status(400).json({ error: 'Недопустимая роль' })
    if (Number(req.params.id) === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'Нельзя снять права администратора с самого себя' })
    }
    try {
      db.setUserRole(req.params.id, role)
      db.logAdmin('set-role', { userId: req.params.id, role })
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  router.post('/api/delete-workspace/:id', requireAdmin, (req, res) => {
    try {
      const result = db.kanban.deleteWorkspace(req.params.id)
      if (!result.ok) return res.status(400).json(result)
      db.logAdmin('delete-workspace', { workspaceId: req.params.id })
      io.emit('kanban:workspaces:update')
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  return router
}