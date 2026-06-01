import { createOmniSeed } from '../server/src/omni/seed.js'

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const MAX_JSON_BODY_BYTES = Number(process.env.OMNI_API_JSON_BODY_LIMIT_BYTES || 262144)

export function json(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('x-frame-options', 'DENY')
  res.setHeader('referrer-policy', 'no-referrer')
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()')
  res.end(JSON.stringify(body))
}

export function requireSupabaseEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { ok: false, error: 'supabase_env_missing' }
  }
  return { ok: true }
}

export async function supabaseRest(path, options = {}) {
  const env = requireSupabaseEnv()
  if (!env.ok) throw new Error(env.error)
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      ...(options.headers || {}),
    },
  })
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  if (!response.ok) {
    const message = body?.message || body?.error || `supabase_request_failed:${response.status}`
    throw new Error(message)
  }
  return body
}

export async function supabaseRpc(name, payload = {}) {
  return supabaseRest(`/rest/v1/rpc/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function recordAiDecisionToSupabase(decision, { agentProfileId = null } = {}) {
  const row = {
    id: decision.id || `ai_${decision.threadId}_${Date.now()}`,
    thread_id: decision.threadId,
    agent_profile_id: agentProfileId,
    confidence: Number(decision.confidence || 0),
    action: decision.action || 'draft_ready',
    source_ids_json: decision.sourceIds || [],
    reason: [
      decision.reason || '',
      `provider=${decision.provider || ''}`,
      `model=${decision.model || ''}`,
      `intent=${decision.intent || ''}`,
      `risk=${decision.risk || ''}`,
    ].filter(Boolean).join(' | '),
  }
  const rows = await supabaseRest('/rest/v1/omni_ai_decisions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  })
  return rows?.[0] ? snakeToCamel(rows[0]) : snakeToCamel(row)
}

export async function recordActionAuditToSupabase({
  threadId = null,
  action,
  actorType,
  actorId = null,
  before = null,
  after = null,
  approvalTaskId = null,
  sourceRef = null,
  createdAt = null,
}) {
  const row = {
    id: `audit_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    thread_id: threadId,
    action,
    actor_type: actorType,
    actor_id: actorId,
    before_json: before,
    after_json: after,
    approval_task_id: approvalTaskId,
    source_ref: sourceRef,
    created_at: createdAt || new Date().toISOString(),
  }
  const rows = await supabaseRest('/rest/v1/omni_action_audits', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  })
  return rows?.[0] ? {
    ...snakeToCamel(rows[0]),
    beforeJson: rows[0].before_json || null,
    afterJson: rows[0].after_json || null,
  } : snakeToCamel(row)
}

export function getWebhookSecret() {
  return process.env.OMNI_WEBHOOK_INGEST_SECRET || ''
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}')

  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_JSON_BODY_BYTES) throw new Error('json_body_too_large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  return text ? JSON.parse(text) : {}
}

export function snakeToCamel(row = {}) {
  const output = {}
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_match, char) => char.toUpperCase())] = value
  }
  return output
}

export function normalizeSettings(rows = []) {
  return rows.map((row) => ({
    id: row.id,
    settings: row.settings_json || {},
    updatedBy: row.updated_by || null,
    updatedAt: row.updated_at || null,
  }))
}

function mergeSeedRows(seedRows = [], dbRows = [], { preferSeedName = false } = {}) {
  const rowsById = new Map(seedRows.map((row) => [row.id, { ...row }]))
  for (const row of dbRows) {
    const seed = rowsById.get(row.id)
    if (!seed) {
      rowsById.set(row.id, { ...row })
      continue
    }
    rowsById.set(row.id, {
      ...seed,
      ...row,
      name: preferSeedName && (!row.name || row.name === row.id) ? seed.name : row.name,
    })
  }
  return [...rowsById.values()]
}

export async function fetchOmniSnapshotFromSupabase() {
  const seed = createOmniSeed()
  const [
    pages,
    customers,
    threads,
    messages,
    orders,
    paymentRequests,
    settings,
    aiDecisions,
    actionAudits,
    approvalTasks,
    knowledgeSources,
  ] = await Promise.all([
    supabaseRest('/rest/v1/omni_pages?select=*&order=updated_at.desc'),
    supabaseRest('/rest/v1/omni_customers?select=*&order=updated_at.desc'),
    supabaseRest('/rest/v1/omni_threads?select=*&order=updated_at.desc'),
    supabaseRest('/rest/v1/omni_messages?select=*&order=created_at.asc'),
    supabaseRest('/rest/v1/omni_orders?select=*&order=updated_at.desc'),
    supabaseRest('/rest/v1/omni_payment_requests?select=*&order=updated_at.desc'),
    supabaseRest('/rest/v1/omni_settings?select=*&order=updated_at.desc'),
    supabaseRest('/rest/v1/omni_ai_decisions?select=*&order=created_at.desc'),
    supabaseRest('/rest/v1/omni_action_audits?select=*&order=created_at.desc'),
    supabaseRest('/rest/v1/omni_approval_tasks?select=*&order=updated_at.desc'),
    supabaseRest('/rest/v1/omni_knowledge_sources?select=*&order=updated_at.desc'),
  ])

  return {
    pages: mergeSeedRows(seed.pages, pages.map(snakeToCamel), { preferSeedName: true }),
    pageRuntimeSettings: [],
    platformAccounts: seed.platformAccounts || [],
    brandGroups: seed.brandGroups || [],
    policySets: seed.policySets || [],
    agentProfiles: seed.agentProfiles || [],
    customers: customers.map(snakeToCamel),
    threads: threads.map((row) => ({
      ...snakeToCamel(row),
      originContext: row.origin_context_json || {},
    })),
    messages: messages.map((row) => ({
      ...snakeToCamel(row),
      originContext: row.origin_context_json || {},
    })),
    orders: orders.map((row) => ({
      ...snakeToCamel(row),
      total: row.total_amount,
      shippingAddress: row.shipping_address_json || {},
      providerResponse: row.provider_response_json || null,
    })),
    orderLinks: [],
    inventorySnapshots: [],
    paymentRequests: paymentRequests.map(snakeToCamel),
    paymentEvents: [],
    omniSettings: normalizeSettings(settings),
    aiDecisions: aiDecisions.map((row) => ({
      ...snakeToCamel(row),
      sourceIds: row.source_ids_json || [],
    })),
    actionAudits: actionAudits.map((row) => ({
      ...snakeToCamel(row),
      beforeJson: row.before_json || null,
      afterJson: row.after_json || null,
    })),
    approvalTasks: approvalTasks.map(snakeToCamel),
    connectorHealth: [],
    knowledgeSources: mergeSeedRows(seed.knowledgeSources || [], knowledgeSources.map((row) => ({
      ...snakeToCamel(row),
      tags: row.tags_json || [],
    }))),
    retentionPolicies: [],
    retentionRuns: [],
  }
}

export async function fetchKnowledgeSourcesFromSupabase({ query = '', type = '', status = '' } = {}) {
  const snapshot = await fetchOmniSnapshotFromSupabase()
  const safeQuery = String(query || '').trim().toLowerCase()
  return (snapshot.knowledgeSources || [])
    .filter((source) => !status || source.status === status)
    .filter((source) => !type || source.type === type)
    .filter((source) => {
      if (!safeQuery) return true
      const haystack = [
        source.title,
        source.content,
        source.scope,
        ...(source.tags || []),
      ].join(' ').toLowerCase()
      return haystack.includes(safeQuery)
    })
}
