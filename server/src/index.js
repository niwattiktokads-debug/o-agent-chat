import express from 'express'
import http from 'node:http'
import { existsSync } from 'node:fs'
import { WebSocketServer } from 'ws'
import { loadEnvFile } from './omni/env.js'
import { mountRoutes } from './routes.js'
import { createHub } from './wsHub.js'
import { mountWebhook } from './webhook.js'
import { room } from './state.js'
import { createSqliteOmniStore } from './omni/db/sqliteStore.js'
import { createOmniService } from './omni/service.js'
import { startChatRetentionScheduler } from './omni/retention.js'
import { createSecurityMiddleware } from './security.js'

loadEnvFile()

const PORT = process.env.PORT || 8787
const OMNI_DB_PATH = process.env.OMNI_DB_PATH || new URL('../data/omni.sqlite', import.meta.url).pathname
const CLIENT_DIST_PATH = process.env.CLIENT_DIST_PATH || new URL('../../client/dist', import.meta.url).pathname
const CORS_ORIGIN = process.env.OMNI_CORS_ORIGIN || ''
const storageStatus = {
  driver: 'sqlite',
  dbPath: OMNI_DB_PATH,
  configuredByEnv: Boolean(process.env.OMNI_DB_PATH),
  persistent: OMNI_DB_PATH.startsWith('/data/'),
  volumeMountPath: OMNI_DB_PATH.startsWith('/data/') ? '/data' : null,
  note: OMNI_DB_PATH.startsWith('/data/')
    ? 'Railway volume-backed SQLite storage'
    : 'Container-local SQLite storage; data may reset on deploy/restart',
}
const app = express()
const security = createSecurityMiddleware({ allowedOrigins: CORS_ORIGIN })
app.use(security.setSecurityHeaders)
app.use(security.corsGuard)
app.use(express.json({ limit: security.jsonLimit, strict: true }))
app.use(express.urlencoded({ extended: false, limit: '16kb' }))
security.mountAccessRoutes(app)

const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws', verifyClient: security.verifyWebSocketClient })
const hub = createHub(wss, room)
const omniStore = createSqliteOmniStore({ dbPath: OMNI_DB_PATH })
const omni = createOmniService({ store: omniStore })
const retention = startChatRetentionScheduler({ omni })

app.use(security.requireAccess)

mountRoutes(app, hub, room, { omni, storageStatus })
mountWebhook(app, hub, room, { omni })

if (existsSync(CLIENT_DIST_PATH)) {
  app.use(express.static(CLIENT_DIST_PATH))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/webhook/')) return next()
    res.sendFile('index.html', { root: CLIENT_DIST_PATH })
  })
}

server.listen(PORT, () => {
  console.log(`[room] listening on http://localhost:${PORT}`)
  if (retention.enabled) {
    console.log(`[omni-retention] enabled delete_after_days=${retention.config.deleteAfterDays}`)
  }
})
