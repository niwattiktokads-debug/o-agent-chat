import { apiFetch, wsUrl } from './runtimeConfig.js'
import { isSupabaseRealtimeEnabled, subscribeOmniDatabaseChanges } from './supabaseRealtime.js'

async function getJson(path) {
  const response = await apiFetch(path)
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || `request_failed:${path}`)
  return body
}

async function postJson(path, payload = {}) {
  const response = await apiFetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || `request_failed:${path}`)
  return body
}

export async function fetchOmniSnapshot(workspaceId) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''
  return (await getJson(`/api/omni/snapshot${qs}`)).snapshot
}

export async function fetchWorkspaces() {
  return (await getJson('/api/omni/workspaces')).workspaces
}

export async function fetchWorkspace(workspaceId) {
  return (await getJson(`/api/omni/workspaces/${encodeURIComponent(workspaceId)}`)).workspace
}

export async function loginOmniAccess(password) {
  const response = await apiFetch('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ password }),
  })
  const body = await response.json()
  if (!response.ok || !body.ok || body.authenticated !== true) throw new Error(body.error || 'login_failed')
  return body
}

/**
 * Filter a full snapshot to only include data belonging to the given workspace.
 * Reusable by both subscription paths.
 */
export function filterSnapshotByWorkspace(full, workspaceId) {
  if (!workspaceId) return full
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
  return { ...full, pages, threads, messages, customers, orders, platformAccounts, pageRuntimeSettings, actionAudits, aiDecisions, knowledgeSources, orderLinks, paymentRequests, paymentEvents, approvalTasks }
}

export function subscribeOmniSnapshots(onSnapshot, { workspaceId } = {}) {
  if (isSupabaseRealtimeEnabled()) {
    let closed = false
    const refresh = () => {
      if (closed) return
      fetchOmniSnapshot(workspaceId || undefined).then(onSnapshot).catch(() => {})
    }
    refresh()
    const unsubscribe = subscribeOmniDatabaseChanges(refresh)
    return () => {
      closed = true
      unsubscribe?.()
    }
  }

  let closed = false
  let ws = null
  let retry = 1000

  function connect() {
    if (closed) return
    ws = new WebSocket(wsUrl('/ws'))
    ws.onopen = () => { retry = 1000 }
    ws.onmessage = (event) => {
      let envelope
      try { envelope = JSON.parse(event.data) } catch { return }
      if (envelope?.event === 'omni' && envelope.state) {
        // Filter incoming full snapshot to workspace scope before passing to UI
        onSnapshot(filterSnapshotByWorkspace(envelope.state, workspaceId))
      }
    }
    ws.onclose = () => {
      if (closed) return
      setTimeout(connect, retry)
      retry = Math.min(retry * 2, 30000)
    }
    ws.onerror = () => ws?.close()
  }

  connect()
  return () => {
    closed = true
    ws?.close()
  }
}

export async function fetchThread(threadId) {
  return (await getJson(`/api/omni/threads/${threadId}`)).thread
}

export async function setPageAutoReply(pageId, enabled) {
  const response = await apiFetch(`/api/omni/pages/${encodeURIComponent(pageId)}/auto-reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled, updatedBy: 'boss' }),
  })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || 'page_auto_reply_update_failed')
  return body
}

export async function fetchConnectorHealth() {
  return (await getJson('/api/omni/connectors/health')).health
}

export async function fetchOmniStorageStatus() {
  return (await getJson('/api/omni/storage/status')).storage
}

export async function fetchOmniSettings(workspaceId) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''
  return (await getJson(`/api/omni/settings${qs}`)).settings
}

export async function saveOmniSettings(settings, options = {}) {
  return postJson('/api/omni/settings', {
    settings,
    updatedBy: options.updatedBy || 'boss',
    ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
  })
}

export async function fetchMessageVolumeReport({ from = '', to = '', pageId = '' } = {}) {
  const query = new URLSearchParams()
  if (from) query.set('from', from)
  if (to) query.set('to', to)
  if (pageId) query.set('pageId', pageId)
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return (await getJson(`/api/omni/reports/message-volume${suffix}`)).report
}

export async function fetchSocialPosts(pageProfile = 'man_kynd', limit = 10) {
  const query = new URLSearchParams({ pageProfile, limit: String(limit) })
  return getJson(`/api/omni/social/posts?${query.toString()}`)
}

export async function capturePostCf(postId, { pageProfile = 'man_kynd', limit = 50, workspaceId } = {}) {
  const body = { pageProfile, limit }
  if (workspaceId) body.workspaceId = workspaceId
  return postJson(`/api/omni/social/posts/${encodeURIComponent(postId)}/capture`, body)
}

export async function fetchLiveSources(pageProfile = 'man_kynd', limit = 10, workspaceId) {
  const query = new URLSearchParams({ pageProfile, limit: String(limit) })
  if (workspaceId) query.set('workspaceId', workspaceId)
  return getJson(`/api/omni/social/live?${query.toString()}`)
}

export async function searchZortProducts(query, limit = 8) {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  return getJson(`/api/omni/zort/products?${params.toString()}`)
}

export async function lookupThaiAddressByPostcode(postcode) {
  return getJson(`/api/omni/thai-address/postcodes/${encodeURIComponent(postcode)}`)
}

export async function extractOrderAddressFromThread(threadId, { text = '', createConfirmationDraft = true } = {}) {
  return postJson(`/api/omni/threads/${encodeURIComponent(threadId)}/order-address-intake`, {
    text,
    createConfirmationDraft,
    authorName: 'AI',
  })
}

export async function createOrderDraft(input) {
  return postJson('/api/omni/order-drafts', { ...input, createdBy: 'boss' })
}

export async function approveOrderDraft(orderId) {
  return postJson(`/api/omni/order-drafts/${encodeURIComponent(orderId)}/approve`, { approved: true, approvedBy: 'boss' })
}

export async function fetchConnections() {
  return getJson('/api/omni/connections')
}

export async function addConnectionOption(input) {
  const response = await apiFetch('/api/omni/connections', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || 'connection_add_failed')
  return body
}

export async function deleteConnectionOption(connectionId) {
  const response = await apiFetch(`/api/omni/connections/${connectionId}`, { method: 'DELETE' })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || 'connection_delete_failed')
  return body
}

export async function verifyConnection(connectionId) {
  const response = await apiFetch(`/api/omni/connections/${connectionId}/verify`, { method: 'POST' })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.summary || body.error || 'connection_verify_failed')
  return body
}

export async function saveConnectionSecrets(connectionId, fields) {
  const response = await apiFetch(`/api/omni/connections/${connectionId}/secrets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || 'connection_secret_save_failed')
  return body
}

