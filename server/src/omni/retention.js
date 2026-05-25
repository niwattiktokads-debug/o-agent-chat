const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_RETENTION_DAYS = 180
const MAX_RETENTION_DAYS = 3650

export const DEFAULT_CHAT_RETENTION_POLICY = {
  id: 'retention_chat_messages',
  name: 'Chat message cleanup',
  target: 'chat_messages',
  enabled: true,
  deleteAfterDays: DEFAULT_RETENTION_DAYS,
  preserveCustomerProfile: true,
  preserveFields: ['displayName', 'platform', 'providerCustomerId', 'phone', 'address', 'contactJson', 'note'],
  mode: 'delete_messages_keep_customer_profile',
  createdAt: '2026-05-24T00:00:00.000Z',
  updatedAt: '2026-05-24T00:00:00.000Z',
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false
  return fallback
}

function parsePositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return Math.min(parsed, max)
}

function toDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function uniq(values) {
  return [...new Set((values || []).filter(Boolean))]
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (digits.startsWith('66') && digits.length >= 11) return `0${digits.slice(2, 11)}`
  if (digits.length >= 9 && digits.length <= 10) return digits
  return null
}

export function extractContactInfo(text = '') {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return { phones: [], addresses: [] }

  const phoneMatches = normalized.match(/(?:\+?66|0)[\d\s().-]{7,}\d/g) || []
  const phones = uniq(phoneMatches.map(normalizePhone))

  const hasAddressKeyword = /(ที่อยู่|จัดส่ง|ส่งที่|บ้านเลขที่|หมู่|ถนน|ซอย|ตำบล|ต\.|อำเภอ|อ\.|จังหวัด|จ\.|รหัสไปรษณีย์)/.test(normalized)
  const hasPostalCode = /(^|\D)[1-9]\d{4}(\D|$)/.test(normalized)
  const isAddressRequest = /(ขอ|สอบถาม|ส่ง).{0,16}ที่อยู่|ที่อยู่.{0,16}(อะไร|ไหน|ยังไง)/.test(normalized)
  const looksLikeAddress = (hasAddressKeyword || hasPostalCode) && !isAddressRequest && normalized.length >= 12
  const addresses = looksLikeAddress ? [normalized.slice(0, 600)] : []

  return { phones, addresses }
}

export function normalizeRetentionPolicy(input = {}, base = DEFAULT_CHAT_RETENTION_POLICY) {
  const now = new Date().toISOString()
  const deleteAfterDays = parsePositiveInt(input.deleteAfterDays ?? input.days, base.deleteAfterDays, MAX_RETENTION_DAYS)
  const target = String(input.target || base.target)
  const safeTarget = target === 'chat_messages' ? target : base.target
  const mode = String(input.mode || base.mode)
  const safeMode = mode === 'delete_messages_keep_customer_profile' ? mode : base.mode

  return {
    ...base,
    ...input,
    id: String(input.id || base.id),
    name: String(input.name || base.name),
    target: safeTarget,
    enabled: parseBoolean(input.enabled, base.enabled),
    deleteAfterDays,
    preserveCustomerProfile: parseBoolean(input.preserveCustomerProfile, base.preserveCustomerProfile),
    preserveFields: Array.isArray(input.preserveFields) && input.preserveFields.length > 0
      ? input.preserveFields.map((field) => String(field))
      : base.preserveFields,
    mode: safeMode,
    updatedAt: input.updatedAt || now,
    createdAt: input.createdAt || base.createdAt || now,
  }
}

