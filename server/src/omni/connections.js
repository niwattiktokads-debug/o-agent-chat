import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const execFileAsync = promisify(execFile)
const CSNAP_BASE_URL = process.env.CSNAP_BASE_URL || 'http://127.0.0.1:9876'
const CSNAP_AUTH_FILE = process.env.CSNAP_AUTH_FILE || ''
const META_INBOX_HELPER = process.env.META_INBOX_HELPER || '/Users/babycuca/.codex/bin/meta-inbox-api'
const INSTAGRAM_MESSAGING_HELPER = process.env.INSTAGRAM_MESSAGING_HELPER || '/Users/babycuca/.codex/bin/instagram-messaging-api'
const LINE_SUDA_OAGENT_HELPER = process.env.LINE_SUDA_OAGENT_HELPER || '/Users/babycuca/.codex/bin/line-suda-oagent'
const TIKTOK_MESSAGING_HELPER = process.env.TIKTOK_MESSAGING_HELPER || '/Users/babycuca/.codex/bin/tiktok-messaging-api'
const OMNI_AI_REPLY_HELPER = process.env.OMNI_AI_REPLY_HELPER || '/Users/babycuca/.codex/bin/omni-ai-reply'
const PERPLEXITY_HELPER = process.env.PERPLEXITY_HELPER || '/Users/babycuca/.codex/bin/perplexity-api'
const FLOWACCOUNT_HELPER = process.env.FLOWACCOUNT_HELPER || '/Users/babycuca/.codex/bin/flowaccount-oa-api'
const ZORT_HELPER = process.env.ZORT_HELPER || '/Users/babycuca/.codex/bin/zort-api'
const GEMINI_PROFILE_PATH = process.env.GEMINI_PROFILE_PATH || join(homedir(), '.gemini')
const CUSTOM_CONNECTIONS_PATH = process.env.OMNI_CUSTOM_CONNECTIONS_PATH || new URL('../../data/custom-connections.json', import.meta.url).pathname

