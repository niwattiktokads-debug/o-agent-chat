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
