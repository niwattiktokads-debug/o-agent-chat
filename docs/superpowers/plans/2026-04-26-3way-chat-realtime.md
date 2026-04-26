# 3-Way Chat Realtime Room — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single realtime chat room where Boss (web/mobile), Code (CLI agent), and Codex (CLI agent) talk together over WebSocket with sub-200ms latency.

**Architecture:** Vite/React UI on port 5173 (Code-owned), Node.js room server on port 8787 (Codex-owned) with WS hub broadcasting to all connected clients, in-memory state, optional webhook ingress for Telegram. Vite dev server proxies `/api` and `/ws` to backend.

**Tech Stack:** React 18 · Vite 6 · Tailwind 3 · Node.js (`ws` + `express`) · Vitest (UI tests) · Node `node:test` (backend tests)

**Spec:** `docs/superpowers/specs/2026-04-26-3way-chat-realtime-design.md`

**Owner split (per Codex pin):**
- **Codex** → Tasks 1–6 (backend, webhook, contract)
- **Code** → Tasks 7–18 (UI, realtime wiring, integration close)

---

## File Structure

### Backend (new — Codex)
- Create `server/package.json` — deps: `ws`, `express`
- Create `server/src/index.js` — entry, mounts routes + WS hub on port 8787
- Create `server/src/state.js` — in-memory `{leader, operator, goal, scope, dod, messages, presence}`
- Create `server/src/wsHub.js` — connection registry + `broadcast(event, payload)`
- Create `server/src/routes.js` — `GET /api/state`, `POST /api/message`, `POST /api/leader`
- Create `server/src/webhook.js` — `POST /webhook/telegram` (idempotent by message id)
- Create `server/test/state.test.js` — state mutations
- Create `server/test/routes.test.js` — REST integration
- Create `server/test/wsHub.test.js` — broadcast + presence
- Create `CONTRACT.md` (root) — frozen contract reference

### Frontend (modify — Code)
- Modify `client/src/lib/api.js` — WS reconnect, optimistic update, queue, presence ping
- Create `client/src/lib/useResponsive.js` — viewport hook (`isMobile` <768px)
- Create `client/src/lib/parseTag.js` — extract `[TAG]` prefix from text
- Create `client/src/components/TagBadge.jsx` — render colored badge
- Create `client/src/components/MobileDrawer.jsx` — slide-in drawer for StatusPanel
- Create `client/src/components/PresenceDot.jsx` — green/grey online indicator
- Modify `client/src/App.jsx` — drawer trigger on mobile, connection banner
- Modify `client/src/components/MessageList.jsx` — timestamp, tag badge, sender group, pending state
- Modify `client/src/components/Composer.jsx` — Enter to send, typing event, queue offline, send fail retry
- Modify `client/src/components/StatusPanel.jsx` — presence dots, editable goal/scope/dod (inline)
- Modify `client/package.json` — add `vitest`, `@testing-library/react`, `jsdom`
- Modify `client/vite.config.js` — add vitest config (already proxies, no change needed)

---

## Phase 1 — Backend (Codex)

### Task 1: Server scaffold + dependencies

**Files:**
- Create: `server/package.json`
- Create: `server/src/index.js`

- [ ] **Step 1: Init server package**

```bash
cd /Users/babycuca/Projects/o-agent-chat
mkdir -p server/src server/test
cat > server/package.json <<'EOF'
{
  "name": "o-agent-chat-server",
  "version": "0.0.1",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "node --watch src/index.js",
    "start": "node src/index.js",
    "test": "node --test test/"
  },
  "dependencies": {
    "express": "^4.21.2",
    "ws": "^8.18.0"
  }
}
EOF
cd server && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 2: Write entry that boots on port 8787**

```js
// server/src/index.js
import express from 'express'
import http from 'node:http'
import { WebSocketServer } from 'ws'
import { mountRoutes } from './routes.js'
import { createHub } from './wsHub.js'
import { mountWebhook } from './webhook.js'

const PORT = process.env.PORT || 8787
const app = express()
app.use(express.json())

const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })
const hub = createHub(wss)

mountRoutes(app, hub)
mountWebhook(app, hub)

server.listen(PORT, () => {
  console.log(`[room] listening on http://localhost:${PORT}`)
})
```

- [ ] **Step 3: Stub the modules so import doesn't fail**

```js
// server/src/state.js
export const state = {
  leader: '—',
  operator: '—',
  goal: '',
  scope: '',
  dod: '',
  messages: [],
  presence: { Boss: false, Code: false, Codex: false },
}
```

```js
// server/src/wsHub.js
export function createHub(wss) {
  return {
    broadcast(event, payload) {
      const msg = JSON.stringify({ event, payload })
      wss.clients.forEach((c) => c.readyState === 1 && c.send(msg))
    },
  }
}
```

```js
// server/src/routes.js
export function mountRoutes(app, hub) {
  app.get('/api/health', (_req, res) => res.json({ ok: true }))
}
```

```js
// server/src/webhook.js
export function mountWebhook(_app, _hub) { /* filled in Task 6 */ }
```

- [ ] **Step 4: Smoke test**

```bash
cd /Users/babycuca/Projects/o-agent-chat/server
npm start &
sleep 1
curl -s http://localhost:8787/api/health
kill %1
```

Expected: `{"ok":true}`

- [ ] **Step 5: Commit**

```bash
cd /Users/babycuca/Projects/o-agent-chat
git add server/
git commit -m "feat(server): scaffold room server with health check"
```

---

### Task 2: In-memory state module + tests

**Files:**
- Modify: `server/src/state.js`
- Create: `server/test/state.test.js`

- [ ] **Step 1: Write failing tests**

```js
// server/test/state.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createState } from '../src/state.js'

test('createState returns defaults', () => {
  const s = createState()
  assert.equal(s.leader, '—')
  assert.deepEqual(s.messages, [])
  assert.equal(s.presence.Boss, false)
})

