const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

const DATA_DIR = path.join(__dirname, '../data')
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

const db = new Database(path.join(DATA_DIR, 'workvault.db'))

// Оптимизации SQLite
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ─── СХЕМА ───────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL UNIQUE,
    avatar    TEXT NOT NULL DEFAULT '🧑',
    color     TEXT NOT NULL DEFAULT '#7c6af7',
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS folders (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL,
    icon  TEXT NOT NULL DEFAULT '📁',
    sort  INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS channels (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
    name      TEXT NOT NULL,
    icon      TEXT NOT NULL DEFAULT '#',
    sort      INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id  INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    text        TEXT,
    type        TEXT NOT NULL DEFAULT 'text',
    attachment  TEXT,
    link_meta   TEXT,
    crm_done    INTEGER DEFAULT 0,
    edited      INTEGER DEFAULT 0,
    created_at  INTEGER DEFAULT (unixepoch()),
    updated_at  INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS reactions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    emoji      TEXT NOT NULL,
    UNIQUE(message_id, user_id, emoji)
  );
`)

// ─── СИДЫ ────────────────────────────────────────────────
const seedFolders = db.prepare('SELECT COUNT(*) as c FROM folders').get()
if (seedFolders.c === 0) {
  const insertFolder = db.prepare('INSERT INTO folders (name, icon, sort) VALUES (?,?,?)')
  const insertChannel = db.prepare('INSERT INTO channels (folder_id, name, icon, sort) VALUES (?,?,?,?)')

  const f1 = insertFolder.run('Рабочее', '🏢', 0).lastInsertRowid
  insertChannel.run(f1, 'общий', '#', 0)
  insertChannel.run(f1, 'задачи', '✅', 1)

  const f2 = insertFolder.run('Медиа', '🖼', 1).lastInsertRowid
  insertChannel.run(f2, 'фотки', '🖼', 0)
  insertChannel.run(f2, 'скриншоты', '📸', 1)

  const f3 = insertFolder.run('Разное', '😄', 2).lastInsertRowid
  insertChannel.run(f3, 'приколы', '😂', 0)
  insertChannel.run(f3, 'ссылки', '🔗', 1)
}

function updateFolders(folders) {
  // Prepared statements
  const stmts = {
    upsertFolder:  db.prepare(`
      INSERT INTO folders (id, name, icon) VALUES (@id, @name, @icon)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, icon = excluded.icon
    `),
    insertFolder:  db.prepare(`INSERT INTO folders (name, icon) VALUES (@name, @icon)`),
    deleteFolder:  db.prepare(`DELETE FROM folders WHERE id = ?`),
    upsertChannel: db.prepare(`
      INSERT INTO channels (id, folder_id, name, icon) VALUES (@id, @folderId, @name, @icon)
      ON CONFLICT(id) DO UPDATE
        SET name = excluded.name, icon = excluded.icon, folder_id = excluded.folder_id
    `),
    insertChannel: db.prepare(`INSERT INTO channels (folder_id, name, icon) VALUES (@folderId, @name, @icon)`),
    deleteChannel: db.prepare(`DELETE FROM channels WHERE id = ?`),
  }

  // Всё в одной транзакции — либо всё, либо ничего
  const transaction = db.transaction(() => {
    for (const folder of folders) {

      // Папка помечена на удаление
      if (folder._deleted) {
        stmts.deleteFolder.run(folder.id)
        continue
      }

      // Новая папка (id ещё нет) — INSERT и берём lastInsertRowid
      let folderId = folder.id
      if (!folderId || folder._new) {
        const info = stmts.insertFolder.run({
          name: folder.name  || 'Новая папка',
          icon: folder.icon  || '📁'
        })
        folderId = info.lastInsertRowid
      } else {
        // Существующая папка — UPDATE
        stmts.upsertFolder.run({
          id:   folderId,
          name: folder.name || 'Без названия',
          icon: folder.icon || '📁'
        })
      }

      // Обрабатываем каналы внутри папки
      for (const ch of (folder.channels || [])) {

        if (ch._deleted) {
          stmts.deleteChannel.run(ch.id)
          continue
        }

        if (!ch.id || ch._new) {
          // Новый канал
          stmts.insertChannel.run({
            folderId,
            name: ch.name || 'канал',
            icon: ch.icon || '#'
          })
        } else {
          // Существующий — UPDATE (включая смену папки)
          stmts.upsertChannel.run({
            id:       ch.id,
            folderId,
            name:     ch.name || 'канал',
            icon:     ch.icon || '#'
          })
        }
      }
    }
  })

  transaction() // запускаем
}

// ─── QUERIES ─────────────────────────────────────────────
module.exports = {
  db,

  getUsers: () => db.prepare('SELECT * FROM users ORDER BY name').all(),

  getUserById: (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id),

  createUser: (name, avatar, color) =>
    db.prepare('INSERT INTO users (name, avatar, color) VALUES (?,?,?)').run(name, avatar, color),

  getFolders: () => {
    const folders = db.prepare('SELECT * FROM folders ORDER BY sort').all()
    const channels = db.prepare('SELECT * FROM channels ORDER BY sort').all()
    return folders.map(f => ({
      ...f,
      channels: channels.filter(c => c.folder_id === f.id)
    }))
  },

  getMessages: (channelId, limit = 50, before = null) => {
    const q = before
      ? db.prepare(`SELECT m.*, u.name as user_name, u.avatar as user_avatar, u.color as user_color
          FROM messages m JOIN users u ON m.user_id = u.id
          WHERE m.channel_id = ? AND m.id < ?
          ORDER BY m.id DESC LIMIT ?`)
          .all(channelId, before, limit)
      : db.prepare(`SELECT m.*, u.name as user_name, u.avatar as user_avatar, u.color as user_color
          FROM messages m JOIN users u ON m.user_id = u.id
          WHERE m.channel_id = ?
          ORDER BY m.id DESC LIMIT ?`)
          .all(channelId, limit)

    // ↓ ВОТ ЧТО НУЖНО ДОБАВИТЬ — парсим JSON поля
    return q.reverse().map(row => ({
      ...row,
      attachment: row.attachment ? JSON.parse(row.attachment) : null,
      link_meta:  row.link_meta  ? JSON.parse(row.link_meta)  : null,
      reactions:  []  // реакции подтягиваются отдельно в server.js
    }))
  },

  getReactions: (messageId) =>
    db.prepare(`SELECT r.emoji, r.user_id, u.name as user_name
      FROM reactions r JOIN users u ON r.user_id = u.id
      WHERE r.message_id = ?`).all(messageId),

  createMessage: (channelId, userId, text, type = 'text', attachment = null, linkMeta = null) =>
    db.prepare(`INSERT INTO messages (channel_id, user_id, text, type, attachment, link_meta)
      VALUES (?,?,?,?,?,?)`).run(channelId, userId, text, type, attachment, linkMeta
        ? JSON.stringify(linkMeta) : null),

  editMessage: (id, text, userId) =>
    db.prepare(`UPDATE messages SET text=?, edited=1, updated_at=unixepoch()
      WHERE id=? AND user_id=?`).run(text, id, userId),

  deleteMessage: (id, userId) =>
    db.prepare('DELETE FROM messages WHERE id=? AND user_id=?').run(id, userId),

  toggleCrm: (id) =>
    db.prepare('UPDATE messages SET crm_done = 1 - crm_done WHERE id=?').run(id),

  toggleReaction: (messageId, userId, emoji) => {
    const existing = db.prepare(
      'SELECT id FROM reactions WHERE message_id=? AND user_id=? AND emoji=?'
    ).get(messageId, userId, emoji)
    if (existing) {
      db.prepare('DELETE FROM reactions WHERE id=?').run(existing.id)
      return 'removed'
    } else {
      db.prepare('INSERT INTO reactions (message_id, user_id, emoji) VALUES (?,?,?)').run(messageId, userId, emoji)
      return 'added'
    }
  },
  updateFolders
}
