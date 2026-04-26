import express from 'express'
import http from 'node:http'
import { WebSocketServer } from 'ws'
import { mountRoutes } from './routes.js'
import { createHub } from './wsHub.js'
import { mountWebhook } from './webhook.js'
import { room } from './state.js'

const PORT = process.env.PORT || 8787
const app = express()
app.use(express.json())

const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })
const hub = createHub(wss, room)

mountRoutes(app, hub, room)
mountWebhook(app, hub, room)

server.listen(PORT, () => {
  console.log(`[room] listening on http://localhost:${PORT}`)
})
