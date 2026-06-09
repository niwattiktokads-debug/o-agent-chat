import { createAdapterRegistry } from './omni/adapters.js'
import { canUseEasyStoreLiveLookup, createAiReplyEngine } from './omni/aiReplyEngine.js'
import { getAiGuardRules } from './omni/aiGuardRules.js'
import { getOmniSchemaSummary } from './omni/db/schema.js'
import { fetchInstagramProfile, listFacebookConversations, sendFacebookReply } from './omni/metaInboxClient.js'
import { createOmniService } from './omni/service.js'
import { listTikTokOrders } from './omni/tiktokOrderClient.js'
import { createConnectionRuntime } from './omni/connections.js'
import { parsePostSessionComment } from './omni/postSessionParser.js'
import { createMetaSocialRuntime } from './omni/metaSocialRuntime.js'
import { lookupThaiAddressByPostcode } from './omni/thaiAddress.js'
import { createZortCommerceRuntime } from './omni/zortCommerceRuntime.js'
import { createEasyStoreRuntime } from './omni/easystoreRuntime.js'
import { createMetaCatalogRuntime } from './omni/metaCatalogRuntime.js'
import { createLineSudaOagentNotifier } from './omni/lineSudaOagentNotifier.js'
import { appendPageRegistryEntry, FALLBACK_PAGE_PROFILES, loadPageRegistry } from './omni/pageRegistry.js'
import { resolveWorkspaceId } from './omni/workspace.js'
import { createKgpPaymentRuntime } from './omni/kgpPaymentRuntime.js'
import { importKnowledgePack } from './omni/knowledgePacks.js'

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

function normalizeMetaFeedLimit(value) {
  const parsed = Number(value || 250)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) return 250
  return parsed
}

function normalizeAddressLimit(value) {
  const parsed = Number(value || 200)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) return 200
  return parsed
}

function isConnectionGovernanceType(input) {
  const value = String(input || '').trim().toLowerCase()
  return ['connection', 'connections'].includes(value)
}

function publicOmniBaseUrl(env = process.env) {
  return String(env.OMNI_PUBLIC_BASE_URL || env.OMNI_FRONTEND_URL || 'https://omni.oagent.biz').replace(/\/+$/, '')
}

function buildEasyStorePreviewUrl({ productId, threadId }, env = process.env) {
  const url = new URL(`/p/easystore/${encodeURIComponent(productId)}`, publicOmniBaseUrl(env))
  if (threadId) url.searchParams.set('threadId', threadId)
  return url.toString()
}

function stockLine(stock = {}) {
  const quantity = Number(stock.totalQuantity || 0)
  if (quantity > 0 && quantity < 5) return 'เหลือน้อยแล้ว'
  if (quantity > 0) return 'พร้อมส่ง'
  if (stock.status === 'out_of_stock') return 'รอเติมสต็อก'
  return ''
}