test('addMessage appends with id and ts', () => {
  const s = createState()
  const msg = s.addMessage({ sender: 'Boss', text: 'hi' })
  assert.equal(msg.sender, 'Boss')
  assert.equal(msg.text, 'hi')
  assert.ok(msg.id)
  assert.ok(msg.ts)
  assert.equal(s.messages.length, 1)
})

test('addMessage parses [TAG] prefix', () => {
  const s = createState()
  const msg = s.addMessage({ sender: 'Code', text: '[PROPOSE] use option A' })
  assert.equal(msg.tag, 'PROPOSE')
  assert.equal(msg.text, 'use option A')
})

test('setLeader updates leader and flips operator', () => {
  const s = createState()
  s.setLeader('Code')
  assert.equal(s.leader, 'Code')
  assert.equal(s.operator, 'Codex')
})

test('setPresence flips online flag', () => {
  const s = createState()
  s.setPresence('Code', true)
  assert.equal(s.presence.Code, true)
})
```

- [ ] **Step 2: Run tests (should fail)**

```bash
cd /Users/babycuca/Projects/o-agent-chat/server
npm test
```

Expected: FAIL — `createState is not a function`.

- [ ] **Step 3: Implement state module**

```js
// server/src/state.js
const VALID_TAGS = ['ASK', 'ANS', 'PROPOSE', 'AGREE', 'DISAGREE', 'DECIDE', 'DO', 'PASS', 'STATE']

function parseTag(text) {
  const m = text.match(/^\[(\w+)\]\s*/)
  if (m && VALID_TAGS.includes(m[1])) {
    return { tag: m[1], text: text.slice(m[0].length) }
  }
  return { tag: undefined, text }
}

export function createState() {
  const data = {
    leader: '—',
    operator: '—',
    goal: '',
    scope: '',
    dod: '',
    messages: [],
    presence: { Boss: false, Code: false, Codex: false },
  }

  return {
    get leader() { return data.leader },
    get operator() { return data.operator },
    get goal() { return data.goal },
    get scope() { return data.scope },
    get dod() { return data.dod },
    get messages() { return data.messages },
    get presence() { return data.presence },

    snapshot() {
      return {
        leader: data.leader,
        operator: data.operator,
        goal: data.goal,
        scope: data.scope,
        dod: data.dod,
        messages: [...data.messages],
        presence: { ...data.presence },
      }
    },

    addMessage({ sender, text }) {
      const { tag, text: cleanText } = parseTag(text)
      const msg = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sender,
        text: cleanText,
        tag,
        ts: Date.now(),
      }
      data.messages.push(msg)
      return msg
    },

    setLeader(leader) {
      data.leader = leader
      data.operator = leader === 'Code' ? 'Codex' : 'Code'
    },

    setField(key, value) {
      if (['goal', 'scope', 'dod'].includes(key)) data[key] = value
    },

    setPresence(who, online) {
      if (who in data.presence) data.presence[who] = online
    },
  }
}

export const room = createState()
```

- [ ] **Step 4: Run tests (should pass)**

```bash
cd /Users/babycuca/Projects/o-agent-chat/server
npm test
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/state.js server/test/state.test.js
git commit -m "feat(server): in-memory room state with tag parsing"
```

---

### Task 3: REST routes + tests

**Files:**
- Modify: `server/src/routes.js`
- Create: `server/test/routes.test.js`

- [ ] **Step 1: Write failing tests**

```js
// server/test/routes.test.js
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'
import { mountRoutes } from '../src/routes.js'
import { room } from '../src/state.js'

const app = express()
app.use(express.json())
const events = []
const hub = { broadcast: (event, payload) => events.push({ event, payload }) }
mountRoutes(app, hub, room)
const server = app.listen(0)
const port = server.address().port
after(() => server.close())

const req = (method, path, body) => fetch(`http://localhost:${port}${path}`, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body && JSON.stringify(body),
}).then((r) => r.json())

test('GET /api/state returns snapshot', async () => {
  const s = await req('GET', '/api/state')
  assert.equal(s.leader, '—')
  assert.ok(Array.isArray(s.messages))
})

test('POST /api/message appends and broadcasts', async () => {
  events.length = 0
  const r = await req('POST', '/api/message', { sender: 'Boss', text: 'hello' })
  assert.equal(r.ok, true)
  assert.equal(events[0].event, 'message:new')
  assert.equal(events[0].payload.text, 'hello')
})

test('POST /api/leader normalizes case and broadcasts state', async () => {
  events.length = 0
  const r = await req('POST', '/api/leader', { leader: 'code' })
  assert.equal(r.ok, true)
  assert.equal(events[0].event, 'state:update')
  assert.equal(events[0].payload.leader, 'Code')
})

test('POST /api/message rejects empty text', async () => {
  const r = await req('POST', '/api/message', { sender: 'Boss', text: '' })
  assert.equal(r.ok, false)
})
```

- [ ] **Step 2: Run tests (should fail)**

```bash
cd /Users/babycuca/Projects/o-agent-chat/server && npm test
```

Expected: FAIL.

- [ ] **Step 3: Implement routes**

```js
// server/src/routes.js
const VALID_LEADERS = ['Code', 'Codex']

function normalizeLeader(input) {
  if (!input) return null
  const lower = String(input).toLowerCase()
  if (lower === 'code') return 'Code'
  if (lower === 'codex') return 'Codex'
  return null
}

