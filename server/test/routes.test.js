import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mountRoutes } from '../src/routes.js'
import { createState } from '../src/state.js'

const app = express()
app.use(express.json())
const events = []
const hub = { broadcast: (event, payload) => events.push({ event, payload }) }
const room = createState()
mountRoutes(app, hub, room)
const server = app.listen(0)
const port = server.address().port
after(() => server.close())

const req = (method, path, body) => fetch(`http://localhost:${port}${path}`, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body && JSON.stringify(body),
}).then(async (r) => ({ status: r.status, body: await r.json() }))

test('GET /api/state returns snapshot', async () => {
  const { body } = await req('GET', '/api/state')
  assert.equal(body.leader, '—')
  assert.ok(Array.isArray(body.messages))
})

test('POST /api/message appends and broadcasts', async () => {
  events.length = 0
  const { body } = await req('POST', '/api/message', { role: 'Boss', text: 'hello' })
  assert.equal(body.ok, true)
  assert.equal(body.message.role, 'Boss')
  assert.equal(events[0].event, 'message')
  assert.equal(events[0].payload.messages.at(-1).text, 'hello')
})

test('POST /api/leader normalizes case and broadcasts state', async () => {
  events.length = 0
  const { body } = await req('POST', '/api/leader', { leader: 'code' })
  assert.equal(body.ok, true)
  assert.equal(events[0].event, 'leader')
  assert.equal(events[0].payload.leader, 'Code')
  assert.equal(body.state.operator, 'Codex')
})

test('POST /api/message rejects empty text', async () => {
  const { body, status } = await req('POST', '/api/message', { sender: 'Boss', text: '' })
  assert.equal(status, 400)
  assert.equal(body.ok, false)
})

test('POST /api/field updates goal and broadcasts', async () => {
  events.length = 0
  const { body } = await req('POST', '/api/field', { key: 'goal', value: 'ship MVP' })
  assert.equal(body.ok, true)
  assert.equal(events[0].event, 'room')
  assert.equal(events[0].payload.goal, 'ship MVP')
})

test('POST /api/field accepts doneDefinition alias', async () => {
  events.length = 0
  const { body } = await req('POST', '/api/field', { key: 'doneDefinition', value: 'green E2E' })
  assert.equal(body.ok, true)
  assert.equal(body.state.dod, 'green E2E')
  assert.equal(body.state.doneDefinition, 'green E2E')
})
