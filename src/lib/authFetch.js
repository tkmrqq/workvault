// Патчим глобальный fetch один раз при загрузке модуля — это единственный
// практичный способ добавить credentials + авто-refresh сразу везде,
// не переписывая вручную каждый отдельный fetch() по всему приложению
// (KanbanView.vue, KanbanCardView.vue, MessageItem.vue и т.д. — их много).

let installed = false
let refreshPromise = null

function isApiUrl(url, apiBase) {
  const s = String(url)
  return s.startsWith(`${apiBase}/api/`) || s.startsWith('/api/')
}

function isAuthUrl(url) {
  // /api/auth/* сюда не попадает — иначе неудачный логин сам себя
  // "рефрешил" бы по кругу
  return String(url).includes('/api/auth/')
}

export function installAuthFetch(apiBase, onSessionExpired) {
  if (installed) return
  installed = true

  const nativeFetch = window.fetch.bind(window)

  async function doRefresh() {
    if (!refreshPromise) {
      refreshPromise = nativeFetch(`${apiBase}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
        .then(r => r.ok)
        .catch(() => false)
        .finally(() => { refreshPromise = null })
    }
    return refreshPromise
  }

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url
    const api = isApiUrl(url, apiBase)
    const opts = api ? { credentials: 'include', ...init } : init

    let res = await nativeFetch(input, opts)

    if (api && res.status === 401 && !isAuthUrl(url)) {
      const ok = await doRefresh()
      if (ok) {
        res = await nativeFetch(input, opts) // одна попытка повтора — не зацикливаемся
      } else {
        onSessionExpired?.()
      }
    }
    return res
  }
}