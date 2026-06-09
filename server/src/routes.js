import { createAdapterRegistry } from './omni/adapters.js'
import { createAiReplyEngine } from './omni/aiReplyEngine.js'
import { getOmniSchemaSummary } from './omni/db/schema.js'
import { listFacebookConversations } from './omni/metaInboxClient.js'
import { createOmniService } from './omni/service.js'
import { listTikTokOrders } from './omni/tiktokOrderClient.js'
import { createConnectionRuntime } from './omni/connections.js'
import { parseCfComment } from './omni/cfParser.js'
import { createMetaSocialRuntime } from './omni/metaSocialRuntime.js'
import { lookupThaiAddressByPostcode } from './omni/thaiAddress.js'
import { createZortCommerceRuntime } from './omni/zortCommerceRuntime.js'
import { createLineSudaOagentNotifier } from './omni/lineSudaOagentNotifier.js'
import { appendPageRegistryEntry } from './omni/pageRegistry.js'

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

function normalizeAddressLimit(value) {
  const parsed = Number(value || 200)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) return 200
  return parsed
}

export function mountRoutes(app, hub, room, options = {}) {
  const omni = options.omni || createOmniService()
  const adapters = createAdapterRegistry()
  const ai = options.ai || createAiReplyEngine()
  const connections = options.connections || createConnectionRuntime()
  const social = options.social || createMetaSocialRuntime()
  const commerce = options.commerce || createZortCommerceRuntime()
  const sudaOagentNotifier = options.sudaOagentNotifier || createLineSudaOagentNotifier()

  function reportToCsv(report) {
    const rows = ['hour,inbound,outbound,total']
    for (const row of report.byHour || []) rows.push([row.hour, row.inbound, row.outbound, row.total].join(','))
    return `${rows.join('\n')}\n`
  }

  function cfReviewItem(reason, item, extra = {}) {
    return {
      reason,
      commentId: item.commentId || null,
      rawText: item.rawText || item.text || '',
      sku: item.sku || '',
      keyword: item.keyword || '',
      quantity: item.quantity || 1,
      customer: item.customer || null,
      ...extra,
    }
  }

  function canDraftFromZortProduct(product) {
    return Boolean(product?.id && product?.sku && Number(product.sellPrice ?? product.unitPrice ?? 0) > 0)
  }

  function isConnectionGovernanceType(input) {
    const value = String(input || '').trim().toLowerCase()
    return ['connection', 'connections'].includes(value)
  }

  app.get('/api/health', (_req, res) => res.json({ ok: true }))

  app.get('/api/omni/pages', (_req, res) => {
    res.json({ ok: true, pages: omni.listPages() })
  })

  app.post('/api/omni/pages/registry', (req, res) => {
    try {
      const result = appendPageRegistryEntry(req.body || {}, { registryPath: options.pageRegistryPath })
      res.json(result)
    } catch (error) {
      const status = ['profile_key_exists', 'page_id_exists'].includes(error.message) ? 409 : 400
      res.status(status).json({ ok: false, error: error.message || 'page_registry_append_failed' })
    }
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

  app.get('/api/omni/governance/matrix', (_req, res) => {
    res.json({ ok: true, matrix: omni.getDeleteGovernanceMatrix() })
  })

  app.post('/api/omni/governance/test-data', (req, res) => {
    const result = omni.clearTestData({
      actorType: 'human',
      actorId: req.body?.actorId || 'boss',
      reason: req.body?.reason || 'ui:test_data_clear',
    })
    if (!result.ok) return res.status(400).json(result)
    hub.broadcast('omni', result.snapshot)
    res.json(result)
  })

  app.post('/api/omni/governance/:objectType/:objectId', async (req, res) => {
    const objectType = req.params.objectType
    const objectId = req.params.objectId
    const action = req.body?.action
    const actorId = req.body?.actorId || 'boss'
    const reason = req.body?.reason || `ui:${objectType}:${action}`

    if (isConnectionGovernanceType(objectType)) {
      try {
        const result = await connections.govern(objectId, { action, actorId, reason })
        const audit = omni.recordActionAudit({
          action: `connection_${action}`,
          actorType: 'human',
          actorId,
          before: result.before,
          after: result.connection,
          sourceRef: `omni_connection:${objectId}`,
        })
        return res.json({ ...result, audit: audit.audit })
      } catch (error) {
        const status = ['connection_not_found', 'system_connection_locked'].includes(error.message) ? 404 : 400
        return res.status(status).json({ ok: false, error: error.message || 'connection_governance_failed' })
      }
    }

    const result = omni.applyGovernanceAction({
      objectType,
      objectId,
      action,
      actorType: 'human',
      actorId,
      reason,
    })
    if (!result.ok) {
      const status = String(result.error || '').endsWith('_not_found') ? 404 : 400
      return res.status(status).json(result)
    }
    hub.broadcast('omni', result.snapshot)
    res.json(result)
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
    hub.broadcast('omni', result.snapshot)
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
    const settings = omni.getSettings()
    if (settings.ai?.enabled === false) return res.status(409).json({ ok: false, error: 'ai_disabled' })
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

  app.post('/api/omni/threads/:threadId/order-address-intake', async (req, res) => {
    try {
      const result = await omni.createOrderAddressIntake({
        threadId: req.params.threadId,
        text: req.body?.text || '',
        createConfirmationDraft: req.body?.createConfirmationDraft,
        authorName: req.body?.authorName || 'AI',
      })
      if (!result.ok) {
        const status = result.error === 'thread_not_found' ? 404
          : result.error === 'order_address_intake_disabled' ? 409
            : 400
        return res.status(status).json(result)
      }
      if (result.snapshot) hub.broadcast('omni', result.snapshot)
      res.json(result)
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || 'order_address_intake_failed' })
    }
  })

  app.get('/api/omni/connectors/health', async (_req, res) => {
    const providers = adapters.list()
    const health = await Promise.all(providers.map((provider) => adapters.get(provider).healthcheck()))
    res.json({ ok: true, health })
  })

  app.get('/api/omni/notifications/suda-oagent/health', async (_req, res) => {
    const result = await sudaOagentNotifier.verify()
    res.status(sudaOagentNotifier.responseStatus(result)).json(result)
  })

  app.get('/api/omni/notifications/suda-oagent/chat-url', async (_req, res) => {
    const result = await sudaOagentNotifier.chatUrl()
    res.status(sudaOagentNotifier.responseStatus(result)).json(result)
  })

  app.post('/api/omni/notifications/suda-oagent/group-id', async (req, res) => {
    const result = await sudaOagentNotifier.setGroupId(req.body?.groupId)
    res.status(sudaOagentNotifier.responseStatus(result)).json(result)
  })

  app.post('/api/omni/notifications/suda-oagent/task-summary', async (req, res) => {
    const result = await sudaOagentNotifier.sendTaskSummary({ dryRun: req.body?.dryRun === true })
    res.status(sudaOagentNotifier.responseStatus(result)).json(result)
  })

  app.get('/api/omni/notifications/suda-oagent/group-rules', async (_req, res) => {
    const result = await sudaOagentNotifier.listGroupRules()
    res.status(sudaOagentNotifier.responseStatus(result)).json(result)
  })

  app.post('/api/omni/notifications/suda-oagent/group-rules/:groupId', async (req, res) => {
    const result = await sudaOagentNotifier.saveGroupRules(req.params.groupId, req.body?.responseRules || {})
    res.status(sudaOagentNotifier.responseStatus(result)).json(result)
  })

  app.get('/api/omni/settings', (_req, res) => {
    res.json({ ok: true, settings: omni.getSettings() })
  })

  app.post('/api/omni/settings', (req, res) => {
    const result = omni.updateSettings({ settings: req.body?.settings || {}, updatedBy: req.body?.updatedBy || 'boss' })
    hub.broadcast('omni', result.snapshot)
    res.json(result)
  })

  app.get('/api/omni/reports/message-volume', (req, res) => {
    const report = omni.messageVolumeReport({ from: req.query.from, to: req.query.to, pageId: req.query.pageId })
    if (req.query.format === 'csv') {
      res.setHeader('content-type', 'text/csv; charset=utf-8')
      res.setHeader('content-disposition', 'attachment; filename="omni-message-volume.csv"')
      return res.send(reportToCsv(report))
    }
    res.json({ ok: true, report })
  })

  app.get('/api/omni/social/posts', async (req, res) => {
    try {
      const result = await social.listPagePosts({
        pageProfile: String(req.query.pageProfile || req.query.page || 'man_kynd'),
        limit: normalizePageSize(req.query.limit),
      })
      res.json(result)
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || 'social_posts_failed' })
    }
  })

  app.get('/api/omni/social/posts/:postId/comments', async (req, res) => {
    try {
      const result = await social.listPostComments({
        objectId: req.params.postId,
        pageProfile: String(req.query.pageProfile || req.query.page || 'man_kynd'),
        limit: normalizePageSize(req.query.limit),
      })
      res.json(result)
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || 'social_comments_failed' })
    }
  })

  app.post('/api/omni/social/posts/:postId/capture', async (req, res) => {
    try {
      const settings = omni.getSettings()
      if (settings.postCf?.enabled === false) return res.status(409).json({ ok: false, error: 'post_cf_disabled' })
      const pageProfile = String(req.body?.pageProfile || req.query.pageProfile || req.query.page || 'man_kynd')
      const comments = await social.listPostComments({
        objectId: req.params.postId,
        pageProfile,
        limit: normalizePageSize(req.body?.limit || req.query.limit || 50),
      })
      const parseResults = (comments.comments || []).map((comment) => parseCfComment(comment, { keywords: settings.postCf?.keywords }))
      const parsed = parseResults.filter((result) => result.ok)
      const reviewItems = parseResults
        .filter((result) => !result.ok && !['empty_comment', 'not_cf_comment'].includes(result.reason))
        .map((result) => cfReviewItem(result.reason, result))
      const drafts = []
      for (const item of parsed) {
        const products = await commerce.searchProducts({ keyword: item.keyword, sku: item.sku, limit: 5 })
        const product = products.products?.[0] || null
        if (!canDraftFromZortProduct(product)) {
          reviewItems.push(cfReviewItem(product ? 'zort_product_price_missing' : 'zort_product_not_found', item, { products: products.products || [] }))
          continue
        }
        if (settings.postCf?.autoCreateDrafts === false) {
          reviewItems.push(cfReviewItem('auto_create_disabled', item, { zortProduct: product }))
          continue
        }
        const draft = omni.createOrderDraft({
          platform: 'facebook',
          customer: item.customer,
          customerId: item.customer.id,
          customerName: item.customer.displayName,
          sourceRef: `meta_post_cf:${req.params.postId}:${item.commentId}`,
          sourcePostId: req.params.postId,
          sourceCommentId: item.commentId,
          items: [{
            sku: product?.sku || item.sku || item.keyword,
            name: product?.name || item.keyword,
            quantity: item.quantity,
            unitPrice: product?.sellPrice || 0,
            zortProductId: product?.id || null,
            zortProduct: product,
            sourceCommentId: item.commentId,
          }],
        })
        if (draft.ok) drafts.push(draft.order)
      }
      hub.broadcast('omni', omni.snapshot())
      res.json({
        ok: true,
        mode: req.body?.mode || 'post_comment_capture',
        postId: req.params.postId,
        summary: { commentCount: comments.comments.length, parsedCount: parsed.length, draftCount: drafts.length, reviewCount: reviewItems.length },
        parsed,
        reviewItems,
        drafts,
        snapshot: omni.snapshot(),
      })
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || 'post_cf_capture_failed' })
    }
  })

  app.get('/api/omni/social/live', async (req, res) => {
    try {
      const settings = omni.getSettings()
      if (settings.liveCf?.enabled === false) return res.status(409).json({ ok: false, error: 'live_cf_disabled' })
      const result = await social.listLiveCommentSources({
        pageProfile: String(req.query.pageProfile || req.query.page || 'man_kynd'),
        limit: normalizePageSize(req.query.limit),
      })
      res.json(result)
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || 'live_cf_failed' })
    }
  })

  app.get('/api/omni/zort/products', async (req, res) => {
    try {
      const result = await commerce.searchProducts({
        keyword: String(req.query.q || req.query.keyword || ''),
        sku: String(req.query.sku || ''),
        limit: normalizePageSize(req.query.limit),
      })
      res.json(result)
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || 'zort_products_failed' })
    }
  })

  app.get('/api/omni/thai-address/postcodes/:postcode', async (req, res) => {
    try {
      const result = await lookupThaiAddressByPostcode(req.params.postcode, {
        limit: normalizeAddressLimit(req.query.limit),
      })
      if (!result.ok) {
        const status = result.error === 'thai_postcode_not_found' ? 404 : 400
        return res.status(status).json(result)
      }
      res.json(result)
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || 'thai_address_lookup_failed' })
    }
  })

  app.post('/api/omni/order-drafts', (req, res) => {
    const result = omni.createOrderDraft({ ...(req.body || {}), createdBy: req.body?.createdBy || 'boss' })
    if (!result.ok) return res.status(400).json(result)
    hub.broadcast('omni', result.snapshot)
    res.json(result)
  })

  app.post('/api/omni/order-drafts/:orderId/approve', async (req, res) => {
    const result = await omni.approveOrderDraft({
      orderId: req.params.orderId,
      approved: req.body?.approved,
      approvedBy: req.body?.approvedBy || 'boss',
      createExternalOrder: ({ order, uniquenumber, approved }) => commerce.createOrder({ order, uniquenumber, approved }),
    })
    if (!result.ok) {
      const status = result.error === 'approval_required' ? 403 : result.error === 'zort_order_create_disabled' ? 409 : 400
      return res.status(status).json(result)
    }
    hub.broadcast('omni', result.snapshot)
    res.json(result)
  })

  app.get('/api/omni/connections', async (_req, res) => {
    try {
      res.json(await connections.list())
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message || 'connections_list_failed' })
    }
  })

  app.post('/api/omni/connections', async (req, res) => {
    try {
      res.json(await connections.add(req.body || {}))
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || 'connection_add_failed' })
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

  app.delete('/api/omni/connections/:connectionId', async (req, res) => {
    try {
      const result = await connections.remove(req.params.connectionId)
      const audit = omni.recordActionAudit({
        action: 'connection_delete',
        actorType: 'human',
        actorId: 'boss',
        before: result.before,
        after: result.connection,
        sourceRef: `omni_connection:${req.params.connectionId}`,
      })
      res.json({ ...result, audit: audit.audit })
    } catch (error) {
      const status = error.message === 'connection_not_found' ? 404 : 400
      res.status(status).json({ ok: false, error: error.message || 'connection_delete_failed' })
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
      const settings = omni.getSettings()
      if (settings.ai?.enabled === false) return res.status(409).json({ ok: false, error: 'ai_disabled' })
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
