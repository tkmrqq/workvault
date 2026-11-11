const { app, BrowserWindow, Notification, ipcMain, shell, dialog, Menu, clipboard, session, net } = require('electron')
const path = require('path')
const fs = require('fs')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')
const { autoUpdater } = require('electron-updater')
const { resolveServerUrl } = require('./serverUrl')

const isDev = !app.isPackaged
let SERVER_URL = resolveServerUrl()

let mainWindow

function trustedServerUrl(url) {
  try {
    const u = new URL(url)
    const s = new URL(SERVER_URL)
    if (u.hostname === s.hostname) return true
    if (['localhost', '127.0.0.1', 'workvault.local'].includes(u.hostname)) return true
  } catch { /* ignore malformed */ }
  return false
}

// Самоподписанный cert nginx: доверяем только своим хостам — для ВСЕХ сессий
// (окно, electron-updater, net.fetch в main). Событие certificate-error
// покрывает только webContents, до запросов main-процесса оно не доходит.
function installCertTrust(ses) {
  ses.setCertificateVerifyProc((req, cb) => {
    if (req.errorCode === 0) return cb(-3)                 // валидный cert — обычная проверка Chromium
    if (trustedServerUrl('https://' + req.hostname)) return cb(0)
    cb(-2)
  })
}
app.on('session-created', installCertTrust)

let retryTimer = null
function loadServerUi() {
  clearTimeout(retryTimer)
  mainWindow?.loadURL(SERVER_URL.replace(/\/$/, '') + '/')
}
function offlinePage(reason) {
  const html = `<!doctype html><meta charset="utf-8"><title>WorkVault</title>
  <body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
    background:#0d0d0d;color:#ddd;font:14px system-ui,sans-serif;-webkit-app-region:drag">
  <div style="text-align:center;max-width:420px">
    <div style="font-size:18px;font-weight:700;margin-bottom:8px">Нет связи с сервером</div>
    <div style="opacity:.6">${String(SERVER_URL).replace(/[<>&"]/g, '')}</div>
    <div style="opacity:.45;margin-top:4px">${String(reason || '').replace(/[<>&"]/g, '')}</div>
    <div style="opacity:.6;margin-top:16px">Пробую переподключиться…</div>
  </div></body>`
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [`--server-url=${SERVER_URL}`]
    },
    icon: path.join(__dirname, '../src/assets/icon.png'),
    backgroundColor: '#0d0d0d',
    show: false
  })

  // Без фильтра ссылка вида file:///C:/Windows/System32/calc.exe или smb://
  // из чата запускала бы произвольные программы/сетевые шары
  const SAFE_EXTERNAL = new Set(['http:', 'https:', 'mailto:'])
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (SAFE_EXTERNAL.has(new URL(url).protocol)) shell.openExternal(url)
    } catch { }
    return { action: 'deny' }
  })
  // И не даём самому окну уйти на чужой сайт (там был бы доступ к preload API)
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const current = mainWindow.webContents.getURL()
    try {
      if (new URL(url).origin === new URL(current).origin) return
    } catch { }
    e.preventDefault()
    try { if (SAFE_EXTERNAL.has(new URL(url).protocol)) shell.openExternal(url) } catch { }
  })

  // Проверка орфографии: русский + английский (на macOS язык берётся из системы)
  try { mainWindow.webContents.session.setSpellCheckerLanguages(['ru', 'en-US']) } catch { }

  // Нативное контекстное меню. Срабатывает только если страница сама не
  // перехватила contextmenu — у сообщений своё меню внутри интерфейса.
  mainWindow.webContents.on('context-menu', (_e, p) => {
    const wc = mainWindow.webContents
    const t = []
    const sep = () => { if (t.length && t[t.length - 1].type !== 'separator') t.push({ type: 'separator' }) }
    const safeExternal = (u) => { try { if (['http:', 'https:', 'mailto:'].includes(new URL(u).protocol)) shell.openExternal(u) } catch { } }

    if (p.isEditable && p.misspelledWord) {
      const sugg = (p.dictionarySuggestions || []).slice(0, 5)
      for (const s of sugg) t.push({ label: s, click: () => wc.replaceMisspelling(s) })
      if (!sugg.length) t.push({ label: 'Нет вариантов', enabled: false })
      t.push({ label: 'Добавить в словарь', click: () => wc.session.addWordToSpellCheckerDictionary(p.misspelledWord) })
      sep()
    }
    if (p.linkURL) {
      t.push({ label: 'Открыть ссылку в браузере', click: () => safeExternal(p.linkURL) })
      t.push({ label: 'Копировать ссылку', click: () => clipboard.writeText(p.linkURL) })
      sep()
    }
    if (p.mediaType === 'image' && p.srcURL) {
      t.push({ label: 'Копировать изображение', click: () => wc.copyImageAt(p.x, p.y) })
      t.push({ label: 'Сохранить изображение как…', click: () => wc.downloadURL(p.srcURL) })
      t.push({ label: 'Копировать адрес изображения', click: () => clipboard.writeText(p.srcURL) })
      sep()
    }
    if (p.isEditable) {
      const f = p.editFlags || {}
      t.push({ label: 'Отменить', role: 'undo', enabled: !!f.canUndo })
      t.push({ label: 'Повторить', role: 'redo', enabled: !!f.canRedo })
      sep()
      t.push({ label: 'Вырезать', role: 'cut', enabled: !!f.canCut })
      t.push({ label: 'Копировать', role: 'copy', enabled: !!f.canCopy })
      t.push({ label: 'Вставить', role: 'paste', enabled: !!f.canPaste })
      sep()
      t.push({ label: 'Выделить всё', role: 'selectAll' })
    } else if (p.selectionText && p.selectionText.trim()) {
      t.push({ label: 'Копировать', role: 'copy' })
      t.push({ label: 'Найти в Google', click: () => safeExternal('https://www.google.com/search?q=' + encodeURIComponent(p.selectionText.trim().slice(0, 200))) })
    }
    if (isDev) { sep(); t.push({ label: 'Просмотреть код', click: () => wc.inspectElement(p.x, p.y) }) }
    while (t.length && t[t.length - 1].type === 'separator') t.pop()
    if (t.length) Menu.buildFromTemplate(t).popup({ window: mainWindow })
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const appUrl = isDev ? 'http://localhost:5173' : SERVER_URL.replace(/\/$/, '') + '/'
    if (!url.startsWith(appUrl)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    // Раньше грузили dist/index.html с file:// — для браузера это другой сайт, и
    // httpOnly-cookie с SameSite=Lax (access_token/refresh_token) на запросах к серверу
    // не сохранялись/не отправлялись → логин «проходил», но сессии не было.
    // SameSite=None по http нельзя (требует Secure), поэтому открываем фронт,
    // который раздаёт сам сервер — тогда всё same-origin.
    loadServerUi()
  }

  // Сервер недоступен — показываем заглушку и переподключаемся раз в 5 сек
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (isDev || !isMainFrame || code === -3 /* ABORTED */ || String(url).startsWith('data:')) return
    mainWindow.loadURL(offlinePage(desc))
    mainWindow.show()
    clearTimeout(retryTimer)
    retryTimer = setTimeout(loadServerUi, 5000)
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    // Проверяем обновления только в продакшне
    if (!isDev) {
      autoUpdater.checkForUpdatesAndNotify()
    }
  })
}

