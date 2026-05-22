async function getJson(path) {
  const response = await fetch(path)
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || `request_failed:${path}`)
  return body
}

export async function fetchOmniSnapshot() {
  return (await getJson('/api/omni/snapshot')).snapshot
}

export async function fetchThread(threadId) {
  return (await getJson(`/api/omni/threads/${threadId}`)).thread
}

export async function fetchConnectorHealth() {
  return (await getJson('/api/omni/connectors/health')).health
}

export async function fetchFacebookConversations(pageProfile) {
  const query = new URLSearchParams({ page: pageProfile })
  return (await getJson(`/api/omni/facebook/conversations?${query.toString()}`)).data
}

export async function syncFacebookConversations(pageProfile) {
  const response = await fetch('/api/omni/facebook/sync', {
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
  const response = await fetch('/api/omni/tiktok/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status, pageSize }),
  })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || 'tiktok_sync_failed')
  return body.result
}

export async function createAiDraft(threadId) {
  const response = await fetch(`/api/omni/threads/${threadId}/ai-draft`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || 'ai_draft_failed')
  return body
}