export function mountRoutes(app, hub, room) {
  app.get('/api/health', (_req, res) => res.json({ ok: true }))

  app.get('/api/state', (_req, res) => {
    res.json(room.snapshot())
  })

  app.post('/api/message', (req, res) => {
    const { sender, text } = req.body || {}
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ ok: false, error: 'empty_text' })
    }
    const safeSender = ['Boss', 'Code', 'Codex'].includes(sender) ? sender : 'Boss'
    const msg = room.addMessage({ sender: safeSender, text: text.trim() })
    hub.broadcast('message:new', msg)
    res.json({ ok: true, message: msg })
  })

  app.post('/api/leader', (req, res) => {
    const leader = normalizeLeader(req.body?.leader)
    if (!leader) return res.status(400).json({ ok: false, error: 'invalid_leader' })
    room.setLeader(leader)
    hub.broadcast('state:update', room.snapshot())
    res.json({ ok: true })
  })

  app.post('/api/field', (req, res) => {
    const { key, value } = req.body || {}
    if (!['goal', 'scope', 'dod'].includes(key)) {
      return res.status(400).json({ ok: false, error: 'invalid_key' })
    }
    room.setField(key, String(value || ''))
    hub.broadcast('state:update', room.snapshot())
    res.json({ ok: true })
  })
}
```

- [ ] **Step 4: Update index.js to pass `room` into routes**

In `server/src/index.js`, change:
```js
import { mountRoutes } from './routes.js'
import { createHub } from './wsHub.js'
import { mountWebhook } from './webhook.js'
```
to also import `room`:
```js
import { mountRoutes } from './routes.js'
import { createHub } from './wsHub.js'
import { mountWebhook } from './webhook.js'
import { room } from './state.js'
```
And update the mount call:
```js
mountRoutes(app, hub, room)
mountWebhook(app, hub, room)
```

- [ ] **Step 5: Run tests (should pass)**

```bash
cd /Users/babycuca/Projects/o-agent-chat/server && npm test
```

Expected: PASS — all routes tests + state tests.

- [ ] **Step 6: Commit**

```bash
git add server/
git commit -m "feat(server): REST routes for state, message, leader, field"
```

---

### Task 4: WS hub with state:full on connect + broadcast tests

**Files:**
- Modify: `server/src/wsHub.js`
- Create: `server/test/wsHub.test.js`

- [ ] **Step 1: Write failing tests**

```js
// server/test/wsHub.test.js
import { test, after } from 'node:test'
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
    server.listen(0, () => resolve({ port: server.address().port, server, hub, room }))
  })
}

test('client receives state:full on connect', async () => {
  const { port, server } = await setupServer()
  const ws = new WebSocket(`ws://localhost:${port}/ws`)
  const msg = await new Promise((resolve) => ws.once('message', (d) => resolve(JSON.parse(d))))
  assert.equal(msg.event, 'state:full')
  assert.ok(msg.payload.messages)
  ws.close()
  server.close()
})

test('hub.broadcast sends to all open clients', async () => {
  const { port, server, hub } = await setupServer()
  const ws1 = new WebSocket(`ws://localhost:${port}/ws`)
  const ws2 = new WebSocket(`ws://localhost:${port}/ws`)
  await Promise.all([
    new Promise((r) => ws1.once('open', r)),
    new Promise((r) => ws2.once('open', r)),
  ])
  // skip the initial state:full
  await Promise.all([
    new Promise((r) => ws1.once('message', r)),
    new Promise((r) => ws2.once('message', r)),
  ])
  hub.broadcast('test', { x: 1 })
  const [m1, m2] = await Promise.all([
    new Promise((r) => ws1.once('message', (d) => r(JSON.parse(d)))),
    new Promise((r) => ws2.once('message', (d) => r(JSON.parse(d)))),
  ])
  assert.equal(m1.event, 'test')
  assert.equal(m2.event, 'test')
  ws1.close()
  ws2.close()
  server.close()
})
```

- [ ] **Step 2: Run tests (should fail)**

```bash
cd /Users/babycuca/Projects/o-agent-chat/server && npm test
```

Expected: FAIL — `createHub` doesn't accept room or send state:full.

- [ ] **Step 3: Implement hub with state:full + presence + typing relay**

```js
// server/src/wsHub.js
export function createHub(wss, room) {
  wss.on('connection', (ws) => {
    // Send full state on connect
    ws.send(JSON.stringify({ event: 'state:full', payload: room.snapshot() }))

    let identifiedAs = null

    ws.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw) } catch { return }
      if (!msg || typeof msg !== 'object') return

      switch (msg.event) {
        case 'identify': {
          const who = msg.payload?.who
          if (['Boss', 'Code', 'Codex'].includes(who)) {
            identifiedAs = who
            room.setPresence(who, true)
            broadcast('presence:update', { who, online: true })
          }
          break
        }
        case 'typing': {
          if (identifiedAs && typeof msg.payload?.typing === 'boolean') {
            broadcast('typing:update', { who: identifiedAs, typing: msg.payload.typing })
          }
          break
        }
      }
    })

    ws.on('close', () => {
      if (identifiedAs) {
        room.setPresence(identifiedAs, false)
        broadcast('presence:update', { who: identifiedAs, online: false })
      }
    })
  })

  function broadcast(event, payload) {
    const msg = JSON.stringify({ event, payload })
    wss.clients.forEach((c) => c.readyState === 1 && c.send(msg))
  }

  return { broadcast }
}
```

- [ ] **Step 4: Update `index.js` to pass room into hub**

Change `const hub = createHub(wss)` → `const hub = createHub(wss, room)`.

- [ ] **Step 5: Run tests**

```bash
cd /Users/babycuca/Projects/o-agent-chat/server && npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/wsHub.js server/test/wsHub.test.js server/src/index.js
git commit -m "feat(server): WS hub with state:full, presence, typing relay"
```

---

### Task 5: Webhook ingress (Telegram-shaped)

**Files:**
- Modify: `server/src/webhook.js`

- [ ] **Step 1: Implement idempotent ingress**

```js
// server/src/webhook.js
const seen = new Set()

