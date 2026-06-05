export function filterThreads(threads, filters = {}) {
  return threads
    .filter((thread) => !filters.pageId || filters.pageId === 'all' || thread.pageId === filters.pageId)
    .filter((thread) => !filters.status || filters.status === 'all' || thread.status === filters.status)
    .slice()
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
}

export function aiApprovalQueue(snapshot = {}, filters = {}) {
  const threads = filterThreads(snapshot.threads || [], filters)
  const threadIds = new Set(threads.map((thread) => thread.id))
  const latestDecisionByThread = new Map()
  for (const decision of snapshot.aiDecisions || []) {
    if (!threadIds.has(decision.threadId)) continue
    const current = latestDecisionByThread.get(decision.threadId)
    if (!current || String(decision.createdAt || decision.id || '').localeCompare(String(current.createdAt || current.id || '')) > 0) {
      latestDecisionByThread.set(decision.threadId, decision)
    }
  }

  return threads
    .map((thread) => {
      const decision = latestDecisionByThread.get(thread.id)
      if (!decision || decision.action !== 'needs_approval') return null
      const decisionAt = new Date(decision.createdAt || 0).getTime()
      const resolvedByOutbound = (snapshot.messages || []).some((message) => {
        if (message.threadId !== thread.id || message.direction !== 'outbound') return false
        if (message.deliveryStatus === 'draft_only') return false
        if (!/(^|:)(meta_send|meta_comment_send|ig_comment_send|manual_send):/.test(`:${message.sourceRef || ''}`)) return false
        const messageAt = new Date(message.createdAt || 0).getTime()
        return !Number.isFinite(decisionAt) || !Number.isFinite(messageAt) || messageAt >= decisionAt
      })
      if (resolvedByOutbound) return null
      return {
        thread,
        decision,
        reason: decision.reason || decision.intent || 'needs_approval',
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.decision.createdAt || b.decision.id || '').localeCompare(String(a.decision.createdAt || a.decision.id || '')))
}

export function statusLabel(status, thread = null) {
  if (thread?.platform === 'easystore' || thread?.kind === 'order_event' || thread?.kind === 'product_event') {
    if (thread?.kind === 'product_event' || thread?.intent === 'product') return 'สินค้าอัปเดต'
    if (thread?.kind === 'customer_event') return 'ลูกค้าอัปเดต'
    return 'ออเดอร์อัปเดต'
  }
  const labels = {
    open: 'ต้องตอบ',
    draft_ready: 'AI ร่างแล้ว',
    needs_approval: 'รออนุมัติ',
    needs_data: 'รอข้อมูล',
    auto_sent: 'ส่งแล้ว',
    escalated: 'ส่งต่อ',
  }
  return labels[status] || status
}

export function pageForThread(pages = [], thread) {
  return pages.find((page) => page.id === thread?.pageId) || null
}

export function customerForThread(customers = [], thread) {
  return customers.find((customer) => customer.id === thread?.customerId) || null
}

export function customerAvatarUrl(customer = {}) {
  const profile = customer || {}
  return profile.avatarUrl || profile.profilePic || profile.profile_pic || profile.picture?.data?.url || profile.pictureUrl || ''
}

export function initialsForName(name = '') {
  const text = String(name || '').trim()
  if (!text) return '?'
  const parts = text.split(/\s+/).filter(Boolean)
  const initials = parts.slice(0, 2).map((part) => part[0]).join('')
  return initials.toUpperCase()
}

export function latestMessageForThread(messages = [], threadId) {
  return messages
    .filter((message) => message.threadId === threadId)
    .slice()
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null
}

export function autoSendStatus(snapshot = {}, thread = null) {
  const settings = snapshot?.settings || snapshot?.omniSettings?.find?.((item) => item.id === 'default')?.settings || {}
  if (settings?.ai?.customerSendEnabled !== true) {
    return { active: false, label: 'Draft only', detail: 'customer send guard is on' }
  }
  const pages = snapshot?.pages || []
  const policySets = snapshot?.policySets || []
  const messages = snapshot?.messages || []
  const threadPage = thread ? pageForThread(pages, thread) : null
  const policies = threadPage
    ? policySets.filter((policy) => policy.id === threadPage.policySetId)
    : policySets
  const autoSendIntents = policies.flatMap((policy) => (
    Object.entries(policy?.autoSend || {})
      .filter(([, enabled]) => Boolean(enabled))
      .map(([intent]) => intent)
  ))
  const sentMessageRecorded = messages.some((message) => (
    (!thread || message.threadId === thread.id) &&
    message.direction === 'outbound' &&
    message.deliveryStatus !== 'draft_only' &&
    /(^|:)(meta_send|meta_comment_send|ig_comment_send):/.test(`:${message.sourceRef || ''}`)
  ))
  if (sentMessageRecorded || autoSendIntents.length > 0) {
    return {
      active: true,
      label: 'Auto-send active',
      detail: sentMessageRecorded ? 'sent reply recorded' : `${new Set(autoSendIntents).size} intents enabled`,
    }
  }
  return { active: false, label: 'Draft only', detail: 'approval required before customer send' }
}

export function formatShortTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

export function sourceLabel(sourceRef = '') {
  if (sourceRef.startsWith('meta_webhook:')) return 'Webhook'
  if (sourceRef.startsWith('meta_send:')) return 'AI ส่ง'
  if (sourceRef.startsWith('meta_thread:')) return 'Meta'
  if (sourceRef.startsWith('tiktok_business_messaging:')) return 'TikTok'
  if (sourceRef.startsWith('ai_auto_reply')) return 'AI'
  if (sourceRef.startsWith('manual_send:')) return 'ส่งจริง'
  if (sourceRef.startsWith('manual_draft')) return 'Draft'
  if (sourceRef.startsWith('easystore_product_draft:')) return 'สินค้า'
  return 'Omni'
}

export function riskClass(risk) {
  if (risk === 'high') return 'text-rose-300 bg-rose-950/40'
  if (risk === 'medium') return 'text-amber-300 bg-amber-950/40'
  return 'text-emerald-300 bg-emerald-950/40'
}
