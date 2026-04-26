// Realtime API client. Talks to Codex's room server via REST + WS at /api + /ws.
// WS envelope from server: { event, state, payload? }
//   event: 'state' | 'message' | 'leader' | 'presence' | 'typing' | 'room'
//   state: full snapshot (every event except 'typing' carries full state)

import { parseTag } from './parseTag.js'

const SENDER_TO_ROLE = { 'บอส': 'Boss', Boss: 'Boss', Code: 'Code', Codex: 'Codex' }

let identity = 'Boss'

export function setIdentity(role) {
  const next = SENDER_TO_ROLE[role] || role
  if (!['Boss', 'Code', 'Codex'].includes(next) || identity === next) return
  identity = next
  if (wsOpen && ws) {
    ws.send(JSON.stringify({ event: 'identify', payload: { who: identity } }))
  }
}

let stateCb = null
let serverSnapshot = null
let typingState = {}
let ws = null
let wsOpen = false
let backoff = 1000
const sendQueue = []
const pending = new Map() // localId -> { role, text, sender, ts }
const reconnectListeners = new Set()

function buildState() {
  if (!serverSnapshot) return null
  // Merge server messages with any still-pending optimistic messages
  const pendingMessages = [...pending.entries()].map(([localId, p]) => ({
    id: localId,
    role: p.role,
    sender: p.sender,
    text: p.text,
    tag: p.tag,
    ts: p.ts,
    pending: !p.failed,
    failed: !!p.failed,
  }))
  return {
    leader: serverSnapshot.leader,
    operator: serverSnapshot.operator ?? serverSnapshot.executor,
    goal: serverSnapshot.goal,
    scope: serverSnapshot.scope,
    dod: serverSnapshot.dod ?? serverSnapshot.doneDefinition,
    presence: serverSnapshot.presence || { Boss: false, Code: false, Codex: false },
    messages: [...(serverSnapshot.messages || []), ...pendingMessages],
    typing: { ...typingState },
  }
}

function emit() {
  if (stateCb) stateCb(buildState())
}

function reconcilePending(serverMessages) {
  for (const [localId, p] of [...pending.entries()]) {
    const matched = serverMessages.find((m) =>
      m.text === p.text && m.role === p.role && Math.abs((m.ts || 0) - p.ts) < 60000
    )
    if (matched) pending.delete(localId)
  }
}

function applyServerState(snapshot) {
  if (!snapshot) return
  serverSnapshot = snapshot
  reconcilePending(snapshot.messages || [])
  emit()
}

async function fetchInitialState() {
  try {
    const r = await fetch('/api/state')
    const s = await r.json()
    applyServerState(s)
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
    handleEvent(msg)
  }

  ws.onclose = () => {
    wsOpen = false
    reconnectListeners.forEach((cb) => cb({ online: false }))
    setTimeout(connectWs, backoff)
    backoff = Math.min(backoff * 2, 30000)
  }

  ws.onerror = () => ws?.close()
}

function handleEvent(msg) {
  const event = msg.event
  switch (event) {
    case 'state':
    case 'message':
    case 'leader':
    case 'presence':
    case 'room':
      // All these carry full state in envelope.state
      applyServerState(msg.state || msg.payload)
      break
    case 'typing': {
      const p = msg.payload || {}
      if (p.who && typeof p.typing === 'boolean') {
        typingState = { ...typingState, [p.who]: p.typing }
      }
      // server includes state too — refresh
      if (msg.state) applyServerState(msg.state)
      else emit()
      break
    }
    default:
      break
  }
}

export function subscribe(cb) {
  stateCb = cb
  emit() // emit empty state immediately
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

async function sendMessageNow(sender, rawText, localId) {
  const role = SENDER_TO_ROLE[sender] || 'Boss'
  try {
    const r = await fetch('/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, text: rawText }),
    })
    if (!r.ok) throw new Error('send_failed')
    const body = await r.json()
    if (body.state) applyServerState(body.state)
    return body
  } catch (e) {
    const p = pending.get(localId)
    if (p) {
      pending.set(localId, { ...p, failed: true })
      emit()
    }
    throw e
  }
}

export function sendMessage(sender, rawText) {
  const role = SENDER_TO_ROLE[sender] || 'Boss'
  const { tag, text: cleanText } = parseTag(rawText)
  const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  // Store cleaned text + tag so reconcile matches server-stored shape
  pending.set(localId, { role, sender, text: cleanText, tag, ts: Date.now() })
  emit()

  if (!wsOpen) {
    sendQueue.push({ sender, text: rawText, localId })
    return
  }
  sendMessageNow(sender, rawText, localId).catch(() => {})
}

export async function setLeader(leader) {
  const r = await fetch('/api/leader', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leader: String(leader).toLowerCase() }),
  })
  const body = await r.json()
  if (body.state) applyServerState(body.state)
  return body
}

export async function setField(key, value) {
  const r = await fetch('/api/field', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  })
  const body = await r.json()
  if (body.state) applyServerState(body.state)
  return body
}

export function sendTyping(typing) {
  if (wsOpen && ws) {
    ws.send(JSON.stringify({ event: 'typing', payload: { typing } }))
  }
}
