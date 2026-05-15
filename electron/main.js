const { app, BrowserWindow, Notification, ipcMain, shell, dialog } = require('electron')
const path  = require('path')
const fs    = require('fs')
const https = require('https')
const http  = require('http')

const isDev = !app.isPackaged
const SERVER_URL = isDev
  ? 'http://localhost:3000'
  : 'http://172.16.99.37:3000'

let mainWindow

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

  mainWindow.once('ready-to-show', () => mainWindow.show())
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('notify', (_, { title, body }) => {
  if (Notification.isSupported()) new Notification({ title, body, silent: false }).show()
})
ipcMain.handle('win:minimize', () => mainWindow?.minimize())
ipcMain.handle('win:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize())
ipcMain.handle('win:close',    () => mainWindow?.close())

ipcMain.handle('download:file', async (_, { url, filename }) => {
  const ext     = path.extname(filename)
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
  const fullUrl  = url.startsWith('http') ? url : `${SERVER_URL}${url}`
  const proto    = fullUrl.startsWith('https') ? https : http

  return new Promise((resolve) => {
    const file = fs.createWriteStream(savePath)
    proto.get(fullUrl, (res) => {
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve({ ok: true, filePath: savePath }) })
    }).on('error', (err) => {
      fs.unlink(savePath, () => {})
      resolve({ ok: false, reason: err.message })
    })
  })
})