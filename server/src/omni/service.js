import { createOmniSeed } from './seed.js'

function resolveOptions(input) {
  if (input?.store || input?.seed) return { seed: input.seed || createOmniSeed(), store: input.store || null }
  return { seed: input || createOmniSeed(), store: null }
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
