const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const config = require('./config')
const db = require('./db')

// ─── Access-токены (JWT, короткоживущие) ───────────────────
function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, name: user.name, role: user.role },
    config.JWT_SECRET,
    { expiresIn: config.JWT_ACCESS_EXPIRES_IN, algorithm: 'HS256' }
  )
}

function verifyAccessToken(token) {
  try {
    // algorithms обязательно указываем явно — иначе теоретически можно
    // подсунуть токен, подписанный другим алгоритмом ("alg confusion")
    return jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] })
  } catch {
    return null
  }
}

// ─── Refresh-токены (непрозрачная случайная строка, не JWT) ─
// Хранится хэшем в БД — можно отозвать мгновенно (logout/смена пароля),
// в отличие от JWT-refresh, который остаётся "валидным" до истечения срока,
// даже если сервер о нём "забыл".
function issueRefreshToken(userId) {
  const token = crypto.randomBytes(48).toString('hex')
  const expiresAtMs = Date.now() + config.JWT_REFRESH_EXPIRES_MS
  db.storeRefreshToken(userId, token, expiresAtMs)
  return token
}

const ACCESS_COOKIE_OPTS = {
  httpOnly: true, sameSite: 'lax', secure: config.COOKIE_SECURE,
  maxAge: 15 * 60 * 1000 // держим независимо от JWT_ACCESS_EXPIRES_IN, но того же порядка
}
const REFRESH_COOKIE_OPTS = {
  httpOnly: true, sameSite: 'lax', secure: config.COOKIE_SECURE,
  path: '/api/auth', // отправляется только на auth-роуты — не на каждый запрос
  maxAge: config.JWT_REFRESH_EXPIRES_MS
}

function setAuthCookies(res, user) {
  res.cookie('access_token', signAccessToken(user), ACCESS_COOKIE_OPTS)
  res.cookie('refresh_token', issueRefreshToken(user.id), REFRESH_COOKIE_OPTS)
}
function clearAuthCookies(res) {
  res.clearCookie('access_token', { path: '/' })
  res.clearCookie('refresh_token', { path: '/api/auth' })
}

// ─── Middleware ─────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.cookies?.access_token
  const payload = token && verifyAccessToken(token)
  if (!payload) return res.status(401).json({ error: 'Не авторизован', code: 'UNAUTHORIZED' })
  req.user = { id: payload.sub, name: payload.name, role: payload.role }
  next()
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Требуются права администратора' })
    next()
  })
}

// ─── Rate limit на попытки логина ───────────────────────────
// В памяти процесса — рестарт сервера сбрасывает счётчики, для масштаба
// одного небольшого VPS с одним Node-процессом этого достаточно (без Redis).
const LOGIN_MAX_ATTEMPTS = 5
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const loginAttempts = new Map() // key (name+ip) → { count, firstAt }

function loginRateLimit(req, res, next) {
  const key = `${(req.body?.name || '').toLowerCase()}:${req.ip}`
  const entry = loginAttempts.get(key)
  const now = Date.now()
  if (entry && now - entry.firstAt < LOGIN_WINDOW_MS && entry.count >= LOGIN_MAX_ATTEMPTS) {
    const retryInMin = Math.ceil((LOGIN_WINDOW_MS - (now - entry.firstAt)) / 60000)
    return res.status(429).json({ error: `Слишком много попыток. Попробуй через ${retryInMin} мин.` })
  }
  next()
}
function registerFailedLogin(req) {
  const key = `${(req.body?.name || '').toLowerCase()}:${req.ip}`
  const now = Date.now()
  const entry = loginAttempts.get(key)
  if (!entry || now - entry.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAt: now })
  } else {
    entry.count++
  }
}
function clearFailedLogins(req) {
  loginAttempts.delete(`${(req.body?.name || '').toLowerCase()}:${req.ip}`)
}

module.exports = {
  signAccessToken, verifyAccessToken, issueRefreshToken,
  setAuthCookies, clearAuthCookies,
  requireAuth, requireAdmin,
  loginRateLimit, registerFailedLogin, clearFailedLogins
}