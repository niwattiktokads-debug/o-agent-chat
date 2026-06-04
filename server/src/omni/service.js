import { createOmniSeed } from './seed.js'
import { DEFAULT_CHAT_RETENTION_POLICY, normalizeRetentionPolicy, planChatRetentionCleanup } from './retention.js'
import { extractThaiOrderAddress } from './orderAddressIntake.js'
import { normalizeStoredShippingAddress, validateThaiShippingAddress } from './thaiAddress.js'
import { DEFAULT_WORKSPACE_ID, backfillWorkspaceId, filterByWorkspace, normalizeWorkspace, buildWorkspaceSummary, resolveWorkspaceId } from './workspace.js'

function resolveOptions(input) {
  if (input?.store || input?.seed) return { seed: input.seed || createOmniSeed(), store: input.store || null }
  return { seed: input || createOmniSeed(), store: null }
}

const KNOWLEDGE_TYPES = new Set(['manual', 'website', 'file', 'faq', 'order_policy'])
const KNOWLEDGE_STATUSES = new Set(['ready', 'training', 'needs_review', 'archived'])
const PAYMENT_PROVIDERS = new Set(['meta_pay_kgp', 'promptpay'])
const PAYMENT_STATUSES = new Set(['draft', 'pending', 'paid', 'failed', 'expired', 'manual_verify', 'cancelled'])
const MAX_DRAFT_ATTACHMENTS = 5
const MAX_DRAFT_ATTACHMENT_BYTES = 5 * 1024 * 1024
const DEFAULT_OMNI_SETTINGS = {
  postSession: { enabled: true, autoCreateDrafts: true },
  postCf: { enabled: true, autoCreateDrafts: true },
  liveCf: { enabled: true, mode: 'fallback_post_comment_capture' },
  report: { timezone: 'Asia/Bangkok' },
  orderDraft: { enabled: true, approvalRequired: true, createZortOrderOnApprove: true },
  orderAddressIntake: { enabled: true, createConfirmationDraft: true },
  ai: { enabled: true, customerSendEnabled: false },
}

function deepMerge(base, patch) {
  const output = structuredClone(base || {})
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = deepMerge(output[key] || {}, value)
    } else {
      output[key] = value
    }
  }
  return output
}

function normalizeSettingsAliases(settings = {}) {
  const output = structuredClone(settings || {})
  if (output.postSession || output.postCf) {
    const postSession = deepMerge(output.postCf || {}, output.postSession || {})
    output.postSession = postSession
    output.postCf = postSession
  }
  return output
}

function getTimeZoneParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
}

function timeZoneOffsetMs(date, timeZone) {
  try {
    const parts = getTimeZoneParts(date, timeZone)
    const zonedAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
      date.getUTCMilliseconds(),
    )
    return zonedAsUtc - date.getTime()
  } catch {
    return 0
  }
}

function hourInTimeZone(date, timeZone) {
  try {
    return Number(getTimeZoneParts(date, timeZone).hour)
  } catch {
    return date.getUTCHours()
  }
}

function normalizeDateBoundary(value, fallback, endOfDay = false, timeZone = 'UTC') {
  if (!value) return fallback
  const text = String(value)
  let date
  if (text.length <= 10) {
    const [year, month, day] = text.split('-').map(Number)
    const utcGuess = new Date(Date.UTC(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0))
    date = new Date(utcGuess.getTime() - timeZoneOffsetMs(utcGuess, timeZone))
  } else {
    date = new Date(text)
  }
  return Number.isNaN(date.getTime()) ? fallback : date
}

function createActionAuditRow({
  id,
  threadId = null,
  workspaceId = null,
  action,
  actorType,
  actorId = null,
  before = null,
  after = null,
  approvalTaskId = null,
  sourceRef = null,
  createdAt,
}) {
  const now = createdAt || new Date().toISOString()
  return {
    id: id || `audit_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    threadId,
    workspaceId: workspaceId || null,
    action,
    actorType,
    actorId,
    beforeJson: before,
    afterJson: after,
    approvalTaskId,
    sourceRef,
    createdAt: now,
  }
}

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

  const workspaceId = String(input.workspaceId || '').trim() || DEFAULT_WORKSPACE_ID

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
      workspaceId,
      sourceRef: input.sourceRef || null,
      createdAt: input.createdAt || now,
      updatedAt: now,
    },
  }
}

function normalizeDraftAttachments(input = []) {
  if (!Array.isArray(input)) return { ok: false, error: 'attachments_must_be_array' }
  if (input.length > MAX_DRAFT_ATTACHMENTS) return { ok: false, error: 'too_many_attachments' }

  const attachments = []
  for (const item of input) {
    const type = String(item?.type || '').trim()
    const dataUrl = String(item?.dataUrl || '').trim()
    const url = String(item?.url || item?.imageUrl || '').trim()
    if (!type.startsWith('image/')) return { ok: false, error: 'attachment_must_be_image' }
    if (!dataUrl.startsWith('data:image/') && !/^https?:\/\//i.test(url)) return { ok: false, error: 'attachment_image_source_required' }
    const size = Number(item?.size || 0)
    if (!Number.isFinite(size) || size < 0 || size > MAX_DRAFT_ATTACHMENT_BYTES) return { ok: false, error: 'attachment_too_large' }
    attachments.push({
      id: item.id || `att_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      name: String(item.name || 'image').slice(0, 120),
      type,
      size,
      dataUrl,
      url,
    })
  }

  return { ok: true, attachments }
}

