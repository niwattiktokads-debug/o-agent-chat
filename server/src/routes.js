import { createAdapterRegistry } from './omni/adapters.js'
import { createAiReplyEngine } from './omni/aiReplyEngine.js'
import { getOmniSchemaSummary } from './omni/db/schema.js'
import { listFacebookConversations } from './omni/metaInboxClient.js'
import { createOmniService } from './omni/service.js'
import { listTikTokOrders } from './omni/tiktokOrderClient.js'
import { createConnectionRuntime } from './omni/connections.js'

function normalizeLeader(input) {
  if (!input) return null
  const lower = String(input).toLowerCase()
  if (lower === 'code') return 'Code'
  if (lower === 'codex') return 'Codex'
  return null
}

function normalizePageSize(value) {
  const parsed = Number(value || 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) return 10
  return parsed
}

export function mountRoutes(app, hub, room, options = {}) {
  const omni = options.omni || createOmniService()
  const adapters = createAdapterRegistry()
  const ai = options.ai || createAiReplyEngine()
  const connections = options.connections || createConnectionRuntime()

  app.get('/api/health', (_req, res) => res.json({ ok: true }))

  app.get('/api/omni/pages', (_req, res) => {
    res.json({ ok: true, pages: omni.listPages() })
  })

  app.post('/api/omni/pages/:pageId/auto-reply', (req, res) => {
    const result = omni.setPageAutoReply({
      pageId: req.params.pageId,
      enabled: req.body?.enabled,
      updatedBy: req.body?.updatedBy || 'boss',
    })
    if (!result.ok) return res.status(result.error === 'page_not_found' ? 404 : 400).json(result)
    hub.broadcast('omni', result.snapshot)
    res.json(result)
  })

  app.get('/api/omni/snapshot', (_req, res) => {
    res.json({ ok: true, snapshot: omni.snapshot() })
  })

  app.get('/api/omni/schema', (_req, res) => {
    res.json({ ok: true, schema: getOmniSchemaSummary() })
  })

  app.get('/api/omni/retention', (_req, res) => {
    res.json({
      ok: true,
      policies: omni.listRetentionPolicies(),
      runs: omni.listRetentionRuns(),
    })
  })

  app.post('/api/omni/retention/policies', (req, res) => {
    const result = omni.upsertRetentionPolicy(req.body || {})
    if (!result.ok) return res.status(400).json(result)
    res.json(result)
  })

  app.post('/api/omni/retention/chat-messages/run', (req, res) => {
    const result = omni.runChatRetention(req.body || {})
    if (!result.ok) return res.status(400).json(result)
    if (!result.dryRun && !result.skipped) hub.broadcast('omni', result.snapshot)
    const { snapshot: _snapshot, ...safeResult } = result
    res.json(safeResult)
  })

  app.get('/api/omni/knowledge-sources', (req, res) => {
    res.json({
      ok: true,
      sources: omni.listKnowledgeSources({
        query: req.query.q,
        status: req.query.status,
        type: req.query.type,
      }),
    })
  })

  app.post('/api/omni/knowledge-sources', (req, res) => {
    const result = omni.upsertKnowledgeSource(req.body || {})
    if (!result.ok) return res.status(400).json(result)
    res.json(result)
  })

  app.delete('/api/omni/knowledge-sources/:sourceId', (req, res) => {
    const result = omni.deleteKnowledgeSource(req.params.sourceId)
    if (!result.ok) return res.status(404).json(result)
    res.json(result)
  })

  app.get('/api/omni/payments/providers/:provider/health', (req, res) => {
    const result = omni.getPaymentProviderHealth(req.params.provider)
    if (!result.ok) return res.status(404).json(result)
    res.json(result)
  })

  app.post('/api/omni/payment-requests', (req, res) => {
    const result = omni.createPaymentRequest(req.body || {})
    if (!result.ok) {
      const status = result.error === 'approval_required' ? 403 : 400
      return res.status(status).json(result)
    }
    hub.broadcast('omni', result.snapshot)
    res.json(result)
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

  app.post('/api/omni/threads/:threadId/ai-draft', async (req, res) => {
    const thread = omni.getThread(req.params.threadId)
    if (!thread) return res.status(404).json({ ok: false, error: 'thread_not_found' })
    const snapshot = omni.snapshot()
    const policy = omni.getPolicyForThread(thread)
    const decision = await ai.draft({ thread, snapshot, policy })
    if (!decision.ok) return res.status(400).json(decision)
    const recorded = omni.recordAiDecision({
      threadId: thread.id,
      agentProfileId: policy?.agentProfileId,
      provider: decision.provider,
      model: decision.model,
      intent: decision.intent,
      risk: decision.risk,
      confidence: decision.confidence,
      action: decision.action,
      sourceIds: decision.sourceIds,
      reason: decision.reason,
    })
    res.json({ ok: true, decision, recorded: recorded.decision, snapshot: recorded.snapshot })
  })

  app.post('/api/omni/threads/:threadId/manual-draft', (req, res) => {
    const result = omni.recordManualReplyDraft({
      threadId: req.params.threadId,
      authorName: req.body?.authorName || 'บอส',
      text: req.body?.text || '',
      attachments: req.body?.attachments || [],
    })
    if (!result.ok) return res.status(400).json(result)
    hub.broadcast('omni', result.snapshot)
    res.json(result)
  })

  app.get('/api/omni/connectors/health', async (_req, res) => {
    const providers = adapters.list()
    const health = await Promise.all(providers.map((provider) => adapters.get(provider).healthcheck()))
    res.json({ ok: true, health })
  })

  app.get('/api/omni/connections', async (_req, res) => {
    try {
      res.json(await connections.list())
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message || 'connections_list_failed' })
    }
  })

  app.post('/api/omni/connections/:connectionId/verify', async (req, res) => {
    try {
      const result = await connections.verify(req.params.connectionId)
      res.status(result.ok ? 200 : 400).json(result)
    } catch (error) {
      const status = error.message === 'connection_not_found' ? 404 : 400
      res.status(status).json({ ok: false, error: error.message || 'connection_verify_failed' })
    }
  })

  app.post('/api/omni/connections/:connectionId/secrets', async (req, res) => {
    try {
      const result = await connections.saveSecrets(req.params.connectionId, req.body?.fields || {})
      res.json(result)
    } catch (error) {
      const status = error.message === 'connection_not_found' ? 404 : 400
      res.status(status).json({ ok: false, error: error.message || 'connection_secret_save_failed' })
    }
  })

  app.get('/api/omni/connections/:connectionId/conversations', async (req, res) => {
    try {
      const result = await connections.listConversations(req.params.connectionId, { limit: req.query.limit })
      res.json(result)
    } catch (error) {
      const status = ['connection_not_found', 'meta_connection_required'].includes(error.message) ? 404 : 400
      res.status(status).json({ ok: false, error: error.message || 'connection_conversations_failed' })
    }
  })

  app.get('/api/omni/connections/:connectionId/conversations/:conversationId/messages', async (req, res) => {
    try {
      const result = await connections.readThread(req.params.connectionId, req.params.conversationId, { limit: req.query.limit })
      res.json(result)
    } catch (error) {
      const status = ['connection_not_found', 'meta_connection_required'].includes(error.message) ? 404 : 400
      res.status(status).json({ ok: false, error: error.message || 'connection_thread_failed' })
    }
  })

  app.post('/api/omni/connections/:connectionId/conversations/:conversationId/ai-draft', async (req, res) => {
    try {
      const thread = await connections.readThread(req.params.connectionId, req.params.conversationId, { limit: 20 })
      const messages = thread.messages.map((message) => ({
        id: message.id,
        threadId: `meta_${req.params.conversationId}`,
        direction: message.direction,
        authorName: message.authorName,
        text: message.text,
        createdAt: message.createdTime,
      }))
      const draftEngine = createAiReplyEngine({
        provider: req.body?.provider || process.env.OMNI_CONNECTION_DRAFT_PROVIDER || 'gemini_cli',
        model: req.body?.model || process.env.OMNI_CONNECTION_DRAFT_MODEL || 'gemini-3-flash-preview',
      })
      const decision = await draftEngine.draft({
        thread: { id: `meta_${req.params.conversationId}`, platform: 'facebook', status: 'open' },
        snapshot: { messages, knowledgeSources: omni.listKnowledgeSources?.() || [] },
        policy: { autoSend: {} },
      })
      res.json({ ok: true, connectionId: req.params.connectionId, conversationId: req.params.conversationId, decision, sent: false })
    } catch (error) {
      const status = ['connection_not_found', 'meta_connection_required'].includes(error.message) ? 404 : 400
      res.status(status).json({ ok: false, error: error.message || 'connection_ai_draft_failed' })
    }
  })

  app.post('/api/omni/connections/:connectionId/conversations/:conversationId/send', async (req, res) => {
    try {
      const result = await connections.sendReply(req.params.connectionId, req.params.conversationId, {
        message: req.body?.message,
        approved: req.body?.approved,
      })
      res.json({ ...result, sent: true })
    } catch (error) {
      const status = ['connection_not_found', 'meta_connection_required'].includes(error.message) ? 404
        : error.message === 'approval_required' ? 403
          : 400
      res.status(status).json({ ok: false, sent: false, error: error.message || 'connection_send_failed' })
    }
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

  app.get('/api/omni/tiktok/orders', async (req, res) => {
    try {
      const status = String(req.query.status || 'AWAITING_COLLECTION')
      const pageSize = normalizePageSize(req.query.pageSize)
      const data = await listTikTokOrders({ status, pageSize })
      res.json({ ok: true, data })
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || 'tiktok_orders_failed' })
    }
  })

  app.post('/api/omni/tiktok/sync', async (req, res) => {
    try {
      const status = String(req.body?.status || req.query.status || 'AWAITING_COLLECTION')
      const pageSize = normalizePageSize(req.body?.pageSize || req.query.pageSize)
      const data = await listTikTokOrders({ status, pageSize })
      const result = omni.syncTikTokOrders(data)
      res.json({ ok: true, result })
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || 'tiktok_sync_failed' })
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
