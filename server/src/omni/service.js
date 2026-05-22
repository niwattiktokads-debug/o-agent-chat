import { createOmniSeed } from './seed.js'

export function createOmniService(seed = createOmniSeed()) {
  const data = structuredClone(seed)

  function getPolicyForThread(thread) {
    const page = data.pages.find((item) => item.id === thread.pageId)
    return data.policySets.find((item) => item.id === page?.policySetId)
  }

  return {
    snapshot() {
      return structuredClone(data)
    },
    listPages() {
      return structuredClone(data.pages)
    },
    listThreads(filters = {}) {
      return data.threads
        .filter((thread) => !filters.pageId || thread.pageId === filters.pageId)
        .filter((thread) => !filters.status || thread.status === filters.status)
        .map((thread) => structuredClone(thread))
    },
    getThread(threadId) {
      const thread = data.threads.find((item) => item.id === threadId)
      if (!thread) return null
      return {
        ...structuredClone(thread),
        messages: data.messages.filter((message) => message.threadId === threadId),
        customer: data.customers.find((customer) => customer.id === thread.customerId) || null,
        orders: data.orders.filter((order) => order.customerId === thread.customerId),
        payments: data.paymentRequests.filter((payment) => payment.threadId === threadId),
        decisions: data.aiDecisions.filter((decision) => decision.threadId === threadId),
      }
    },
    evaluateAutoSend({ threadId }) {
      const thread = data.threads.find((item) => item.id === threadId)
      if (!thread) return { allowed: false, reason: 'thread_not_found' }
      const policy = getPolicyForThread(thread)
      if (!policy) return { allowed: false, reason: 'missing_policy' }
      if (!policy.autoSend?.[thread.intent]) return { allowed: false, reason: 'intent_requires_approval' }
      if (thread.risk !== 'low') return { allowed: false, reason: 'risk_not_low' }
      return { allowed: true, reason: 'policy_whitelist' }
    },
    approveDraft({ threadId }) {
      const thread = data.threads.find((item) => item.id === threadId)
      if (!thread) return { ok: false, error: 'thread_not_found' }
      thread.status = 'auto_sent'
      return { ok: true, thread: structuredClone(thread) }
    },
  }
}
