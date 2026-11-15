// ─── ADMIN: рендер HTML-страницы ────────────────────────────
// Чисто шаблон — никакой работы с БД тут быть не должно, только вывод
// уже готовых данных, которые передаёт router.js.

// Всё пользовательское (имена каналов, юзеров, зон) — только через esc().
// Раньше имена вставлялись как есть, в т.ч. внутрь onclick="...('${name}')" —
// канал с апострофом в названии ломал кнопки, а <script> в имени исполнялся.
const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

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
    ${error ? `<div class="error">${esc(error)}</div>` : ''}
    <input type="text" name="name" placeholder="Имя пользователя" autofocus required>
    <input type="password" name="password" placeholder="Пароль" required>
    <button type="submit">Войти</button>
    <div class="hint">Тот же аккаунт, что и в самом приложении —<br>просто с правами администратора.</div>
  </form>
</body>
</html>`
}

function renderChannelsManager(folders, channels) {
  const msgCount = Object.fromEntries(channels.map(c => [c.id, c.msg_count]))
  const folderOptions = (selectedId) => folders.map(f =>
    `<option value="${f.id}"${f.id === selectedId ? ' selected' : ''}>${esc(f.icon)} ${esc(f.name)}</option>`).join('')

  return `
  <div class="cm">
    ${folders.map((f, fi) => `
      <div class="cm-folder" data-folder-id="${f.id}">
        <div class="cm-row cm-folder-row">
          <input class="in in-icon" data-field="icon" value="${esc(f.icon)}" maxlength="8" title="Иконка папки">
          <input class="in in-name" data-field="name" value="${esc(f.name)}" maxlength="64" placeholder="Название папки">
          <span class="cm-meta">папка · ${(f.channels || []).length} кан.</span>
          <span class="cm-actions">
            <button class="btn btn-ghost" data-act="folder-move" data-dir="up" ${fi === 0 ? 'disabled' : ''} title="Выше">↑</button>
            <button class="btn btn-ghost" data-act="folder-move" data-dir="down" ${fi === folders.length - 1 ? 'disabled' : ''} title="Ниже">↓</button>
            <button class="btn btn-accent" data-act="folder-save">Сохранить</button>
            <button class="btn btn-red" data-act="folder-delete" ${(f.channels || []).length ? 'disabled title="Сначала перенесите или удалите каналы"' : ''}>Удалить</button>
          </span>
        </div>

        ${(f.channels || []).map((c, ci, arr) => `
          <div class="cm-row cm-channel-row" data-channel-id="${c.id}" data-name="${esc(c.name)}">
            <input class="in in-icon" data-field="icon" value="${esc(c.icon)}" maxlength="8" title="Иконка канала">
            <input class="in in-name" data-field="name" value="${esc(c.name)}" maxlength="64" placeholder="Название канала">
            <select class="in in-folder" data-field="folderId" title="Папка">${folderOptions(f.id)}</select>
            <span class="cm-meta">id ${c.id} · ${msgCount[c.id] ?? 0} сообщ.</span>
            <span class="cm-actions">
              <button class="btn btn-ghost" data-act="channel-move" data-dir="up" ${ci === 0 ? 'disabled' : ''} title="Выше">↑</button>
              <button class="btn btn-ghost" data-act="channel-move" data-dir="down" ${ci === arr.length - 1 ? 'disabled' : ''} title="Ниже">↓</button>
              <button class="btn btn-accent" data-act="channel-save">Сохранить</button>
              <button class="btn btn-ghost" data-act="channel-clear">Очистить историю</button>
              <button class="btn btn-red" data-act="channel-delete">Удалить</button>
            </span>
          </div>
        `).join('')}

        <div class="cm-row cm-new-row">
          <input class="in in-icon" data-field="icon" value="#" maxlength="8">
          <input class="in in-name" data-field="name" maxlength="64" placeholder="Новый канал в «${esc(f.name)}»">
          <span class="cm-actions"><button class="btn btn-accent" data-act="channel-create">+ Канал</button></span>
        </div>
      </div>
    `).join('')}

    <div class="cm-row cm-new-row cm-new-folder">
      <input class="in in-icon" data-field="icon" value="📁" maxlength="8">
      <input class="in in-name" data-field="name" maxlength="64" placeholder="Новая папка">
      <span class="cm-actions"><button class="btn btn-accent" data-act="folder-create">+ Папка</button></span>
    </div>
  </div>`
}

function renderAdminPage({ stats, users, channels, folders = [], workspaces, log, me }) {
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
    .btn:disabled { opacity: .35; cursor: default }
    .btn-red { background: rgba(224,108,117,.15); color: #e06c75 }
    .btn-red:hover:not(:disabled) { background: rgba(224,108,117,.3) }
    .btn-accent { background: rgba(124,106,247,.15); color: #7c6af7 }
    .btn-accent:hover:not(:disabled) { background: rgba(124,106,247,.3) }
    .btn-ghost { background: #1e1e1e; color: #888 }
    .btn-ghost:hover:not(:disabled) { background: #262626; color: #ccc }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 11px; background: #1e1e1e; color: #888 }
    .badge-admin { background: rgba(124,106,247,.2); color: #a99bff }
    .badge-nopass { background: rgba(224,108,117,.15); color: #e06c75 }
    .health { display: inline-flex; align-items: center; gap: 6px; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 8px 14px; font-size: 13px }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #4caf7d }
    .log-row { font-size: 12px; color: #888; padding: 6px 0; border-bottom: 1px solid #1a1a1a }
    .log-time { color: #555; margin-right: 8px }
    .me { color: #666; font-size: 13px; font-weight: 400 }
    .me a { color: #7c6af7; text-decoration: none; margin-left: 10px }

    /* ── Управление каналами ── */
    .cm { display: flex; flex-direction: column; gap: 14px }
    .cm-folder { background: #141414; border: 1px solid #222; border-radius: 10px; padding: 6px }
    .cm-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; flex-wrap: wrap }
    .cm-folder-row { background: #1a1a1a }
    .cm-folder-row .in-name { font-weight: 600; color: #fff }
    .cm-channel-row { padding-left: 28px }
    .cm-channel-row:hover { background: #181818 }
    .cm-new-row { padding-left: 28px; opacity: .8 }
    .cm-new-folder { padding-left: 8px; background: #141414; border: 1px dashed #2a2a2a; border-radius: 10px }
    .cm-meta { color: #555; font-size: 12px; min-width: 110px }
    .cm-actions { margin-left: auto; display: flex; gap: 0 }
    .in { background: #0f0f0f; border: 1px solid #2a2a2a; border-radius: 6px; padding: 6px 8px; color: #eee; font-size: 13px; font-family: inherit }
    .in:focus { outline: none; border-color: #7c6af7 }
    .in-icon { width: 46px; text-align: center }
    .in-name { width: 240px }
    .in-folder { width: 180px }
    .in.dirty { border-color: #e8af34 }
    .toast { position: fixed; bottom: 20px; right: 20px; background: #1a1a1a; border: 1px solid #2a2a2a; color: #ddd; padding: 10px 14px; border-radius: 8px; font-size: 13px; opacity: 0; transition: opacity .2s; pointer-events: none }
    .toast.show { opacity: 1 }
    .toast.err { border-color: #e06c75; color: #e06c75 }
  </style>
</head>
<body>
  <h1>
    ⚙️ WorkVault Admin
    <span class="me">${esc(me.name)}<a href="/admin/logout">Выйти</a></span>
  </h1>

  <div class="health">
    <div class="dot"></div>
    Server healthy · uptime ${esc(stats.uptime)}
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
    <div class="card"><div class="card-val">${esc(stats.dbSize)}</div><div class="card-label">Размер БД</div></div>
  </div>

  <h2>Каналы и папки</h2>
  ${renderChannelsManager(folders, channels)}

  <h2>Рабочие зоны канбана</h2>
  <table>
    <thead><tr><th>ID</th><th>Зона</th><th>Колонок</th><th>Активных задач</th><th>Действия</th></tr></thead>
    <tbody>
      ${workspaces.map(w => `
        <tr data-id="${w.id}" data-name="${esc(w.name)}">
          <td><span class="badge">${w.id}</span></td>
          <td>${esc(w.icon || '')} ${esc(w.name)}</td>
          <td>${w.col_count}</td>
          <td>${w.card_count}</td>
          <td>
            ${workspaces.length > 1 ? `<button class="btn btn-red" data-act="workspace-delete">Удалить</button>` : '—'}
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
        <tr data-id="${u.id}" data-name="${esc(u.name)}">
          <td><span class="badge">${u.id}</span></td>
          <td>${esc(u.avatar)}</td>
          <td style="color:${/^#[0-9a-f]{3,8}$/i.test(u.color || '') ? u.color : 'inherit'}">${esc(u.name)}</td>
          <td>
            ${u.role === 'admin' ? '<span class="badge badge-admin">admin</span>' : ''}
            ${!u.has_password ? '<span class="badge badge-nopass">без пароля</span>' : ''}
          </td>
          <td>
            ${u.role === 'admin'
              ? `<button class="btn btn-ghost" data-act="user-role" data-role="member">Снять админку</button>`
              : `<button class="btn btn-accent" data-act="user-role" data-role="admin">Сделать админом</button>`}
            <button class="btn btn-red" data-act="user-delete">Удалить</button>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <h2>Журнал действий</h2>
  <div>
    ${log.length ? log.map(l => `
      <div class="log-row"><span class="log-time">${new Date(l.created_at * 1000).toLocaleString('ru-RU')}</span>${esc(l.action)}${l.details ? ' — ' + esc(l.details) : ''}</div>
    `).join('') : '<div class="log-row">Пока пусто</div>'}
  </div>

  <div class="toast" id="toast"></div>

  <script>
    const toastEl = document.getElementById('toast')
    let toastTimer
    function toast(text, isErr) {
      toastEl.textContent = text
      toastEl.className = 'toast show' + (isErr ? ' err' : '')
      clearTimeout(toastTimer)
      toastTimer = setTimeout(() => { toastEl.className = 'toast' }, 2200)
    }

    async function api(url, body) {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      })
      let d = {}
      try { d = await r.json() } catch (e) {}
      if (!r.ok || !d.ok) throw new Error(d.error || ('HTTP ' + r.status))
      return d
    }

    const val = (row, field) => row.querySelector('[data-field="' + field + '"]')?.value ?? ''

    // Подсвечиваем несохранённые правки; Enter в поле = «Сохранить»
    document.addEventListener('input', (e) => {
      if (e.target.classList.contains('in') && e.target.closest('.cm-folder-row, .cm-channel-row')) e.target.classList.add('dirty')
    })
    document.addEventListener('change', (e) => {
      if (e.target.matches('select.in')) e.target.classList.add('dirty')
    })
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.classList.contains('in')) return
      const row = e.target.closest('.cm-row')
      row?.querySelector('[data-act$="-save"], [data-act$="-create"]')?.click()
    })

    const actions = {
      async 'folder-create'(btn) {
        const row = btn.closest('.cm-row')
        await api('/admin/api/folders', { name: val(row, 'name'), icon: val(row, 'icon') })
        location.reload()
      },
      async 'folder-save'(btn) {
        const box = btn.closest('.cm-folder'), row = btn.closest('.cm-row')
        await api('/admin/api/folders/' + box.dataset.folderId, { name: val(row, 'name'), icon: val(row, 'icon') })
        row.querySelectorAll('.dirty').forEach(el => el.classList.remove('dirty'))
        toast('Папка сохранена')
      },
      async 'folder-move'(btn) {
        const box = btn.closest('.cm-folder')
        await api('/admin/api/folders/' + box.dataset.folderId + '/move', { dir: btn.dataset.dir })
        location.reload()
      },
      async 'folder-delete'(btn) {
        const box = btn.closest('.cm-folder'), row = btn.closest('.cm-row')
        if (!confirm('Удалить папку «' + val(row, 'name') + '»?')) return
        await api('/admin/api/folders/' + box.dataset.folderId + '/delete')
        location.reload()
      },
      async 'channel-create'(btn) {
        const box = btn.closest('.cm-folder'), row = btn.closest('.cm-row')
        await api('/admin/api/channels', { folderId: Number(box.dataset.folderId), name: val(row, 'name'), icon: val(row, 'icon') })
        location.reload()
      },
      async 'channel-save'(btn) {
        const row = btn.closest('.cm-row')
        const box = btn.closest('.cm-folder')
        const folderId = Number(val(row, 'folderId'))
        await api('/admin/api/channels/' + row.dataset.channelId, { name: val(row, 'name'), icon: val(row, 'icon'), folderId })
        if (folderId !== Number(box.dataset.folderId)) return location.reload()
        row.dataset.name = val(row, 'name')
        row.querySelectorAll('.dirty').forEach(el => el.classList.remove('dirty'))
        toast('Канал сохранён')
      },
      async 'channel-move'(btn) {
        const row = btn.closest('.cm-row')
        await api('/admin/api/channels/' + row.dataset.channelId + '/move', { dir: btn.dataset.dir })
        location.reload()
      },
      async 'channel-clear'(btn) {
        const row = btn.closest('.cm-row')
        if (!confirm('Очистить всю историю канала #' + row.dataset.name + '?')) return
        const d = await api('/admin/api/clear-history/' + row.dataset.channelId)
        alert('Удалено сообщений: ' + d.deleted); location.reload()
      },
      async 'channel-delete'(btn) {
        const row = btn.closest('.cm-row')
        if (!confirm('Удалить канал #' + row.dataset.name + ' вместе со всеми сообщениями? Это необратимо.')) return
        await api('/admin/api/channels/' + row.dataset.channelId + '/delete')
        location.reload()
      },
      async 'user-role'(btn) {
        const row = btn.closest('tr'), role = btn.dataset.role
        const verb = role === 'admin' ? 'Выдать права администратора' : 'Снять права администратора у'
        if (!confirm(verb + ' ' + row.dataset.name + '?')) return
        await api('/admin/api/set-role/' + row.dataset.id, { role })
        location.reload()
      },
      async 'user-delete'(btn) {
        const row = btn.closest('tr')
        if (!confirm('Удалить пользователя ' + row.dataset.name + '?')) return
        await api('/admin/api/delete-user/' + row.dataset.id)
        alert('Удалён'); location.reload()
      },
      async 'workspace-delete'(btn) {
        const row = btn.closest('tr')
        if (!confirm('Удалить зону «' + row.dataset.name + '» вместе со всеми колонками и задачами?')) return
        await api('/admin/api/delete-workspace/' + row.dataset.id)
        alert('Удалена'); location.reload()
      }
    }

    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]')
      if (!btn || btn.disabled || !actions[btn.dataset.act]) return
      btn.disabled = true
      try { await actions[btn.dataset.act](btn) }
      catch (err) { toast('Ошибка: ' + err.message, true) }
      finally { btn.disabled = false }
    })
  <\/script>
</body>
</html>`
}

module.exports = { renderAdminPage, renderAdminLoginPage }
