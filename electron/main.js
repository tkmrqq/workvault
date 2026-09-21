const { app, BrowserWindow, Notification, ipcMain, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const https = require('https')
const http = require('http')
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const appUrl = isDev ? 'http://localhost:5173' : 'file://'
    if (!url.startsWith(appUrl)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    // Проверяем обновления только в продакшне
    if (!isDev) {
      autoUpdater.checkForUpdatesAndNotify()
    }
  })
}

app.whenReady().then(() => {
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
  const fullUrl = url.startsWith('http') ? url : `${SERVER_URL}${url}`
  const proto = fullUrl.startsWith('https') ? https : http

  return new Promise((resolve) => {
    const file = fs.createWriteStream(savePath)
    proto.get(fullUrl, (res) => {
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve({ ok: true, filePath: savePath }) })
    }).on('error', (err) => {
      fs.unlink(savePath, () => { })
      resolve({ ok: false, reason: err.message })
    })
  })
})