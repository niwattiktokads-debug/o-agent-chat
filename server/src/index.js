import express from 'express'
import http from 'node:http'
import { WebSocketServer } from 'ws'
import { loadEnvFile } from './omni/env.js'
import { mountRoutes } from './routes.js'
import { createHub } from './wsHub.js'
import { mountWebhook } from './webhook.js'
import { room } from './state.js'
import { createSqliteOmniStore } from './omni/db/sqliteStore.js'
import { createOmniService } from './omni/service.js'

loadEnvFile()

const PORT = process.env.PORT || 8787
const OMNI_DB_PATH = process.env.OMNI_DB_PATH || new URL('../data/omni.sqlite', import.meta.url).pathname
const app = express()
app.use(express.json())

const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })
const hub = createHub(wss, room)
const omniStore = createSqliteOmniStore({ dbPath: OMNI_DB_PATH })
const omni = createOmniService({ store: omniStore })

mountRoutes(app, hub, room, { omni })
mountWebhook(app, hub, room, { omni })

server.listen(PORT, () => {
  console.log(`[room] listening on http://localhost:${PORT}`)
})
