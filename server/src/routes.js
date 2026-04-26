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
    const { sender, role, text } = req.body || {}
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ ok: false, error: 'empty_text' })
    }
    const VALID = ['Boss', 'Code', 'Codex', 'ChatGPT', 'Cowork']
    const inputRole = VALID.includes(role) ? role : sender
    const safeRole = VALID.includes(inputRole) ? inputRole : 'Boss'
    const msg = room.addMessage({ role: safeRole, text: text.trim() })
    const state = room.snapshot()
    hub.broadcast('message', state)
    res.json({ ok: true, message: msg, state })
  })

  app.post('/api/leader', (req, res) => {
    const leader = normalizeLeader(req.body?.leader)
    if (!leader) return res.status(400).json({ ok: false, error: 'invalid_leader' })
    room.setLeader(leader)
    const state = room.snapshot()
    hub.broadcast('leader', state)
    res.json({ ok: true, state })
  })

  app.post('/api/field', (req, res) => {
    const { key, value } = req.body || {}
    if (!['goal', 'scope', 'dod', 'doneDefinition'].includes(key)) {
      return res.status(400).json({ ok: false, error: 'invalid_key' })
    }
    room.setField(key, String(value || ''))
    const state = room.snapshot()
    hub.broadcast('room', state)
    res.json({ ok: true, state })
  })
}
