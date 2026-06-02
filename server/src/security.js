import { createHmac, timingSafeEqual } from 'node:crypto'

const DEFAULT_JSON_LIMIT = '256kb'
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const ACCESS_COOKIE = 'omni_access'
const SESSION_TTL_MS = 12 * 60 * 60 * 1000

function parseAllowedOrigins(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function createSecurityMiddleware({
  allowedOrigins = process.env.OMNI_CORS_ORIGIN || '',
  jsonLimit = process.env.OMNI_JSON_BODY_LIMIT || DEFAULT_JSON_LIMIT,
  accessPassword = process.env.OMNI_ACCESS_PASSWORD || '',
  accessSessionSecret = process.env.OMNI_ACCESS_SESSION_SECRET || '',
} = {}) {
  const origins = parseAllowedOrigins(allowedOrigins)
  const password = String(accessPassword || '')
  const sessionSecret = String(accessSessionSecret || password)
  const accessEnabled = Boolean(password)

  function setSecurityHeaders(_req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    res.setHeader('Cache-Control', 'no-store')
    return next()
  }

  function corsGuard(req, res, next) {
    if (!origins.length) return next()

    const origin = req.headers.origin || ''
    const allowed = origin && origins.includes(origin)
    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Headers', 'content-type,x-omni-action-token')
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
      res.setHeader('Access-Control-Allow-Credentials', 'true')
    }

    if (req.method === 'OPTIONS') return res.sendStatus(allowed ? 204 : 403)
    if (origin && STATE_CHANGING_METHODS.has(req.method) && !allowed) {
      return res.status(403).json({ ok: false, error: 'origin_not_allowed' })
    }
    return next()
  }

  function mountAccessRoutes(app) {
    app.get('/auth/status', (req, res) => {
      res.json({ ok: true, enabled: accessEnabled, authenticated: isAuthenticated(req) })
    })

    app.get('/auth/login', (req, res) => {
      if (!accessEnabled || isAuthenticated(req)) return res.redirect('/')
      res.status(401).type('html').send(loginHtml())
    })

    app.post('/auth/login', (req, res) => {
      if (!accessEnabled) return res.json({ ok: true, enabled: false })
      const submitted = String(req.body?.password || '')
      if (!safeEqual(submitted, password)) {
        if (acceptsJson(req)) return res.status(401).json({ ok: false, error: 'invalid_password' })
        return res.status(401).type('html').send(loginHtml('รหัสไม่ถูกต้อง'))
      }
      setSessionCookie(req, res)
      if (acceptsJson(req)) return res.json({ ok: true, authenticated: true })
      return res.redirect('/')
    })

    app.post('/auth/logout', (_req, res) => {
      res.setHeader('Set-Cookie', `${ACCESS_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`)
      res.json({ ok: true })
    })
  }

  function requireAccess(req, res, next) {
    if (!accessEnabled || isPublicPath(req.path)) return next()
    if (isAuthenticated(req)) return next()
    if (req.path.startsWith('/api/') || req.path.startsWith('/webhook/')) {
      return res.status(401).json({ ok: false, error: 'access_password_required' })
    }
    return res.status(401).type('html').send(loginHtml())
  }

  function verifyWebSocketClient(info, done) {
    if (!accessEnabled) return done(true)
    return done(hasValidCookie(info.req?.headers?.cookie || ''))
  }

  function isAuthenticated(req) {
    if (!accessEnabled) return true
    return hasValidCookie(req.headers.cookie || '')
  }

  function hasValidCookie(cookieHeader) {
    const token = parseCookies(cookieHeader)[ACCESS_COOKIE]
    if (!token) return false
    const [payload, signature] = String(token).split('.')
    if (!payload || !signature) return false
    if (!safeEqual(signature, signPayload(payload))) return false
    try {
      const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      return Number(session.exp || 0) > Date.now()
    } catch {
      return false
    }
  }

  function setSessionCookie(req, res) {
    const payload = Buffer.from(JSON.stringify({
      iat: Date.now(),
      exp: Date.now() + SESSION_TTL_MS,
    })).toString('base64url')
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https'
    const cookie = [
      `${ACCESS_COOKIE}=${payload}.${signPayload(payload)}`,
      'HttpOnly',
      secure ? 'SameSite=None' : 'SameSite=Lax',
      'Path=/',
      `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
      secure ? 'Secure' : ''
    ].filter(Boolean).join('; ')
    res.setHeader('Set-Cookie', cookie)
  }

  function signPayload(payload) {
    return createHmac('sha256', sessionSecret).update(payload).digest('base64url')
  }

  return { setSecurityHeaders, corsGuard, mountAccessRoutes, requireAccess, verifyWebSocketClient, jsonLimit }
}

function isPublicPath(path = '') {
  return path === '/api/health'
    || path.startsWith('/auth/')
    || path.startsWith('/webhook/meta')
    || path.startsWith('/webhook/tiktok')
    || path.startsWith('/webhook/line/suda-oagent')
}

function parseCookies(header = '') {
  const output = {}
  for (const part of String(header || '').split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (!key) continue
    output[key] = value.join('=')
  }
  return output
}

function acceptsJson(req) {
  const accept = String(req.headers.accept || '')
  const contentType = String(req.headers['content-type'] || '')
  return accept.includes('application/json') || contentType.includes('application/json')
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function loginHtml(error = '') {
  const errorText = error ? `<p class="error">${escapeHtml(error)}</p>` : ''
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Omni Access</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#e5e7eb;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{width:min(360px,calc(100vw - 32px));border:1px solid #334155;background:#111827;padding:24px}
    h1{font-size:20px;margin:0 0 16px}
    label{display:block;font-size:13px;color:#cbd5e1;margin-bottom:8px}
    input{box-sizing:border-box;width:100%;border:1px solid #475569;background:#020617;color:#f8fafc;padding:12px;font-size:16px}
    button{width:100%;margin-top:16px;border:0;background:#22c55e;color:#052e16;padding:12px;font-weight:700;font-size:15px}
    .error{color:#fecaca;background:#7f1d1d;padding:10px;font-size:13px}
  </style>
</head>
<body>
  <main>
    <h1>Omni Access</h1>
    ${errorText}
    <form method="post" action="/auth/login">
      <label for="password">รหัสเข้าใช้งาน</label>
      <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
      <button type="submit">เข้าใช้งาน</button>
    </form>
  </main>
</body>
</html>`
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
