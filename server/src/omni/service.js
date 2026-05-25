import { createOmniSeed } from './seed.js'
import { DEFAULT_CHAT_RETENTION_POLICY, normalizeRetentionPolicy, planChatRetentionCleanup } from './retention.js'

function resolveOptions(input) {
  if (input?.store || input?.seed) return { seed: input.seed || createOmniSeed(), store: input.store || null }
  return { seed: input || createOmniSeed(), store: null }
}

const KNOWLEDGE_TYPES = new Set(['manual', 'website', 'file', 'faq', 'order_policy'])
const KNOWLEDGE_STATUSES = new Set(['ready', 'training', 'needs_review', 'archived'])
const PAYMENT_PROVIDERS = new Set(['meta_pay_kgp', 'promptpay'])
const PAYMENT_STATUSES = new Set(['draft', 'pending', 'paid', 'failed', 'expired', 'manual_verify', 'cancelled'])
const MAX_DRAFT_ATTACHMENTS = 5
const MAX_DRAFT_ATTACHMENT_BYTES = 5 * 1024 * 1024

function createActionAuditRow({
  id,
  threadId = null,
  action,
  actorType,
  actorId = null,
  before = null,
  after = null,
  approvalTaskId = null,
  sourceRef = null,
  createdAt,
}) {
  const now = createdAt || new Date().toISOString()
  return {
    id: id || `audit_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    threadId,
    action,
    actorType,
    actorId,
    beforeJson: before,
    afterJson: after,
    approvalTaskId,
    sourceRef,
    createdAt: now,
  }
}

function normalizeKnowledgeSource(input = {}) {
  const title = String(input.title || '').trim()
  const content = String(input.content || '').trim()
  if (!title) return { ok: false, error: 'knowledge_title_required' }
  if (!content) return { ok: false, error: 'knowledge_content_required' }

  const now = new Date().toISOString()
  const type = KNOWLEDGE_TYPES.has(input.type) ? input.type : 'manual'
  const status = KNOWLEDGE_STATUSES.has(input.status) ? input.status : 'ready'
  const tags = Array.isArray(input.tags)
    ? input.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : String(input.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean)

  return {
    ok: true,
    row: {
      id: input.id || `ks_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      title,
      type,
      scope: String(input.scope || 'all_pages').trim() || 'all_pages',
      status,
      content,
      tags,
      sourceRef: input.sourceRef || null,
      createdAt: input.createdAt || now,
      updatedAt: now,
    },
  }
}

