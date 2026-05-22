import { createAdapterRegistry } from './omni/adapters.js'
import { getOmniSchemaSummary } from './omni/db/schema.js'
import { listFacebookConversations } from './omni/metaInboxClient.js'
import { createOmniService } from './omni/service.js'

function normalizeLeader(input) {
  if (!input) return null
  const lower = String(input).toLowerCase()
  if (lower === 'code') return 'Code'
  if (lower === 'codex') return 'Codex'
  return null
}

export function mountRoutes(app, hub, room, options = {}) {
  const omni = options.omni || createOmniService()
  const adapters = createAdapterRegistry()

  app.get('/api/health', (_req, res) => res.json({ ok: true }))

  app.get('/api/omni/pages', (_req, res) => {
    res.json({ ok: true, pages: omni.listPages() })
  })

  app.get('/api/omni/snapshot', (_req, res) => {
    res.json({ ok: true, snapshot: omni.snapshot() })
  })

  app.get('/api/omni/schema', (_req, res) => {
    res.json({ ok: true, schema: getOmniSchemaSummary() })
  })

  app.get('/api/omni/threads', (req, res) => {
    res.json({ ok: true, threads: omni.listThreads({ pageId: req.query.pageId, status: req.query.status }) })
  })

  app.get('/api/omni/threads/:threadId', (req, res) => {
    const thread = omni.getThread(req.params.threadId)
    if (!thread) return res.status(404).json({ ok: false, error: 'thread_not_found' })
    res.json({ ok: true, thread })
  })

  app.post('/api/omni/threads/:threadId/evaluate-auto-send', (req, res) => {
    res.json({ ok: true, decision: omni.evaluateAutoSend({ threadId: req.params.threadId }) })
  })

  app.get('/api/omni/connectors/health', async (_req, res) => {
    const providers = adapters.list()
    const health = await Promise.all(providers.map((provider) => adapters.get(provider).healthcheck()))
    res.json({ ok: true, health })
  })

  app.get('/api/omni/facebook/conversations', async (req, res) => {
    try {
      const pageProfile = String(req.query.page || 'anna_lynn')
      const data = await listFacebookConversations({ pageProfile })
      res.json({ ok: true, data })
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || 'facebook_conversations_failed' })
    }
  })

  app.post('/api/omni/facebook/sync', async (req, res) => {
    try {
      const pageProfile = String(req.body?.page || req.query.page || 'anna_lynn')
      const data = await listFacebookConversations({ pageProfile })
      const result = omni.syncFacebookConversations(data)
      res.json({ ok: true, result })
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || 'facebook_sync_failed' })
    }
  })

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
