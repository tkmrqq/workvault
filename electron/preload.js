const { contextBridge, ipcRenderer } = require('electron')

const serverUrl = process.argv
  .find(a => a.startsWith('--server-url='))
  ?.replace('--server-url=', '') || ''

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  notify:       (title, body) => ipcRenderer.invoke('notify', { title, body }),
  minimize:     () => ipcRenderer.invoke('win:minimize'),
  maximize:     () => ipcRenderer.invoke('win:maximize'),
  close:        () => ipcRenderer.invoke('win:close'),
  // Скачать файл: показывает диалог «Сохранить как» и копирует файл
  downloadFile: (url, filename) => ipcRenderer.invoke('download:file', { url, filename }),
  serverUrl,
  onUpdateAvailable:  (cb) => ipcRenderer.on('update:available',  cb),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update:downloaded', cb),
  installUpdate: () => ipcRenderer.invoke('update:install')
})