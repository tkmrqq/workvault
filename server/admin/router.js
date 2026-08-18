const express = require('express')
const fs = require('fs')
const path = require('path')
const db = require('../db')
const { requireAdminAuth } = require('./auth')
const { renderAdminPage } = require('./view')

const config = require('../config')
const UPLOADS_DIR = config.UPLOADS_DIR

// Экспортируем фабрику, а не готовый роутер — админке нужен io,
// чтобы разослать клиентам обновление после удаления рабочей зоны.
module.exports = function createAdminRouter(io) {
  const router = express.Router()

  router.get('/', requireAdminAuth, (_, res) => {
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
    const users = db.db.prepare('SELECT id, name, avatar, color FROM users').all()
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

    res.send(renderAdminPage({ stats, users, channels, workspaces, log }))
  })

  router.post('/api/clear-history/:channelId', requireAdminAuth, (req, res) => {
    try {
      const result = db.db.prepare('DELETE FROM messages WHERE channel_id = ?')
        .run(req.params.channelId)
      db.logAdmin('clear-history', { channelId: req.params.channelId, deleted: result.changes })
      res.json({ ok: true, deleted: result.changes })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  router.post('/api/delete-user/:id', requireAdminAuth, (req, res) => {
    try {
      db.db.prepare('DELETE FROM messages WHERE user_id = ?').run(req.params.id)
      db.db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id)
      db.logAdmin('delete-user', { userId: req.params.id })
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  router.post('/api/delete-workspace/:id', requireAdminAuth, (req, res) => {
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