function compactProductToken(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function cleanVariantSize(value = '') {
  const raw = compactProductToken(value)
  if (!raw) return ''
  const readable = raw.includes('=') ? raw.split('=').pop() : raw
  return readable.replace(/,/g, '/').replace(/\s*\/\s*/g, '/').trim()
}

function displayProductOption(value = '') {
  const label = compactProductToken(value)
  if (!label || /^set\b/i.test(label) || label.startsWith('สี')) return label
  return `สี${label}`
}

function compactProductTitle(product = {}) {
  const title = compactProductToken(product.title || product.name || '')
  const family = title.split(' ')[0] || 'สินค้า'
  const color = compactProductToken(product.color || product.variantColor || '')
  const variantTitle = compactProductToken(product.variantTitle || product.variant || '')
  const optionColor = variantTitle.split(',')[0]?.trim() || ''
  const displayColor = displayProductOption(color || optionColor)
  return [family, displayColor].filter(Boolean).join(' ')
}

function buildEasyStoreProductDraft({ product, threadId }) {
  const previewUrl = String(product.links?.storefrontUrl || '').trim() || buildEasyStorePreviewUrl({ productId: product.id })
  const image = product.images?.[0] || null
  const priceLine = product.price?.formatted ? `ราคา ${product.price.formatted.replace(/^฿/, '')} บาท` : ''
  const size = cleanVariantSize(product.size || product.variantSize || '')
  const stock = stockLine(product.stock)
  const detailLine = [size ? `ไซซ์ ${size}` : '', priceLine, stock].filter(Boolean).join(' ')
  const lines = [
    `มี ${compactProductTitle(product)}ค่ะ`,
    detailLine,
  ].filter(Boolean)
  if (previewUrl) lines.push('', 'ดูสินค้า:', previewUrl)

  return {
    text: lines.join('\n'),
    attachments: image?.url ? [{
      id: `easystore_product_${product.id}`,
      name: image.alt || product.title || 'EasyStore product',
      type: 'image/jpeg',
      size: 0,
      url: image.url,
    }] : [],
  }
}

function normalizeCarouselCards(input = []) {
  if (!Array.isArray(input)) return { ok: true, cards: [], attachments: [] }
  if (input.length > 10) return { ok: false, error: 'carousel_card_limit_exceeded' }
  const cards = []
  const attachments = []
  for (const [index, item] of input.entries()) {
    const title = String(item?.title || '').trim().slice(0, 80)
    const subtitle = String(item?.subtitle || '').trim().slice(0, 80)
    const imageUrl = String(item?.image_url || item?.imageUrl || '').trim()
    if (!title || !/^https:\/\//i.test(imageUrl)) return { ok: false, error: 'carousel_card_https_image_required' }
    const buttons = Array.isArray(item?.buttons) ? item.buttons.map((button) => {
      const type = String(button?.type || 'web_url').trim()
      const buttonTitle = String(button?.title || '').trim().slice(0, 20)
      const url = String(button?.url || '').trim()
      if (type !== 'web_url' || !buttonTitle || !/^https:\/\//i.test(url)) return null
      return { type: 'web_url', title: buttonTitle, url }
    }).filter(Boolean).slice(0, 3) : []
    const card = {
      title,
      ...(subtitle ? { subtitle } : {}),
      imageUrl,
      ...(buttons.length ? { buttons } : {}),
    }
    cards.push(card)
    attachments.push({
      id: item?.id || `carousel_card_${index + 1}`,
      name: title,
      type: 'image/jpeg',
      size: 0,
      url: imageUrl,
      source: 'facebook_carousel_card',
    })
  }
  return { ok: true, cards, attachments }
}

function pageProfileForOmniPage(pageId) {
  const target = String(pageId || '')
  return Object.values(loadPageRegistry()).find((profile) => profile.omniPageId === target)?.profileKey || null
}

export function mountRoutes(app, hub, room, options = {}) {
  const omni = options.omni || createOmniService()
  const connections = options.connections || createConnectionRuntime()
  const social = options.social || createMetaSocialRuntime()
  const commerce = options.commerce || createZortCommerceRuntime()
  const easyStore = options.easyStore || createEasyStoreRuntime()
  const aiEasyStore = (options.easyStore || canUseEasyStoreLiveLookup()) ? easyStore : null
  const ai = options.ai || createAiReplyEngine({ easyStore: aiEasyStore })
  const metaCatalog = options.metaCatalog || createMetaCatalogRuntime()
  const kgpPayment = options.kgpPayment || createKgpPaymentRuntime()
  const adapters = createAdapterRegistry({ kgpPayment })
  const sendFacebookReplyRuntime = options.sendFacebookReply || sendFacebookReply
  const sudaOagentNotifier = options.sudaOagentNotifier || createLineSudaOagentNotifier()
  const storageStatus = options.storageStatus || {
    driver: 'memory',
    dbPath: null,
    configuredByEnv: false,
    persistent: false,
    volumeMountPath: null,
    note: 'No external persistent storage configured',
  }

  function reportToCsv(report) {
    const rows = ['hour,inbound,outbound,total']
    for (const row of report.byHour || []) rows.push([row.hour, row.inbound, row.outbound, row.total].join(','))
    return `${rows.join('\n')}\n`
  }

  function postSessionReviewItem(reason, item, extra = {}) {
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

  app.get('/api/health', (_req, res) => res.json({ ok: true }))

  // --- Workspace Foundation (Private SaaS v1) ---
  app.get('/api/omni/workspaces', (_req, res) => {
    res.json({ ok: true, workspaces: omni.listWorkspaces() })
  })

  app.get('/api/omni/workspaces/:workspaceId', (req, res) => {
    const workspace = omni.getWorkspace(req.params.workspaceId)
    if (!workspace) return res.status(404).json({ ok: false, error: 'workspace_not_found' })
    res.json({ ok: true, workspace })
  })

  app.get('/api/omni/pages', (req, res) => {
    const workspaceId = req.query.workspaceId || undefined
    res.json({ ok: true, pages: omni.listPages({ workspaceId }) })
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

  app.post('/api/omni/pages/:pageId/provider-profile', async (req, res) => {
    try {
      const pageId = String(req.params.pageId || '').trim()
      const profileKey = String(req.body?.pageProfile || req.query.pageProfile || '').trim()
        || Object.entries(loadPageRegistry()).find(([, profile]) => profile.omniPageId === pageId)?.[0]
      if (!profileKey) return res.status(400).json({ ok: false, error: 'page_profile_required' })
      const providerProfile = await (options.fetchInstagramProfile || fetchInstagramProfile)({ pageProfile: profileKey })
      if (!providerProfile.ok) return res.status(502).json(providerProfile)
      const result = omni.updatePageProviderProfile({
        pageId,
        provider: 'instagram',
        providerAccountId: providerProfile.profile?.id,
        username: providerProfile.profile?.username,
        name: providerProfile.profile?.name,
        avatarUrl: providerProfile.profile?.avatarUrl,
        updatedBy: req.body?.updatedBy || 'provider_profile_sync',
      })
      if (!result.ok) return res.status(result.error === 'page_not_found' ? 404 : 400).json(result)
      hub.broadcast('omni', result.snapshot)
      res.json({ ...result, providerProfile })
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || 'provider_profile_sync_failed' })
    }
  })

  app.get('/api/omni/snapshot', (req, res) => {
    const workspaceId = req.query.workspaceId || ''
    const settings = omni.getSettings({ workspaceId })
    const full = { ...omni.snapshot(), settings, aiGuardRules: getAiGuardRules() }
    if (!workspaceId) return res.json({ ok: true, snapshot: full })
    // Filter snapshot collections by workspace
    const pages = (full.pages || []).filter((p) => p.workspaceId === workspaceId)
    const pageIds = new Set(pages.map((p) => p.id))
    const threads = (full.threads || []).filter((t) => pageIds.has(t.pageId))
    const threadIds = new Set(threads.map((t) => t.id))
    const messages = (full.messages || []).filter((m) => threadIds.has(m.threadId))
    const customers = (full.customers || []).filter((c) => threads.some((t) => t.customerId === c.id))
    const orders = (full.orders || []).filter((o) => customers.some((c) => c.id === o.customerId) || o.workspaceId === workspaceId)
    const platformAccounts = (full.platformAccounts || []).filter((a) => pageIds.has(a.pageId))
    const pageRuntimeSettings = (full.pageRuntimeSettings || []).filter((s) => pageIds.has(s.pageId))
    const actionAudits = (full.actionAudits || []).filter((a) => a.workspaceId === workspaceId || threadIds.has(a.threadId))
    const aiDecisions = (full.aiDecisions || []).filter((d) => threadIds.has(d.threadId))
    const knowledgeSources = (full.knowledgeSources || []).filter((k) => (k.workspaceId || 'ws_oagent') === workspaceId)
    const orderIds = new Set(orders.map((o) => o.id))
    const orderLinks = (full.orderLinks || []).filter((l) => threadIds.has(l.threadId) || orderIds.has(l.orderId))
    const paymentRequests = (full.paymentRequests || []).filter((p) => threadIds.has(p.threadId) || orderIds.has(p.orderId))
    const paymentRequestIds = new Set(paymentRequests.map((p) => p.id))
    const paymentEvents = (full.paymentEvents || []).filter((e) => paymentRequestIds.has(e.paymentRequestId))
    const approvalTasks = (full.approvalTasks || []).filter((t) => threadIds.has(t.threadId) || orderIds.has(t.orderId))
    res.json({
      ok: true,
      snapshot: {
        ...full,
        pages,
        threads,
        messages,
        customers,
        orders,
        platformAccounts,
        pageRuntimeSettings,
        actionAudits,
        aiDecisions,
        knowledgeSources,
        orderLinks,
        paymentRequests,
        paymentEvents,
        approvalTasks,
      },
    })
  })

  app.get('/api/omni/schema', (_req, res) => {
    res.json({ ok: true, schema: getOmniSchemaSummary() })
  })

  app.get('/api/omni/storage/status', (_req, res) => {
    res.json({ ok: true, storage: storageStatus })
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

  app.post('/api/omni/history/clear', (req, res) => {
    const result = omni.clearHistory({
      ...(req.body || {}),
      sourceRef: req.body?.sourceRef || (req.body?.dryRun === false ? 'omni_history_clear_apply' : 'omni_history_clear_plan'),
    })
    if (!result.ok) return res.status(400).json(result)
    if (!result.dryRun) hub.broadcast('omni', result.snapshot)
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
        workspaceId: req.query.workspaceId,
      }),
    })
  })

  app.post('/api/omni/knowledge-sources', (req, res) => {
    const result = omni.upsertKnowledgeSource(req.body || {})
    if (!result.ok) return res.status(400).json(result)
    res.json(result)
  })

  app.post('/api/omni/knowledge-import/:packId', async (req, res) => {
    try {
      const result = await importKnowledgePack({
        packId: req.params.packId,
        omni,
        easyStore,
        input: req.body || {},
      })
      if (!result.ok) {
        const status = result.error === 'knowledge_pack_not_found' ? 404 : 400
        return res.status(status).json(result)
      }
      if (result.snapshot) hub.broadcast('omni', result.snapshot)
      const { snapshot: _snapshot, ...safeResult } = result
      res.json(safeResult)
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || 'knowledge_import_failed' })
    }
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
    if (req.params.provider === 'meta_pay_kgp') {
      const runtimeHealth = kgpPayment.health()
      return res.json({
        ...result,
        health: {
          ...result.health,
          ...runtimeHealth,
          seedStatus: result.health.status,
        },
      })
    }
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

  app.post('/api/omni/payment-requests/:paymentRequestId/kgp/checkout', async (req, res) => {
    if (req.body?.approved !== true) return res.status(403).json({ ok: false, error: 'approval_required' })
    if (req.body?.messageApproved !== true) return res.status(403).json({ ok: false, error: 'message_approval_required' })
    const paymentResult = omni.getPaymentRequest(req.params.paymentRequestId)
    if (!paymentResult.ok) return res.status(paymentResult.error === 'payment_request_not_found' ? 404 : 400).json(paymentResult)
    const checkout = await kgpPayment.createCheckout(paymentResult.payment)
    if (!checkout.ok) return res.status(checkout.error === 'kgp_provider_not_enabled' ? 409 : 502).json(checkout)
    const result = omni.attachPaymentCheckout({
      paymentRequestId: paymentResult.payment.id,
      checkoutUrl: checkout.checkoutUrl,
      providerRef: checkout.providerRef,
      expiresAt: checkout.expiresAt,
      providerResponse: checkout.response,
      approvedBy: req.body?.approvedBy || 'boss',
    })
    if (!result.ok) return res.status(400).json(result)
    hub.broadcast('omni', result.snapshot)
    res.json({ ...result, checkout: { checkoutUrl: checkout.checkoutUrl, providerRef: checkout.providerRef, expiresAt: checkout.expiresAt } })
  })

  app.post('/webhook/kgp/meta-pay', (req, res) => {
    const signature = kgpPayment.verifyWebhookSignature(req)
    if (!signature.ok) return res.status(401).json({ ok: false, error: signature.error })
    const event = kgpPayment.normalizeWebhookEvent(req.body || {})
    if (!event.ok) return res.status(400).json(event)
    const result = omni.applyPaymentProviderEvent(event)
    if (!result.ok) return res.status(result.error === 'payment_request_not_found' ? 404 : 400).json(result)
    if (!result.deduped) hub.broadcast('omni', result.snapshot)
    res.json({
      ok: true,
      deduped: Boolean(result.deduped),
      payment: result.payment,
      event: result.event,
    })
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

  app.get('/api/omni/threads/:threadId/sales-context', async (req, res) => {
    try {
      const baseContext = omni.resolveSalesContext({ threadId: req.params.threadId })
      if (!baseContext.ok) return res.status(baseContext.error === 'thread_not_found' ? 404 : 400).json(baseContext)

      const productId = String(req.query.productId || baseContext.product?.product?.productId || '').trim()
      if (!productId || req.query.images === '0') return res.json(baseContext)

      let preview = null
      try {
        preview = await easyStore.getProductPreview({ productId })
      } catch (error) {
        return res.json({
          ...baseContext,
          imagePicker: {
            ...baseContext.imagePicker,
            ok: false,
            productId,
            source: 'easystore_preview',
            error: error.message || 'easystore_product_preview_failed',
          },
        })
      }
      res.json(omni.resolveSalesContext({ threadId: req.params.threadId, productPreview: preview }))
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || 'sales_context_failed' })
    }
  })

  app.post('/api/omni/threads/:threadId/ai-draft', async (req, res) => {
    const thread = omni.getThread(req.params.threadId)
    if (!thread) return res.status(404).json({ ok: false, error: 'thread_not_found' })
    const settings = omni.getSettingsForThread(req.params.threadId)
    if (settings.ai?.enabled === false) return res.status(409).json({ ok: false, error: 'ai_disabled' })
    const threadKind = String(thread.kind || '').trim()
    if (thread.platform === 'easystore' || (threadKind && threadKind !== 'customer_chat')) {
      return res.status(409).json({ ok: false, error: 'system_event_no_ai_reply' })
    }
    const snapshot = { ...omni.snapshot(), settings }
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

  app.post('/api/omni/threads/:threadId/send', async (req, res) => {
    try {
      if (req.body?.approved !== true) return res.status(403).json({ ok: false, sent: false, error: 'approval_required' })
      const text = String(req.body?.text || '').trim()
      const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : []
      const carousel = normalizeCarouselCards(req.body?.cards || req.body?.carousel || [])
      if (!carousel.ok) return res.status(400).json({ ok: false, sent: false, error: carousel.error })
      const liveAttachments = attachments.map((item) => ({
        id: item?.id,
        name: item?.name,
        type: item?.type,
        size: item?.size,
        url: String(item?.url || item?.imageUrl || '').trim(),
      }))
      if (!text && liveAttachments.length === 0 && carousel.cards.length === 0) return res.status(400).json({ ok: false, sent: false, error: 'message_required' })
      if (liveAttachments.some((item) => !item.type?.startsWith('image/') || !/^https:\/\//i.test(item.url))) {
        return res.status(400).json({ ok: false, sent: false, error: 'live_attachment_https_image_required' })
      }

      const thread = omni.getThread(req.params.threadId)
      if (!thread) return res.status(404).json({ ok: false, sent: false, error: 'thread_not_found' })
      if (thread.platform !== 'facebook') return res.status(400).json({ ok: false, sent: false, error: 'unsupported_thread_platform' })

      const pageProfile = pageProfileForOmniPage(thread.pageId)
      if (!pageProfile) return res.status(400).json({ ok: false, sent: false, error: 'page_profile_not_found' })
      const recipientId = thread.customer?.providerCustomerId
      if (!recipientId) return res.status(400).json({ ok: false, sent: false, error: 'recipient_id_not_found' })

      const sendResult = await sendFacebookReplyRuntime({ pageProfile, recipientId, message: text, attachments: liveAttachments, carousel: carousel.cards })
      if (!sendResult?.ok) return res.status(400).json({
        ok: false,
        sent: false,
        error: sendResult?.error || 'facebook_send_failed',
        userMessage: sendResult?.userMessage || 'ส่งลูกค้าไม่สำเร็จ ตรวจ Connector Health ก่อนส่งซ้ำ',
        pageProfile,
        sendResult,
      })

      const recorded = omni.recordOutboundMessage({
        threadId: thread.id,
        authorName: req.body?.authorName || 'บอส',
        text,
        attachments: [...liveAttachments, ...carousel.attachments],
        providerMessageId: sendResult.response?.message_id || sendResult.response?.id || sendResult.response?.recipient_id || null,
        sourceRef: `manual_send:${pageProfile}`,
      })
      if (!recorded.ok) return res.status(400).json({ ...recorded, sent: false })
      hub.broadcast('omni', recorded.snapshot)
      res.json({ ...recorded, sent: true, sendResult: { ok: true, response: sendResult.response || null } })
    } catch (error) {
      res.status(400).json({ ok: false, sent: false, error: error.message || 'manual_send_failed' })
    }
  })

  app.post('/api/omni/threads/:threadId/easystore-product-draft', async (req, res) => {
    try {
      const productId = String(req.body?.productId || req.query.productId || '').trim()
      if (!productId) return res.status(400).json({ ok: false, error: 'easystore_product_id_required' })
      const preview = await easyStore.getProductPreview({ productId })
      const product = preview.product || {}
      if (!product.id) return res.status(404).json({ ok: false, error: 'easystore_product_not_found' })
      const draft = buildEasyStoreProductDraft({ product, threadId: req.params.threadId })
      const result = omni.recordManualReplyDraft({
        threadId: req.params.threadId,
        authorName: req.body?.authorName || 'บอส',
        text: draft.text,
        attachments: draft.attachments,
        sourceRef: `easystore_product_draft:${product.id}`,
      })
      if (!result.ok) return res.status(result.error === 'thread_not_found' ? 404 : 400).json(result)
      hub.broadcast('omni', result.snapshot)
      res.json({ ...result, product, previewUrl: String(product.links?.storefrontUrl || '').trim() || buildEasyStorePreviewUrl({ productId: product.id, threadId: req.params.threadId }) })
    } catch (error) {
      const status = error.status === 404 || error.message === 'easystore_product_not_found' ? 404 : 400
      res.status(status).json({ ok: false, error: error.message || 'easystore_product_draft_failed' })
    }
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

  app.get('/api/omni/settings', (req, res) => {
    res.json({ ok: true, settings: omni.getSettings({ workspaceId: req.query.workspaceId }) })
  })

  app.post('/api/omni/settings', (req, res) => {
    const result = omni.updateSettings({
      workspaceId: req.body?.workspaceId || req.query.workspaceId,
      settings: req.body?.settings || {},
      updatedBy: req.body?.updatedBy || 'boss',
    })
    if (result.snapshot) result.snapshot.settings = result.settings
    hub.broadcast('omni', result.snapshot)
    res.json(result)
  })

  app.post('/api/omni/policy-sets/:policySetId/auto-send', (req, res) => {
    const result = omni.updatePolicyAutoSend({
      policySetId: req.params.policySetId,
      autoSend: req.body?.autoSend || {},
      updatedBy: req.body?.updatedBy || 'boss',
    })
    if (!result.ok) return res.status(result.error === 'policy_set_not_found' ? 404 : 400).json(result)
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
      const pageProfile = String(req.body?.pageProfile || req.query.pageProfile || req.query.page || 'man_kynd')
      // Derive workspaceId from pageProfile in snapshot if not explicitly provided
      const explicitWsId = req.body?.workspaceId || req.query.workspaceId || undefined
      const wsId = explicitWsId || resolveWorkspaceId(omni.snapshot(), { pageId: pageProfile, pageProfiles: loadPageRegistry() })
      const settings = omni.getSettings({ workspaceId: wsId })
      const postSessionSettings = settings.postSession || settings.postCf || {}
      if (postSessionSettings.enabled === false) return res.status(409).json({ ok: false, error: 'post_session_disabled' })
      const comments = await social.listPostComments({
        objectId: req.params.postId,
        pageProfile,
        limit: normalizePageSize(req.body?.limit || req.query.limit || 50),
      })
      const parseResults = (comments.comments || []).map((comment) => parsePostSessionComment(comment, { keywords: postSessionSettings.keywords }))
      const parsed = parseResults.filter((result) => result.ok)
      const reviewItems = parseResults
        .filter((result) => !result.ok && !['empty_comment', 'not_post_session_comment', 'not_cf_comment'].includes(result.reason))
        .map((result) => postSessionReviewItem(result.reason, result))
      const drafts = []
      for (const item of parsed) {
        const products = await commerce.searchProducts({ keyword: item.keyword, sku: item.sku, limit: 5 })
        const product = products.products?.[0] || null
        if (!canDraftFromZortProduct(product)) {
          reviewItems.push(postSessionReviewItem(product ? 'zort_product_price_missing' : 'zort_product_not_found', item, { products: products.products || [] }))
          continue
        }
        if (postSessionSettings.autoCreateDrafts === false) {
          reviewItems.push(postSessionReviewItem('auto_create_disabled', item, { zortProduct: product }))
          continue
        }
        const draft = omni.createOrderDraft({
          platform: 'facebook',
          pageId: pageProfile,
          workspaceId: wsId,
          customer: item.customer,
          customerId: item.customer.id,
          customerName: item.customer.displayName,
          sourceRef: `meta_post_session:${req.params.postId}:${item.commentId}`,
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
      const pageProfile = String(req.query.pageProfile || req.query.page || 'man_kynd')
      // Derive workspaceId from pageProfile in snapshot if not explicitly provided
      const explicitWsId = req.query.workspaceId || undefined
      const wsId = explicitWsId || resolveWorkspaceId(omni.snapshot(), { pageId: pageProfile, pageProfiles: loadPageRegistry() })
      const settings = omni.getSettings({ workspaceId: wsId })
      if (settings.liveCf?.enabled === false) return res.status(409).json({ ok: false, error: 'live_cf_disabled' })
      const result = await social.listLiveCommentSources({
        pageProfile,
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

  app.get('/api/omni/easystore/products', async (req, res) => {
    try {
      const result = await easyStore.searchProducts({
        keyword: String(req.query.q || req.query.keyword || ''),
        sku: String(req.query.sku || ''),
        limit: normalizePageSize(req.query.limit),
      })
      res.json(result)
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || 'easystore_products_failed' })
    }
  })

  app.get('/feeds/meta/annalynna.csv', async (req, res) => {
    try {
      const result = await easyStore.getMetaCatalogFeed({
        limit: normalizeMetaFeedLimit(req.query.limit),
      })
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Cache-Control', 'public, max-age=900, s-maxage=900')
      res.setHeader('X-Omni-Feed-Count', String(result.count || 0))
      res.send(result.csv)
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || 'easystore_meta_feed_failed' })
    }
  })

  app.get('/api/omni/meta/catalog/status', (req, res) => {
    res.json(metaCatalog.status())
  })

  app.get('/api/omni/easystore/products/:productId/preview', async (req, res) => {
    try {
      const result = await easyStore.getProductPreview({ productId: req.params.productId })
      res.json(result)
    } catch (error) {
      const status = error.status === 404 || error.message === 'easystore_product_not_found' ? 404 : 400
      res.status(status).json({ ok: false, error: error.message || 'easystore_product_preview_failed' })
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
    const provider = ['easystore', 'zort'].includes(String(req.body?.provider || '').toLowerCase())
      ? String(req.body.provider).toLowerCase()
      : undefined
    const result = await omni.approveOrderDraft({
      orderId: req.params.orderId,
      approved: req.body?.approved,
      approvedBy: req.body?.approvedBy || 'boss',
      provider,
      createExternalOrder: ({ order, uniquenumber, approved, provider: targetProvider }) => (
        targetProvider === 'easystore'
          ? easyStore.createOrder({ order, uniquenumber, approved })
          : commerce.createOrder({ order, uniquenumber, approved })
      ),
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
      res.json(await connections.remove(req.params.connectionId))
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
      const settings = omni.getSettings({ workspaceId: req.body?.workspaceId || req.query.workspaceId })
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
        easyStore: aiEasyStore,
      })
      const wsId = req.body?.workspaceId || req.query.workspaceId || undefined
      const allKnowledge = omni.listKnowledgeSources?.({ workspaceId: wsId }) || []
      const decision = await draftEngine.draft({
        thread: { id: `meta_${req.params.conversationId}`, platform: 'facebook', status: 'open' },
        snapshot: { messages, knowledgeSources: allKnowledge },
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
