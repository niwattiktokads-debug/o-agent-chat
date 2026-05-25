import { existsSync, readFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const CSNAP_BASE_URL = process.env.CSNAP_BASE_URL || 'http://127.0.0.1:9876'
const CSNAP_AUTH_FILE = process.env.CSNAP_AUTH_FILE || '/Users/babycuca/Projects/c-snap/data/.auth_token'
const META_INBOX_HELPER = process.env.META_INBOX_HELPER || '/Users/babycuca/.codex/bin/meta-inbox-api'

const CONNECTIONS = [
  {
    id: 'meta_anna_lynn',
    title: 'Meta · Anna Lynn',
    provider: 'meta',
    pageProfile: 'anna_lynn',
    pageId: '122106446570001676',
    group: 'customer_channel',
    description: 'Facebook Messenger inbox, webhook, and approved customer replies for Anna Lynn.',
    helper: '/Users/babycuca/.codex/bin/meta-inbox-api',
    verify: { command: '/Users/babycuca/.codex/bin/meta-inbox-api', args: ['verify', '--page=anna_lynn'] },
    fields: [
      { id: 'page_token', label: 'Page access token', credentialName: 'FB Anna Lynn Page Token -OA', secret: true, required: true },
      { id: 'app_secret', label: 'Meta app secret', credentialName: 'Meta App Secret FB -MP', secret: true, required: false },
      { id: 'verify_token', label: 'Webhook verify token', credentialName: 'Meta Webhook Verify Token Omni -OA', secret: true, required: true },
    ],
    docs: '/Users/babycuca/.codex/integrations/meta_inbox_api.json',
    endpoints: [
      {
        method: 'GET',
        path: '/me/conversations?fields=id,snippet,senders,updated_time,message_count,unread_count&limit=5',
        purpose: 'ดู inbox conversation ล่าสุดของเพจ',
      },
    ],
    productionNotes: ['Subscribe page webhooks after public HTTPS callback is stable.', 'Customer-facing sends require approval guard.'],
  },
  {
    id: 'meta_man_kynd',
    title: 'Meta · MAN KYND',
    provider: 'meta',
    pageProfile: 'man_kynd',
    pageId: '189971841184132',
    group: 'customer_channel',
    description: 'Facebook Messenger inbox and comment/reply control for MAN KYND.',
    helper: '/Users/babycuca/.codex/bin/meta-inbox-api',
    verify: { command: '/Users/babycuca/.codex/bin/meta-inbox-api', args: ['verify', '--page=man_kynd'] },
    fields: [
      { id: 'page_token', label: 'Page access token', credentialName: 'FB Page Token MAN KYND -MP', secret: true, required: true },
      { id: 'app_secret', label: 'Meta app secret', credentialName: 'Meta App Secret FB -MP', secret: true, required: false },
    ],
    docs: '/Users/babycuca/.codex/integrations/meta_inbox_api.json',
    endpoints: [
      {
        method: 'GET',
        path: '/me/conversations?fields=id,snippet,senders,updated_time,message_count,unread_count&limit=5',
        purpose: 'ดู inbox conversation ล่าสุดของเพจ',
      },
    ],
    productionNotes: ['Keep page token scoped to Meta tasks only.', 'Do not expose customer tokens in workspace files.'],
  },
  {
    id: 'omni_ai_gemini',
    title: 'AI Reply · Gemini CLI',
    provider: 'gemini_cli',
    group: 'ai_provider',
    description: 'Local AI reply provider through Google Code Assist OAuth. Best current local path.',
    helper: '/Users/babycuca/.codex/bin/omni-ai-reply',
    verify: {
      command: '/Users/babycuca/.codex/bin/omni-ai-reply',
      args: ['verify'],
      env: { OMNI_AI_PROVIDER: 'gemini_cli', OMNI_AI_MODEL: 'gemini-3-flash-preview' },
    },
    fields: [
      { id: 'local_oauth', label: 'Google Code Assist OAuth', credentialName: 'Local ~/.gemini profile', secret: false, required: true, readOnly: true },
    ],
    docs: '/Users/babycuca/.codex/integrations/omni_ai_reply.json',
    productionNotes: ['Local-only provider. Use OpenAI or another hosted provider for cloud 24/7.'],
  },
  {
    id: 'omni_ai_openai',
    title: 'AI Reply · OpenAI',
    provider: 'openai',
    group: 'ai_provider',
    description: 'Cloud-ready AI reply provider for Omni customer responses.',
    helper: '/Users/babycuca/.codex/bin/omni-ai-reply',
    verify: { command: '/Users/babycuca/.codex/bin/omni-ai-reply', args: ['verify'], env: { OMNI_AI_PROVIDER: 'openai' } },
    fields: [
      { id: 'api_key', label: 'OpenAI API key', credentialName: 'OpenAI API Key', envName: 'OPENAI_API_KEY', secret: true, required: true },
    ],
    docs: '/Users/babycuca/.codex/integrations/omni_ai_reply.json',
    productionNotes: ['Store key in cloud secret manager before cloud deploy.', 'Verify with mocked send before customer-facing auto-send.'],
  },
  {
    id: 'perplexity',
    title: 'Perplexity · Sonar',
    provider: 'perplexity',
    group: 'research_provider',
    description: 'Web-grounded research provider for reusable content and support workflows.',
    helper: '/Users/babycuca/.codex/bin/perplexity-api',
    verify: { command: '/Users/babycuca/.codex/bin/perplexity-api', args: ['verify'] },
    fields: [
      { id: 'api_key', label: 'Perplexity API key', credentialName: 'Perplexity API Key -OA', envName: 'PERPLEXITY_API_KEY', secret: true, required: true },
    ],
    docs: '/Users/babycuca/.codex/integrations/perplexity_api.json',
    productionNotes: ['Account billing/credits must be active before live use.'],
  },
  {
    id: 'flowaccount',
    title: 'FlowAccount · O-Agent',
    provider: 'flowaccount',
    group: 'finance_provider',
    description: 'Finance/accounting verification path for O-Agent documents and customer/order workflows.',
    helper: '/Users/babycuca/.codex/bin/flowaccount-oa-api',
    verify: { command: '/Users/babycuca/.codex/bin/flowaccount-oa-api', args: ['company-info'] },
    fields: [
      { id: 'client_id', label: 'Client ID', credentialName: 'FlowAccount Client ID -OA', secret: true, required: true },
      { id: 'client_secret', label: 'Client secret', credentialName: 'FlowAccount Client Secret -OA', secret: true, required: true },
      { id: 'support_code', label: 'Support code', credentialName: 'FlowAccount Support Code -OA', secret: true, required: true },
    ],
    docs: '/Users/babycuca/.codex/integrations/flowaccount_oa.json',
    productionNotes: ['Read/verify first. Production writes stay behind approval.'],
  },
  {
    id: 'zort_open_api',
    title: 'ZORT · Open API',
    provider: 'zort',
    group: 'commerce_backend',
    description: 'API-first stock master and order backend for Omni Facebook Order Assist. ใช้เช็กสินค้า สร้างออเดอร์ และตัดสต็อกผ่าน approval guard.',
    helper: '/Users/babycuca/.codex/bin/zort-api',
    verify: { command: '/Users/babycuca/.codex/bin/zort-api', args: ['verify'] },
    fields: [
      { id: 'store_name', label: 'Store name', credentialName: 'ZORT Store Name -OA', envName: 'ZORT_STORE_NAME', secret: false, required: true },
      { id: 'api_key', label: 'API key', credentialName: 'ZORT API Key -OA', envName: 'ZORT_API_KEY', secret: true, required: true },
      { id: 'api_secret', label: 'API secret', credentialName: 'ZORT API Secret -OA', envName: 'ZORT_API_SECRET', secret: true, required: true },
    ],
    docs: '/Users/babycuca/.codex/integrations/zort_api.json',
    endpoints: [
      {
        method: 'GET',
        path: '/Product/GetProducts',
        purpose: 'ค้นสินค้าและอ่าน stock / available stock ตาม SKU',
      },
      {
        method: 'POST',
        path: '/Order/AddOrder',
        purpose: 'สร้าง order จาก Omni พร้อม uniquenumber กันรายการซ้ำ',
      },
      {
        method: 'POST',
        path: '/Product/DecreaseProductStockList',
        purpose: 'ตัดสต็อกจริงหลังแอดมินอนุมัติ',
      },
    ],
    productionNotes: [
      'เปิด Open API ใน ZORT: ตั้งค่า > เชื่อมต่อบริการอื่น > API Reference > เปิดใช้งาน',
      'Read stock ได้อัตโนมัติ แต่ create order / decrease stock ต้องมี approval guard.',
      'ใช้เป็น backend ให้ Omni เท่านั้น ห้ามให้ AI ตัดสต็อกหรือส่งลูกค้าเองโดยไม่มีคนอนุมัติ.',
    ],
  },
]

function compact(value, limit = 360) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

function maskPresence(value) {
  return value ? 'configured' : 'missing'
}

async function readCnapAuth() {
  if (!existsSync(CSNAP_AUTH_FILE)) throw new Error('csnap_auth_missing')
  return readFileSync(CSNAP_AUTH_FILE, 'utf8').trim()
}

async function cSnapRequest(path, options = {}) {
  const token = await readCnapAuth()
  const response = await fetch(`${CSNAP_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `csnap_http_${response.status}`)
  return body
}

async function listCredentials() {
  try {
    const credentials = await cSnapRequest('/api/credentials')
    return { ok: true, credentials: Array.isArray(credentials) ? credentials : [] }
  } catch (error) {
    return { ok: false, credentials: [], error: error.message || 'csnap_unavailable' }
  }
}

function fieldStatus(field, credentials) {
  if (field.readOnly) {
    const exists = field.id === 'local_oauth' ? existsSync('/Users/babycuca/.gemini') : false
    return {
      id: field.id,
      label: field.label,
      credentialName: field.credentialName,
      envName: field.envName || null,
      secret: Boolean(field.secret),
      required: Boolean(field.required),
      readOnly: true,
      status: maskPresence(exists),
      source: exists ? 'local_profile' : 'missing',
    }
  }
  const envPresent = field.envName ? Boolean(process.env[field.envName]) : false
  const cSnapPresent = credentials.some((credential) => credential.name === field.credentialName)
  return {
    id: field.id,
    label: field.label,
    credentialName: field.credentialName,
    envName: field.envName || null,
    secret: Boolean(field.secret),
    required: Boolean(field.required),
    readOnly: false,
    status: maskPresence(envPresent || cSnapPresent),
    source: envPresent ? 'env' : cSnapPresent ? 'c_snap' : 'missing',
  }
}

function summarizeConnection(connection, credentials, cSnapStatus) {
  const fields = connection.fields.map((field) => fieldStatus(field, credentials))
  const missingRequired = fields.filter((field) => field.required && field.status !== 'configured')
  return {
    id: connection.id,
    title: connection.title,
    provider: connection.provider,
    pageProfile: connection.pageProfile || null,
    group: connection.group,
    description: connection.description,
    helper: connection.helper,
    docs: connection.docs,
    endpoints: connection.endpoints || [],
    productionNotes: connection.productionNotes,
    fields,
    cSnap: cSnapStatus,
    status: missingRequired.length ? 'needs_key' : 'ready_to_verify',
    missingRequired: missingRequired.map((field) => field.id),
  }
}

function safeMetaConnection(connectionId) {
  const connection = findConnection(connectionId)
  if (connection.provider !== 'meta' || !connection.pageProfile) throw new Error('meta_connection_required')
  return connection
}

async function runMetaInbox(args) {
  const { stdout } = await execFileAsync(META_INBOX_HELPER, args, {
    env: process.env,
    timeout: Number(process.env.OMNI_META_HELPER_TIMEOUT_MS || 60000),
    maxBuffer: 1024 * 1024 * 8,
  })
  return JSON.parse(stdout)
}

function summarizeConversation(row, pageId) {
  const senders = row.senders?.data || []
  const customer = senders.find((sender) => sender.id !== pageId) || senders[0] || null
  return {
    id: row.id,
    customerName: customer?.name || 'Facebook Customer',
    customerId: customer?.id || null,
    snippet: row.snippet || '',
    updatedTime: row.updated_time || null,
    unreadCount: row.unread_count || 0,
    messageCount: row.message_count || 0,
    link: row.link || null,
  }
}

function summarizeMessage(row, pageId) {
  const fromPage = row.from?.id === pageId
  const target = row.to?.data?.find((item) => item.id !== pageId) || row.to?.data?.[0] || null
  return {
    id: row.id,
    direction: fromPage ? 'outbound' : 'inbound',
    senderId: row.from?.id || null,
    authorName: row.from?.name || (fromPage ? 'Facebook Page' : target?.name || 'Facebook Customer'),
    recipientId: target?.id || null,
    recipientName: target?.name || null,
    text: String(row.message || '').trim(),
    createdTime: row.created_time || null,
  }
}

async function listMetaConversations(connectionId, { limit = 5 } = {}) {
  const connection = safeMetaConnection(connectionId)
  const safeLimit = Math.min(20, Math.max(1, Number(limit) || 5))
  const payload = await runMetaInbox(['list-conversations', `--page=${connection.pageProfile}`, `--limit=${safeLimit}`])
  if (!payload?.ok) throw new Error(payload?.error || 'meta_conversations_failed')
  return {
    ok: true,
    connectionId,
    pageProfile: connection.pageProfile,
    conversations: (payload.response?.data || []).map((row) => summarizeConversation(row, connection.pageId)),
  }
}

async function readMetaThread(connectionId, conversationId, { limit = 20 } = {}) {
  const connection = safeMetaConnection(connectionId)
  if (!conversationId) throw new Error('conversation_id_required')
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20))
  const payload = await runMetaInbox([
    'read-thread',
    `--page=${connection.pageProfile}`,
    `--conversation-id=${conversationId}`,
    `--limit=${safeLimit}`,
  ])
  if (!payload?.ok) throw new Error(payload?.error || 'meta_thread_failed')
  return {
    ok: true,
    connectionId,
    conversationId,
    pageProfile: connection.pageProfile,
    messages: (payload.response?.data || []).map((row) => summarizeMessage(row, connection.pageId)),
  }
}

async function sendMetaReply(connectionId, conversationId, { message = '', approved = false } = {}) {
  const connection = safeMetaConnection(connectionId)
  if (!conversationId) throw new Error('conversation_id_required')
  const text = String(message || '').trim()
  if (!text) throw new Error('message_required')
  if (approved !== true) throw new Error('approval_required')
  const thread = await readMetaThread(connectionId, conversationId, { limit: 20 })
  const latestInbound = thread.messages.find((row) => row.direction === 'inbound' && row.senderId)
  if (!latestInbound?.senderId) throw new Error('recipient_id_not_found')
  const payload = await runMetaInbox([
    'send-reply',
    `--page=${connection.pageProfile}`,
    `--recipient-id=${latestInbound.senderId}`,
    `--message=${text}`,
    '--approved',
  ])
  if (!payload?.ok) throw new Error(payload?.error || 'meta_send_reply_failed')
  return {
    ok: true,
    connectionId,
    conversationId,
    pageProfile: connection.pageProfile,
    recipientId: latestInbound.senderId,
    message: text,
    response: payload.response || payload,
  }
}

function findConnection(connectionId) {
  const connection = CONNECTIONS.find((item) => item.id === connectionId)
  if (!connection) throw new Error('connection_not_found')
  return connection
}

async function verifyConnection(connectionId) {
  const connection = findConnection(connectionId)
  const startedAt = new Date().toISOString()
  try {
    const { stdout } = await execFileAsync(connection.verify.command, connection.verify.args, {
      env: { ...process.env, ...(connection.verify.env || {}) },
      timeout: Number(process.env.OMNI_CONNECTION_VERIFY_TIMEOUT_MS || 60000),
      maxBuffer: 1024 * 1024 * 4,
    })
    let parsed = null
    try { parsed = JSON.parse(stdout) } catch {}
    return {
      ok: Boolean(parsed?.ok ?? true),
      connectionId,
      checkedAt: startedAt,
      status: parsed?.ok === false ? 'failed' : 'healthy',
      provider: parsed?.provider || connection.provider,
      model: parsed?.model || null,
      summary: parsed ? compact(JSON.stringify(parsed)) : compact(stdout),
    }
  } catch (error) {
    return {
      ok: false,
      connectionId,
      checkedAt: startedAt,
      status: 'failed',
      provider: connection.provider,
      model: null,
      summary: compact(error.stdout || error.stderr || error.message || 'verify_failed'),
    }
  }
}

async function saveConnectionSecrets(connectionId, fields = {}) {
  const connection = findConnection(connectionId)
  const credentialList = await cSnapRequest('/api/credentials')
  const saved = []
  for (const field of connection.fields) {
    if (field.readOnly) continue
    const value = String(fields[field.id] || '').trim()
    if (!value) continue
    const existing = credentialList.find((credential) => credential.name === field.credentialName)
    const body = {
      name: field.credentialName,
      type: 'api_key',
      category: 'O-Agent Omni',
      value,
      tags: ['omni', connection.provider, connection.group].filter(Boolean),
      notes: `Managed by Omni Connections. Provider: ${connection.title}. Do not paste into workspace files.`,
    }
    if (existing) {
      await cSnapRequest(`/api/credentials/${encodeURIComponent(existing.id)}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      saved.push({ fieldId: field.id, credentialName: field.credentialName, action: 'updated' })
    } else {
      await cSnapRequest('/api/credentials', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      saved.push({ fieldId: field.id, credentialName: field.credentialName, action: 'created' })
    }
  }
  return { ok: true, connectionId, saved, savedCount: saved.length }
}

export function createConnectionRuntime() {
  return {
    async list() {
      const cSnap = await listCredentials()
      return {
        ok: true,
        cSnap: { ok: cSnap.ok, error: cSnap.error || null },
        connections: CONNECTIONS.map((connection) => summarizeConnection(connection, cSnap.credentials, { ok: cSnap.ok })),
      }
    },
    verify: verifyConnection,
    saveSecrets: saveConnectionSecrets,
    listConversations: listMetaConversations,
    readThread: readMetaThread,
    sendReply: sendMetaReply,
  }
}
