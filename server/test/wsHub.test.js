import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { createHub } from '../src/wsHub.js'
import { createState } from '../src/state.js'

function setupServer() {
  const room = createState()
  const server = http.createServer()
  const wss = new WebSocketServer({ server, path: '/ws' })
  const hub = createHub(wss, room)
  return new Promise((resolve) => {
    server.listen(0, () => resolve({ port: server.address().port, server, hub, room, wss }))
  })
}

const nextMessage = (ws) => new Promise((resolve) => ws.once('message', (d) => resolve(JSON.parse(d))))
const opened = (ws) => new Promise((resolve) => ws.once('open', resolve))
const closedServer = (server) => new Promise((resolve) => server.close(resolve))

test('client receives state:full on connect', async () => {
  const { port, server } = await setupServer()
  const ws = new WebSocket(`ws://localhost:${port}/ws`)
  const msg = await nextMessage(ws)
  assert.equal(msg.event, 'state')
  assert.ok(msg.state.messages)
  ws.close()
  await closedServer(server)
})

test('hub.broadcast sends to all open clients', async () => {
  const { port, server, hub } = await setupServer()
  const ws1 = new WebSocket(`ws://localhost:${port}/ws`)
  const ws2 = new WebSocket(`ws://localhost:${port}/ws`)
  const initial1 = nextMessage(ws1)
  const initial2 = nextMessage(ws2)
  await Promise.all([opened(ws1), opened(ws2), initial1, initial2])
  hub.broadcast('test', { x: 1 })
  const [m1, m2] = await Promise.all([
    nextMessage(ws1),
    nextMessage(ws2),
  ])
  assert.equal(m1.event, 'test')
  assert.equal(m2.event, 'test')
  assert.deepEqual(m1.state, { x: 1 })
  ws1.close()
  ws2.close()
  await closedServer(server)
})

test('identify sets presence and broadcasts', async () => {
  const { port, server, room } = await setupServer()
  const ws = new WebSocket(`ws://localhost:${port}/ws`)
  const initial = nextMessage(ws)
  await Promise.all([opened(ws), initial])
  ws.send(JSON.stringify({ event: 'identify', payload: { who: 'Code' } }))
  const msg = await nextMessage(ws)
  assert.equal(msg.event, 'presence')
  assert.equal(msg.state.presence.Code, true)
  assert.equal(room.presence.Code, true)
  ws.close()
  await closedServer(server)
})