const CONNECTIONS = [
  {
    id: 'meta_anna_lynn',
    title: 'Meta · Anna Lynn',
    provider: 'meta',
    pageProfile: 'anna_lynn',
    pageId: '122106446570001676',
    group: 'customer_channel',
    description: 'Facebook Messenger inbox, webhook, and approved customer replies for Anna Lynn.',
    helper: META_INBOX_HELPER,
    verify: { command: META_INBOX_HELPER, args: ['verify', '--page=anna_lynn'] },
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
    helper: META_INBOX_HELPER,
    verify: { command: META_INBOX_HELPER, args: ['verify', '--page=man_kynd'] },
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
    id: 'social_instagram',
    title: 'Instagram · Social Chat',
    provider: 'instagram',
    group: 'customer_channel',
    description: 'Instagram DM sales channel for chat-to-order workflows. Requires Instagram Professional account linked to Facebook, then channel verify and warehouse/user access mapping.',
    helper: INSTAGRAM_MESSAGING_HELPER,
    verify: { command: INSTAGRAM_MESSAGING_HELPER, args: ['verify'] },
    fields: [
      { id: 'instagram_user_id', label: 'Instagram user ID', credentialName: 'Instagram User ID -OA', secret: false, required: true },
      { id: 'access_token', label: 'Instagram access token', credentialName: 'Instagram Access Token -OA', secret: true, required: true },
    ],
    docs: '/Users/babycuca/.codex/integrations/instagram_messaging_api.json',
    endpoints: [
      {
        method: 'WEBHOOK',
        path: '/webhook/meta/instagram',
        purpose: 'รับ Instagram DM ผ่าน Meta webhook แล้วสร้าง thread ใน Omni',
      },
    ],
    productionNotes: ['Instagram must be linked to Facebook before connection.', 'Map warehouse and allowed users before customer-facing order creation.'],
  },
  {
    id: 'line_suda_oagent',
    title: 'LINE OA · สุดา O-agent',
    provider: 'line_suda_oagent',
    group: 'customer_channel',
    description: 'LINE Official Account สุดา for O-agent group alerts, approval-gated group intake, and per-group /su response rules.',
    helper: LINE_SUDA_OAGENT_HELPER,
    verify: { command: LINE_SUDA_OAGENT_HELPER, args: ['verify'] },
    fields: [
      { id: 'channel_access_token', label: 'Channel access token', credentialName: 'LINE Channel Access Token -EP', secret: true, required: true },
      { id: 'oagent_group_id', label: 'O-agent group ID', credentialName: 'LINE O-agent Winn Group ID -OA', secret: true, required: false },
    ],
    docs: '/Users/babycuca/.codex/integrations/line_suda_oagent_alerts.json',
    endpoints: [
      {
        method: 'WEBHOOK',
        path: '/webhook/line/suda-oagent',
        purpose: 'รับ join/message event จาก LINE OA สุดาเข้า Omni',
      },
      {
        method: 'GET',
        path: '/api/omni/notifications/suda-oagent/group-rules',
        purpose: 'อ่านกฎคำถามและคำตอบตั้งต้นรายกลุ่ม',
      },
    ],
    productionNotes: [
      'ไม่ใช้ n8n เป็น route หลัก',
      'กฎตอบรายกลุ่มเก็บใน Omni staging และใช้เป็น context ของ /su',
      'helper ห้ามส่งข้อความทุกชนิดเข้ากลุ่มจนกว่าตั้งครบ หน้าที่/รูปแบบคำถาม/รูปแบบตอบ/กฎตอบ',
      'การส่งข้อความเข้ากลุ่มใช้ LINE Push API ในนามสุดา',
    ],
  },
  {
    id: 'line_oa',
    title: 'LINE OA · Chat + Order',
    provider: 'line_oa',
    group: 'customer_channel',
    description: 'LINE Official Account chat channel for replying, creating orders, and sending order/payment summaries from one screen.',
    helper: 'runtime gap: add line-oa-api helper using LINE Messaging API',
    verify: null,
    fields: [
      { id: 'channel_id', label: 'Channel ID', credentialName: 'LINE OA Channel ID -OA', secret: false, required: true },
      { id: 'channel_secret', label: 'Channel secret', credentialName: 'LINE OA Channel Secret -OA', secret: true, required: true },
      { id: 'channel_access_token', label: 'Channel access token', credentialName: 'LINE OA Channel Access Token -OA', secret: true, required: true },
    ],
    docs: 'https://zortout.com/docs/lineoa-system-guide',
    endpoints: [
      {
        method: 'WEBHOOK',
        path: '/webhook/line/oa',
        purpose: 'รับข้อความ LINE OA เข้า Omni inbox และ route ไป order/payment guard',
      },
    ],
    productionNotes: ['LINE OA must enable Messaging API, chat, webhook, and manual chat mode.', 'Reply cost follows LINE OA message quota/broadcast rules.'],
  },
  {
    id: 'line_shopping_myshop',
    title: 'LINE Shopping · MyShop',
    provider: 'line_shopping',
    group: 'marketplace_channel',
    description: 'LINE Shopping/MyShop order and stock bridge so Omni can sync marketplace orders into one stock source.',
    helper: 'runtime gap: add line-shopping helper when LINE MyShop API access is approved',
    verify: null,
    fields: [
      { id: 'shop_id', label: 'LINE Shopping shop ID', credentialName: 'LINE Shopping Shop ID -OA', secret: false, required: true },
      { id: 'access_token', label: 'LINE Shopping access token', credentialName: 'LINE Shopping Access Token -OA', secret: true, required: true },
    ],
    docs: 'https://zortout.com/docs/zort-social-chat',
    endpoints: [
      {
        method: 'SYNC',
        path: '/api/omni/marketplaces/line-shopping/orders',
        purpose: 'ดึงออเดอร์ LINE Shopping และ sync stock กับ ZORT stock master',
      },
    ],
    productionNotes: ['Use ZORT as stock master before enabling automatic stock deduction.', 'Order import is read-only until approval guard is wired.'],
  },
  {
    id: 'tiktok_sale_page',
    title: 'TikTok · Sale Page Tracking',
    provider: 'tiktok_sale_page',
    group: 'marketplace_channel',
    description: 'TikTok sale page tracking lane for campaign attribution, order source mapping, and future TikTok Shop/Business Messaging bridge.',
    helper: TIKTOK_MESSAGING_HELPER,
    verify: { command: TIKTOK_MESSAGING_HELPER, args: ['verify'] },
    fields: [
      { id: 'app_id', label: 'TikTok Business app ID', credentialName: 'TikTok Business App ID -OA', secret: false, required: true },
      { id: 'app_secret', label: 'TikTok Business app secret', credentialName: 'TikTok Business App Secret -OA', secret: true, required: true },
      { id: 'access_token', label: 'TikTok Business access token', credentialName: 'TikTok Business Messaging Access Token -OA', secret: true, required: true },
    ],
    docs: '/Users/babycuca/.codex/integrations/tiktok_business_messaging.json',
    endpoints: [
      {
        method: 'WEBHOOK',
        path: '/webhook/tiktok/business-messaging',
        purpose: 'รับ TikTok message/order signal เข้า Omni และผูกกับ campaign/source tracking',
      },
    ],
    productionNotes: ['Business Messaging/OAuth approval is required before live use.', 'Keep sale-page tracking separate from auto-send until smoke tests pass.'],
  },
  {
    id: 'facebook_post_cf',
    title: 'Facebook Post CF · Auto Order',
    provider: 'facebook_post_cf',
    group: 'social_automation',
    description: 'Facebook post CF automation lane: watch connected posts, map CF keywords to products, create guarded orders, and send summary links back through chat.',
    helper: 'runtime gap: extend meta-inbox-api with post comment CF parser',
    verify: null,
    fields: [
      { id: 'page_token', label: 'Facebook page token', credentialName: 'FB Anna Lynn Page Token -OA', secret: true, required: true },
      { id: 'cf_keyword_rule', label: 'Default CF keyword rule', credentialName: 'FB Post CF Rule -OA', secret: false, required: false },
    ],
    docs: 'https://zortout.com/docs/how-to-create-postsocialchat',
    endpoints: [
      {
        method: 'WEBHOOK',
        path: '/webhook/meta/comments',
        purpose: 'ดึงคอมเมนต์ CF ใต้โพสต์มาเข้าคิวสร้าง order แบบมี approval guard',
      },
    ],
    productionNotes: ['Do not connect a live post until products, CF codes, quantity, gifts, and stop/end states are configured.', 'Customer summary/payment links remain approval-gated.'],
  },
  {
    id: 'facebook_live_cf',
    title: 'Facebook Live CF · Realtime Order',
    provider: 'facebook_live_cf',
    group: 'social_automation',
    description: 'Facebook Live CF lane for realtime comment capture, CF code matching, stock reservation, and post-live continuation planning.',
    helper: 'runtime gap: extend meta-inbox-api with live comment CF stream',
    verify: null,
    fields: [
      { id: 'page_token', label: 'Facebook page token', credentialName: 'FB Anna Lynn Page Token -OA', secret: true, required: true },
      { id: 'live_cf_rule', label: 'Default live CF rule', credentialName: 'FB Live CF Rule -OA', secret: false, required: false },
    ],
    docs: 'https://zortout.com/docs/how-to-create-livesocialchat',
    endpoints: [
      {
        method: 'STREAM',
        path: '/webhook/meta/live-comments',
        purpose: 'รับ CF ระหว่างไลฟ์แบบ realtime แล้วสร้าง order draft/stock hold',
      },
    ],
    productionNotes: ['Support post-live selling as a separate post/order lane.', 'Realtime auto-order must stay behind stock and payment approval guards.'],
  },
  {
    id: 'social_message_report',
    title: 'Social Message Report',
    provider: 'social_report',
    group: 'social_automation',
    description: 'Message-volume analytics lane for tracking admin replies by date/channel and exporting operational review data.',
    helper: 'runtime gap: aggregate Omni outbound messages by channel/user/date',
    verify: null,
    fields: [
      { id: 'export_sink', label: 'Report export sink', credentialName: 'Omni Social Message Report Sink -OA', secret: false, required: false },
    ],
    docs: 'https://zortout.com/docs/how-to-view-message-volume-reports',
    endpoints: [
      {
        method: 'GET',
        path: '/api/omni/reports/message-volume',
        purpose: 'สรุปจำนวนข้อความตอบกลับตามช่วงเวลา ช่องทาง และผู้ใช้งาน',
      },
    ],
    productionNotes: ['Count only messages sent through Omni for auditability.', 'Export must not expose full customer message bodies by default.'],
  },
  {
    id: 'omni_ai_gemini',
    title: 'AI Reply · Gemini CLI',
    provider: 'gemini_cli',
    group: 'ai_provider',
    description: 'Local AI reply provider through Google Code Assist OAuth. Best current local path.',
    helper: OMNI_AI_REPLY_HELPER,
    verify: {
      command: OMNI_AI_REPLY_HELPER,
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
    helper: OMNI_AI_REPLY_HELPER,
    verify: { command: OMNI_AI_REPLY_HELPER, args: ['verify'], env: { OMNI_AI_PROVIDER: 'openai' } },
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
    helper: PERPLEXITY_HELPER,
    verify: { command: PERPLEXITY_HELPER, args: ['verify'] },
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
    helper: FLOWACCOUNT_HELPER,
    verify: { command: FLOWACCOUNT_HELPER, args: ['company-info'] },
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
    helper: ZORT_HELPER,
    verify: { command: ZORT_HELPER, args: ['verify'] },
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

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
}

function safeString(value, limit = 240) {
  return String(value || '').trim().slice(0, limit)
}

function readCustomConnections() {
  if (!existsSync(CUSTOM_CONNECTIONS_PATH)) return []
  try {
    const parsed = JSON.parse(readFileSync(CUSTOM_CONNECTIONS_PATH, 'utf8'))
    return Array.isArray(parsed?.connections) ? parsed.connections : []
  } catch {
    return []
  }
}

function writeCustomConnections(connections) {
  mkdirSync(dirname(CUSTOM_CONNECTIONS_PATH), { recursive: true })
  writeFileSync(CUSTOM_CONNECTIONS_PATH, `${JSON.stringify({ connections }, null, 2)}\n`)
}

function connectionGovernanceState(connection = {}) {
  if (connection.governanceState) return connection.governanceState
  if (connection.deletedAt) return 'deleted'
  if (connection.archivedAt) return 'archived'
  if (connection.disabledAt) return 'disabled'
  if (connection.clearedAt) return 'cleared'
  return 'active'
}

function allConnections() {
  return [...CONNECTIONS, ...readCustomConnections()].filter((connection) => connectionGovernanceState(connection) !== 'deleted')
}

function normalizeCustomConnection(input = {}) {
  const title = safeString(input.title, 80)
  const provider = slugify(input.provider)
  if (!title) throw new Error('connection_title_required')
  if (!provider) throw new Error('connection_provider_required')
  const group = slugify(input.group) || 'custom_provider'
  const idBase = slugify(input.id || `${provider}_${title}`) || `custom_${Date.now()}`
  const credentialName = safeString(input.credentialName, 120)
  return {
    id: idBase.startsWith('custom_') ? idBase : `custom_${idBase}`,
    title,
    provider,
    group,
    description: safeString(input.description, 240) || 'Custom connection option. Add credentials and runtime helper when ready.',
    helper: safeString(input.helper, 180) || 'manual setup',
    verify: null,
    fields: credentialName ? [{
      id: 'credential',
      label: 'Credential',
      credentialName,
      secret: true,
      required: false,
    }] : [],
    docs: safeString(input.docs, 180) || null,
    endpoints: [],
    productionNotes: ['Custom option. Add a reusable helper/manifest before production automation.'],
    custom: true,
    canDelete: true,
  }
}

function maskPresence(value) {
  return value ? 'configured' : 'missing'
}

async function readCnapAuth() {
  if (!CSNAP_AUTH_FILE) throw new Error('csnap_auth_file_not_configured')
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
    const exists = field.id === 'local_oauth' && GEMINI_PROFILE_PATH ? existsSync(GEMINI_PROFILE_PATH) : false
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
  const governanceState = connectionGovernanceState(connection)
  const status = governanceState === 'disabled'
    ? 'disabled'
    : governanceState === 'archived'
      ? 'archived'
      : governanceState === 'cleared'
        ? 'cleared'
        : missingRequired.length
          ? 'needs_key'
          : 'ready_to_verify'
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
    custom: Boolean(connection.custom),
    canDelete: Boolean(connection.canDelete),
    governanceState,
    fields,
    cSnap: cSnapStatus,
    status,
    missingRequired: missingRequired.map((field) => field.id),
  }
}

function safeMetaConnection(connectionId) {
  const connection = findConnection(connectionId)
  if (connection.provider !== 'meta' || !connection.pageProfile) throw new Error('meta_connection_required')
  return connection
}

function safeInstagramConnection(connectionId) {
  const connection = findConnection(connectionId)
  if (connection.provider !== 'instagram') throw new Error('instagram_connection_required')
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

async function runInstagramMessaging(args) {
  const { stdout } = await execFileAsync(INSTAGRAM_MESSAGING_HELPER, args, {
    env: process.env,
    timeout: Number(process.env.OMNI_INSTAGRAM_HELPER_TIMEOUT_MS || 60000),
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

function summarizeInstagramConversation(row, ownUsername = '') {
  const participants = row.participants?.data || []
  const customer = participants.find((item) => item.username && item.username !== ownUsername) || participants[0] || null
  return {
    id: row.id,
    customerName: customer?.username || 'Instagram Customer',
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

function summarizeInstagramMessage(row, ownUsername = '') {
  const fromUsername = row.from?.username || row.from?.name || ''
  const fromSelf = ownUsername && fromUsername === ownUsername
  const target = row.to?.data?.find((item) => item.username !== ownUsername) || row.to?.data?.[0] || null
  return {
    id: row.id,
    direction: fromSelf ? 'outbound' : 'inbound',
    senderId: row.from?.id || null,
    authorName: fromUsername || (fromSelf ? 'Instagram Account' : 'Instagram Customer'),
    recipientId: target?.id || null,
    recipientName: target?.username || target?.name || null,
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

async function listInstagramConversations(connectionId, { limit = 5 } = {}) {
  safeInstagramConnection(connectionId)
  const safeLimit = Math.min(20, Math.max(1, Number(limit) || 5))
  const [account, payload] = await Promise.all([
    runInstagramMessaging(['verify']).catch(() => null),
    runInstagramMessaging(['list-conversations', `--limit=${safeLimit}`]),
  ])
  if (!payload?.ok) throw new Error(payload?.error || payload?.reason || 'instagram_conversations_failed')
  const ownUsername = account?.account?.username || ''
  return {
    ok: true,
    connectionId,
    pageProfile: 'instagram',
    conversations: (payload.response?.data || []).map((row) => summarizeInstagramConversation(row, ownUsername)),
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

async function readInstagramThread(connectionId, conversationId, { limit = 20 } = {}) {
  safeInstagramConnection(connectionId)
  if (!conversationId) throw new Error('conversation_id_required')
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20))
  const [account, payload] = await Promise.all([
    runInstagramMessaging(['verify']).catch(() => null),
    runInstagramMessaging(['read-thread', `--conversation-id=${conversationId}`, `--limit=${safeLimit}`]),
  ])
  if (!payload?.ok) throw new Error(payload?.error || payload?.reason || 'instagram_thread_failed')
  const ownUsername = account?.account?.username || ''
  return {
    ok: true,
    connectionId,
    conversationId,
    pageProfile: 'instagram',
    messages: (payload.response?.messages?.data || []).map((row) => summarizeInstagramMessage(row, ownUsername)),
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

async function sendInstagramReply(connectionId, conversationId, { message = '', approved = false } = {}) {
  safeInstagramConnection(connectionId)
  if (!conversationId) throw new Error('conversation_id_required')
  const text = String(message || '').trim()
  if (!text) throw new Error('message_required')
  if (approved !== true) throw new Error('approval_required')
  const thread = await readInstagramThread(connectionId, conversationId, { limit: 20 })
  const latestInbound = thread.messages.find((row) => row.direction === 'inbound' && row.senderId)
  if (!latestInbound?.senderId) throw new Error('recipient_id_not_found')
  const payload = await runInstagramMessaging([
    'send-reply',
    `--recipient-id=${latestInbound.senderId}`,
    `--message=${text}`,
    '--approved',
  ])
  if (!payload?.ok) throw new Error(payload?.error || payload?.reason || 'instagram_send_reply_failed')
  return {
    ok: true,
    connectionId,
    conversationId,
    pageProfile: 'instagram',
    recipientId: latestInbound.senderId,
    message: text,
    response: payload.response || payload,
  }
}

function findConnection(connectionId) {
  const connection = allConnections().find((item) => item.id === connectionId)
  if (!connection) throw new Error('connection_not_found')
  return connection
}

async function verifyConnection(connectionId) {
  const connection = findConnection(connectionId)
  const startedAt = new Date().toISOString()
  if (!connection.verify?.command) {
    return {
      ok: false,
      connectionId,
      checkedAt: startedAt,
      status: 'runtime_gap',
      provider: connection.provider,
      model: null,
      summary: 'manual custom option: add helper/manifest before automated verify',
    }
  }
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

async function addConnection(input = {}) {
  const customConnections = readCustomConnections()
  const connection = normalizeCustomConnection(input)
  const existingIds = new Set([...CONNECTIONS, ...customConnections].map((item) => item.id))
  let candidate = connection.id
  let suffix = 2
  while (existingIds.has(candidate)) {
    candidate = `${connection.id}_${suffix}`
    suffix += 1
  }
  const nextConnection = { ...connection, id: candidate }
  writeCustomConnections([...customConnections, nextConnection])
  return { ok: true, connection: nextConnection }
}

async function removeConnection(connectionId) {
  return governConnection(connectionId, { action: 'delete', actorId: 'boss' })
}

async function governConnection(connectionId, { action, actorId = 'boss', reason = '' } = {}) {
  if (!['archive', 'disable', 'clear', 'delete'].includes(action)) throw new Error('governance_action_invalid')
  const customConnections = readCustomConnections()
  const rowIndex = customConnections.findIndex((item) => item.id === connectionId)
  if (rowIndex < 0) {
    if (CONNECTIONS.some((item) => item.id === connectionId)) throw new Error('system_connection_locked')
    throw new Error('connection_not_found')
  }
  const connection = customConnections[rowIndex]
  const before = structuredClone(connection)
  const now = new Date().toISOString()
  const nextState = action === 'delete'
    ? 'deleted'
    : action === 'archive'
      ? 'archived'
      : action === 'disable'
        ? 'disabled'
        : 'cleared'
  const clearedPatch = action === 'clear'
    ? {
        description: 'Cleared in branch/test governance flow.',
        helper: 'manual setup',
        docs: null,
        endpoints: [],
        fields: [],
        productionNotes: ['Cleared in branch/test governance flow.'],
      }
    : {}
  const after = {
    ...connection,
    ...clearedPatch,
    governanceState: nextState,
    governanceReason: reason || null,
    governanceUpdatedAt: now,
    governanceUpdatedBy: actorId,
  }
  if (action === 'archive') {
    after.archivedAt = now
    after.archivedBy = actorId
  }
  if (action === 'disable') {
    after.disabledAt = now
    after.disabledBy = actorId
  }
  if (action === 'delete') {
    after.deletedAt = now
    after.deletedBy = actorId
  }
  if (action === 'clear') {
    after.clearedAt = now
    after.clearedBy = actorId
  }
  const nextConnections = customConnections.slice()
  nextConnections[rowIndex] = after
  writeCustomConnections(nextConnections)
  return {
    ok: true,
    action,
    removedId: action === 'delete' ? connectionId : null,
    connection: after,
    before,
  }
}

export function createConnectionRuntime() {
  return {
    async list() {
      const cSnap = await listCredentials()
      return {
        ok: true,
        cSnap: { ok: cSnap.ok, error: cSnap.error || null },
        connections: allConnections().map((connection) => summarizeConnection(connection, cSnap.credentials, { ok: cSnap.ok })),
      }
    },
    add: addConnection,
    remove: removeConnection,
    govern: governConnection,
    verify: verifyConnection,
    saveSecrets: saveConnectionSecrets,
    async listConversations(connectionId, options) {
      const connection = findConnection(connectionId)
      if (connection.provider === 'instagram') return listInstagramConversations(connectionId, options)
      return listMetaConversations(connectionId, options)
    },
    async readThread(connectionId, conversationId, options) {
      const connection = findConnection(connectionId)
      if (connection.provider === 'instagram') return readInstagramThread(connectionId, conversationId, options)
      return readMetaThread(connectionId, conversationId, options)
    },
    async sendReply(connectionId, conversationId, options) {
      const connection = findConnection(connectionId)
      if (connection.provider === 'instagram') return sendInstagramReply(connectionId, conversationId, options)
      return sendMetaReply(connectionId, conversationId, options)
    },
  }
}