export function mountWebhook(app, hub, room) {
  app.post('/webhook/telegram', (req, res) => {
    const { update_id, message } = req.body || {}
    if (!update_id || !message?.text) {
      return res.status(400).json({ ok: false, error: 'invalid_update' })
    }
    if (seen.has(update_id)) return res.json({ ok: true, dedup: true })
    seen.add(update_id)
    const msg = room.addMessage({ sender: 'Boss', text: message.text })
    hub.broadcast('message:new', msg)
    res.json({ ok: true })
  })
}
```

- [ ] **Step 2: Smoke test**

```bash
cd /Users/babycuca/Projects/o-agent-chat/server
npm start &
sleep 1
curl -s -X POST http://localhost:8787/webhook/telegram \
  -H 'Content-Type: application/json' \
  -d '{"update_id":1,"message":{"text":"from telegram"}}'
echo
curl -s http://localhost:8787/api/state | head -c 200
kill %1
```

Expected: First response `{"ok":true}`, state contains the message.

- [ ] **Step 3: Commit**

```bash
git add server/src/webhook.js
git commit -m "feat(server): telegram webhook ingress with dedup"
```

---

### Task 6: Freeze contract document

**Files:**
- Create: `CONTRACT.md`

- [ ] **Step 1: Write contract**

```bash
cat > /Users/babycuca/Projects/o-agent-chat/CONTRACT.md <<'EOF'
# O-Agent Chat — Frozen Contract

## REST
- `GET  /api/state` → `{ leader, operator, goal, scope, dod, messages[], presence }`
- `POST /api/message` `{ sender: "Boss"|"Code"|"Codex", text: string }` → `{ ok, message }`
- `POST /api/leader` `{ leader: "code"|"codex" }` → `{ ok }` (case-insensitive, server normalizes)
- `POST /api/field` `{ key: "goal"|"scope"|"dod", value: string }` → `{ ok }`

## WebSocket `/ws`
**Server → client events:**
- `state:full` — sent on connect, payload = full state snapshot
- `state:update` — payload = full state snapshot
- `message:new` — payload = single message `{ id, sender, text, tag?, ts }`
- `presence:update` — payload = `{ who, online }`
- `typing:update` — payload = `{ who, typing }`

**Client → server events:**
- `identify` — `{ who: "Boss"|"Code"|"Codex" }` — must send right after connect to register presence
- `typing` — `{ typing: boolean }` — relayed to others, ephemeral, not persisted

## Webhook
- `POST /webhook/telegram` `{ update_id, message: { text } }` — idempotent by `update_id`

## Tag Vocabulary
`ASK | ANS | PROPOSE | AGREE | DISAGREE | DECIDE | DO | PASS | STATE`

Format in text: `[PROPOSE] message body`
EOF
```

- [ ] **Step 2: Commit**

```bash
cd /Users/babycuca/Projects/o-agent-chat
git add CONTRACT.md
git commit -m "docs: freeze contract for room server v1"
```

---

## Phase 2 — UI work (Code) — runs in parallel with Phase 1

### Task 7: Vitest setup + parseTag util

**Files:**
- Modify: `client/package.json`
- Create: `client/src/lib/parseTag.js`
- Create: `client/src/lib/parseTag.test.js`
- Modify: `client/vite.config.js`

- [ ] **Step 1: Install vitest**

```bash
cd /Users/babycuca/Projects/o-agent-chat/client
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

Add to `client/package.json` `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Configure vitest in vite.config.js**

Modify `client/vite.config.js` to add `test` block:

```js
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```

- [ ] **Step 3: Write failing test for parseTag**

```js
// client/src/lib/parseTag.test.js
import { describe, it, expect } from 'vitest'
import { parseTag } from './parseTag.js'

describe('parseTag', () => {
  it('extracts known tag and trims body', () => {
    expect(parseTag('[PROPOSE] do X')).toEqual({ tag: 'PROPOSE', text: 'do X' })
  })

  it('returns null tag for unknown bracket', () => {
    expect(parseTag('[xyz] body')).toEqual({ tag: null, text: '[xyz] body' })
  })

  it('returns null tag for plain text', () => {
    expect(parseTag('plain message')).toEqual({ tag: null, text: 'plain message' })
  })
})
```

- [ ] **Step 4: Run (should fail)**

```bash
npm test
```

Expected: FAIL — file missing.

- [ ] **Step 5: Implement parseTag**

```js
// client/src/lib/parseTag.js
const TAGS = ['ASK', 'ANS', 'PROPOSE', 'AGREE', 'DISAGREE', 'DECIDE', 'DO', 'PASS', 'STATE']

export function parseTag(text) {
  const m = (text || '').match(/^\[(\w+)\]\s*/)
  if (m && TAGS.includes(m[1])) {
    return { tag: m[1], text: text.slice(m[0].length) }
  }
  return { tag: null, text }
}
```

- [ ] **Step 6: Run (should pass)**

```bash
npm test
```

Expected: PASS — 3 tests.

- [ ] **Step 7: Commit**

```bash
cd /Users/babycuca/Projects/o-agent-chat
git add client/
git commit -m "feat(ui): vitest setup + parseTag util"
```

---

### Task 8: TagBadge component

**Files:**
- Create: `client/src/components/TagBadge.jsx`
- Create: `client/src/components/TagBadge.test.jsx`

- [ ] **Step 1: Write failing test**

```jsx
// client/src/components/TagBadge.test.jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TagBadge from './TagBadge.jsx'

