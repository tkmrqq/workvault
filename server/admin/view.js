// ─── ADMIN: рендер HTML-страницы ────────────────────────────
// Чисто шаблон — никакой работы с БД тут быть не должно, только вывод
// уже готовых данных, которые передаёт router.js.

function renderAdminLoginPage({ error }) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>WorkVault Admin · Вход</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0 }
    body {
      font-family: system-ui, sans-serif; background: #0f0f0f; color: #ccc;
      display: flex; align-items: center; justify-content: center; height: 100vh;
    }
    .box { width: 320px; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 28px; }
    h1 { color: #fff; font-size: 18px; margin-bottom: 18px; text-align: center; }
    input {
      width: 100%; background: #0f0f0f; border: 1px solid #2a2a2a; border-radius: 8px;
      padding: 10px 12px; color: #eee; font-size: 14px; margin-bottom: 10px;
    }
    input:focus { outline: none; border-color: #7c6af7; }
    button {
      width: 100%; background: #7c6af7; color: #fff; border: none; border-radius: 8px;
      padding: 10px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 4px;
    }
    button:hover { background: #6a58e0; }
    .error { color: #e06c75; font-size: 13px; margin-bottom: 10px; text-align: center; }
    .hint { color: #555; font-size: 12px; margin-top: 14px; text-align: center; line-height: 1.5; }
  </style>
</head>
<body>
  <form class="box" method="POST" action="/admin/login">
    <h1>⚙️ WorkVault Admin</h1>
    ${error ? `<div class="error">${error}</div>` : ''}
    <input type="text" name="name" placeholder="Имя пользователя" autofocus required>
    <input type="password" name="password" placeholder="Пароль" required>
    <button type="submit">Войти</button>
    <div class="hint">Тот же аккаунт, что и в самом приложении —<br>просто с правами администратора.</div>
  </form>
</body>
</html>`
}

function renderAdminPage({ stats, users, channels, workspaces, log, me }) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>WorkVault Admin</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0 }
    body { font-family: system-ui, sans-serif; background: #0f0f0f; color: #ccc; padding: 32px; }
    h1 { color: #fff; margin-bottom: 8px; font-size: 20px; display: flex; align-items: center; justify-content: space-between; }
    h2 { color: #aaa; font-size: 13px; text-transform: uppercase; letter-spacing: .08em; margin: 32px 0 12px }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-bottom: 8px }
    .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 10px; padding: 16px }
    .card-val { font-size: 28px; font-weight: 700; color: #fff }
    .card-label { font-size: 12px; color: #666; margin-top: 4px }
    table { width: 100%; border-collapse: collapse; font-size: 13px }
    th { text-align: left; padding: 8px 12px; background: #1a1a1a; color: #666; font-weight: 600 }
    td { padding: 8px 12px; border-bottom: 1px solid #1e1e1e }
    tr:hover td { background: #161616 }
    .btn { padding: 4px 10px; border-radius: 6px; border: none; cursor: pointer; font-size: 12px; font-weight: 600; margin-right: 6px }
    .btn-red { background: rgba(224,108,117,.15); color: #e06c75 }
    .btn-red:hover { background: rgba(224,108,117,.3) }
    .btn-accent { background: rgba(124,106,247,.15); color: #7c6af7 }
    .btn-accent:hover { background: rgba(124,106,247,.3) }
    .btn-ghost { background: #1e1e1e; color: #888 }
    .btn-ghost:hover { background: #262626; color: #ccc }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 11px; background: #1e1e1e; color: #888 }
    .badge-admin { background: rgba(124,106,247,.2); color: #a99bff }
    .badge-nopass { background: rgba(224,108,117,.15); color: #e06c75 }
    .health { display: inline-flex; align-items: center; gap: 6px; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 8px 14px; font-size: 13px }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #4caf7d }
    .log-row { font-size: 12px; color: #888; padding: 6px 0; border-bottom: 1px solid #1a1a1a }
    .log-time { color: #555; margin-right: 8px }
    .me { color: #666; font-size: 13px; font-weight: 400 }
    .me a { color: #7c6af7; text-decoration: none; margin-left: 10px }
  </style>
</head>
<body>
  <h1>
    ⚙️ WorkVault Admin
    <span class="me">${me.name}<a href="/admin/logout">Выйти</a></span>
  </h1>

  <div class="health">
    <div class="dot"></div>
    Server healthy · uptime ${stats.uptime}
  </div>

  <h2>Статистика</h2>
  <div class="grid">
    <div class="card"><div class="card-val">${stats.users}</div><div class="card-label">Пользователей</div></div>
    <div class="card"><div class="card-val">${stats.messages}</div><div class="card-label">Сообщений</div></div>
    <div class="card"><div class="card-val">${stats.channels}</div><div class="card-label">Каналов</div></div>
    <div class="card"><div class="card-val">${stats.uploads}</div><div class="card-label">Файлов</div></div>
    <div class="card"><div class="card-val">${stats.cards}</div><div class="card-label">Задач в канбане</div></div>
    <div class="card"><div class="card-val">${stats.archived}</div><div class="card-label">В архиве</div></div>
    <div class="card"><div class="card-val">${stats.workspaces}</div><div class="card-label">Рабочих зон</div></div>
    <div class="card"><div class="card-val">${stats.dbSize}</div><div class="card-label">Размер БД</div></div>
  </div>

  <h2>Рабочие зоны канбана</h2>
  <table>
    <thead><tr><th>ID</th><th>Зона</th><th>Колонок</th><th>Активных задач</th><th>Действия</th></tr></thead>
    <tbody>
      ${workspaces.map(w => `
        <tr>
          <td><span class="badge">${w.id}</span></td>
          <td>${w.icon} ${w.name}</td>
          <td>${w.col_count}</td>
          <td>${w.card_count}</td>
          <td>
            ${workspaces.length > 1 ? `<button class="btn btn-red" onclick="deleteWorkspace(${w.id}, '${w.name}')">Удалить</button>` : '—'}
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <h2>Каналы</h2>
  <table>
    <thead><tr><th>ID</th><th>Канал</th><th>Папка</th><th>Сообщений</th><th>Действия</th></tr></thead>
    <tbody>
      ${channels.map(c => `
        <tr>
          <td><span class="badge">${c.id}</span></td>
          <td>${c.name}</td>
          <td>${c.folder || '—'}</td>
          <td>${c.msg_count}</td>
          <td>
            <button class="btn btn-red" onclick="clearHistory(${c.id}, '${c.name}')">
              Очистить историю
            </button>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <h2>Пользователи</h2>
  <table>
    <thead><tr><th>ID</th><th>Аватар</th><th>Имя</th><th>Статус</th><th>Действия</th></tr></thead>
    <tbody>
      ${users.map(u => `
        <tr>
          <td><span class="badge">${u.id}</span></td>
          <td>${u.avatar}</td>
          <td style="color:${u.color}">${u.name}</td>
          <td>
            ${u.role === 'admin' ? '<span class="badge badge-admin">admin</span>' : ''}
            ${!u.has_password ? '<span class="badge badge-nopass">без пароля</span>' : ''}
          </td>
          <td>
            ${u.role === 'admin'
              ? `<button class="btn btn-ghost" onclick="setRole(${u.id}, 'member', '${u.name}')">Снять админку</button>`
              : `<button class="btn btn-accent" onclick="setRole(${u.id}, 'admin', '${u.name}')">Сделать админом</button>`}
            <button class="btn btn-red" onclick="deleteUser(${u.id}, '${u.name}')">Удалить</button>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <h2>Журнал действий</h2>
  <div>
    ${log.length ? log.map(l => `
      <div class="log-row"><span class="log-time">${new Date(l.created_at * 1000).toLocaleString('ru-RU')}</span>${l.action}${l.details ? ' — ' + l.details : ''}</div>
    `).join('') : '<div class="log-row">Пока пусто</div>'}
  </div>

  <script>
    async function clearHistory(channelId, name) {
      if (!confirm('Очистить всю историю канала #' + name + '?')) return
      const r = await fetch('/admin/api/clear-history/' + channelId, { method: 'POST' })
      const d = await r.json()
      if (d.ok) { alert('Удалено сообщений: ' + d.deleted); location.reload() }
      else alert('Ошибка: ' + d.error)
    }
    async function deleteUser(id, name) {
      if (!confirm('Удалить пользователя ' + name + '?')) return
      const r = await fetch('/admin/api/delete-user/' + id, { method: 'POST' })
      const d = await r.json()
      if (d.ok) { alert('Удалён'); location.reload() }
      else alert('Ошибка: ' + d.error)
    }
    async function setRole(id, role, name) {
      const verb = role === 'admin' ? 'Выдать права администратора' : 'Снять права администратора у'
      if (!confirm(verb + ' ' + name + '?')) return
      const r = await fetch('/admin/api/set-role/' + id, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      })
      const d = await r.json()
      if (d.ok) location.reload()
      else alert('Ошибка: ' + d.error)
    }
    async function deleteWorkspace(id, name) {
      if (!confirm('Удалить зону «' + name + '» вместе со всеми колонками и задачами?')) return
      const r = await fetch('/admin/api/delete-workspace/' + id, { method: 'POST' })
      const d = await r.json()
      if (d.ok) { alert('Удалена'); location.reload() }
      else alert('Ошибка: ' + (d.error || 'не удалось'))
    }
  <\/script>
</body>
</html>`
}

module.exports = { renderAdminPage, renderAdminLoginPage }