export async function fetchConnectionConversations(connectionId, limit = 5) {
  const query = new URLSearchParams({ limit: String(limit) })
  return getJson(`/api/omni/connections/${connectionId}/conversations?${query.toString()}`)
}

export async function fetchConnectionThread(connectionId, conversationId, limit = 20) {
  const query = new URLSearchParams({ limit: String(limit) })
  return getJson(`/api/omni/connections/${connectionId}/conversations/${encodeURIComponent(conversationId)}/messages?${query.toString()}`)
}

export async function createConnectionAiDraft(connectionId, conversationId) {
  const response = await apiFetch(`/api/omni/connections/${connectionId}/conversations/${encodeURIComponent(conversationId)}/ai-draft`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || 'connection_ai_draft_failed')
  return body
}

export async function sendConnectionReply(connectionId, conversationId, message) {
  const response = await apiFetch(`/api/omni/connections/${connectionId}/conversations/${encodeURIComponent(conversationId)}/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, approved: true }),
  })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || 'connection_send_failed')
  return body
}

export async function fetchLineSudaGroupRules() {
  return getJson('/api/omni/notifications/suda-oagent/group-rules')
}

export async function saveLineSudaGroupRules(groupId, responseRules) {
  const response = await apiFetch(`/api/omni/notifications/suda-oagent/group-rules/${encodeURIComponent(groupId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ responseRules }),
  })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || 'line_suda_group_rules_save_failed')
  return body
}

export async function fetchKnowledgeSources({ query = '', type = '', workspaceId = '' } = {}) {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (type) params.set('type', type)
  if (workspaceId) params.set('workspaceId', workspaceId)
  const suffix = params.toString() ? `?${params.toString()}` : ''
  return (await getJson(`/api/omni/knowledge-sources${suffix}`)).sources
}

export async function saveKnowledgeSource(source) {
  const response = await apiFetch('/api/omni/knowledge-sources', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(source),
  })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || 'knowledge_save_failed')
  return body
}

export async function deleteKnowledgeSource(sourceId) {
  const response = await apiFetch(`/api/omni/knowledge-sources/${sourceId}`, { method: 'DELETE' })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || 'knowledge_delete_failed')
  return body
}

export async function fetchFacebookConversations(pageProfile) {
  const query = new URLSearchParams({ page: pageProfile })
  return (await getJson(`/api/omni/facebook/conversations?${query.toString()}`)).data
}

export async function syncFacebookConversations(pageProfile) {
  const response = await apiFetch('/api/omni/facebook/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ page: pageProfile }),
  })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || 'facebook_sync_failed')
  return body.result
}

export async function fetchTikTokOrders(status = 'AWAITING_COLLECTION', pageSize = 10) {
  const query = new URLSearchParams({ status, pageSize: String(pageSize) })
  return (await getJson(`/api/omni/tiktok/orders?${query.toString()}`)).data
}

export async function syncTikTokOrders(status = 'AWAITING_COLLECTION', pageSize = 10) {
  const response = await apiFetch('/api/omni/tiktok/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status, pageSize }),
  })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || 'tiktok_sync_failed')
  return body.result
}

export async function createAiDraft(threadId) {
  const response = await apiFetch(`/api/omni/threads/${threadId}/ai-draft`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || 'ai_draft_failed')
  return body
}

export async function saveManualReplyDraft(threadId, draft) {
  const response = await apiFetch(`/api/omni/threads/${threadId}/manual-draft`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(draft),
  })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || 'manual_draft_failed')
  return body
}