describe('TagBadge', () => {
  it('renders tag name uppercase', () => {
    render(<TagBadge tag="propose" />)
    expect(screen.getByText('PROPOSE')).toBeInTheDocument()
  })

  it('returns null when tag missing', () => {
    const { container } = render(<TagBadge tag={null} />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Add jest-dom setup**

Create `client/src/test-setup.js`:
```js
import '@testing-library/jest-dom/vitest'
```

Update `client/vite.config.js` `test` block:
```js
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: ['./src/test-setup.js'],
},
```

- [ ] **Step 3: Run (should fail)**

```bash
cd client && npm test
```

Expected: FAIL — TagBadge missing.

- [ ] **Step 4: Implement**

```jsx
// client/src/components/TagBadge.jsx
import React from 'react'

const COLOR = {
  ASK: 'bg-blue-500/20 text-blue-300',
  ANS: 'bg-cyan-500/20 text-cyan-300',
  PROPOSE: 'bg-violet-500/20 text-violet-300',
  AGREE: 'bg-emerald-500/20 text-emerald-300',
  DISAGREE: 'bg-rose-500/20 text-rose-300',
  DECIDE: 'bg-amber-500/30 text-amber-300',
  DO: 'bg-lime-500/20 text-lime-300',
  PASS: 'bg-slate-500/20 text-slate-300',
  STATE: 'bg-indigo-500/20 text-indigo-300',
}

export default function TagBadge({ tag }) {
  if (!tag) return null
  const upper = String(tag).toUpperCase()
  const cls = COLOR[upper] || 'bg-slate-500/20 text-slate-300'
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide mr-1.5 ${cls}`}>
      {upper}
    </span>
  )
}
```

- [ ] **Step 5: Run (should pass)** + commit

```bash
npm test
cd /Users/babycuca/Projects/o-agent-chat
git add client/
git commit -m "feat(ui): TagBadge component for [PROPOSE]/[DECIDE]/etc"
```

---

### Task 9: PresenceDot component

**Files:**
- Create: `client/src/components/PresenceDot.jsx`

- [ ] **Step 1: Implement (trivial, no test)**

```jsx
// client/src/components/PresenceDot.jsx
import React from 'react'

export default function PresenceDot({ online }) {
  const cls = online ? 'bg-emerald-400' : 'bg-slate-600'
  const title = online ? 'online' : 'offline'
  return <span title={title} className={`inline-block h-2 w-2 rounded-full ${cls}`} />
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/PresenceDot.jsx
git commit -m "feat(ui): PresenceDot indicator"
```

---

### Task 10: useResponsive hook

**Files:**
- Create: `client/src/lib/useResponsive.js`
- Create: `client/src/lib/useResponsive.test.js`

- [ ] **Step 1: Write failing test**

```js
// client/src/lib/useResponsive.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIsMobile } from './useResponsive.js'

describe('useIsMobile', () => {
  beforeEach(() => {
    window.innerWidth = 1024
    window.dispatchEvent(new Event('resize'))
  })

  it('returns false on desktop width', () => {
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it('returns true when resized below 768', () => {
    const { result } = renderHook(() => useIsMobile())
    act(() => {
      window.innerWidth = 500
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toBe(true)
  })
})
```

- [ ] **Step 2: Run (should fail)** then implement

```js
// client/src/lib/useResponsive.js
import { useEffect, useState } from 'react'

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < breakpoint
  )
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [breakpoint])
  return isMobile
}
```

- [ ] **Step 3: Run + commit**

```bash
cd client && npm test
cd /Users/babycuca/Projects/o-agent-chat
git add client/
git commit -m "feat(ui): useIsMobile hook"
```

---

### Task 11: MobileDrawer component

**Files:**
- Create: `client/src/components/MobileDrawer.jsx`

- [ ] **Step 1: Implement**

```jsx
// client/src/components/MobileDrawer.jsx
import React, { useEffect } from 'react'

export default function MobileDrawer({ open, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/60 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <div
        className={`fixed left-0 top-0 z-40 h-full w-80 max-w-[85vw] bg-slate-900 shadow-xl transition-transform ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          onClick={onClose}
          aria-label="ปิด"
          className="absolute right-3 top-3 rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
        >
          ✕
        </button>
        {children}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/MobileDrawer.jsx
git commit -m "feat(ui): MobileDrawer with overlay + esc close"
```

---

### Task 12: Upgrade MessageList — timestamp, tag badge, sender group, pending

**Files:**
- Modify: `client/src/components/MessageList.jsx`

- [ ] **Step 1: Replace MessageList with version that uses tag, timestamp, pending**

```jsx
// client/src/components/MessageList.jsx
import React, { useEffect, useRef } from 'react'
import TagBadge from './TagBadge.jsx'
import { parseTag } from '../lib/parseTag.js'

const styleFor = (sender) => {
  if (sender === 'บอส' || sender === 'Boss') return 'bg-amber-500/90 text-slate-950'
  if (sender === 'Code') return 'bg-sky-600 text-white'
  if (sender === 'Codex') return 'bg-violet-600 text-white'
  return 'bg-slate-700 text-slate-100'
}

const sideFor = (sender) =>
  sender === 'บอส' || sender === 'Boss' ? 'justify-end' : 'justify-start'

const fmtTime = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

export default function MessageList({ messages }) {
  const endRef = useRef(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-5 space-y-3 sm:px-6">
      {messages.map((m) => {
        const parsed = m.tag ? { tag: m.tag, text: m.text } : parseTag(m.text || '')
        return (
          <div key={m.id} className={`flex ${sideFor(m.sender)}`}>
            <div className="max-w-[80%] sm:max-w-[70%]">
              <div className="text-[11px] text-slate-500 mb-1 px-1 flex items-center gap-2">
                <span>{m.sender}</span>
                <span>·</span>
                <span>{fmtTime(m.ts)}</span>
                {m.pending && <span className="text-amber-400">กำลังส่ง...</span>}
                {m.failed && <span className="text-rose-400">⚠️ ส่งไม่สำเร็จ</span>}
              </div>
              <div className={`rounded-2xl px-4 py-2 text-sm leading-relaxed shadow ${styleFor(m.sender)} ${m.pending ? 'opacity-60' : ''}`}>
                <TagBadge tag={parsed.tag} />
                <span>{parsed.text}</span>
              </div>
            </div>
          </div>
        )
      })}
      <div ref={endRef} />
    </div>
  )
}
```

- [ ] **Step 2: Manual smoke test**

```bash
cd client && npm run dev
# open http://localhost:5173
# verify: timestamp shows next to sender, tag badges render for [PROPOSE]/[DECIDE] messages
```

- [ ] **Step 3: Commit**

```bash
cd /Users/babycuca/Projects/o-agent-chat
git add client/src/components/MessageList.jsx
git commit -m "feat(ui): MessageList timestamp, tag badge, pending state"
```

---

### Task 13: Upgrade Composer — Enter to send, typing event, queue offline, retry

**Files:**
- Modify: `client/src/components/Composer.jsx`

- [ ] **Step 1: Replace Composer**

```jsx
// client/src/components/Composer.jsx
import React, { useEffect, useRef, useState } from 'react'

export default function Composer({ onSend, onTyping, online }) {
  const [text, setText] = useState('')
  const [sender, setSender] = useState('บอส')
  const typingTimer = useRef(null)
  const lastTyping = useRef(false)

  const flushTyping = (typing) => {
    if (lastTyping.current === typing) return
    lastTyping.current = typing
    onTyping?.(typing)
  }

  const handleChange = (e) => {
    setText(e.target.value)
    if (e.target.value.length > 0) {
      flushTyping(true)
      clearTimeout(typingTimer.current)
      typingTimer.current = setTimeout(() => flushTyping(false), 2000)
    } else {
      flushTyping(false)
    }
  }

  const submit = (e) => {
    e?.preventDefault()
    const t = text.trim()
    if (!t) return
    flushTyping(false)
    clearTimeout(typingTimer.current)
    onSend(sender, t)
    setText('')
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      submit(e)
    }
  }

  useEffect(() => () => clearTimeout(typingTimer.current), [])

  return (
    <form onSubmit={submit} className="border-t border-slate-800 bg-slate-900/60 p-3 sm:p-4">
      <div className="flex flex-wrap gap-2 mb-2">
        {['บอส', 'Code', 'Codex'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSender(s)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              sender === s ? 'bg-slate-200 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            ส่งในนาม {s}
          </button>
        ))}
        {!online && (
          <span className="ml-auto text-[11px] text-amber-400">offline — จะส่งเมื่อกลับมา</span>
        )}
      </div>
      <div className="flex gap-2">
        <textarea
          rows={1}
          value={text}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          placeholder={`พิมพ์ในนาม ${sender}... (Enter ส่ง, Shift+Enter ขึ้นบรรทัด)`}
          className="flex-1 resize-none rounded-md bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-emerald-600"
        />
        <button
          type="submit"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          disabled={!text.trim()}
        >
          ส่ง
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/Composer.jsx
git commit -m "feat(ui): Composer Enter-to-send, typing event, offline indicator"
```

---

### Task 14: Upgrade StatusPanel — presence dots, editable goal/scope/dod

**Files:**
- Modify: `client/src/components/StatusPanel.jsx`

- [ ] **Step 1: Replace**

```jsx
// client/src/components/StatusPanel.jsx
import React, { useState } from 'react'
import PresenceDot from './PresenceDot.jsx'

const Row = ({ label, value }) => (
  <div className="flex gap-3 text-sm">
    <span className="w-24 shrink-0 text-slate-400">{label}</span>
    <span className="text-slate-100">{value || '—'}</span>
  </div>
)

function EditableField({ label, value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')

  const start = () => {
    setDraft(value || '')
    setEditing(true)
  }
  const save = () => {
    setEditing(false)
    if (draft !== value) onSave(draft)
  }

  if (!editing) {
    return (
      <div className="flex gap-3 text-sm group">
        <span className="w-24 shrink-0 text-slate-400">{label}</span>
        <span className="text-slate-100 flex-1 break-words">{value || '—'}</span>
        <button
          onClick={start}
          className="text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 hover:text-slate-300"
        >
          แก้
        </button>
      </div>
    )
  }
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-24 shrink-0 text-slate-400">{label}</span>
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') setEditing(false)
        }}
        className="flex-1 rounded bg-slate-800 px-2 py-1 text-slate-100 outline-none focus:ring-1 focus:ring-emerald-600"
      />
    </div>
  )
}

export default function StatusPanel({ state, onSetLeader, onSetField }) {
  const presence = state.presence || { Boss: false, Code: false, Codex: false }

  return (
    <aside className="w-full sm:w-80 sm:shrink-0 border-r border-slate-800 bg-slate-900/60 p-5 flex flex-col gap-5">
      <div>
        <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-3">ผู้ร่วมห้อง</h2>
        <div className="space-y-1.5 text-sm">
          {['Boss', 'Code', 'Codex'].map((who) => (
            <div key={who} className="flex items-center gap-2">
              <PresenceDot online={presence[who]} />
              <span className="text-slate-100">{who === 'Boss' ? 'บอส' : who}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-3">รอบงานปัจจุบัน</h2>
        <div className="space-y-2">
          <Row label="หัวหน้า" value={state.leader} />
          <Row label="ผู้ปฏิบัติ" value={state.operator} />
          <EditableField label="เป้าหมาย" value={state.goal} onSave={(v) => onSetField('goal', v)} />
          <EditableField label="ขอบเขต" value={state.scope} onSave={(v) => onSetField('scope', v)} />
          <EditableField label="นิยามเสร็จ" value={state.dod} onSave={(v) => onSetField('dod', v)} />
        </div>
      </div>

      <div>
        <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-2">ตั้งหัวหน้า</h2>
        <div className="grid grid-cols-2 gap-2">
          {['Code', 'Codex'].map((name) => (
            <button
              key={name}
              onClick={() => onSetLeader(name)}
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                state.leader === name
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/StatusPanel.jsx
git commit -m "feat(ui): StatusPanel presence dots + editable goal/scope/dod"
```

---

## Phase 3 — Wire realtime (Code, depends on Phase 1)

### Task 15: Rewrite api.js — WS reconnect, optimistic, queue, presence ping

**Files:**
- Modify: `client/src/lib/api.js`

- [ ] **Step 1: Replace api.js with realtime version**

```js
// client/src/lib/api.js
const SENDER_TO_ROLE = { 'บอส': 'Boss', 'Boss': 'Boss', Code: 'Code', Codex: 'Codex' }
const ROLE_TO_SENDER = { Boss: 'บอส', Code: 'Code', Codex: 'Codex' }

let identity = 'Boss' // default; can be set via setIdentity()
export function setIdentity(role) { identity = role }

let stateCb = null
let currentState = null
let ws = null
let wsOpen = false
let backoff = 1000
const sendQueue = []
const reconnectListeners = new Set()

function normalizeMessage(m) {
  return {
    id: m.id,
    sender: ROLE_TO_SENDER[m.sender] ?? m.sender,
    text: m.text,
    tag: m.tag,
    ts: m.ts,
    pending: m.pending,
    failed: m.failed,
  }
}

function normalizeState(raw) {
  if (!raw) return raw
  return {
    leader: raw.leader,
    operator: raw.operator,
    goal: raw.goal,
    scope: raw.scope,
    dod: raw.dod,
    presence: raw.presence || { Boss: false, Code: false, Codex: false },
    messages: (raw.messages || []).map(normalizeMessage),
  }
}

function emit() {
  if (stateCb && currentState) stateCb(currentState)
}

async function fetchInitialState() {
  try {
    const r = await fetch('/api/state')
    const s = await r.json()
    currentState = normalizeState(s)
    emit()
  } catch (e) {
    console.error('[api] state fetch failed', e)
  }
}

function connectWs() {
  ws = new WebSocket(`ws://${location.host}/ws`)

  ws.onopen = () => {
    wsOpen = true
    backoff = 1000
    ws.send(JSON.stringify({ event: 'identify', payload: { who: identity } }))
    // flush queued sends
    while (sendQueue.length) {
      const item = sendQueue.shift()
      sendMessageNow(item.sender, item.text, item.localId).catch(() => {})
    }
    reconnectListeners.forEach((cb) => cb({ online: true }))
    fetchInitialState()
  }

  ws.onmessage = (e) => {
    let msg
    try { msg = JSON.parse(e.data) } catch { return }
    if (!msg) return
    handleEvent(msg.event, msg.payload)
  }

  ws.onclose = () => {
    wsOpen = false
    reconnectListeners.forEach((cb) => cb({ online: false }))
    setTimeout(connectWs, backoff)
    backoff = Math.min(backoff * 2, 30000)
  }

  ws.onerror = () => ws?.close()
}

function handleEvent(event, payload) {
  if (!currentState) return
  switch (event) {
    case 'state:full':
    case 'state:update':
      currentState = normalizeState(payload)
      emit()
      break
    case 'message:new': {
      const incoming = normalizeMessage(payload)
      // reconcile pending by matching text+sender (simple)
      const idx = currentState.messages.findIndex(
        (m) => m.pending && m.text === incoming.text && m.sender === incoming.sender
      )
      if (idx >= 0) currentState.messages.splice(idx, 1)
      currentState.messages.push(incoming)
      emit()
      break
    }
    case 'presence:update':
      currentState.presence = { ...currentState.presence, [payload.who]: payload.online }
      emit()
      break
    case 'typing:update':
      currentState = { ...currentState, typing: { ...(currentState.typing || {}), [payload.who]: payload.typing } }
      emit()
      break
  }
}

export function subscribe(cb) {
  stateCb = cb
  fetchInitialState()
  connectWs()
  return () => {
    stateCb = null
    ws?.close()
  }
}

export function onConnectivity(cb) {
  reconnectListeners.add(cb)
  cb({ online: wsOpen })
  return () => reconnectListeners.delete(cb)
}

async function sendMessageNow(sender, text, localId) {
  const role = SENDER_TO_ROLE[sender] || 'Boss'
  try {
    const r = await fetch('/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: role, text }),
    })
    if (!r.ok) throw new Error('send_failed')
    return r.json()
  } catch (e) {
    if (currentState && localId) {
      const m = currentState.messages.find((x) => x.id === localId)
      if (m) {
        m.pending = false
        m.failed = true
      }
      emit()
    }
    throw e
  }
}

export function sendMessage(sender, text) {
  if (!currentState) return
  const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  currentState.messages.push({
    id: localId,
    sender,
    text,
    ts: Date.now(),
    pending: true,
  })
  emit()

  if (!wsOpen) {
    sendQueue.push({ sender, text, localId })
    return
  }
  sendMessageNow(sender, text, localId).catch(() => {})
}

export async function setLeader(leader) {
  return fetch('/api/leader', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leader: String(leader).toLowerCase() }),
  }).then((r) => r.json())
}

export async function setField(key, value) {
  return fetch('/api/field', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  }).then((r) => r.json())
}

export function sendTyping(typing) {
  if (wsOpen) ws.send(JSON.stringify({ event: 'typing', payload: { typing } }))
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/lib/api.js
git commit -m "feat(ui): realtime api with reconnect, optimistic, queue, presence"
```

---

### Task 16: Wire App.jsx — drawer, banner, typing, field updates

**Files:**
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Replace App.jsx**

```jsx
// client/src/App.jsx
import React, { useEffect, useState } from 'react'
import StatusPanel from './components/StatusPanel.jsx'
import MessageList from './components/MessageList.jsx'
import Composer from './components/Composer.jsx'
import MobileDrawer from './components/MobileDrawer.jsx'
import {
  subscribe, sendMessage, setLeader, setField, sendTyping, onConnectivity,
} from './lib/api.js'
import { useIsMobile } from './lib/useResponsive.js'

export default function App() {
  const [state, setState] = useState({
    leader: '—', operator: '—', goal: '', scope: '', dod: '', messages: [],
    presence: { Boss: false, Code: false, Codex: false },
  })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [online, setOnline] = useState(true)
  const isMobile = useIsMobile()

  useEffect(() => subscribe(setState), [])
  useEffect(() => onConnectivity(({ online }) => setOnline(online)), [])

  const panel = (
    <StatusPanel state={state} onSetLeader={setLeader} onSetField={setField} />
  )

  return (
    <div className="flex h-full text-slate-100">
      {!isMobile && panel}

      {isMobile && (
        <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
          {panel}
        </MobileDrawer>
      )}

      <main className="flex flex-1 flex-col bg-slate-950">
        <header className="border-b border-slate-800 px-4 sm:px-6 py-3 flex items-center gap-3">
          {isMobile && (
            <button
              onClick={() => setDrawerOpen(true)}
              className="rounded-md bg-slate-800 px-2 py-1 text-sm text-slate-200"
              aria-label="เปิดเมนู"
            >
              ☰
            </button>
          )}
          <div className="flex-1">
            <h1 className="text-lg font-semibold">O Agent Chat</h1>
            <p className="text-xs text-slate-500">ห้องแชต 3 ฝ่าย — บอส · Code · Codex</p>
          </div>
          {!online && (
            <span className="text-[11px] text-amber-400 bg-amber-950/40 px-2 py-1 rounded">
              เชื่อมต่อใหม่...
            </span>
          )}
        </header>
        <MessageList messages={state.messages} />
        <Composer onSend={sendMessage} onTyping={sendTyping} online={online} />
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/App.jsx
git commit -m "feat(ui): App with drawer, connectivity banner, field updates"
```

---

### Task 17: Manual integration smoke (3 tabs)

**Files:** none (manual)

- [ ] **Step 1: Boot both servers**

Terminal A:
```bash
cd /Users/babycuca/Projects/o-agent-chat/server && npm run dev
```

Terminal B:
```bash
cd /Users/babycuca/Projects/o-agent-chat/client && npm run dev
```

- [ ] **Step 2: Three browser tabs**

1. Open `http://localhost:5173` in 3 tabs.
2. Tab 1: send a message in นาม `บอส`
3. Tab 2: confirm message appears within 1s, then reply in นาม `Code`
4. Tab 3: confirm both messages, reply in นาม `Codex`
5. Verify presence dots reflect open tabs (3 online when all 3 tabs open).
6. Verify `[PROPOSE] hello` in tab 1 → tab 2/3 show violet PROPOSE badge.
7. Type in composer (don't send) → other tabs should not crash (typing UI optional in v1).

Expected: latency under 200ms, no console errors, optimistic message replaces with server message correctly.

- [ ] **Step 3: Reconnect test**

1. Kill server (Ctrl+C in Terminal A).
2. Confirm banner `เชื่อมต่อใหม่...` appears in all tabs.
3. Type a message in Tab 1 → goes to queue, shows pending.
4. Restart server (`npm run dev` again).
5. Confirm queue flushes, banner disappears, message appears in all tabs.

- [ ] **Step 4: If issues found**, fix in code, commit small fixes with `fix(ui): <what>`.

---

### Task 18: Mobile QA + close-out

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Mobile QA**

In Chrome DevTools:
1. Toggle device toolbar.
2. Test 375×667 (iPhone SE) and 414×896 (iPhone 11).
3. Verify: hamburger button visible, drawer slides in, composer visible, no horizontal scroll.
4. Send a message from drawer-closed view → confirm scroll-to-bottom works.

- [ ] **Step 2: Update README with run instructions**

Replace `README.md`:

```markdown
# O Agent Chat

Local web app — ห้องแชต 3 ฝ่าย: บอส, Code, Codex (realtime via WebSocket).

## Layout
- `client/` — UI (Code-owned) — Vite + React + Tailwind
- `server/` — backend (Codex-owned) — Node.js + Express + ws

## รัน

Terminal A — server:
```bash
cd server && npm install && npm run dev
# listens on http://localhost:8787
```

Terminal B — client:
```bash
cd client && npm install && npm run dev
# open http://localhost:5173
```

Vite proxies `/api` and `/ws` to `localhost:8787`.

## Test
- Server: `cd server && npm test`
- UI: `cd client && npm test`

## Contract
See `CONTRACT.md` for the frozen REST + WS contract.

## Spec
See `docs/superpowers/specs/2026-04-26-3way-chat-realtime-design.md`.
```

- [ ] **Step 3: Final commit**

```bash
git add README.md
git commit -m "docs: update README with run + test instructions"
```

- [ ] **Step 4: Report close-out in chat**

Code reports to room:
> ปิดงาน 3-way chat realtime แล้ว — server (Codex) + UI (Code) ครบ มือถือใช้งานได้ smoke test 3 tab + reconnect ผ่าน

---

## Verification Checklist (success criteria from spec)

- [ ] Boss web → Code/Codex see message within 200ms
- [ ] Code/Codex reply → Boss sees presence + message
- [ ] Server restart → state reset accepted, clients reconnect
- [ ] Mobile (375 + 414) usable — drawer, composer, scroll
- [ ] Tag badges render `[PROPOSE]`/`[DECIDE]`/etc
- [ ] Server tests pass (`cd server && npm test`)
- [ ] UI tests pass (`cd client && npm test`)

---

## Out of Scope (deferred)

- Authentication / multi-room
- Persistent message history (in-memory only)
- File/image upload
- Push notifications
- Voice/video
