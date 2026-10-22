/**
 * Базовый URL API для всех режимов:
 * - браузер + vite dev: '' → запросы на /api/* проксируются на localhost:3000
 * - браузер + prod (тот же origin): '' → nginx/Express отдают SPA и API с одного хоста
 * - Electron (сборка): VITE_API_URL из .env.production (https://…)
 * - Electron (dev): preload.serverUrl = http://localhost:3000 для абсолютных /uploads
 */
export function getApiBase() {
  // В браузерной разработке работаем через Vite proxy на том же origin.
  // Иначе localhost:5173 → LAN-IP создаёт cross-site запросы, и браузер
  // блокирует SameSite=Lax auth-cookie в Socket.IO handshake.
  if (import.meta.env.DEV) {
    const electronServer = typeof window !== 'undefined' && window.electronAPI?.serverUrl
    if (electronServer) return String(electronServer).replace(/\/$/, '')
    return ''
  }

  const fromEnv = import.meta.env.VITE_API_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const fromElectron = typeof window !== 'undefined' && window.electronAPI?.serverUrl
  if (fromElectron) return String(fromElectron).replace(/\/$/, '')
  return ''
}
