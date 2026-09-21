const { app } = require('electron')
const path = require('path')
const fs = require('fs')

function readBundledServerUrl() {
  try {
    const p = path.join(__dirname, '../dist/server-url.json')
    const { serverUrl } = JSON.parse(fs.readFileSync(p, 'utf8'))
    if (serverUrl) return serverUrl.replace(/\/$/, '')
  } catch { /* dist ещё не собран — dev или первый запуск */ }
  return null
}

function resolveServerUrl() {
  const fromEnv = process.env.WORKVAULT_SERVER_URL?.replace(/\/$/, '')
  if (fromEnv) return fromEnv

  const isDev = !app.isPackaged
  if (isDev) return 'http://localhost:3000'

  return readBundledServerUrl() || 'http://localhost:3000'
}

module.exports = { resolveServerUrl }