function normalizePaymentRequest(input = {}, snapshot = {}) {
  const provider = String(input.provider || '').trim()
  if (!PAYMENT_PROVIDERS.has(provider)) return { ok: false, error: 'unsupported_payment_provider' }

  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'payment_amount_required' }

  const threadId = String(input.threadId || '').trim()
  if (threadId && !(snapshot.threads || []).some((thread) => thread.id === threadId)) {
    return { ok: false, error: 'thread_not_found' }
  }

  const orderId = String(input.orderId || '').trim()
  if (orderId && !(snapshot.orders || []).some((order) => order.id === orderId)) {
    return { ok: false, error: 'order_not_found' }
  }

  const now = new Date().toISOString()
  const status = PAYMENT_STATUSES.has(input.status) ? input.status : 'draft'
  const id = input.id || `pay_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
  const providerRef = input.providerRef || (provider === 'meta_pay_kgp' ? `kgp_draft_${id}` : null)

  return {
    ok: true,
    row: {
      id,
      threadId: threadId || null,
      orderId: orderId || null,
      provider,
      status,
      amount,
      currency: String(input.currency || 'THB').trim() || 'THB',
      approvalRequired: true,
      providerRef,
      sourceRef: input.sourceRef || `omni:${provider}`,
      expiresAt: input.expiresAt || null,
      createdAt: input.createdAt || now,
      updatedAt: now,
    },
    event: {
      id: input.eventId || `pay_event_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      paymentRequestId: id,
      type: 'created',
      source: provider,
      sourceRef: input.sourceRef || `omni:${provider}`,
      createdAt: now,
    },
  }
}

function normalizeOrderDraftItem(item = {}) {
  const sku = String(item.sku || '').trim()
  const name = String(item.name || sku || 'สินค้า').trim()
  const quantity = Number(item.quantity || 1)
  const unitPrice = Number(item.unitPrice ?? item.sellPrice ?? item.price ?? 0)
  if (!sku && !item.zortProductId) return { ok: false, error: 'order_item_sku_required' }
  if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, error: 'order_item_quantity_required' }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return { ok: false, error: 'order_item_price_invalid' }
  return {
    ok: true,
    item: {
      sku,
      name,
      quantity,
      unitPrice,
      zortProductId: item.zortProductId || item.zortProduct?.id || null,
      zortProduct: item.zortProduct || null,
      sourceCommentId: item.sourceCommentId || null,
    },
  }
}

