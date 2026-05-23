import { createOmniSeed } from './seed.js'

function resolveOptions(input) {
  if (input?.store || input?.seed) return { seed: input.seed || createOmniSeed(), store: input.store || null }
  return { seed: input || createOmniSeed(), store: null }
}

const KNOWLEDGE_TYPES = new Set(['manual', 'website', 'file', 'faq', 'order_policy'])
const KNOWLEDGE_STATUSES = new Set(['ready', 'training', 'needs_review', 'archived'])

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

  function getPolicyForThread(thread) {
    const snapshot = currentData()
    const page = snapshot.pages.find((item) => item.id === thread.pageId)
    return snapshot.policySets.find((item) => item.id === page?.policySetId)
  }

  return {
    snapshot() {
      return structuredClone(currentData())
    },
    listPages() {
      return structuredClone(currentData().pages)
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
      }
    },
    evaluateAutoSend({ threadId }) {
      const thread = currentData().threads.find((item) => item.id === threadId)
      if (!thread) return { allowed: false, reason: 'thread_not_found' }
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
        action: decision.action,
        sourceIds: decision.sourceIds || [],
        reason: decision.reason || '',
        createdAt: decision.createdAt || new Date().toISOString(),
      }
      const result = upsert('aiDecisions', [row])
      return { ok: true, result, decision: structuredClone(row), snapshot: this.snapshot() }
    },
    approveDraft({ threadId }) {
      if (store) return { ok: false, error: 'approval_not_supported_for_sqlite_store_yet' }
      const thread = data.threads.find((item) => item.id === threadId)
      if (!thread) return { ok: false, error: 'thread_not_found' }
      thread.status = 'auto_sent'
      return { ok: true, thread: structuredClone(thread) }
    },
    syncFacebookConversations(normalized) {
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