function normalizeDraftAttachments(input = []) {
  if (!Array.isArray(input)) return { ok: false, error: 'attachments_must_be_array' }
  if (input.length > MAX_DRAFT_ATTACHMENTS) return { ok: false, error: 'too_many_attachments' }

  const attachments = []
  for (const item of input) {
    const type = String(item?.type || '').trim()
    const dataUrl = String(item?.dataUrl || '').trim()
    if (!type.startsWith('image/')) return { ok: false, error: 'attachment_must_be_image' }
    if (!dataUrl.startsWith('data:image/')) return { ok: false, error: 'attachment_data_url_required' }
    const size = Number(item?.size || 0)
    if (!Number.isFinite(size) || size < 0 || size > MAX_DRAFT_ATTACHMENT_BYTES) return { ok: false, error: 'attachment_too_large' }
    attachments.push({
      id: item.id || `att_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      name: String(item.name || 'image').slice(0, 120),
      type,
      size,
      dataUrl,
    })
  }

  return { ok: true, attachments }
}

function normalizePaymentRequest(input = {}, snapshot = {}) {
  const provider = String(input.provider || '').trim()
  if (!PAYMENT_PROVIDERS.has(provider)) return { ok: false, error: 'unsupported_payment_provider' }

  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'payment_amount_required' }

  const threadId = String(input.threadId || '').trim()
  if (threadId && !(snapshot.threads || []).some((thread) => thread.id === threadId)) {
    return { ok: false, error: 'thread_not_found' }
  }

  const orderId = String(input.orderId || '').trim()
  if (orderId && !(snapshot.orders || []).some((order) => order.id === orderId)) {
    return { ok: false, error: 'order_not_found' }
  }

  const now = new Date().toISOString()
  const status = PAYMENT_STATUSES.has(input.status) ? input.status : 'draft'
  const id = input.id || `pay_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
  const providerRef = input.providerRef || (provider === 'meta_pay_kgp' ? `kgp_draft_${id}` : null)

  return {
    ok: true,
    row: {
      id,
      threadId: threadId || null,
      orderId: orderId || null,
      provider,
      status,
      amount,
      currency: String(input.currency || 'THB').trim() || 'THB',
      approvalRequired: true,
      providerRef,
      sourceRef: input.sourceRef || `omni:${provider}`,
      expiresAt: input.expiresAt || null,
      createdAt: input.createdAt || now,
      updatedAt: now,
    },
    event: {
      id: input.eventId || `pay_event_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      paymentRequestId: id,
      type: 'created',
      source: provider,
      sourceRef: input.sourceRef || `omni:${provider}`,
      createdAt: now,
    },
  }
}

function isFacebookSnippetPreview(message) {
  return (
    String(message.id || '').startsWith('fb_preview_') ||
    String(message.providerMessageId || '').endsWith(':snippet') ||
    String(message.sourceRef || '').startsWith('meta_conversation:')
  )
}

function normalizeFacebookWebhookSync(snapshot, normalized) {
  const messagesByThreadId = new Map()
  for (const message of normalized.messages || []) {
    const rows = messagesByThreadId.get(message.threadId) || []
    rows.push(message)
    messagesByThreadId.set(message.threadId, rows)
  }

  const remappedThreadIds = new Map()
  const threads = (normalized.threads || []).map((thread) => {
    const existing = (snapshot.threads || []).find((candidate) => (
      candidate.platform === 'facebook' &&
      candidate.pageId === thread.pageId &&
      candidate.customerId === thread.customerId &&
      candidate.id !== thread.id &&
      !String(candidate.id || '').startsWith('fb_webhook_')
    ))
    if (!existing) return thread

    remappedThreadIds.set(thread.id, existing.id)
    const threadMessages = messagesByThreadId.get(thread.id) || []
    const inboundCount = threadMessages.filter((message) => message.direction === 'inbound').length
    return {
      ...existing,
      status: 'open',
      unreadCount: (existing.unreadCount || 0) + inboundCount,
      messageCount: (existing.messageCount || 0) + threadMessages.length,
      updatedAt: thread.updatedAt || existing.updatedAt,
    }
  })

  const messages = (normalized.messages || []).map((message) => ({
    ...message,
    threadId: remappedThreadIds.get(message.threadId) || message.threadId,
  }))

  return { ...normalized, threads, messages }
}

function pageRuntimeSettingFor(snapshot, pageId) {
  const setting = (snapshot.pageRuntimeSettings || []).find((item) => item.pageId === pageId)
  return {
    pageId,
    autoReplyEnabled: setting?.autoReplyEnabled !== false,
    updatedAt: setting?.updatedAt || null,
    updatedBy: setting?.updatedBy || null,
  }
}

function withPageRuntimeSettings(snapshot) {
  const next = structuredClone(snapshot)
  next.pageRuntimeSettings = (next.pages || []).map((page) => pageRuntimeSettingFor(snapshot, page.id))
  next.pages = (next.pages || []).map((page) => {
    const runtime = pageRuntimeSettingFor(snapshot, page.id)
    return {
      ...page,
      autoReplyEnabled: runtime.autoReplyEnabled,
      runtimeSettings: runtime,
    }
  })
  return next
}

export function createOmniService(options = createOmniSeed()) {
  const { seed, store } = resolveOptions(options)
  const data = structuredClone(seed)

  function currentData() {
    return store ? store.snapshot() : data
  }

  function upsert(collectionName, rows, key = 'id') {
    if (store) return store.upsert(collectionName, rows, key)
    const collection = data[collectionName]
    let inserted = 0
    let updated = 0

    for (const row of rows || []) {
      const existingIndex = collection.findIndex((item) => item[key] === row[key])
      if (existingIndex >= 0) {
        collection[existingIndex] = { ...collection[existingIndex], ...structuredClone(row) }
        updated += 1
      } else {
        collection.push(structuredClone(row))
        inserted += 1
      }
    }

    return { inserted, updated }
  }

  function replace(collectionName, rows) {
    if (store) return store.replace(collectionName, rows)
    data[collectionName] = structuredClone(rows || [])
  }

  function getPolicyForThread(thread) {
    const snapshot = currentData()
    const page = snapshot.pages.find((item) => item.id === thread.pageId)
    return snapshot.policySets.find((item) => item.id === page?.policySetId)
  }

  return {
    snapshot() {
      return withPageRuntimeSettings(currentData())
    },
    listPages() {
      return withPageRuntimeSettings(currentData()).pages
    },
    getPageRuntimeSetting(pageId) {
      const page = currentData().pages.find((item) => item.id === pageId)
      if (!page) return null
      return pageRuntimeSettingFor(currentData(), pageId)
    },
    isPageAutoReplyEnabled(pageId) {
      const setting = this.getPageRuntimeSetting(pageId)
      return setting ? setting.autoReplyEnabled : false
    },
    setPageAutoReply({ pageId, enabled, updatedBy = 'boss' } = {}) {
      const id = String(pageId || '').trim()
      const snapshot = currentData()
      const page = snapshot.pages.find((item) => item.id === id)
      if (!page) return { ok: false, error: 'page_not_found' }
      if (typeof enabled !== 'boolean') return { ok: false, error: 'enabled_boolean_required' }
      const before = pageRuntimeSettingFor(snapshot, id)
      const row = {
        pageId: id,
        autoReplyEnabled: enabled,
        updatedAt: new Date().toISOString(),
        updatedBy: String(updatedBy || 'boss'),
      }
      const result = upsert('pageRuntimeSettings', [row], 'pageId')
      const audit = createActionAuditRow({
        action: enabled ? 'page_auto_reply_enabled' : 'page_auto_reply_disabled',
        actorType: 'human',
        actorId: row.updatedBy,
        before,
        after: row,
        sourceRef: `omni_page:${id}`,
      })
      const auditResult = upsert('actionAudits', [audit])
      return {
        ok: true,
        result: { pageRuntimeSettings: result, actionAudits: auditResult },
        page: withPageRuntimeSettings({ ...snapshot, pageRuntimeSettings: [...(snapshot.pageRuntimeSettings || []).filter((item) => item.pageId !== id), row] }).pages.find((item) => item.id === id),
        setting: structuredClone(row),
        audit: structuredClone(audit),
        snapshot: this.snapshot(),
      }
    },
    listRetentionPolicies() {
      const policies = currentData().retentionPolicies || []
      if (policies.length === 0) return [structuredClone(DEFAULT_CHAT_RETENTION_POLICY)]
      return policies.map((policy) => structuredClone(policy))
    },
    listRetentionRuns() {
      return (currentData().retentionRuns || []).map((run) => structuredClone(run))
    },
    upsertRetentionPolicy(input = {}) {
      const snapshot = currentData()
      const existing = (snapshot.retentionPolicies || []).find((policy) => policy.id === (input.id || DEFAULT_CHAT_RETENTION_POLICY.id))
        || DEFAULT_CHAT_RETENTION_POLICY
      const policy = normalizeRetentionPolicy(input, existing)
      const result = upsert('retentionPolicies', [policy])
      return { ok: true, result, policy: structuredClone(policy), snapshot: this.snapshot() }
    },
    runChatRetention(input = {}) {
      const planned = planChatRetentionCleanup(currentData(), input)
      if (!planned.ok || planned.skipped || planned.dryRun) {
        const { next: _next, ...safeResult } = planned
        return { ...safeResult, snapshot: this.snapshot() }
      }

      replace('messages', planned.next.messages)
      replace('threads', planned.next.threads)
      replace('customers', planned.next.customers)
      replace('retentionRuns', planned.next.retentionRuns)

      const { next: _next, ...safeResult } = planned
      return { ...safeResult, snapshot: this.snapshot() }
    },
    listKnowledgeSources(filters = {}) {
      const query = String(filters.query || '').trim().toLowerCase()
      return (currentData().knowledgeSources || [])
        .filter((source) => !filters.status || source.status === filters.status)
        .filter((source) => !filters.type || source.type === filters.type)
        .filter((source) => !query || [source.title, source.content, source.scope, ...(source.tags || [])].join(' ').toLowerCase().includes(query))
        .map((source) => structuredClone(source))
    },
    upsertKnowledgeSource(input) {
      const normalized = normalizeKnowledgeSource(input)
      if (!normalized.ok) return normalized
      const result = upsert('knowledgeSources', [normalized.row])
      return { ok: true, result, source: structuredClone(normalized.row), snapshot: this.snapshot() }
    },
    deleteKnowledgeSource(id) {
      const sourceId = String(id || '').trim()
      if (!sourceId) return { ok: false, error: 'knowledge_id_required' }
      const snapshot = currentData()
      const next = (snapshot.knowledgeSources || []).filter((source) => source.id !== sourceId)
      if (next.length === (snapshot.knowledgeSources || []).length) return { ok: false, error: 'knowledge_not_found' }
      if (store) store.replace('knowledgeSources', next)
      else data.knowledgeSources = next
      return { ok: true, deletedId: sourceId, snapshot: this.snapshot() }
    },
    getPaymentProviderHealth(provider) {
      const providerId = String(provider || '').trim()
      const health = currentData().connectorHealth.find((item) => item.provider === providerId)
      if (!health) return { ok: false, error: 'payment_provider_not_found' }
      return {
        ok: true,
        provider: providerId,
        health: {
          ...structuredClone(health),
          mode: health.status === 'healthy' ? 'live' : 'guarded_setup',
          liveReady: health.status === 'healthy',
        },
      }
    },
    createPaymentRequest(input = {}) {
      if (input.approved !== true) return { ok: false, error: 'approval_required' }
      const normalized = normalizePaymentRequest(input, currentData())
      if (!normalized.ok) return normalized
      const paymentResult = upsert('paymentRequests', [normalized.row])
      const eventResult = upsert('paymentEvents', [normalized.event])
      const audit = createActionAuditRow({
        threadId: normalized.row.threadId,
        action: 'payment_request_created',
        actorType: 'human',
        actorId: input.approvedBy || 'boss',
        after: {
          paymentRequestId: normalized.row.id,
          orderId: normalized.row.orderId,
          provider: normalized.row.provider,
          status: normalized.row.status,
          amount: normalized.row.amount,
          currency: normalized.row.currency,
          approvalRequired: normalized.row.approvalRequired,
        },
        approvalTaskId: input.approvalTaskId || null,
        sourceRef: normalized.row.sourceRef,
      })
      const auditResult = upsert('actionAudits', [audit])
      return {
        ok: true,
        result: { paymentRequests: paymentResult, paymentEvents: eventResult, actionAudits: auditResult },
        payment: structuredClone(normalized.row),
        event: structuredClone(normalized.event),
        audit: structuredClone(audit),
        snapshot: this.snapshot(),
      }
    },
    listThreads(filters = {}) {
      return currentData().threads
        .filter((thread) => !filters.pageId || thread.pageId === filters.pageId)
        .filter((thread) => !filters.status || thread.status === filters.status)
        .map((thread) => structuredClone(thread))
    },
    getThread(threadId) {
      const snapshot = currentData()
      const thread = snapshot.threads.find((item) => item.id === threadId)
      if (!thread) return null
      return {
        ...structuredClone(thread),
        messages: snapshot.messages.filter((message) => message.threadId === threadId),
        customer: snapshot.customers.find((customer) => customer.id === thread.customerId) || null,
        orders: snapshot.orders.filter((order) => order.customerId === thread.customerId),
        payments: snapshot.paymentRequests.filter((payment) => payment.threadId === threadId),
        decisions: snapshot.aiDecisions.filter((decision) => decision.threadId === threadId),
        audits: (snapshot.actionAudits || []).filter((audit) => audit.threadId === threadId),
      }
    },
    evaluateAutoSend({ threadId }) {
      const thread = currentData().threads.find((item) => item.id === threadId)
      if (!thread) return { allowed: false, reason: 'thread_not_found' }
      if (process.env.OMNI_AI_AUTO_SEND_ALL === '1') return { allowed: true, reason: 'auto_send_all_enabled' }
      const policy = getPolicyForThread(thread)
      if (!policy) return { allowed: false, reason: 'missing_policy' }
      if (!policy.autoSend?.[thread.intent]) return { allowed: false, reason: 'intent_requires_approval' }
      if (thread.risk !== 'low') return { allowed: false, reason: 'risk_not_low' }
      return { allowed: true, reason: 'policy_whitelist' }
    },
    getPolicyForThread(thread) {
      return structuredClone(getPolicyForThread(thread))
    },
    recordAiDecision(decision) {
      const id = decision.id || `ai_${decision.threadId}_${Date.now()}`
      const row = {
        id,
        threadId: decision.threadId,
        agentProfileId: decision.agentProfileId || null,
        confidence: decision.confidence || 0,
        intent: decision.intent || null,
        risk: decision.risk || null,
        provider: decision.provider || null,
        model: decision.model || null,
        action: decision.action,
        sourceIds: decision.sourceIds || [],
        reason: decision.reason || '',
        createdAt: decision.createdAt || new Date().toISOString(),
      }
      const result = upsert('aiDecisions', [row])
      return { ok: true, result, decision: structuredClone(row), snapshot: this.snapshot() }
    },
    recordActionAudit(input = {}) {
      const audit = createActionAuditRow(input)
      const result = upsert('actionAudits', [audit])
      return { ok: true, result, audit: structuredClone(audit), snapshot: this.snapshot() }
    },
    recordOutboundMessage({ threadId, authorName = 'AI', text, providerMessageId = null, sourceRef = 'ai_auto_reply', decisionId = null, decision = null }) {
      const snapshot = currentData()
      const thread = snapshot.threads.find((item) => item.id === threadId)
      if (!thread) return { ok: false, error: 'thread_not_found' }
      const now = new Date().toISOString()
      const message = {
        id: `out_${threadId}_${Date.now()}`,
        threadId,
        direction: 'outbound',
        authorName,
        text: String(text || ''),
        createdAt: now,
        providerMessageId,
        sourceRef,
      }
      const updatedThread = {
        ...thread,
        status: 'auto_sent',
        unreadCount: 0,
        messageCount: (thread.messageCount || 0) + 1,
        updatedAt: now,
      }
      upsert('messages', [message])
      upsert('threads', [updatedThread])
      const audit = createActionAuditRow({
        threadId,
        action: 'customer_message_sent',
        actorType: 'ai',
        actorId: authorName,
        before: {
          threadStatus: thread.status,
          unreadCount: thread.unreadCount || 0,
          messageCount: thread.messageCount || 0,
        },
        after: {
          messageId: message.id,
          providerMessageId,
          decisionId,
          intent: decision?.intent || null,
          risk: decision?.risk || null,
          confidence: decision?.confidence || null,
          sourceIds: decision?.sourceIds || [],
          policyDecision: decision?.allowed ? 'allowed' : 'not_allowed',
          replyText: message.text,
          threadStatus: updatedThread.status,
        },
        sourceRef,
      })
      upsert('actionAudits', [audit])
      return { ok: true, message: structuredClone(message), thread: structuredClone(updatedThread), audit: structuredClone(audit), snapshot: this.snapshot() }
    },
    recordManualReplyDraft({ threadId, authorName = 'บอส', text = '', attachments = [] }) {
      const snapshot = currentData()
      const thread = snapshot.threads.find((item) => item.id === threadId)
      if (!thread) return { ok: false, error: 'thread_not_found' }
      const cleanText = String(text || '').trim()
      const normalizedAttachments = normalizeDraftAttachments(attachments)
      if (!normalizedAttachments.ok) return normalizedAttachments
      if (!cleanText && normalizedAttachments.attachments.length === 0) return { ok: false, error: 'draft_empty' }

      const now = new Date().toISOString()
      const message = {
        id: `draft_${threadId}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        threadId,
        direction: 'outbound',
        authorName,
        text: cleanText,
        attachments: normalizedAttachments.attachments,
        createdAt: now,
        providerMessageId: null,
        sourceRef: 'manual_draft',
        deliveryStatus: 'draft_only',
      }
      const updatedThread = {
        ...thread,
        status: 'draft_ready',
        messageCount: (thread.messageCount || 0) + 1,
        updatedAt: now,
      }
      upsert('messages', [message])
      upsert('threads', [updatedThread])
      const audit = createActionAuditRow({
        threadId,
        action: 'manual_reply_draft_created',
        actorType: 'human',
        actorId: authorName,
        before: {
          threadStatus: thread.status,
          messageCount: thread.messageCount || 0,
        },
        after: {
          messageId: message.id,
          attachmentCount: normalizedAttachments.attachments.length,
          replyText: message.text,
          deliveryStatus: message.deliveryStatus,
          threadStatus: updatedThread.status,
        },
        sourceRef: message.sourceRef,
      })
      upsert('actionAudits', [audit])
      return { ok: true, message: structuredClone(message), thread: structuredClone(updatedThread), audit: structuredClone(audit), snapshot: this.snapshot() }
    },
    approveDraft({ threadId }) {
      if (store) return { ok: false, error: 'approval_not_supported_for_sqlite_store_yet' }
      const thread = data.threads.find((item) => item.id === threadId)
      if (!thread) return { ok: false, error: 'thread_not_found' }
      thread.status = 'auto_sent'
      return { ok: true, thread: structuredClone(thread) }
    },
    syncFacebookConversations(normalized) {
      const detailedThreadIds = new Set(
        (normalized.messages || [])
          .filter((message) => String(message.sourceRef || '').startsWith('meta_thread:'))
          .map((message) => message.threadId)
          .filter(Boolean),
      )
      if (detailedThreadIds.size > 0) {
        const snapshot = currentData()
        const nextMessages = (snapshot.messages || []).filter((message) => (
          !detailedThreadIds.has(message.threadId) || !isFacebookSnippetPreview(message)
        ))
        if (nextMessages.length !== (snapshot.messages || []).length) {
          if (store) store.replace('messages', nextMessages)
          else data.messages = nextMessages
        }
      }
      const customerResult = upsert('customers', normalized.customers)
      const threadResult = upsert('threads', normalized.threads)
      const messageResult = upsert('messages', normalized.messages)
      return {
        ok: true,
        page: normalized.page,
        customers: customerResult,
        threads: threadResult,
        messages: messageResult,
        snapshot: this.snapshot(),
      }
    },
    syncFacebookWebhookEvents(normalized) {
      const prepared = normalizeFacebookWebhookSync(currentData(), normalized)
      const customerResult = upsert('customers', prepared.customers)
      const threadResult = upsert('threads', prepared.threads)
      const messageResult = upsert('messages', prepared.messages)
      return {
        ok: true,
        source: prepared.source,
        customers: customerResult,
        threads: threadResult,
        messages: messageResult,
        snapshot: this.snapshot(),
      }
    },
    syncTikTokMessagingWebhookEvents(normalized) {
      const customerResult = upsert('customers', normalized.customers)
      const threadResult = upsert('threads', normalized.threads)
      const messageResult = upsert('messages', normalized.messages)
      return {
        ok: true,
        source: normalized.source,
        customers: customerResult,
        threads: threadResult,
        messages: messageResult,
        snapshot: this.snapshot(),
      }
    },
    syncTikTokOrders(normalized) {
      const customerResult = upsert('customers', normalized.customers)
      const orderResult = upsert('orders', normalized.orders)
      return {
        ok: true,
        source: normalized.source,
        totalCount: normalized.totalCount,
        nextPageToken: normalized.nextPageToken,
        customers: customerResult,
        orders: orderResult,
        snapshot: this.snapshot(),
      }
    },
  }
}