function createOrderDraftRow(input = {}, snapshot = {}) {
  const items = []
  for (const item of input.items || []) {
    const normalized = normalizeOrderDraftItem(item)
    if (!normalized.ok) return normalized
    items.push(normalized.item)
  }
  if (!items.length) return { ok: false, error: 'order_items_required' }

  const threadId = String(input.threadId || '').trim()
  const thread = threadId ? (snapshot.threads || []).find((item) => item.id === threadId) : null
  if (threadId && !thread) return { ok: false, error: 'thread_not_found' }
  const customerId = input.customerId || thread?.customerId || input.customer?.id || null
  const customer = customerId ? (snapshot.customers || []).find((item) => item.id === customerId) || input.customer || null : input.customer || null
  const shippingAddress = normalizeStoredShippingAddress({
    ...(input.shippingAddress || {}),
    recipientName: input.shippingAddress?.recipientName || input.shippingName || input.customerName || customer?.displayName,
    recipientPhone: input.shippingAddress?.recipientPhone || input.shippingPhone || input.customerPhone || customer?.phone,
  })
  const now = new Date().toISOString()
  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  // Derive workspaceId: explicit input > thread's page workspace > pageId lookup > null
  const derivedWorkspaceId = input.workspaceId
    || (thread ? ((snapshot.pages || []).find((p) => p.id === thread.pageId)?.workspaceId || null) : null)
    || (input.pageId ? ((snapshot.pages || []).find((p) => p.id === input.pageId)?.workspaceId || null) : null)
    || null
  return {
    ok: true,
    row: {
      id: input.id || `order_draft_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      customerId,
      customerName: input.customerName || customer?.displayName || shippingAddress.recipientName || 'Omni Customer',
      customerPhone: input.customerPhone || customer?.phone || shippingAddress.recipientPhone || '',
      customerEmail: customer?.email || input.customerEmail || '',
      platform: input.platform || thread?.platform || 'omni',
      providerOrderId: null,
      status: 'draft',
      approvalRequired: true,
      approvalStatus: 'pending',
      items,
      totalAmount,
      currency: input.currency || 'THB',
      shippingMethod: input.shippingMethod || 'ไปรษณีย์ไทย',
      shippingAddress,
      paymentMethod: input.paymentMethod || 'bank_transfer',
      workspaceId: derivedWorkspaceId,
      sourceRef: input.sourceRef || 'omni_order_draft',
      sourceCommentId: input.sourceCommentId || null,
      sourcePostId: input.sourcePostId || null,
      createdAt: input.createdAt || now,
      updatedAt: now,
    },
    threadId,
  }
}

async function validateOrderReadyForZort(order = {}) {
  const missingFields = []
  if (!order.customerName) missingFields.push('customerName')
  if (!order.customerPhone) missingFields.push('customerPhone')
  if (!Array.isArray(order.items) || order.items.length === 0) missingFields.push('items')
  for (const item of order.items || []) {
    if (!item.sku) missingFields.push('items.sku')
    if (!item.zortProductId && !item.zortProduct?.id) missingFields.push(`items.${item.sku || 'unknown'}.zortProductId`)
  }
  if (missingFields.length) return { ok: false, error: 'zort_order_missing_required_data', missingFields }

  const address = await validateThaiShippingAddress({
    ...(order.shippingAddress || {}),
    recipientName: order.shippingAddress?.recipientName || order.customerName,
    recipientPhone: order.shippingAddress?.recipientPhone || order.customerPhone,
  })
  if (!address.ok) return address
  return { ok: true, shippingAddress: address.address }
}

function isFacebookSnippetPreview(message) {
  return (
    String(message.id || '').startsWith('fb_preview_') ||
    String(message.providerMessageId || '').endsWith(':snippet') ||
    String(message.sourceRef || '').startsWith('meta_conversation:')
  )
}

function normalizeFacebookWebhookSync(snapshot, normalized) {
  const messagesByThreadId = new Map()
  for (const message of normalized.messages || []) {
    const rows = messagesByThreadId.get(message.threadId) || []
    rows.push(message)
    messagesByThreadId.set(message.threadId, rows)
  }

  const remappedThreadIds = new Map()
  const threads = (normalized.threads || []).map((thread) => {
    const isFbComment = ['facebook_comment', 'facebook_video_comment'].includes(thread.platform)
    const existing = (snapshot.threads || []).find((candidate) => (
      (isFbComment
        ? ['facebook_comment', 'facebook_video_comment'].includes(candidate.platform)
        : candidate.platform === 'facebook') &&
      candidate.pageId === thread.pageId &&
      candidate.customerId === thread.customerId &&
      candidate.id !== thread.id &&
      (isFbComment || !String(candidate.id || '').startsWith('fb_webhook_'))
    ))
    if (!existing) return thread

    remappedThreadIds.set(thread.id, existing.id)
    const threadMessages = messagesByThreadId.get(thread.id) || []
    const inboundCount = threadMessages.filter((message) => message.direction === 'inbound').length
    return {
      ...existing,
      status: 'open',
      unreadCount: (existing.unreadCount || 0) + inboundCount,
      messageCount: (existing.messageCount || 0) + threadMessages.length,
      updatedAt: thread.updatedAt || existing.updatedAt,
      originContext: {
        ...(existing.originContext || {}),
        ...(thread.originContext || {}),
      },
    }
  })

  const messages = (normalized.messages || []).map((message) => ({
    ...message,
    threadId: remappedThreadIds.get(message.threadId) || message.threadId,
  }))

  return { ...normalized, threads, messages }
}

function pageRuntimeSettingFor(snapshot, pageId) {
  const setting = (snapshot.pageRuntimeSettings || []).find((item) => item.pageId === pageId)
  return {
    pageId,
    autoReplyEnabled: setting?.autoReplyEnabled !== false,
    updatedAt: setting?.updatedAt || null,
    updatedBy: setting?.updatedBy || null,
  }
}

function withPageRuntimeSettings(snapshot) {
  const next = structuredClone(snapshot)
  next.pageRuntimeSettings = (next.pages || []).map((page) => pageRuntimeSettingFor(snapshot, page.id))
  next.pages = (next.pages || []).map((page) => {
    const runtime = pageRuntimeSettingFor(snapshot, page.id)
    return {
      ...page,
      autoReplyEnabled: runtime.autoReplyEnabled,
      runtimeSettings: runtime,
    }
  })
  return next
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

  function replace(collectionName, rows) {
    if (store) return store.replace(collectionName, rows)
    data[collectionName] = structuredClone(rows || [])
  }

  function getPolicyForThread(thread) {
    const snapshot = currentData()
    const page = snapshot.pages.find((item) => item.id === thread.pageId)
    return snapshot.policySets.find((item) => item.id === page?.policySetId)
  }

  return {
    snapshot() {
      return withPageRuntimeSettings(currentData())
    },
    listWorkspaces() {
      return (currentData().workspaces || []).map((ws) => structuredClone(ws))
    },
    getWorkspace(workspaceId) {
      const id = String(workspaceId || '').trim()
      if (!id) return null
      const snapshot = currentData()
      const ws = (snapshot.workspaces || []).find((item) => item.id === id)
      if (!ws) return null
      return buildWorkspaceSummary(ws, snapshot)
    },
    upsertWorkspace(input = {}) {
      const normalized = normalizeWorkspace(input)
      if (!normalized.ok) return normalized
      const result = upsert('workspaces', [normalized.workspace])
      return { ok: true, result, workspace: structuredClone(normalized.workspace), snapshot: this.snapshot() }
    },
    listPages(options = {}) {
      const allPages = withPageRuntimeSettings(currentData()).pages
      return filterByWorkspace(allPages, options.workspaceId)
    },
    getSettings(options = {}) {
      const workspaceId = String(options.workspaceId || '').trim()
      const rows = currentData().omniSettings || []
      const row = workspaceId
        ? rows.find((item) => item.id === `workspace:${workspaceId}`)
          || rows.find((item) => item.workspaceId === workspaceId)
        : rows.find((item) => item.id === 'default')
      return normalizeSettingsAliases(deepMerge(DEFAULT_OMNI_SETTINGS, normalizeSettingsAliases(row?.settings || {})))
    },
    updateSettings({ workspaceId, settings = {}, updatedBy = 'boss' } = {}) {
      const id = String(workspaceId || '').trim()
      const before = this.getSettings(id ? { workspaceId: id } : {})
      const nextSettings = normalizeSettingsAliases(deepMerge(before, normalizeSettingsAliases(settings)))
      const row = {
        id: id ? `workspace:${id}` : 'default',
        ...(id ? { workspaceId: id } : {}),
        settings: nextSettings,
        updatedAt: new Date().toISOString(),
        updatedBy: String(updatedBy || 'boss'),
      }
      const result = upsert('omniSettings', [row])
      const audit = createActionAuditRow({
        action: 'omni_settings_updated',
        workspaceId: id || null,
        actorType: 'human',
        actorId: row.updatedBy,
        before,
        after: nextSettings,
        sourceRef: id ? `omni_settings:workspace:${id}` : 'omni_settings:default',
      })
      const auditResult = upsert('actionAudits', [audit])
      return { ok: true, result: { omniSettings: result, actionAudits: auditResult }, settings: structuredClone(nextSettings), audit, snapshot: this.snapshot() }
    },
    updatePolicyAutoSend({ policySetId, autoSend = {}, updatedBy = 'boss' } = {}) {
      const id = String(policySetId || '').trim()
      if (!id) return { ok: false, error: 'policy_set_id_required' }
      const snapshot = currentData()
      const policy = (snapshot.policySets || []).find((item) => item.id === id)
      if (!policy) return { ok: false, error: 'policy_set_not_found' }
      const nextAutoSend = Object.fromEntries(
        Object.entries(autoSend || {}).map(([key, value]) => [String(key), value === true])
      )
      const row = {
        ...policy,
        autoSend: nextAutoSend,
        updatedAt: new Date().toISOString(),
        updatedBy: String(updatedBy || 'boss'),
      }
      const result = upsert('policySets', [row])
      const audit = createActionAuditRow({
        action: 'policy_auto_send_updated',
        workspaceId: null,
        actorType: 'human',
        actorId: row.updatedBy,
        before: policy.autoSend || {},
        after: row.autoSend,
        sourceRef: `policy_set:${id}`,
      })
      const auditResult = upsert('actionAudits', [audit])
      return { ok: true, result: { policySets: result, actionAudits: auditResult }, policySet: structuredClone(row), audit, snapshot: this.snapshot() }
    },
    resolveWorkspaceId({ threadId, pageId } = {}) {
      return resolveWorkspaceId(currentData(), { threadId, pageId })
    },
    getSettingsForThread(threadId) {
      const wsId = resolveWorkspaceId(currentData(), { threadId })
      return this.getSettings({ workspaceId: wsId })
    },
    getSettingsForPage(pageId) {
      const wsId = resolveWorkspaceId(currentData(), { pageId })
      return this.getSettings({ workspaceId: wsId })
    },
    getPageRuntimeSetting(pageId) {
      const page = currentData().pages.find((item) => item.id === pageId)
      if (!page) return null
      return pageRuntimeSettingFor(currentData(), pageId)
    },
    isPageAutoReplyEnabled(pageId) {
      const setting = this.getPageRuntimeSetting(pageId)
      return setting ? setting.autoReplyEnabled : false
    },
    setPageAutoReply({ pageId, enabled, updatedBy = 'boss' } = {}) {
      const id = String(pageId || '').trim()
      const snapshot = currentData()
      const page = snapshot.pages.find((item) => item.id === id)
      if (!page) return { ok: false, error: 'page_not_found' }
      if (typeof enabled !== 'boolean') return { ok: false, error: 'enabled_boolean_required' }
      const before = pageRuntimeSettingFor(snapshot, id)
      const row = {
        pageId: id,
        autoReplyEnabled: enabled,
        updatedAt: new Date().toISOString(),
        updatedBy: String(updatedBy || 'boss'),
      }
      const result = upsert('pageRuntimeSettings', [row], 'pageId')
      const audit = createActionAuditRow({
        action: enabled ? 'page_auto_reply_enabled' : 'page_auto_reply_disabled',
        workspaceId: page.workspaceId || null,
        actorType: 'human',
        actorId: row.updatedBy,
        before,
        after: row,
        sourceRef: `omni_page:${id}`,
      })
      const auditResult = upsert('actionAudits', [audit])
      return {
        ok: true,
        result: { pageRuntimeSettings: result, actionAudits: auditResult },
        page: withPageRuntimeSettings({ ...snapshot, pageRuntimeSettings: [...(snapshot.pageRuntimeSettings || []).filter((item) => item.pageId !== id), row] }).pages.find((item) => item.id === id),
        setting: structuredClone(row),
        audit: structuredClone(audit),
        snapshot: this.snapshot(),
      }
    },
    updatePageProviderProfile({ pageId, provider = 'instagram', providerAccountId, username, name, avatarUrl, updatedBy = 'system' } = {}) {
      const id = String(pageId || '').trim()
      const snapshot = currentData()
      const page = snapshot.pages.find((item) => item.id === id)
      if (!page) return { ok: false, error: 'page_not_found' }

      const cleanAvatarUrl = String(avatarUrl || '').trim()
      const cleanProviderAccountId = String(providerAccountId || '').trim()
      const cleanUsername = String(username || '').trim()
      const cleanProvider = String(provider || 'instagram').trim() || 'instagram'
      const now = new Date().toISOString()
      const before = structuredClone(page)
      const nextPage = {
        ...page,
        ...(name ? { providerDisplayName: String(name) } : {}),
        ...(cleanUsername ? { providerUsername: cleanUsername } : {}),
        ...(cleanAvatarUrl ? { avatarUrl: cleanAvatarUrl, profilePictureUrl: cleanAvatarUrl } : {}),
        updatedAt: now,
      }
      const pageResult = upsert('pages', [nextPage])

      const existingAccount = (snapshot.platformAccounts || []).find((item) => item.pageId === id && item.platform === cleanProvider)
      const nextAccount = {
        ...(existingAccount || {
          id: `acct_${cleanProvider}_${id.replace(/^page_/, '')}`,
          pageId: id,
          platform: cleanProvider,
          provider: cleanProvider === 'instagram' ? 'instagram_messaging' : cleanProvider,
          status: 'healthy',
        }),
        ...(cleanProviderAccountId ? { providerAccountId: cleanProviderAccountId } : {}),
        ...(cleanUsername ? { username: cleanUsername } : {}),
        ...(cleanAvatarUrl ? { avatarUrl: cleanAvatarUrl, profilePictureUrl: cleanAvatarUrl } : {}),
        updatedAt: now,
      }
      const accountResult = upsert('platformAccounts', [nextAccount])
      const audit = createActionAuditRow({
        action: 'page_provider_profile_updated',
        workspaceId: page.workspaceId || null,
        actorType: 'system',
        actorId: String(updatedBy || 'system'),
        before,
        after: nextPage,
        sourceRef: `omni_page:${id}:${cleanProvider}:profile`,
      })
      const auditResult = upsert('actionAudits', [audit])
      return {
        ok: true,
        result: { pages: pageResult, platformAccounts: accountResult, actionAudits: auditResult },
        page: structuredClone(nextPage),
        account: structuredClone(nextAccount),
        audit: structuredClone(audit),
        snapshot: this.snapshot(),
      }
    },
    listRetentionPolicies() {
      const policies = currentData().retentionPolicies || []
      if (policies.length === 0) return [structuredClone(DEFAULT_CHAT_RETENTION_POLICY)]
      return policies.map((policy) => structuredClone(policy))
    },
    listRetentionRuns() {
      return (currentData().retentionRuns || []).map((run) => structuredClone(run))
    },
    upsertRetentionPolicy(input = {}) {
      const snapshot = currentData()
      const existing = (snapshot.retentionPolicies || []).find((policy) => policy.id === (input.id || DEFAULT_CHAT_RETENTION_POLICY.id))
        || DEFAULT_CHAT_RETENTION_POLICY
      const policy = normalizeRetentionPolicy(input, existing)
      const result = upsert('retentionPolicies', [policy])
      return { ok: true, result, policy: structuredClone(policy), snapshot: this.snapshot() }
    },
    runChatRetention(input = {}) {
      const planned = planChatRetentionCleanup(currentData(), input)
      if (!planned.ok || planned.skipped || planned.dryRun) {
        const { next: _next, ...safeResult } = planned
        return { ...safeResult, snapshot: this.snapshot() }
      }

      replace('messages', planned.next.messages)
      replace('threads', planned.next.threads)
      replace('customers', planned.next.customers)
      replace('retentionRuns', planned.next.retentionRuns)

      const { next: _next, ...safeResult } = planned
      return { ...safeResult, snapshot: this.snapshot() }
    },
    listKnowledgeSources(filters = {}) {
      const query = String(filters.query || '').trim().toLowerCase()
      const workspaceId = String(filters.workspaceId || '').trim() || undefined
      return (currentData().knowledgeSources || [])
        .filter((source) => {
          // Workspace boundary: sources without workspaceId are treated as ws_oagent (default backfill)
          // When workspaceId filter is given, strictly match — no cross-workspace leakage
          if (!workspaceId) return true // legacy: no filter → show all
          const sourceWs = source.workspaceId || DEFAULT_WORKSPACE_ID
          return sourceWs === workspaceId
        })
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
    getPaymentProviderHealth(provider) {
      const providerId = String(provider || '').trim()
      const health = currentData().connectorHealth.find((item) => item.provider === providerId)
      if (!health) return { ok: false, error: 'payment_provider_not_found' }
      return {
        ok: true,
        provider: providerId,
        health: {
          ...structuredClone(health),
          mode: health.status === 'healthy' ? 'live' : 'guarded_setup',
          liveReady: health.status === 'healthy',
        },
      }
    },
    createPaymentRequest(input = {}) {
      if (input.approved !== true) return { ok: false, error: 'approval_required' }
      const normalized = normalizePaymentRequest(input, currentData())
      if (!normalized.ok) return normalized
      const paymentResult = upsert('paymentRequests', [normalized.row])
      const eventResult = upsert('paymentEvents', [normalized.event])
      // Derive workspaceId: from threadId first, then from order.workspaceId if threadId is empty
      let auditWorkspaceId = null
      if (normalized.row.threadId) {
        auditWorkspaceId = resolveWorkspaceId(currentData(), { threadId: normalized.row.threadId }) || null
      } else if (normalized.row.orderId) {
        const order = (currentData().orders || []).find((o) => o.id === normalized.row.orderId)
        auditWorkspaceId = order?.workspaceId || null
      }
      const audit = createActionAuditRow({
        threadId: normalized.row.threadId,
        workspaceId: auditWorkspaceId,
        action: 'payment_request_created',
        actorType: 'human',
        actorId: input.approvedBy || 'boss',
        after: {
          paymentRequestId: normalized.row.id,
          orderId: normalized.row.orderId,
          provider: normalized.row.provider,
          status: normalized.row.status,
          amount: normalized.row.amount,
          currency: normalized.row.currency,
          approvalRequired: normalized.row.approvalRequired,
        },
        approvalTaskId: input.approvalTaskId || null,
        sourceRef: normalized.row.sourceRef,
      })
      const auditResult = upsert('actionAudits', [audit])
      return {
        ok: true,
        result: { paymentRequests: paymentResult, paymentEvents: eventResult, actionAudits: auditResult },
        payment: structuredClone(normalized.row),
        event: structuredClone(normalized.event),
        audit: structuredClone(audit),
        snapshot: this.snapshot(),
      }
    },
    createOrderDraft(input = {}) {
      const threadId = String(input.threadId || '').trim()
      let settings
      if (threadId) {
        settings = this.getSettingsForThread(threadId)
      } else if (input.workspaceId || input.pageId) {
        // Derive workspace from pageId or use explicit workspaceId
        const wsId = input.workspaceId || resolveWorkspaceId(currentData(), { pageId: input.pageId })
        settings = this.getSettings({ workspaceId: wsId })
      } else {
        settings = this.getSettings()
      }
      if (settings.orderDraft?.enabled === false) return { ok: false, error: 'order_draft_disabled' }
      const normalized = createOrderDraftRow(input, currentData())
      if (!normalized.ok) return normalized
      const orderResult = upsert('orders', [normalized.row])
      const links = []
      if (normalized.threadId) {
        links.push({
          id: `order_link_${normalized.row.id}_${normalized.threadId}`,
          threadId: normalized.threadId,
          orderId: normalized.row.id,
          linkReason: input.linkReason || 'order_draft_created',
          confidence: input.confidence || 0.8,
          sourceRef: normalized.row.sourceRef,
          createdAt: normalized.row.createdAt,
        })
      }
      const linkResult = links.length ? upsert('orderLinks', links) : { inserted: 0, updated: 0 }
      const audit = createActionAuditRow({
        threadId: normalized.threadId || null,
        workspaceId: input.workspaceId || normalized.row.workspaceId || null,
        action: 'order_draft_created',
        actorType: 'human',
        actorId: input.createdBy || 'boss',
        after: { orderId: normalized.row.id, itemCount: normalized.row.items.length, totalAmount: normalized.row.totalAmount },
        sourceRef: normalized.row.sourceRef,
      })
      const auditResult = upsert('actionAudits', [audit])
      return { ok: true, result: { orders: orderResult, orderLinks: linkResult, actionAudits: auditResult }, order: structuredClone(normalized.row), audit, snapshot: this.snapshot() }
    },
    async approveOrderDraft({ orderId, approved = false, approvedBy = 'boss', createExternalOrder } = {}) {
      if (approved !== true) return { ok: false, error: 'approval_required' }
      const snapshot = currentData()
      const order = (snapshot.orders || []).find((item) => item.id === orderId)
      if (!order) return { ok: false, error: 'order_not_found' }
      if (order.status !== 'draft') return { ok: false, error: 'order_not_draft' }
      const orderLink = (snapshot.orderLinks || []).find((link) => link.orderId === orderId)
      const settings = orderLink?.threadId ? this.getSettingsForThread(orderLink.threadId) : this.getSettings()
      if (settings.orderDraft?.enabled === false) return { ok: false, error: 'order_draft_disabled' }
      if (settings.orderDraft?.createZortOrderOnApprove === false) return { ok: false, error: 'zort_order_create_disabled' }
      if (typeof createExternalOrder !== 'function') return { ok: false, error: 'order_runtime_missing' }
      const ready = await validateOrderReadyForZort(order)
      if (!ready.ok) return ready
      const providerOrder = { ...order, shippingAddress: ready.shippingAddress }
      let provider
      try {
        provider = await createExternalOrder({ order: providerOrder, uniquenumber: order.id, approved: true })
      } catch (error) {
        return {
          ok: false,
          error: 'zort_order_create_failed',
          provider: { ok: false, error: error.message || 'zort_order_create_failed' },
        }
      }
      if (!provider?.ok) return { ok: false, error: provider?.error || 'zort_order_create_failed', provider }
      const updatedOrder = {
        ...providerOrder,
        status: 'zort_created',
        approvalStatus: 'approved',
        providerOrderId: provider.providerOrderId || order.providerOrderId || null,
        providerResponse: provider.response || null,
        approvedBy,
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const orderResult = upsert('orders', [updatedOrder])
      const audit = createActionAuditRow({
        action: 'order_draft_approved_zort_created',
        workspaceId: order.workspaceId || null,
        actorType: 'human',
        actorId: approvedBy,
        before: { orderId: order.id, status: order.status, providerOrderId: order.providerOrderId || null },
        after: { orderId: updatedOrder.id, status: updatedOrder.status, providerOrderId: updatedOrder.providerOrderId },
        sourceRef: updatedOrder.sourceRef,
      })
      const auditResult = upsert('actionAudits', [audit])
      return { ok: true, result: { orders: orderResult, actionAudits: auditResult }, order: structuredClone(updatedOrder), provider, audit, snapshot: this.snapshot() }
    },
    messageVolumeReport({ from, to, pageId } = {}) {
      const snapshot = currentData()
      const settings = pageId ? this.getSettingsForPage(pageId) : this.getSettings()
      const timeZone = settings.report?.timezone || 'UTC'
      const fromDate = normalizeDateBoundary(from, new Date(0), false, timeZone)
      const toDate = normalizeDateBoundary(to, new Date('9999-12-31T23:59:59.999Z'), true, timeZone)
      const threadsById = new Map((snapshot.threads || []).map((thread) => [thread.id, thread]))
      const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour: String(hour).padStart(2, '0'), inbound: 0, outbound: 0, total: 0 }))
      const byPage = new Map()
      const messages = (snapshot.messages || []).filter((message) => {
        const createdAt = new Date(message.createdAt || 0)
        const thread = threadsById.get(message.threadId)
        return createdAt >= fromDate && createdAt <= toDate && (!pageId || thread?.pageId === pageId)
      })
      const totals = { inbound: 0, outbound: 0, system: 0, total: messages.length }
      for (const message of messages) {
        const direction = ['inbound', 'outbound', 'system'].includes(message.direction) ? message.direction : 'system'
        totals[direction] += 1
        const hour = hourInTimeZone(new Date(message.createdAt || 0), timeZone)
        byHour[hour][direction] += 1
        byHour[hour].total += 1
        const thread = threadsById.get(message.threadId)
        const pageKey = thread?.pageId || 'unknown'
        const pageRow = byPage.get(pageKey) || { pageId: pageKey, inbound: 0, outbound: 0, system: 0, total: 0 }
        pageRow[direction] += 1
        pageRow.total += 1
        byPage.set(pageKey, pageRow)
      }
      return {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        timezone: timeZone,
        totals,
        byHour,
        byPage: Array.from(byPage.values()),
      }
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
        audits: (snapshot.actionAudits || []).filter((audit) => audit.threadId === threadId),
      }
    },
    evaluateAutoSend({ threadId }) {
      const thread = currentData().threads.find((item) => item.id === threadId)
      if (!thread) return { allowed: false, reason: 'thread_not_found' }
      if (process.env.OMNI_AI_AUTO_SEND_ALL === '1') return { allowed: true, reason: 'auto_send_all_enabled' }
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
        intent: decision.intent || null,
        risk: decision.risk || null,
        provider: decision.provider || null,
        model: decision.model || null,
        action: decision.action,
        sourceIds: decision.sourceIds || [],
        reason: decision.reason || '',
        createdAt: decision.createdAt || new Date().toISOString(),
      }
      const result = upsert('aiDecisions', [row])
      return { ok: true, result, decision: structuredClone(row), snapshot: this.snapshot() }
    },
    recordActionAudit(input = {}) {
      const audit = createActionAuditRow(input)
      const result = upsert('actionAudits', [audit])
      return { ok: true, result, audit: structuredClone(audit), snapshot: this.snapshot() }
    },
    recordOutboundMessage({ threadId, authorName = 'AI', text, providerMessageId = null, sourceRef = 'ai_auto_reply', decisionId = null, decision = null }) {
      const snapshot = currentData()
      const thread = snapshot.threads.find((item) => item.id === threadId)
      if (!thread) return { ok: false, error: 'thread_not_found' }
      const now = new Date().toISOString()
      const message = {
        id: `out_${threadId}_${Date.now()}`,
        threadId,
        direction: 'outbound',
        authorName,
        text: String(text || ''),
        createdAt: now,
        providerMessageId,
        sourceRef,
      }
      const updatedThread = {
        ...thread,
        status: 'auto_sent',
        unreadCount: 0,
        messageCount: (thread.messageCount || 0) + 1,
        updatedAt: now,
      }
      upsert('messages', [message])
      upsert('threads', [updatedThread])
      const audit = createActionAuditRow({
        threadId,
        workspaceId: resolveWorkspaceId(currentData(), { threadId }) || null,
        action: 'customer_message_sent',
        actorType: 'ai',
        actorId: authorName,
        before: {
          threadStatus: thread.status,
          unreadCount: thread.unreadCount || 0,
          messageCount: thread.messageCount || 0,
        },
        after: {
          messageId: message.id,
          providerMessageId,
          decisionId,
          intent: decision?.intent || null,
          risk: decision?.risk || null,
          confidence: decision?.confidence || null,
          sourceIds: decision?.sourceIds || [],
          policyDecision: decision?.allowed ? 'allowed' : 'not_allowed',
          replyText: message.text,
          threadStatus: updatedThread.status,
        },
        sourceRef,
      })
      upsert('actionAudits', [audit])
      return { ok: true, message: structuredClone(message), thread: structuredClone(updatedThread), audit: structuredClone(audit), snapshot: this.snapshot() }
    },
    recordManualReplyDraft({
      threadId,
      authorName = 'บอส',
      text = '',
      attachments = [],
      sourceRef = 'manual_draft',
      actorType = 'human',
      auditAction = 'manual_reply_draft_created',
    }) {
      const snapshot = currentData()
      const thread = snapshot.threads.find((item) => item.id === threadId)
      if (!thread) return { ok: false, error: 'thread_not_found' }
      const cleanText = String(text || '').trim()
      const normalizedAttachments = normalizeDraftAttachments(attachments)
      if (!normalizedAttachments.ok) return normalizedAttachments
      if (!cleanText && normalizedAttachments.attachments.length === 0) return { ok: false, error: 'draft_empty' }

      const now = new Date().toISOString()
      const message = {
        id: `draft_${threadId}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        threadId,
        direction: 'outbound',
        authorName,
        text: cleanText,
        attachments: normalizedAttachments.attachments,
        createdAt: now,
        providerMessageId: null,
        sourceRef,
        deliveryStatus: 'draft_only',
      }
      const updatedThread = {
        ...thread,
        status: 'draft_ready',
        messageCount: (thread.messageCount || 0) + 1,
        updatedAt: now,
      }
      upsert('messages', [message])
      upsert('threads', [updatedThread])
      const audit = createActionAuditRow({
        threadId,
        workspaceId: resolveWorkspaceId(currentData(), { threadId }) || null,
        action: auditAction,
        actorType,
        actorId: authorName,
        before: {
          threadStatus: thread.status,
          messageCount: thread.messageCount || 0,
        },
        after: {
          messageId: message.id,
          attachmentCount: normalizedAttachments.attachments.length,
          replyText: message.text,
          deliveryStatus: message.deliveryStatus,
          threadStatus: updatedThread.status,
        },
        sourceRef: message.sourceRef,
      })
      upsert('actionAudits', [audit])
      return { ok: true, message: structuredClone(message), thread: structuredClone(updatedThread), audit: structuredClone(audit), snapshot: this.snapshot() }
    },
    async createOrderAddressIntake({ threadId, text = '', createConfirmationDraft, authorName = 'AI' } = {}) {
      const settings = threadId ? this.getSettingsForThread(threadId) : this.getSettings()
      if (settings.orderAddressIntake?.enabled === false) return { ok: false, error: 'order_address_intake_disabled' }
      const snapshot = currentData()
      const thread = snapshot.threads.find((item) => item.id === threadId)
      if (!thread) return { ok: false, error: 'thread_not_found' }
      const customer = snapshot.customers.find((item) => item.id === thread.customerId) || null
      const inboundText = (snapshot.messages || [])
        .filter((message) => message.threadId === threadId && message.direction === 'inbound')
        .slice(-5)
        .map((message) => message.text)
        .join('\n')
      const sourceText = String(text || inboundText || '').trim()
      const extraction = await extractThaiOrderAddress(sourceText, { fallbackName: customer?.displayName || '' })
      if (!extraction.ok) return extraction

      let confirmationDraft = null
      const shouldDraft = createConfirmationDraft ?? settings.orderAddressIntake?.createConfirmationDraft !== false
      if (shouldDraft) {
        const draft = this.recordManualReplyDraft({
          threadId,
          authorName,
          text: extraction.confirmationText,
          sourceRef: 'ai_address_confirmation_draft',
          actorType: 'ai',
          auditAction: 'address_confirmation_draft_created',
        })
        if (!draft.ok) return draft
        confirmationDraft = { message: draft.message, audit: draft.audit }
      }

      return {
        ok: true,
        ...extraction,
        confirmationDraft,
        snapshot: this.snapshot(),
      }
    },
    approveDraft({ threadId }) {
      if (store) return { ok: false, error: 'approval_not_supported_for_sqlite_store_yet' }
      const thread = data.threads.find((item) => item.id === threadId)
      if (!thread) return { ok: false, error: 'thread_not_found' }
      thread.status = 'auto_sent'
      return { ok: true, thread: structuredClone(thread) }
    },
    syncFacebookConversations(normalized) {
      const detailedThreadIds = new Set(
        (normalized.messages || [])
          .filter((message) => String(message.sourceRef || '').startsWith('meta_thread:'))
          .map((message) => message.threadId)
          .filter(Boolean),
      )
      if (detailedThreadIds.size > 0) {
        const snapshot = currentData()
        const nextMessages = (snapshot.messages || []).filter((message) => (
          !detailedThreadIds.has(message.threadId) || !isFacebookSnippetPreview(message)
        ))
        if (nextMessages.length !== (snapshot.messages || []).length) {
          if (store) store.replace('messages', nextMessages)
          else data.messages = nextMessages
        }
      }
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
      const prepared = normalizeFacebookWebhookSync(currentData(), normalized)
      const customerResult = upsert('customers', prepared.customers)
      const threadResult = upsert('threads', prepared.threads)
      const messageResult = upsert('messages', prepared.messages)
      return {
        ok: true,
        source: prepared.source,
        customers: customerResult,
        threads: threadResult,
        messages: messageResult,
        snapshot: this.snapshot(),
      }
    },
    syncTikTokMessagingWebhookEvents(normalized) {
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
    syncEasyStoreWebhookEvents(normalized) {
      const now = new Date().toISOString()
      const customerResult = upsert('customers', normalized.customers)
      const threadResult = upsert('threads', normalized.threads)
      const messageResult = upsert('messages', normalized.messages)
      const orderResult = upsert('orders', normalized.orders)
      const inventoryResult = upsert('inventorySnapshots', normalized.inventorySnapshots)
      const connectorHealthResult = upsert('connectorHealth', [{
        id: 'health_easystore',
        provider: 'easystore',
        status: 'healthy',
        lastCheckedAt: normalized.receivedAt || now,
        lastWebhookTopic: normalized.topic || 'unknown',
        lastWebhookReceivedAt: normalized.receivedAt || now,
        sourceRef: `easystore_webhook:${normalized.topic || 'unknown'}`,
      }])
      return {
        ok: true,
        source: normalized.source,
        topic: normalized.topic,
        customers: customerResult,
        threads: threadResult,
        messages: messageResult,
        orders: orderResult,
        inventorySnapshots: inventoryResult,
        connectorHealth: connectorHealthResult,
        snapshot: this.snapshot(),
      }
    },
  }
}
