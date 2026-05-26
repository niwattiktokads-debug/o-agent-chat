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

loadEnvFile()

const PORT = process.env.PORT || 8787
const OMNI_DB_PATH = process.env.OMNI_DB_PATH || new URL('../data/omni.sqlite', import.meta.url).pathname
const CLIENT_DIST_PATH = process.env.CLIENT_DIST_PATH || new URL('../../client/dist', import.meta.url).pathname
const CORS_ORIGIN = process.env.OMNI_CORS_ORIGIN || ''
const app = express()
app.use((req, res, next) => {
  if (CORS_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'content-type')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  return next()
})
app.use(express.json())

const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })
const hub = createHub(wss, room)
const omniStore = createSqliteOmniStore({ dbPath: OMNI_DB_PATH })
const omni = createOmniService({ store: omniStore })
const retention = startChatRetentionScheduler({ omni })

mountRoutes(app, hub, room, { omni })
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