app.whenReady().then(() => {
  installCertTrust(session.defaultSession)
  SERVER_URL = resolveServerUrl()
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: `${SERVER_URL.replace(/\/$/, '')}/downloads/`
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

autoUpdater.on('update-available', () => {
  mainWindow?.webContents.send('update:available')
})

autoUpdater.on('update-downloaded', () => {
  mainWindow?.webContents.send('update:downloaded')
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Самоподписанный сертификат nginx на LAN — доверяем только нашему серверу (https)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (trustedServerUrl(url)) {
    event.preventDefault()
    callback(true)
  } else {
    callback(false)
  }
})



ipcMain.handle('notify', (_, { title, body }) => {
  if (Notification.isSupported()) new Notification({ title, body, silent: false }).show()
})
ipcMain.handle('win:minimize', () => mainWindow?.minimize())
ipcMain.handle('win:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize())
ipcMain.handle('win:close', () => mainWindow?.close())

ipcMain.handle('update:install', () => { autoUpdater.quitAndInstall() })

ipcMain.handle('download:file', async (_, { url, filename }) => {
  const ext = path.extname(filename)
  const filters = []
  if (ext) filters.push({ name: `${ext.slice(1).toUpperCase()} файл`, extensions: [ext.slice(1)] })
  filters.push({ name: 'Все файлы', extensions: ['*'] })

  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: filename,
    buttonLabel: 'Сохранить',
    filters
  })

  if (canceled || !filePath) return { ok: false, reason: 'cancelled' }

  const savePath = ext && !filePath.endsWith(ext) ? filePath + ext : filePath
  const fullUrl = url.startsWith('http') ? url : `${SERVER_URL.replace(/\/$/, '')}${url}`

  // net.fetch — сетевой стек Chromium: проходит через installCertTrust
  // (самоподписанный cert) и сам идёт по редиректам (http → https от nginx).
  // Node-шный https.get не умеет ни то, ни другое.
  try {
    const res = await net.fetch(fullUrl)
    if (!res.ok || !res.body) return { ok: false, reason: `HTTP ${res.status}` }
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(savePath))
    return { ok: true, filePath: savePath }
  } catch (err) {
    fs.unlink(savePath, () => { })
    return { ok: false, reason: err.message }
  }
})