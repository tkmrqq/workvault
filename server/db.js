const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

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
  CREATE TABLE IF NOT EXISTS kanban_columns (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    title    TEXT    NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    color    TEXT    NOT NULL DEFAULT '#7c6af7'
  );

  CREATE TABLE IF NOT EXISTS kanban_cards (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    column_id   INTEGER NOT NULL REFERENCES kanban_columns(id) ON DELETE CASCADE,
    title       TEXT    NOT NULL,
    description TEXT,
    assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    priority    TEXT    NOT NULL DEFAULT 'medium',
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS kanban_subtasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id     INTEGER NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
    title       TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'todo',
    assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    priority    TEXT    NOT NULL DEFAULT 'medium',
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER DEFAULT (unixepoch())
  );
`)

try {
  db.prepare('ALTER TABLE users ADD COLUMN pin_hash TEXT').run()
} catch {}

try {
  db.prepare('ALTER TABLE users ADD COLUMN description TEXT').run()
} catch {}

function publicUserSelect(where = '') {
  return `
    SELECT
      id,
      name,
      avatar,
      color,
      created_at,
      description,
      CASE WHEN pin_hash IS NOT NULL AND pin_hash != '' THEN 1 ELSE 0 END as has_pin
    FROM users
    ${where}
  `
}

function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(pin), salt, 120000, 32, 'sha256').toString('hex')
  return `${salt}:${hash}`
}

function verifyPinHash(pin, stored) {
  if (!stored) return false
  const [salt, hash] = String(stored).split(':')
  if (!salt || !hash) return false
  const candidate = hashPin(pin, salt).split(':')[1]
  const left = Buffer.from(candidate, 'hex')
  const right = Buffer.from(hash, 'hex')
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

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

const seedKanban = db.prepare('SELECT COUNT(*) as c FROM kanban_columns').get()
if (seedKanban.c === 0) {
  db.prepare("INSERT INTO kanban_columns (title, position, color) VALUES (?,?,?)").run('To Do',       0, '#61afef')
  db.prepare("INSERT INTO kanban_columns (title, position, color) VALUES (?,?,?)").run('In Progress', 1, '#e8af34')
  db.prepare("INSERT INTO kanban_columns (title, position, color) VALUES (?,?,?)").run('Done',        2, '#4caf7d')
}

function updateFolders(folders) {
  const transaction = db.transaction(() => {
    // ID папок которые пришли с фронта (новые без id пропускаем)
    const incomingFolderIds = folders.filter(f => f.id).map(f => f.id)

    // Удаляем папки которых нет в новом списке (каналы удалятся каскадом)
    const existingFolders = db.prepare('SELECT id FROM folders').all()
    for (const { id } of existingFolders) {
      if (!incomingFolderIds.includes(id)) {
        db.prepare('DELETE FROM folders WHERE id=?').run(id)
      }
    }

    for (const [fi, folder] of folders.entries()) {
      let folderId = folder.id

      if (!folderId) {
        // Новая папка
        folderId = db.prepare('INSERT INTO folders (name, icon, sort) VALUES (?,?,?)')
          .run(folder.name || 'Новая папка', folder.icon || '📁', fi).lastInsertRowid
      } else {
        db.prepare('UPDATE folders SET name=?, icon=?, sort=? WHERE id=?')
          .run(folder.name || 'Без названия', folder.icon || '📁', fi, folderId)
      }

      // ID каналов которые пришли для этой папки
      const incomingChannelIds = (folder.channels || []).filter(c => c.id).map(c => c.id)

      // Удаляем каналы которых нет в новом списке
      const existingChannels = db.prepare('SELECT id FROM channels WHERE folder_id=?').all(folderId)
      for (const { id } of existingChannels) {
        if (!incomingChannelIds.includes(id)) {
          db.prepare('DELETE FROM channels WHERE id=?').run(id)
        }
      }

      for (const [ci, ch] of (folder.channels || []).entries()) {
        if (!ch.id) {
          db.prepare('INSERT INTO channels (folder_id, name, icon, sort) VALUES (?,?,?,?)')
            .run(folderId, ch.name || 'канал', ch.icon || '#', ci)
        } else {
          db.prepare('UPDATE channels SET name=?, icon=?, sort=?, folder_id=? WHERE id=?')
            .run(ch.name || 'канал', ch.icon || '#', ci, folderId, ch.id)
        }
      }
    }
  })

  transaction()
}

// ─── QUERIES ─────────────────────────────────────────────
module.exports = {
  db,

  getUsers: () => db.prepare(`${publicUserSelect()} ORDER BY name`).all(),

  getUserById: (id) => db.prepare(publicUserSelect('WHERE id = ?')).get(id),

  getUserByName: (name) => db.prepare(publicUserSelect('WHERE name = ?')).get(name),

  createUser: (name, avatar, color) =>
    db.prepare('INSERT INTO users (name, avatar, color) VALUES (?,?,?)').run(name, avatar, color),

  setUserPin: (id, pin) =>
    db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(hashPin(pin), id),

  verifyUserPin: (id, pin) => {
    const row = db.prepare('SELECT pin_hash FROM users WHERE id = ?').get(id)
    return verifyPinHash(pin, row?.pin_hash)
  },

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
  updateFolders,
  kanban: {
    getBoard: () => {
      const columns = db.prepare('SELECT * FROM kanban_columns ORDER BY position').all()
      const cards   = db.prepare(`
        SELECT k.*, u.name as assignee_name, u.avatar as assignee_avatar, u.color as assignee_color
        FROM kanban_cards k
        LEFT JOIN users u ON k.assignee_id = u.id
        ORDER BY k.position
      `).all()
      return columns.map(col => ({
        ...col,
        cards: cards.filter(c => c.column_id === col.id)
      }))
    },
    createCard: (column_id, title, description, assignee_id, priority) => {
      const pos = db.prepare('SELECT COUNT(*) as c FROM kanban_cards WHERE column_id=?').get(column_id).c
      const r   = db.prepare(`
        INSERT INTO kanban_cards (column_id, title, description, assignee_id, priority, position)
        VALUES (?,?,?,?,?,?)
      `).run(column_id, title, description || null, assignee_id || null, priority || 'medium', pos)
      return db.prepare(`
        SELECT k.*, u.name as assignee_name, u.avatar as assignee_avatar, u.color as assignee_color
        FROM kanban_cards k LEFT JOIN users u ON k.assignee_id = u.id WHERE k.id=?
      `).get(r.lastInsertRowid)
    },
    updateCard: (id, { title, description, assignee_id, priority }) => {
      db.prepare(`
        UPDATE kanban_cards SET
          title       = COALESCE(?, title),
          description = COALESCE(?, description),
          assignee_id = ?,
          priority    = COALESCE(?, priority)
        WHERE id = ?
      `).run(title || null, description || null, assignee_id ?? null, priority || null, id)
      return db.prepare(`
        SELECT k.*, u.name as assignee_name, u.avatar as assignee_avatar, u.color as assignee_color
        FROM kanban_cards k LEFT JOIN users u ON k.assignee_id = u.id WHERE k.id=?
      `).get(id)
    },
    moveCard: (id, column_id, position) => {
      db.prepare('UPDATE kanban_cards SET column_id=?, position=? WHERE id=?').run(column_id, position, id)
    },
    deleteCard: (id) => {
      db.prepare('DELETE FROM kanban_cards WHERE id=?').run(id)
    },
    reorderCards: (cards) => {
      const stmt = db.prepare('UPDATE kanban_cards SET column_id=?, position=? WHERE id=?')
      const run  = db.transaction(() => cards.forEach((c, i) => stmt.run(c.column_id, i, c.id)))
      run()
    },
    getCard: (id) => {
      const card = db.prepare(`
        SELECT k.*, u.name as assignee_name, u.avatar as assignee_avatar, u.color as assignee_color
        FROM kanban_cards k LEFT JOIN users u ON k.assignee_id = u.id WHERE k.id=?
      `).get(id)
      if (!card) return null
      card.subtasks = db.prepare(`
        SELECT s.*, u.name as assignee_name, u.avatar as assignee_avatar, u.color as assignee_color
        FROM kanban_subtasks s LEFT JOIN users u ON s.assignee_id = u.id
        WHERE s.card_id = ? ORDER BY s.position
      `).all(id)
      return card
    },
    createSubtask: (card_id, title, assignee_id, priority) => {
      const pos = db.prepare('SELECT COUNT(*) as c FROM kanban_subtasks WHERE card_id=?').get(card_id).c
      const r = db.prepare(`
        INSERT INTO kanban_subtasks (card_id, title, assignee_id, priority, position)
        VALUES (?,?,?,?,?)
      `).run(card_id, title, assignee_id || null, priority || 'medium', pos)
      return db.prepare(`
        SELECT s.*, u.name as assignee_name, u.avatar as assignee_avatar, u.color as assignee_color
        FROM kanban_subtasks s LEFT JOIN users u ON s.assignee_id = u.id WHERE s.id=?
      `).get(r.lastInsertRowid)
    },
    updateSubtask: (id, { title, status, assignee_id, priority }) => {
      db.prepare(`
        UPDATE kanban_subtasks SET
          title       = COALESCE(?, title),
          status      = COALESCE(?, status),
          assignee_id = ?,
          priority    = COALESCE(?, priority)
        WHERE id = ?
      `).run(title || null, status || null, assignee_id ?? null, priority || null, id)
      return db.prepare(`
        SELECT s.*, u.name as assignee_name, u.avatar as assignee_avatar, u.color as assignee_color
        FROM kanban_subtasks s LEFT JOIN users u ON s.assignee_id = u.id WHERE s.id=?
      `).get(id)
    },
    reorderSubtasks: (subtasks) => {
      const stmt = db.prepare('UPDATE kanban_subtasks SET status=?, position=? WHERE id=?')
      const run  = db.transaction(() => subtasks.forEach((s, i) => stmt.run(s.status, i, s.id)))
      run()
    },
    deleteSubtask: (id) => db.prepare('DELETE FROM kanban_subtasks WHERE id=?').run(id)
  }
}
