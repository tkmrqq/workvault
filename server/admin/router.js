const express = require('express')
const fs = require('fs')
const path = require('path')
const db = require('../db')
const { requireAdmin, verifyAccessToken, setAuthCookies, clearAuthCookies, loginRateLimit, registerFailedLogin, clearFailedLogins } = require('../auth')
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

  // Ссылка «Выйти» на странице админки вела в никуда (роута не было)
  router.get('/logout', (req, res) => {
    clearAuthCookies(res)
    res.redirect('/admin/login')
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
    const folders = db.getFolders()

    res.send(renderAdminPage({ stats, users, channels, folders, workspaces, log, me: payload }))
  })

  router.post('/api/clear-history/:channelId', requireAdmin, (req, res) => {
    try {
      const result = db.db.prepare('DELETE FROM messages WHERE channel_id = ?')
        .run(req.params.channelId)
      db.logAdmin('clear-history', { channelId: req.params.channelId, deleted: result.changes })
      res.json({ ok: true, deleted: result.changes })
    } catch (e) {
      res.status(500).json({ error: 'Внутренняя ошибка сервера' })
    }
  })

  // Раньше: удалялись только сообщения + пользователь, но его access-токен жил ещё
  // 15 минут, refresh — до 30 дней, а реакции/голоса оставались сиротами.
  router.post('/api/delete-user/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id)
    if (id === req.user.id) return res.status(400).json({ error: 'Нельзя удалить самого себя' })
    try {
      db.db.transaction(() => {
        db.revokeUserSessions(id)
        const mine = 'SELECT id FROM messages WHERE user_id = ?'
        db.db.prepare(`DELETE FROM reactions WHERE user_id = ? OR message_id IN (${mine})`).run(id, id)
        db.db.prepare(`DELETE FROM poll_votes WHERE user_id = ? OR message_id IN (${mine})`).run(id, id)
        db.db.prepare(`UPDATE messages SET parent_id = NULL WHERE parent_id IN (${mine})`).run(id)
        db.db.prepare('DELETE FROM messages WHERE user_id = ?').run(id)
        db.db.prepare('DELETE FROM users WHERE id = ?').run(id)
      })()
      db.logAdmin('delete-user', { userId: id, by: req.user.id })
      io.in(`user:${id}`).disconnectSockets(true)
      res.json({ ok: true })
    } catch (e) {
      console.error('delete-user error:', e)
      res.status(500).json({ error: 'Внутренняя ошибка сервера' })
    }
  })

  router.post('/api/set-role/:id', requireAdmin, (req, res) => {
    const { role } = req.body || {}
    if (!['member', 'admin'].includes(role)) return res.status(400).json({ error: 'Недопустимая роль' })
    if (Number(req.params.id) === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'Нельзя снять права администратора с самого себя' })
    }
    try {
      db.setUserRole(req.params.id, role)
      // Роль зашита в JWT: без отзыва сессий снятый админ оставался бы админом
      // до истечения access-токена. Заставляем перелогиниться.
      if (Number(req.params.id) !== req.user.id) {
        db.revokeUserSessions(Number(req.params.id))
        io.in(`user:${Number(req.params.id)}`).disconnectSockets(true)
      }
      db.logAdmin('set-role', { userId: req.params.id, role, by: req.user.id })
      res.json({ ok: true })
    } catch (e) {
      console.error('set-role error:', e)
      res.status(500).json({ error: 'Внутренняя ошибка сервера' })
    }
  })

  // Замена дырявому /api/auth/set-password: пароль задаёт/сбрасывает админ
  router.post('/api/reset-password/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id)
    const password = String(req.body?.password || '')
    if (password.length < 8) return res.status(400).json({ error: 'Пароль — минимум 8 символов' })
    if (password.length > 200) return res.status(400).json({ error: 'Слишком длинный пароль' })
    if (!db.getUserById(id)) return res.status(404).json({ error: 'Пользователь не найден' })
    try {
      db.setUserPassword(id, password)
      if (id !== req.user.id) {
        db.revokeUserSessions(id)
        io.in(`user:${id}`).disconnectSockets(true)
      }
      db.logAdmin('reset-password', { userId: id, by: req.user.id })
      res.json({ ok: true })
    } catch (e) {
      console.error('reset-password error:', e)
      res.status(500).json({ error: 'Внутренняя ошибка сервера' })
    }
  })

  router.post('/api/delete-workspace/:id', requireAdmin, (req, res) => {
    try {
      const result = db.kanban.deleteWorkspace(req.params.id)
      if (!result.ok) return res.status(400).json(result)
      db.logAdmin('delete-workspace', { workspaceId: req.params.id, by: req.user.id })
      io.emit('kanban:workspaces:update')
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ error: 'Внутренняя ошибка сервера' })
    }
  })

  // ── Каналы и папки ──
  // Раньше редактировались из настроек приложения одним большим /api/folders/update:
  // не-админ получал 403, а фронт записывал {error} вместо списка папок — переименование
  // «не работало», а другие клиенты изменений вообще не видели. Теперь — точечные операции.
  const cleanName = (v, fallback) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 64) || fallback
  const cleanIcon = (v, fallback) => [...String(v ?? '').trim()].slice(0, 4).join('') || fallback
  const folderById = (id) => db.db.prepare('SELECT * FROM folders WHERE id = ?').get(Number(id))
  const channelById = (id) => db.db.prepare('SELECT * FROM channels WHERE id = ?').get(Number(id))
  const broadcastFolders = () => io.emit('folders:update')
  const nextSort = (table, where = '', ...args) =>
    (db.db.prepare(`SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM ${table} ${where}`).get(...args)).s
  const handle = (action, fn) => (req, res) => {
    try {
      const result = fn(req, res)
      if (res.headersSent) return
      db.logAdmin(action, { ...req.params, ...(req.body || {}), by: req.user.id })
      broadcastFolders()
      res.json({ ok: true, ...(result || {}), folders: db.getFolders() })
    } catch (e) {
      console.error(`${action} error:`, e)
      if (!res.headersSent) res.status(500).json({ error: 'Внутренняя ошибка сервера' })
    }
  }

  router.post('/api/folders', requireAdmin, handle('create-folder', (req) => {
    const id = db.db.prepare('INSERT INTO folders (name, icon, sort) VALUES (?,?,?)')
      .run(cleanName(req.body?.name, 'Новая папка'), cleanIcon(req.body?.icon, '📁'), nextSort('folders')).lastInsertRowid
    return { id: Number(id) }
  }))

  router.post('/api/folders/:id', requireAdmin, handle('update-folder', (req, res) => {
    const f = folderById(req.params.id)
    if (!f) return res.status(404).json({ error: 'Папка не найдена' })
    db.db.prepare('UPDATE folders SET name = ?, icon = ? WHERE id = ?')
      .run(cleanName(req.body?.name, f.name), cleanIcon(req.body?.icon, f.icon), f.id)
  }))

  router.post('/api/folders/:id/delete', requireAdmin, handle('delete-folder', (req, res) => {
    const f = folderById(req.params.id)
    if (!f) return res.status(404).json({ error: 'Папка не найдена' })
    const { c } = db.db.prepare('SELECT COUNT(*) AS c FROM channels WHERE folder_id = ?').get(f.id)
    if (c > 0) return res.status(400).json({ error: 'В папке есть каналы — сначала перенесите или удалите их' })
    db.db.prepare('DELETE FROM folders WHERE id = ?').run(f.id)
  }))

  router.post('/api/channels', requireAdmin, handle('create-channel', (req, res) => {
    const f = folderById(req.body?.folderId)
    if (!f) return res.status(400).json({ error: 'Укажите существующую папку' })
    const id = db.db.prepare('INSERT INTO channels (folder_id, name, icon, sort) VALUES (?,?,?,?)')
      .run(f.id, cleanName(req.body?.name, 'канал'), cleanIcon(req.body?.icon, '#'), nextSort('channels', 'WHERE folder_id = ?', f.id)).lastInsertRowid
    return { id: Number(id) }
  }))

  router.post('/api/channels/:id', requireAdmin, handle('update-channel', (req, res) => {
    const ch = channelById(req.params.id)
    if (!ch) return res.status(404).json({ error: 'Канал не найден' })
    let folderId = ch.folder_id
    let sort = ch.sort
    if (req.body?.folderId != null && Number(req.body.folderId) !== ch.folder_id) {
      const f = folderById(req.body.folderId)
      if (!f) return res.status(400).json({ error: 'Папка не найдена' })
      folderId = f.id
      sort = nextSort('channels', 'WHERE folder_id = ?', f.id)
    }
    db.db.prepare('UPDATE channels SET name = ?, icon = ?, folder_id = ?, sort = ? WHERE id = ?')
      .run(cleanName(req.body?.name, ch.name), cleanIcon(req.body?.icon, ch.icon), folderId, sort, ch.id)
  }))

  // Перестановка вверх/вниз внутри своего списка (для папок и каналов)
  function move(table, row, dir, scopeSql = '', ...scopeArgs) {
    const list = db.db.prepare(`SELECT id FROM ${table} ${scopeSql} ORDER BY sort, id`).all(...scopeArgs).map(r => r.id)
    const i = list.indexOf(row.id)
    const j = dir === 'up' ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    const upd = db.db.prepare(`UPDATE ${table} SET sort = ? WHERE id = ?`)
    db.db.transaction(() => list.forEach((id, idx) => upd.run(idx, id)))()
  }

  router.post('/api/folders/:id/move', requireAdmin, handle('move-folder', (req, res) => {
    const f = folderById(req.params.id)
    if (!f) return res.status(404).json({ error: 'Папка не найдена' })
    move('folders', f, req.body?.dir)
  }))

  router.post('/api/channels/:id/move', requireAdmin, handle('move-channel', (req, res) => {
    const ch = channelById(req.params.id)
    if (!ch) return res.status(404).json({ error: 'Канал не найден' })
    move('channels', ch, req.body?.dir, 'WHERE folder_id = ?', ch.folder_id)
  }))

  router.post('/api/channels/:id/delete', requireAdmin, handle('delete-channel', (req, res) => {
    const ch = channelById(req.params.id)
    if (!ch) return res.status(404).json({ error: 'Канал не найден' })
    const { c } = db.db.prepare('SELECT COUNT(*) AS c FROM channels').get()
    if (c <= 1) return res.status(400).json({ error: 'Нельзя удалить последний канал' })
    db.db.transaction(() => {
      const msgs = 'SELECT id FROM messages WHERE channel_id = ?'
      db.db.prepare(`DELETE FROM reactions WHERE message_id IN (${msgs})`).run(ch.id)
      db.db.prepare(`DELETE FROM poll_votes WHERE message_id IN (${msgs})`).run(ch.id)
      db.db.prepare('DELETE FROM messages WHERE channel_id = ?').run(ch.id)
      db.db.prepare('DELETE FROM channels WHERE id = ?').run(ch.id)
    })()
  }))

  return router
}