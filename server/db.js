const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const config = require('./config')

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
  CREATE TABLE IF NOT EXISTS kanban_workspaces (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT    NOT NULL,
    icon     TEXT    NOT NULL DEFAULT '🗂',
    color    TEXT    NOT NULL DEFAULT '#7c6af7',
    sort     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS kanban_columns (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER REFERENCES kanban_workspaces(id) ON DELETE CASCADE,
    title        TEXT    NOT NULL,
    position     INTEGER NOT NULL DEFAULT 0,
    color        TEXT    NOT NULL DEFAULT '#7c6af7',
    is_terminal  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS kanban_cards (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    column_id   INTEGER NOT NULL REFERENCES kanban_columns(id) ON DELETE CASCADE,
    title       TEXT    NOT NULL,
    description TEXT,
    assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    priority    TEXT    NOT NULL DEFAULT 'medium',
    position    INTEGER NOT NULL DEFAULT 0,
    due_date    INTEGER,
    done_at     INTEGER,
    archived_at INTEGER,
    created_at  INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS kanban_subtasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id     INTEGER NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
    title       TEXT    NOT NULL,
    description TEXT,
    status      TEXT    NOT NULL DEFAULT 'todo',
    assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    priority    TEXT    NOT NULL DEFAULT 'medium',
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS admin_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    action     TEXT    NOT NULL,
    details    TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS kanban_tags (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE COLLATE NOCASE,
    color TEXT NOT NULL DEFAULT '#8a8fa3'
  );

  CREATE TABLE IF NOT EXISTS kanban_subtask_tags (
    subtask_id INTEGER NOT NULL REFERENCES kanban_subtasks(id) ON DELETE CASCADE,
    tag_id     INTEGER NOT NULL REFERENCES kanban_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (subtask_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );
`)

try {
  db.prepare('ALTER TABLE users ADD COLUMN pin_hash TEXT').run()
} catch { }

try {
  db.prepare('ALTER TABLE users ADD COLUMN description TEXT').run()
} catch { }

try {
  db.prepare("ALTER TABLE users ADD COLUMN banner TEXT DEFAULT 'violet'").run()
} catch { }

// ─── Auth: пароли + роли ───────────────────────────────────
// password_hash NULL = старый юзер, ещё не проходил миграцию на пароль —
// именно по этому признаку логин-флоу решает, показывать "войти" или
// "задай пароль для существующего имени".
try { db.prepare('ALTER TABLE users ADD COLUMN password_hash TEXT').run() } catch { }
try { db.prepare("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'").run() } catch { }

// Разовая уборка тегов, успевших осиротеть до того, как появилась
// автоматическая чистка в removeTagFromSubtask/deleteSubtask
db.prepare(`
  DELETE FROM kanban_tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM kanban_subtask_tags)
`).run()

// ─── Миграции для существующих БД (добавляем колонки, если их ещё нет) ───
try { db.prepare("ALTER TABLE kanban_workspaces ADD COLUMN color TEXT NOT NULL DEFAULT '#7c6af7'").run() } catch { }
// Раньше icon хранил эмодзи (🗂, 🚀ит.п.) — теперь это ключ lucide-иконки
// (см. src/lib/workspaceIcons.js на фронте). Одноразово переводим старые
// эмодзи-значения на дефолтный ключ 'folder', чтобы новый бейдж с иконкой
// не остался пустым у существующих рабочих зон.
try {
  db.prepare(`
    UPDATE kanban_workspaces SET icon = 'folder'
    WHERE icon IS NULL OR icon = '' OR icon NOT GLOB '[a-z-]*'
  `).run()
} catch { }
try { db.prepare('ALTER TABLE kanban_columns ADD COLUMN workspace_id INTEGER REFERENCES kanban_workspaces(id)').run() } catch { }
try { db.prepare('ALTER TABLE kanban_columns ADD COLUMN is_terminal INTEGER NOT NULL DEFAULT 0').run() } catch { }
try { db.prepare('ALTER TABLE kanban_cards ADD COLUMN due_date INTEGER').run() } catch { }
try { db.prepare('ALTER TABLE kanban_cards ADD COLUMN done_at INTEGER').run() } catch { }
try { db.prepare('ALTER TABLE kanban_cards ADD COLUMN archived_at INTEGER').run() } catch { }
try { db.prepare('ALTER TABLE kanban_subtasks ADD COLUMN description TEXT').run() } catch { }
// Связь задачи с сообщением чата (/task, «Создать задачу» в ховер-меню).
// ON DELETE SET NULL — удаление сообщения не должно ломаться из-за FK
// (foreign_keys = ON), а source_channel_id без FK остаётся, чтобы карточка
// могла показать «исходное сообщение удалено».
try { db.prepare('ALTER TABLE kanban_cards ADD COLUMN source_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL').run() } catch { }
try { db.prepare('ALTER TABLE kanban_cards ADD COLUMN source_channel_id INTEGER').run() } catch { }
try { db.prepare('CREATE INDEX IF NOT EXISTS idx_kanban_cards_source_msg ON kanban_cards(source_message_id)').run() } catch { }
// Колонка messages.crm_done — легаси от «Занести в CRM». В новых БД её больше
// не создаём, в старых просто не используем (DROP COLUMN в SQLite не стоит риска).
try { db.prepare('ALTER TABLE kanban_cards ADD COLUMN source_snapshot TEXT').run() } catch { }
// Профиль: должность, часовой пояс и статус (со временем автосброса)
for (const col of ['title TEXT', 'timezone TEXT', 'status_emoji TEXT', 'status_text TEXT', 'status_until INTEGER']) {
  try { db.prepare(`ALTER TABLE users ADD COLUMN ${col}`).run() } catch { }
}

// Треды: ответ — обычное сообщение с parent_id. Треды плоские (как в Slack):
// у ответа не бывает своих ответов. Удалили корень — удаляется и тред.
try { db.prepare('ALTER TABLE messages ADD COLUMN parent_id INTEGER REFERENCES messages(id) ON DELETE CASCADE').run() } catch { }
try { db.prepare('CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_id)').run() } catch { }

// Дефолтная рабочая зона + привязка "старых" колонок без workspace_id
const wsCount = db.prepare('SELECT COUNT(*) as c FROM kanban_workspaces').get().c
if (wsCount === 0) {
  db.prepare('INSERT INTO kanban_workspaces (name, icon, color, sort) VALUES (?,?,?,?)').run('Основное', 'folder', '#7c6af7', 0)
}
const defaultWsId = db.prepare('SELECT id FROM kanban_workspaces ORDER BY sort LIMIT 1').get().id
db.prepare('UPDATE kanban_columns SET workspace_id = ? WHERE workspace_id IS NULL').run(defaultWsId)
// Помечаем колонку с названием "Done" как терминальную (для автоархива), если ещё не помечена
db.prepare("UPDATE kanban_columns SET is_terminal = 1 WHERE is_terminal = 0 AND lower(title) = 'done'").run()

function publicUserSelect(where = '') {
  return `
    SELECT
      id,
      name,
      avatar,
      color,
      created_at,
      description,
      banner,
      title,
      timezone,
      CASE WHEN status_until IS NULL OR status_until > unixepoch() THEN status_emoji END AS status_emoji,
      CASE WHEN status_until IS NULL OR status_until > unixepoch() THEN status_text  END AS status_text,
      CASE WHEN status_until IS NULL OR status_until > unixepoch() THEN status_until END AS status_until,
      role,
      CASE WHEN password_hash IS NOT NULL AND password_hash != '' THEN 1 ELSE 0 END as has_password
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

// Алиасы — тот же PBKDF2-хелпер, что и для старого PIN, переиспользуем для
// паролей (алгоритм не завязан на длину/формат секрета, менять нечего).
const hashSecret = hashPin
const verifySecretHash = verifyPinHash

function hashToken(token) {
  // Refresh-токены в БД храним только хэшем (SHA-256 достаточно — это не
  // пароль человека, а уже случайная строка высокой энтропии из crypto.randomBytes)
  return crypto.createHash('sha256').update(token).digest('hex')
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
  const wsId = db.prepare('SELECT id FROM kanban_workspaces ORDER BY sort LIMIT 1').get().id
  db.prepare("INSERT INTO kanban_columns (workspace_id, title, position, color, is_terminal) VALUES (?,?,?,?,?)").run(wsId, 'To Do', 0, '#61afef', 0)
  db.prepare("INSERT INTO kanban_columns (workspace_id, title, position, color, is_terminal) VALUES (?,?,?,?,?)").run(wsId, 'In Progress', 1, '#e8af34', 0)
  db.prepare("INSERT INTO kanban_columns (workspace_id, title, position, color, is_terminal) VALUES (?,?,?,?,?)").run(wsId, 'Done', 2, '#4caf7d', 1)
}

const ARCHIVE_AFTER_MS = config.KANBAN_ARCHIVE_AFTER_DAYS * 86400

// Та же палитра, что и для автоцвета юзеров при регистрации (LoginView.vue) —
// чтобы теги визуально не выбивались из остального UI.
// Приглушённые/пастельные тона — сплошным цветом используются и как фон
// активного фильтра с белым текстом поверх (см. фронт), поэтому слишком
// светлые "настоящие" пастельные (типа baby blue) не берём — не хватит
// контраста с белым текстом.
const TAG_PALETTE = [
  '#7c6af7', '#4caf7d', '#e8956d', '#e06c75', '#e8af34', '#61afef', '#c678dd', '#56b6c2',
  '#f06595', '#20c997', '#748ffc', '#ff922b', '#63e6be', '#e599f7', '#94d82d', '#4dabf7'
]

function hashString(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h
}

function tagsForSubtask(subtask_id) {
  return db.prepare(`
    SELECT t.* FROM kanban_tags t
    JOIN kanban_subtask_tags st ON st.tag_id = t.id
    WHERE st.subtask_id = ? ORDER BY t.name COLLATE NOCASE
  `).all(subtask_id)
}

// Тег, случайно созданный на лету и тут же отвязанный (или у последней
// подзадачи, где он был, удалили саму подзадачу) — больше никому не нужен,
// иначе такие тени копятся в списке автокомплита навсегда.
function deleteTagIfOrphaned(tag_id) {
  const { c } = db.prepare('SELECT COUNT(*) as c FROM kanban_subtask_tags WHERE tag_id=?').get(tag_id)
  if (c === 0) db.prepare('DELETE FROM kanban_tags WHERE id=?').run(tag_id)
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
// ─── Связь сообщение ↔ задача ─────────────────────────────
// Компактное представление задачи для чипа под сообщением
function taskForMessage(messageId) {
  return db.prepare(`
    SELECT k.id, k.title, k.done_at, k.archived_at,
           c.title as column_title, c.color as column_color, c.is_terminal, c.workspace_id
    FROM kanban_cards k LEFT JOIN kanban_columns c ON k.column_id = c.id
    WHERE k.source_message_id = ?
    ORDER BY k.id DESC LIMIT 1
  `).get(messageId) || null
}

// Сводка треда для корневого сообщения: сколько ответов, когда последний, кто отвечал
function threadMeta(messageId) {
  const agg = db.prepare('SELECT COUNT(*) as c, MAX(created_at) as last FROM messages WHERE parent_id = ?').get(messageId)
  if (!agg.c) return { reply_count: 0, last_reply_at: null, reply_users: [] }
  const users = db.prepare(`
    SELECT u.id, u.name, u.avatar, u.color, MAX(m.id) as last_id
    FROM messages m JOIN users u ON m.user_id = u.id
    WHERE m.parent_id = ?
    GROUP BY u.id ORDER BY last_id DESC LIMIT 3
  `).all(messageId).map(({ last_id, ...u }) => u)
  return { reply_count: agg.c, last_reply_at: agg.last, reply_users: users }
}

function parseMessageRow(row) {
  return {
    ...row,
    attachment: row.attachment ? JSON.parse(row.attachment) : null,
    link_meta: row.link_meta ? JSON.parse(row.link_meta) : null,
    task: taskForMessage(row.id),
    ...(row.parent_id ? {} : threadMeta(row.id)),
    reactions: []  // реакции подтягиваются отдельно в server.js
  }
}

const MESSAGE_SELECT = `SELECT m.*, u.name as user_name, u.avatar as user_avatar, u.color as user_color
  FROM messages m JOIN users u ON m.user_id = u.id`

// Снимок сообщения для карточки «из чата»: контекст остаётся, даже если
// сообщение потом удалят из канала
function messageSnapshot(id) {
  const m = db.prepare(`
    SELECT m.id, m.channel_id, m.parent_id, m.text, m.created_at, m.attachment,
           u.name as user_name, u.avatar as user_avatar, u.color as user_color,
           ch.name as channel_name, ch.icon as channel_icon
    FROM messages m JOIN users u ON m.user_id = u.id
    LEFT JOIN channels ch ON ch.id = m.channel_id
    WHERE m.id = ?
  `).get(id)
  if (!m) return null
  let attachment_name = null
  try { attachment_name = m.attachment ? (JSON.parse(m.attachment)?.name || null) : null } catch { }
  const { attachment, ...rest } = m
  return { ...rest, attachment_name }
}

function setCardSourceSnapshot(cardId, snap) {
  db.prepare('UPDATE kanban_cards SET source_snapshot=? WHERE id=?').run(snap ? JSON.stringify(snap) : null, cardId)
}

function getUserStats(id) {
  return db.prepare(`
    SELECT
      (SELECT COUNT(*)        FROM messages     WHERE user_id = @id)                          AS messages,
      (SELECT MAX(created_at) FROM messages     WHERE user_id = @id)                          AS last_message_at,
      (SELECT COUNT(*)        FROM kanban_cards WHERE assignee_id = @id AND done_at IS NULL)     AS tasks_open,
      (SELECT COUNT(*)        FROM kanban_cards WHERE assignee_id = @id AND done_at IS NOT NULL) AS tasks_done
  `).get({ id })
}

module.exports = {
  getUserStats,
  taskForMessage,
  messageSnapshot,
  setCardSourceSnapshot,
  threadMeta,

  // Сообщение целиком (JSON распарсен, задача и сводка треда на месте)
  getMessageFull: (id) => {
    const row = db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(id)
    return row ? parseMessageRow(row) : null
  },

  getReplies: (parentId) =>
    db.prepare(`${MESSAGE_SELECT} WHERE m.parent_id = ? ORDER BY m.id ASC LIMIT 1000`).all(parentId).map(parseMessageRow),

  getMessageById: (id) => db.prepare(`
    SELECT m.*, u.name as user_name, u.avatar as user_avatar, u.color as user_color
    FROM messages m JOIN users u ON m.user_id = u.id WHERE m.id = ?
  `).get(id) || null,

  db,

  getUsers: () => db.prepare(`${publicUserSelect()} ORDER BY name`).all(),

  getUserById: (id) => db.prepare(publicUserSelect('WHERE id = ?')).get(id),

  getUserByName: (name) => db.prepare(publicUserSelect('WHERE name = ? COLLATE NOCASE')).get(name),

  createUser: (name, avatar, color, password) =>
    db.prepare('INSERT INTO users (name, avatar, color, password_hash) VALUES (?,?,?,?)')
      .run(name, avatar, color, password ? hashSecret(password) : null),

  // Возвращает id + password_hash + role — то, чего нет в publicUserSelect()
  // (пароль никогда не должен утечь в обычный /api/users)
  getUserAuthByName: (name) =>
    db.prepare('SELECT id, name, password_hash, role FROM users WHERE name = ? COLLATE NOCASE').get(name),

  setUserPassword: (id, password) =>
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashSecret(password), id),

  verifyUserPassword: (id, password) => {
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(id)
    return verifySecretHash(password, row?.password_hash)
  },

  setUserRole: (id, role) =>
    db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id),

  // ── Refresh-токены ────────────────────────────────────────
  storeRefreshToken: (userId, token, expiresAtMs) =>
    db.prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?,?,?)')
      .run(userId, hashToken(token), Math.floor(expiresAtMs / 1000)),

  findRefreshToken: (token) => {
    const row = db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(hashToken(token))
    if (!row) return null
    if (row.expires_at < Math.floor(Date.now() / 1000)) {
      db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(row.id) // просрочен — сразу подчищаем
      return null
    }
    return row
  },

  deleteRefreshToken: (token) =>
    db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(hashToken(token)),

  deleteAllRefreshTokensForUser: (userId) =>
    db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId),

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
          WHERE m.channel_id = ? AND m.parent_id IS NULL AND m.id < ?
          ORDER BY m.id DESC LIMIT ?`)
        .all(channelId, before, limit)
      : db.prepare(`SELECT m.*, u.name as user_name, u.avatar as user_avatar, u.color as user_color
          FROM messages m JOIN users u ON m.user_id = u.id
          WHERE m.channel_id = ? AND m.parent_id IS NULL
          ORDER BY m.id DESC LIMIT ?`)
        .all(channelId, limit)

    // ↓ ВОТ ЧТО НУЖНО ДОБАВИТЬ — парсим JSON поля
    // Ответы тредов в ленту канала не попадают — только сводка под корнем
    return q.reverse().map(parseMessageRow)
  },

  getReactions: (messageId) =>
    db.prepare(`SELECT r.emoji, r.user_id, u.name as user_name
      FROM reactions r JOIN users u ON r.user_id = u.id
      WHERE r.message_id = ?`).all(messageId),

  // attachment и linkMeta приходят сюда УЖЕ сериализованными строками (или null) —
  // сериализация делается один раз, на вызывающей стороне (server.js), здесь
  // просто пишем как есть. Раньше linkMeta сериализовался второй раз прямо тут —
  // на выходе получался JSON-строка JSON-строки, и превью ссылок ломались.
  createMessage: (channelId, userId, text, type = 'text', attachment = null, linkMeta = null, parentId = null) =>
    db.prepare(`INSERT INTO messages (channel_id, user_id, text, type, attachment, link_meta, parent_id)
      VALUES (?,?,?,?,?,?,?)`).run(channelId, userId, text, type, attachment, linkMeta, parentId),

  editMessage: (id, text, userId) =>
    db.prepare(`UPDATE messages SET text=?, edited=1, updated_at=unixepoch()
      WHERE id=? AND user_id=?`).run(text, id, userId),

  deleteMessage: (id, userId) =>
    db.prepare('DELETE FROM messages WHERE id=? AND user_id=?').run(id, userId),

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
  logAdmin: (action, details) => {
    db.prepare('INSERT INTO admin_log (action, details) VALUES (?,?)')
      .run(action, details ? JSON.stringify(details) : null)
  },
  getAdminLog: (limit = 50) =>
    db.prepare('SELECT * FROM admin_log ORDER BY created_at DESC LIMIT ?').all(limit),
  kanban: {
    // ── Рабочие зоны ──────────────────────────────────────
    getWorkspaces: () => db.prepare('SELECT * FROM kanban_workspaces ORDER BY sort').all(),
    createWorkspace: (name, icon, color) => {
      const pos = db.prepare('SELECT COUNT(*) as c FROM kanban_workspaces').get().c
      const r = db.prepare('INSERT INTO kanban_workspaces (name, icon, color, sort) VALUES (?,?,?,?)')
        .run(name || 'Новая зона', icon || 'folder', color || '#7c6af7', pos)
      const wsId = r.lastInsertRowid
      // Новой зоне сразу даём стандартный набор колонок
      db.prepare("INSERT INTO kanban_columns (workspace_id, title, position, color, is_terminal) VALUES (?,?,?,?,?)").run(wsId, 'To Do', 0, '#61afef', 0)
      db.prepare("INSERT INTO kanban_columns (workspace_id, title, position, color, is_terminal) VALUES (?,?,?,?,?)").run(wsId, 'In Progress', 1, '#e8af34', 0)
      db.prepare("INSERT INTO kanban_columns (workspace_id, title, position, color, is_terminal) VALUES (?,?,?,?,?)").run(wsId, 'Done', 2, '#4caf7d', 1)
      return db.prepare('SELECT * FROM kanban_workspaces WHERE id=?').get(wsId)
    },
    updateWorkspace: (id, { name, icon, color }) => {
      db.prepare('UPDATE kanban_workspaces SET name=COALESCE(?,name), icon=COALESCE(?,icon), color=COALESCE(?,color) WHERE id=?')
        .run(name || null, icon || null, color || null, id)
      return db.prepare('SELECT * FROM kanban_workspaces WHERE id=?').get(id)
    },
    deleteWorkspace: (id) => {
      const total = db.prepare('SELECT COUNT(*) as c FROM kanban_workspaces').get().c
      if (total <= 1) return { ok: false, error: 'Нельзя удалить последнюю рабочую зону' }
      db.prepare('DELETE FROM kanban_workspaces WHERE id=?').run(id)
      return { ok: true }
    },

    // ── Доска ─────────────────────────────────────────────
    getBoard: (workspaceId) => {
      const columns = workspaceId
        ? db.prepare('SELECT * FROM kanban_columns WHERE workspace_id=? ORDER BY position').all(workspaceId)
        : db.prepare('SELECT * FROM kanban_columns ORDER BY position').all()
      const colIds = columns.map(c => c.id)
      if (!colIds.length) return columns.map(col => ({ ...col, cards: [] }))
      const placeholders = colIds.map(() => '?').join(',')
      const cards = db.prepare(`
        SELECT k.*, u.name as assignee_name, u.avatar as assignee_avatar, u.color as assignee_color,
          (SELECT COUNT(*) FROM kanban_subtasks s WHERE s.card_id = k.id) as subtasks_total,
          (SELECT COUNT(*) FROM kanban_subtasks s WHERE s.card_id = k.id AND s.status = 'done') as subtasks_done
        FROM kanban_cards k
        LEFT JOIN users u ON k.assignee_id = u.id
        WHERE k.archived_at IS NULL AND k.column_id IN (${placeholders})
        ORDER BY k.position
      `).all(...colIds)
      return columns.map(col => ({
        ...col,
        cards: cards.filter(c => c.column_id === col.id)
      }))
    },
    getArchivedCards: (workspaceId) => {
      const columns = workspaceId
        ? db.prepare('SELECT id FROM kanban_columns WHERE workspace_id=?').all(workspaceId)
        : db.prepare('SELECT id FROM kanban_columns').all()
      const colIds = columns.map(c => c.id)
      if (!colIds.length) return []
      const placeholders = colIds.map(() => '?').join(',')
      return db.prepare(`
        SELECT k.*, u.name as assignee_name, u.avatar as assignee_avatar, u.color as assignee_color
        FROM kanban_cards k
        LEFT JOIN users u ON k.assignee_id = u.id
        WHERE k.archived_at IS NOT NULL AND k.column_id IN (${placeholders})
        ORDER BY k.archived_at DESC
      `).all(...colIds)
    },
    createCard: (column_id, title, description, assignee_id, priority, due_date, source = null) => {
      const pos = db.prepare('SELECT COUNT(*) as c FROM kanban_cards WHERE column_id=?').get(column_id).c
      const isTerminal = db.prepare('SELECT is_terminal FROM kanban_columns WHERE id=?').get(column_id)?.is_terminal
      const r = db.prepare(`
        INSERT INTO kanban_cards (column_id, title, description, assignee_id, priority, position, due_date, done_at,
                                  source_message_id, source_channel_id)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `).run(column_id, title, description || null, assignee_id || null, priority || 'medium', pos,
        due_date || null, isTerminal ? Math.floor(Date.now() / 1000) : null,
        source?.message_id || null, source?.channel_id || null)
      return db.prepare(`
        SELECT k.*, u.name as assignee_name, u.avatar as assignee_avatar, u.color as assignee_color
        FROM kanban_cards k LEFT JOIN users u ON k.assignee_id = u.id WHERE k.id=?
      `).get(r.lastInsertRowid)
    },
    updateCard: (id, { title, description, assignee_id, priority, column_id, due_date }) => {
      const current = db.prepare('SELECT column_id, done_at FROM kanban_cards WHERE id=?').get(id)
      let doneAt = current?.done_at ?? null
      if (column_id && column_id !== current?.column_id) {
        const isTerminal = db.prepare('SELECT is_terminal FROM kanban_columns WHERE id=?').get(column_id)?.is_terminal
        doneAt = isTerminal ? Math.floor(Date.now() / 1000) : null
      }
      db.prepare(`
        UPDATE kanban_cards SET
          title       = COALESCE(?, title),
          description = COALESCE(?, description),
          assignee_id = ?,
          priority    = COALESCE(?, priority),
          column_id   = COALESCE(?, column_id),
          due_date    = ?,
          done_at     = ?
        WHERE id = ?
      `).run(title || null, description || null, assignee_id ?? null, priority || null,
        column_id || null, due_date ?? null, doneAt, id)
      return db.prepare(`
        SELECT k.*, u.name as assignee_name, u.avatar as assignee_avatar, u.color as assignee_color
        FROM kanban_cards k LEFT JOIN users u ON k.assignee_id = u.id WHERE k.id=?
      `).get(id)
    },
    moveCard: (id, column_id, position) => {
      const isTerminal = db.prepare('SELECT is_terminal FROM kanban_columns WHERE id=?').get(column_id)?.is_terminal
      db.prepare('UPDATE kanban_cards SET column_id=?, position=?, done_at=? WHERE id=?')
        .run(column_id, position, isTerminal ? Math.floor(Date.now() / 1000) : null, id)
    },
    // Перенос карточки в колонку, которая может принадлежать ДРУГОЙ рабочей
    // зоне (не просто reorder внутри своей). В отличие от updateCard —
    // сама считает позицию (в конец целевой колонки) и возвращает обе
    // рабочие зоны (старую и новую), чтобы уведомить по сокету оба борда.
    moveCardToColumn: (id, column_id) => {
      const card = db.prepare('SELECT column_id FROM kanban_cards WHERE id=?').get(id)
      if (!card) return null
      const oldWorkspaceId = db.prepare('SELECT workspace_id FROM kanban_columns WHERE id=?').get(card.column_id)?.workspace_id
      const newWorkspaceId = db.prepare('SELECT workspace_id FROM kanban_columns WHERE id=?').get(column_id)?.workspace_id
      const isTerminal = db.prepare('SELECT is_terminal FROM kanban_columns WHERE id=?').get(column_id)?.is_terminal
      const position = db.prepare('SELECT COUNT(*) as c FROM kanban_cards WHERE column_id=?').get(column_id).c
      db.prepare('UPDATE kanban_cards SET column_id=?, position=?, done_at=? WHERE id=?')
        .run(column_id, position, isTerminal ? Math.floor(Date.now() / 1000) : null, id)
      const updated = db.prepare(`
        SELECT k.*, u.name as assignee_name, u.avatar as assignee_avatar, u.color as assignee_color
        FROM kanban_cards k LEFT JOIN users u ON k.assignee_id = u.id WHERE k.id=?
      `).get(id)
      return { card: updated, oldWorkspaceId, newWorkspaceId }
    },
    deleteCard: (id) => {
      db.prepare('DELETE FROM kanban_cards WHERE id=?').run(id)
    },
    // Колонка по умолчанию для задач из чата: первая колонка зоны
    // (или первой зоны вообще, если зона не указана/не существует)
    defaultColumn: (workspaceId) => {
      const inWs = workspaceId
        ? db.prepare('SELECT * FROM kanban_columns WHERE workspace_id=? ORDER BY position LIMIT 1').get(workspaceId)
        : null
      return inWs || db.prepare(`
        SELECT c.* FROM kanban_columns c LEFT JOIN kanban_workspaces w ON w.id = c.workspace_id
        ORDER BY w.id, c.position LIMIT 1
      `).get() || null
    },
    getColumn: (id) => db.prepare('SELECT * FROM kanban_columns WHERE id=?').get(id) || null,
    // Какие из карточек привязаны к сообщениям — чтобы обновить чипы в чате
    linkedMessages: (cardIds) => {
      const ids = (cardIds || []).map(Number).filter(Boolean)
      if (!ids.length) return []
      return db.prepare(`
        SELECT id, source_message_id, source_channel_id FROM kanban_cards
        WHERE source_message_id IS NOT NULL AND id IN (${ids.map(() => '?').join(',')})
      `).all(...ids)
    },
    archiveCard: (id) => db.prepare('UPDATE kanban_cards SET archived_at=? WHERE id=?').run(Math.floor(Date.now() / 1000), id),
    unarchiveCard: (id) => db.prepare('UPDATE kanban_cards SET archived_at=NULL WHERE id=?').run(id),
    // Автоархив: карточки, лежащие в терминальной колонке дольше ARCHIVE_AFTER_MS
    autoArchiveStale: () => {
      const cutoff = Math.floor(Date.now() / 1000) - ARCHIVE_AFTER_MS
      const r = db.prepare(`
        UPDATE kanban_cards SET archived_at = unixepoch()
        WHERE archived_at IS NULL AND done_at IS NOT NULL AND done_at < ?
      `).run(cutoff)
      return r.changes
    },
    reorderCards: (cards) => {
      const colTerminal = {}
      const stmt = db.prepare('UPDATE kanban_cards SET column_id=?, position=?, done_at=? WHERE id=?')
      const run = db.transaction(() => {
        cards.forEach((c, i) => {
          if (!(c.column_id in colTerminal)) {
            colTerminal[c.column_id] = db.prepare('SELECT is_terminal FROM kanban_columns WHERE id=?').get(c.column_id)?.is_terminal
          }
          const current = db.prepare('SELECT column_id, done_at FROM kanban_cards WHERE id=?').get(c.id)
          let doneAt = current?.done_at ?? null
          if (current?.column_id !== c.column_id) {
            doneAt = colTerminal[c.column_id] ? Math.floor(Date.now() / 1000) : null
          }
          stmt.run(c.column_id, i, doneAt, c.id)
        })
      })
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
      card.subtasks.forEach(s => { s.tags = tagsForSubtask(s.id) })
      card.source_message = card.source_message_id ? (db.prepare(`
        SELECT m.id, m.channel_id, m.parent_id, m.text, m.created_at, m.attachment,
               u.name as user_name, u.avatar as user_avatar, u.color as user_color,
               ch.name as channel_name, ch.icon as channel_icon
        FROM messages m JOIN users u ON m.user_id = u.id
        LEFT JOIN channels ch ON ch.id = m.channel_id
        WHERE m.id = ?
      `).get(card.source_message_id) || null) : null
      if (card.source_message?.attachment) {
        try { card.source_message.attachment = JSON.parse(card.source_message.attachment) } catch { card.source_message.attachment = null }
      }
      if (card.source_snapshot) {
        try { card.source_snapshot = JSON.parse(card.source_snapshot) } catch { card.source_snapshot = null }
      }
      if (card.source_message && !card.source_message.parent_id) {
        card.source_message.reply_count = threadMeta(card.source_message.id).reply_count
      }
      return card
    },
    createSubtask: (card_id, title, assignee_id, priority, description) => {
      const pos = db.prepare('SELECT COUNT(*) as c FROM kanban_subtasks WHERE card_id=?').get(card_id).c
      const r = db.prepare(`
        INSERT INTO kanban_subtasks (card_id, title, description, assignee_id, priority, position)
        VALUES (?,?,?,?,?,?)
      `).run(card_id, title, description || null, assignee_id || null, priority || 'medium', pos)
      const s = db.prepare(`
        SELECT s.*, u.name as assignee_name, u.avatar as assignee_avatar, u.color as assignee_color
        FROM kanban_subtasks s LEFT JOIN users u ON s.assignee_id = u.id WHERE s.id=?
      `).get(r.lastInsertRowid)
      s.tags = []
      return s
    },
    updateSubtask: (id, { title, status, assignee_id, priority, description }) => {
      db.prepare(`
        UPDATE kanban_subtasks SET
          title       = COALESCE(?, title),
          description = COALESCE(?, description),
          status      = COALESCE(?, status),
          assignee_id = ?,
          priority    = COALESCE(?, priority)
        WHERE id = ?
      `).run(title || null, description || null, status || null, assignee_id ?? null, priority || null, id)
      const s = db.prepare(`
        SELECT s.*, u.name as assignee_name, u.avatar as assignee_avatar, u.color as assignee_color
        FROM kanban_subtasks s LEFT JOIN users u ON s.assignee_id = u.id WHERE s.id=?
      `).get(id)
      s.tags = tagsForSubtask(id)
      return s
    },
    getAllTags: () => db.prepare('SELECT * FROM kanban_tags ORDER BY name COLLATE NOCASE').all(),
    getSubtaskCardId: (id) => db.prepare('SELECT card_id FROM kanban_subtasks WHERE id=?').get(id)?.card_id,
    addTagToSubtask: (subtask_id, name) => {
      const clean = (name || '').trim()
      if (!clean) return tagsForSubtask(subtask_id)
      let tag = db.prepare('SELECT * FROM kanban_tags WHERE name = ? COLLATE NOCASE').get(clean)
      if (!tag) {
        // Детерминированный цвет по имени — одинаковый тег всегда одного цвета,
        // и не нужно спрашивать у пользователя цвет при создании на лету.
        const color = TAG_PALETTE[hashString(clean.toLowerCase()) % TAG_PALETTE.length]
        const r = db.prepare('INSERT INTO kanban_tags (name, color) VALUES (?,?)').run(clean, color)
        tag = { id: r.lastInsertRowid, name: clean, color }
      }
      db.prepare('INSERT OR IGNORE INTO kanban_subtask_tags (subtask_id, tag_id) VALUES (?,?)').run(subtask_id, tag.id)
      return tagsForSubtask(subtask_id)
    },
    removeTagFromSubtask: (subtask_id, tag_id) => {
      db.prepare('DELETE FROM kanban_subtask_tags WHERE subtask_id=? AND tag_id=?').run(subtask_id, tag_id)
      deleteTagIfOrphaned(tag_id)
      return tagsForSubtask(subtask_id)
    },
    reorderSubtasks: (subtasks) => {
      const stmt = db.prepare('UPDATE kanban_subtasks SET status=?, position=? WHERE id=?')
      const run = db.transaction(() => subtasks.forEach((s, i) => stmt.run(s.status, i, s.id)))
      run()
    },
    deleteSubtask: (id) => {
      // Теги этой подзадачи — до удаления, иначе после CASCADE уже не узнать,
      // какие вообще были привязаны, чтобы проверить их на "остался ли кто-то ещё"
      const tagIds = db.prepare('SELECT tag_id FROM kanban_subtask_tags WHERE subtask_id=?').all(id).map(r => r.tag_id)
      const result = db.prepare('DELETE FROM kanban_subtasks WHERE id=?').run(id)
      tagIds.forEach(deleteTagIfOrphaned) // ON DELETE CASCADE уже убрал связи — просто чистим осиротевшие теги
      return result
    }
  }
}