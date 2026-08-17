// ─── ADMIN: базовая защита паролем ─────────────────────────
// Пароль задаётся через .env.server → ADMIN_PASSWORD. Без него /admin
// недоступна вообще — это лучше, чем случайно оставить панель открытой
// всем в локальной сети.
function requireAdminAuth(req, res, next) {
  const pass = process.env.ADMIN_PASSWORD
  if (!pass) {
    return res.status(503).send(`
      <body style="font-family:system-ui;background:#0f0f0f;color:#ccc;padding:40px">
        <h2 style="color:#fff">Админка не настроена</h2>
        <p>Добавь <code>ADMIN_PASSWORD=твой_пароль</code> в файл .env.server в корне проекта и перезапусти сервер.</p>
      </body>`)
  }
  const header = req.headers.authorization || ''
  const [scheme, encoded] = header.split(' ')
  if (scheme === 'Basic' && encoded) {
    const [, suppliedPass] = Buffer.from(encoded, 'base64').toString().split(':')
    if (suppliedPass === pass) return next()
  }
  res.set('WWW-Authenticate', 'Basic realm="WorkVault Admin"')
  res.status(401).send('Требуется авторизация')
}

module.exports = { requireAdminAuth }