function parseContactJson(value) {
  if (!value) return {}
  if (typeof value === 'object') return structuredClone(value)
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

function mergeCustomerContact(customer, contact, nowIso) {
  const contactJson = parseContactJson(customer.contactJson)
  const phones = uniq([...(Array.isArray(contactJson.phones) ? contactJson.phones : []), ...(contact.phones || [])])
  const addresses = uniq([...(Array.isArray(contactJson.addresses) ? contactJson.addresses : []), ...(contact.addresses || [])])
  const sourceMessageIds = uniq([...(Array.isArray(contactJson.sourceMessageIds) ? contactJson.sourceMessageIds : []), ...(contact.sourceMessageIds || [])])

  if (phones.length === 0 && addresses.length === 0) return { changed: false, customer }

  const next = {
    ...customer,
    phone: customer.phone || phones[0] || null,
    address: customer.address || addresses[0] || null,
    contactJson: {
      ...contactJson,
      phones,
      addresses,
      sourceMessageIds,
      retainedBy: 'chat_retention',
      updatedAt: nowIso,
    },
    importantContactUpdatedAt: nowIso,
    updatedAt: nowIso,
  }

  return { changed: JSON.stringify(next) !== JSON.stringify(customer), customer: next }
}

function createRunId(nowIso) {
  return `retention_run_${nowIso.replace(/\D/g, '').slice(0, 14)}_${Math.random().toString(16).slice(2, 8)}`
}

export function planChatRetentionCleanup(snapshot = {}, options = {}) {
  const policies = Array.isArray(snapshot.retentionPolicies) ? snapshot.retentionPolicies : []
  const storedPolicy = policies.find((policy) => policy.id === DEFAULT_CHAT_RETENTION_POLICY.id) || DEFAULT_CHAT_RETENTION_POLICY
  const policy = normalizeRetentionPolicy({
    ...storedPolicy,
    ...(options.policy || {}),
    ...(options.deleteAfterDays || options.days ? { deleteAfterDays: options.deleteAfterDays || options.days } : {}),
    ...(options.enabled !== undefined ? { enabled: options.enabled } : {}),
  })
  const forced = parseBoolean(options.force, false)
  const dryRun = parseBoolean(options.dryRun, true)
  const nowDate = toDate(options.now || Date.now()) || new Date()
  const nowIso = nowDate.toISOString()
  const cutoffDate = new Date(nowDate.getTime() - policy.deleteAfterDays * DAY_MS)
  const cutoffAt = cutoffDate.toISOString()

  if (!policy.enabled && !forced) {
    return {
      ok: true,
      skipped: true,
      reason: 'retention_disabled',
      dryRun,
      policy,
      cutoffAt,
      counts: { messagesDeleted: 0, threadsTouched: 0, customersUpdated: 0 },
    }
  }

  const messages = Array.isArray(snapshot.messages) ? snapshot.messages : []
  const threads = Array.isArray(snapshot.threads) ? snapshot.threads : []
  const customers = Array.isArray(snapshot.customers) ? snapshot.customers : []
  const oldMessages = messages.filter((message) => {
    const createdAt = toDate(message.createdAt)
    return createdAt && createdAt < cutoffDate
  })
  const oldMessageIds = new Set(oldMessages.map((message) => message.id))
  const threadById = new Map(threads.map((thread) => [thread.id, thread]))
  const contactByCustomerId = new Map()
  const deletedByThreadId = new Map()

  for (const message of oldMessages) {
    deletedByThreadId.set(message.threadId, (deletedByThreadId.get(message.threadId) || 0) + 1)
    const thread = threadById.get(message.threadId)
    if (!thread?.customerId || !policy.preserveCustomerProfile) continue

    const extracted = extractContactInfo(message.text)
    if (extracted.phones.length === 0 && extracted.addresses.length === 0) continue

    const current = contactByCustomerId.get(thread.customerId) || { phones: [], addresses: [], sourceMessageIds: [] }
    contactByCustomerId.set(thread.customerId, {
      phones: uniq([...current.phones, ...extracted.phones]),
      addresses: uniq([...current.addresses, ...extracted.addresses]),
      sourceMessageIds: uniq([...current.sourceMessageIds, message.id]),
    })
  }

  let customersUpdated = 0
  const nextCustomers = customers.map((customer) => {
    const contact = contactByCustomerId.get(customer.id)
    if (!contact) return customer
    const merged = mergeCustomerContact(customer, contact, nowIso)
    if (merged.changed) customersUpdated += 1
    return merged.customer
  })

  const nextMessages = messages.filter((message) => !oldMessageIds.has(message.id))
  const remainingByThreadId = new Map()
  const remainingInboundByThreadId = new Map()
  for (const message of nextMessages) {
    remainingByThreadId.set(message.threadId, (remainingByThreadId.get(message.threadId) || 0) + 1)
    if (message.direction === 'inbound') {
      remainingInboundByThreadId.set(message.threadId, (remainingInboundByThreadId.get(message.threadId) || 0) + 1)
    }
  }

  const nextThreads = threads.map((thread) => {
    const deletedCount = deletedByThreadId.get(thread.id) || 0
    if (deletedCount === 0) return thread
    const remainingMessages = remainingByThreadId.get(thread.id) || 0
    const remainingInbound = remainingInboundByThreadId.get(thread.id) || 0
    return {
      ...thread,
      messageCount: remainingMessages,
      unreadCount: Math.min(thread.unreadCount || 0, remainingInbound),
      retentionDeletedCount: (thread.retentionDeletedCount || 0) + deletedCount,
      lastRetentionAt: nowIso,
    }
  })

  const run = {
    id: createRunId(nowIso),
    policyId: policy.id,
    target: policy.target,
    dryRun,
    cutoffAt,
    deleteAfterDays: policy.deleteAfterDays,
    messagesDeleted: oldMessages.length,
    threadsTouched: deletedByThreadId.size,
    customersUpdated,
    sourceRef: options.sourceRef || 'omni_retention',
    createdAt: nowIso,
  }

  return {
    ok: true,
    dryRun,
    policy,
    cutoffAt,
    counts: {
      messagesDeleted: oldMessages.length,
      threadsTouched: deletedByThreadId.size,
      customersUpdated,
    },
    preservedContacts: {
      customers: contactByCustomerId.size,
      phones: [...contactByCustomerId.values()].reduce((sum, item) => sum + item.phones.length, 0),
      addresses: [...contactByCustomerId.values()].reduce((sum, item) => sum + item.addresses.length, 0),
    },
    run,
    next: {
      messages: nextMessages,
      threads: nextThreads,
      customers: nextCustomers,
      retentionRuns: [...(snapshot.retentionRuns || []), run].slice(-100),
    },
  }
}

export function retentionRuntimeConfig(env = process.env) {
  return {
    enabled: parseBoolean(env.OMNI_CHAT_RETENTION_ENABLED, true),
    deleteAfterDays: parsePositiveInt(env.OMNI_CHAT_RETENTION_DAYS, DEFAULT_RETENTION_DAYS, MAX_RETENTION_DAYS),
    intervalMs: parsePositiveInt(env.OMNI_CHAT_RETENTION_INTERVAL_MS, DAY_MS),
    runOnStart: parseBoolean(env.OMNI_CHAT_RETENTION_RUN_ON_START, false),
  }
}

export function startChatRetentionScheduler({ omni, env = process.env, log = console } = {}) {
  const config = retentionRuntimeConfig(env)
  if (!config.enabled || !omni?.runChatRetention) {
    return { enabled: false, config, stop() {} }
  }

  const run = () => {
    try {
      const result = omni.runChatRetention({
        dryRun: false,
        deleteAfterDays: config.deleteAfterDays,
        sourceRef: 'omni_retention_scheduler',
      })
      log.info?.('[omni-retention] cleanup', {
        messagesDeleted: result.counts?.messagesDeleted || 0,
        customersUpdated: result.counts?.customersUpdated || 0,
        cutoffAt: result.cutoffAt,
      })
    } catch (error) {
      log.error?.('[omni-retention] cleanup_failed', error)
    }
  }

  if (config.runOnStart) setTimeout(run, 1000).unref?.()
  const timer = setInterval(run, config.intervalMs)
  timer.unref?.()
  return {
    enabled: true,
    config,
    stop() {
      clearInterval(timer)
    },
  }
}
