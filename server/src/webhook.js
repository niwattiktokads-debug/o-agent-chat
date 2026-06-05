import { normalizeMetaWebhookPayload } from './omni/metaWebhook.js'
import { normalizeEasyStoreWebhookPayload } from './omni/easystoreWebhook.js'
import { canUseEasyStoreLiveLookup, createAiReplyEngine } from './omni/aiReplyEngine.js'
import { sendFacebookCommentReply, sendFacebookReply, sendInstagramCommentReply } from './omni/metaInboxClient.js'
import { getProfileKeyForOmniPage } from './omni/pageRegistry.js'
import { normalizeTikTokMessagingWebhookPayload } from './omni/tiktokMessagingClient.js'
import { createMetaCatalogRuntime } from './omni/metaCatalogRuntime.js'
import { createEasyStoreRuntime } from './omni/easystoreRuntime.js'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { execFile } from 'node:child_process'
import { createHmac, timingSafeEqual } from 'node:crypto'

const seen = new Set()
const LINE_CAPTURE_LOG = process.env.LINE_SUDA_OAGENT_CAPTURE_LOG || '/Users/babycuca/Documents/O-Agent workspace/finance/staging/line_suda_oagent_capture_events.jsonl'
const LINE_GROUP_REGISTRY_LOG = process.env.LINE_SUDA_GROUP_REGISTRY_LOG || '/Users/babycuca/Documents/O-Agent workspace/finance/staging/line_suda_group_registry.jsonl'
const LINE_GROUP_RULES_FILE = process.env.LINE_SUDA_GROUP_RULES_FILE || '/Users/babycuca/Documents/O-Agent workspace/finance/staging/line_suda_group_rules.json'
const LINE_HELPER = process.env.LINE_SUDA_OAGENT_HELPER || '/Users/babycuca/.codex/bin/line-suda-oagent'
const LINE_JOIN_INTAKE_PUSH_DEFAULT = process.env.LINE_SUDA_JOIN_INTAKE_PUSH === '1'

function envFlag(name) {
  return process.env[name] === '1'
}

function omniAutoSendOnWebhookEnabled() {
  return envFlag('OMNI_AI_AUTO_SEND_ON_WEBHOOK')
}

function omniDirectSendAllEnabled() {
  return omniAutoSendOnWebhookEnabled() || envFlag('OMNI_AI_AUTO_SEND_ALL')
}

function appendJsonl(file, row) {
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, `${JSON.stringify(row)}\n`)
}

function appendLineCapture(row, file = LINE_CAPTURE_LOG) {
  appendJsonl(file, row)
}

function readJsonFile(file, fallback) {
  if (!existsSync(file)) return fallback
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (_error) {
    return fallback
  }
}

function writeJsonFile(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
}

async function trySaveLineGroupId(groupId, lineHelperRunner = defaultLineHelperRunner) {
  if (!groupId) return
  await lineHelperRunner(['set-group-id', '--group-id', groupId])
}

function parseHelperOutput(stdout) {
  const text = String(stdout || '').trim()
  if (!text) return { ok: true }
  try {
    return JSON.parse(text)
  } catch (_error) {
    return { ok: false, error: 'invalid_helper_json', stdout: text.slice(0, 500) }
  }
}

function defaultLineHelperRunner(args) {
  return new Promise((resolve) => {
    execFile(LINE_HELPER, args, { env: process.env, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      const parsed = parseHelperOutput(stdout)
      if (error) {
        resolve({
          ...parsed,
          ok: false,
          error: parsed.error || error.message,
          stderr: String(stderr || '').trim(),
        })
        return
      }
      resolve(parsed)
    })
  })
}

function groupMemberSummary(details) {
  if (Array.isArray(details?.members) && details.members.length) {
    const names = details.members
      .map((member) => member.displayName || member.userIdMasked || '')
      .filter(Boolean)
    return names.length ? names.join(', ') : 'อ่านรายชื่อไม่ได้'
  }
  if (details?.memberFetch?.errors?.length) return 'LINE API ยังไม่ส่งรายชื่อสมาชิก'
  return 'ยังไม่มีรายชื่อสมาชิกจาก API'
}

function normalizeSudaRules(input = {}) {
  return {
    duty: String(input.duty || '').trim(),
    questionPattern: String(input.questionPattern || '').trim(),
    defaultReply: String(input.defaultReply || '').trim(),
    replyRules: String(input.replyRules || '').trim(),
  }
}

function rulesComplete(rules) {
  const normalizedRules = normalizeSudaRules(rules)
  return ['duty', 'questionPattern', 'defaultReply', 'replyRules']
    .every((field) => Boolean(normalizedRules[field]))
}

function rulesStatus(rules, fallback = 'pending_boss_instruction') {
  const normalizedRules = normalizeSudaRules(rules)
  if (rulesComplete(normalizedRules)) return 'response_rules_recorded'
  if (Object.values(normalizedRules).some(Boolean)) return 'pending_group_usage_rules'
  return fallback
}

function formatRuleLines(rules) {
  const lines = []
  if (rules.duty) lines.push(`หน้าที่: ${rules.duty}`)
  if (rules.questionPattern) lines.push(`รูปแบบคำถาม: ${rules.questionPattern}`)
  if (rules.defaultReply) lines.push(`รูปแบบตอบ: ${rules.defaultReply}`)
  if (rules.replyRules) lines.push(`กฎตอบ: ${rules.replyRules}`)
  return lines
}

function lineGroupRegistryRow({ type, row, details = {}, rules = {}, result = {} }) {
  const normalizedRules = normalizeSudaRules(rules)
  return {
    recordedAt: new Date().toISOString(),
    type,
    groupId: row.groupId,
    groupIdMasked: details.groupIdMasked || '',
    groupName: details.groupName || '',
    eventType: row.eventType,
    userId: row.userId || '',
    messageText: row.text || '',
    memberCount: details.memberCount ?? null,
    memberNamesReadable: Array.isArray(details.members) ? details.members.map((member) => member.displayName || member.userIdMasked || '').filter(Boolean) : [],
    duty: normalizedRules.duty,
    questionPattern: normalizedRules.questionPattern,
    defaultReply: normalizedRules.defaultReply,
    replyRules: normalizedRules.replyRules,
    responseRules: normalizedRules,
    status: rulesStatus(normalizedRules),
    helperResult: result,
  }
}

function upsertLineGroupRules({ file = LINE_GROUP_RULES_FILE, row, details = {}, rules = {} }) {
  if (!row.groupId) return null
  const store = readJsonFile(file, { version: 1, groups: {} })
  const previous = store.groups?.[row.groupId] || {}
  const normalizedRules = normalizeSudaRules(rules)
  const mergedRules = normalizeSudaRules(previous.responseRules || {})
  for (const [key, value] of Object.entries(normalizedRules)) {
    if (value) mergedRules[key] = value
  }
  const group = {
    groupId: row.groupId,
    groupIdMasked: details.groupIdMasked || previous.groupIdMasked || '',
    groupName: details.groupName || previous.groupName || '',
    memberCount: details.memberCount ?? previous.memberCount ?? null,
    memberNamesReadable: Array.isArray(details.members) && details.members.length
      ? details.members.map((member) => member.displayName || member.userIdMasked || '').filter(Boolean)
      : previous.memberNamesReadable || [],
    responseRules: mergedRules,
    status: rulesStatus(mergedRules, previous.status || 'pending_boss_instruction'),
    updatedAt: new Date().toISOString(),
    updatedByUserId: row.userId || previous.updatedByUserId || '',
    sourceMessageText: row.text || previous.sourceMessageText || '',
  }
  store.version = 1
  store.groups = { ...(store.groups || {}), [row.groupId]: group }
  writeJsonFile(file, store)
  return group
}

async function signalLineGroupJoin({ room, hub, rows, lineHelperRunner = defaultLineHelperRunner, lineRegistryLog = LINE_GROUP_REGISTRY_LOG, lineRulesFile = LINE_GROUP_RULES_FILE, joinIntakePush = LINE_JOIN_INTAKE_PUSH_DEFAULT }) {
  const joins = rows.filter((row) => row.sourceType === 'group' && row.groupId && row.eventType === 'join')
  if (!joins.length) return null
  const first = joins[0]
  const extra = joins.length > 1 ? ` (+${joins.length - 1})` : ''
  const detailsResult = await lineHelperRunner(['group-details', '--group-id', first.groupId, '--member-limit', '20'])
  const details = detailsResult.ok ? detailsResult : {}
  const intakeResult = joinIntakePush
    ? await lineHelperRunner(['send-join-intake', '--group-id', first.groupId, '--member-limit', '20'])
    : { ok: true, sent: false, reason: 'approval_required_before_group_message' }
  appendJsonl(lineRegistryLog, lineGroupRegistryRow({
    type: joinIntakePush ? 'group_join_intake_requested' : 'group_join_detected',
    row: first,
    details,
    result: { ok: intakeResult.ok, sent: Boolean(intakeResult.sent), reason: intakeResult.reason || null, error: intakeResult.error || null },
  }))
  const groupRules = upsertLineGroupRules({ file: lineRulesFile, row: first, details })
  const message = room.addMessage({
    role: 'Codex',
    text: `[STATE] @เดส สุดาถูกเพิ่มเข้ากลุ่ม LINE ใหม่${extra}: ${details.groupName || 'ไม่ทราบชื่อกลุ่ม'} · สมาชิก ${details.memberCount ?? 'ไม่ทราบจำนวน'} · ${groupMemberSummary(details)} · บันทึกเข้า Settings/registry แล้ว ยังไม่ส่งคำถามเข้ากลุ่ม`,
  })
  hub.broadcast('message', room.snapshot())
  hub.broadcast('line:suda-oagent:join', { joins, details, intakeResult, groupRules, message })
  return message
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const SUDA_RULE_FIELDS = [
  { key: 'duty', labels: ['หน้าที่', 'duty', 'role', 'purpose'] },
  { key: 'questionPattern', labels: ['รูปแบบคำถาม', 'รูปแบบถาม', 'คำถาม', 'question_pattern', 'question pattern', 'question'] },
  { key: 'defaultReply', labels: ['รูปแบบตอบ', 'รูปแบบการตอบ', 'คำตอบตั้งต้น', 'ตอบตั้งต้น', 'default_reply', 'default reply', 'answer_format', 'answer format', 'reply format'] },
  { key: 'replyRules', labels: ['กฎตอบ', 'กฎการตอบ', 'กติกาตอบ', 'ข้อห้าม', 'reply_rules', 'reply rules', 'rules'] },
]

const SUDA_RULE_LABELS = new Map(SUDA_RULE_FIELDS.flatMap((field) => (
  field.labels.map((label) => [label.toLowerCase(), field.key])
)))

const SUDA_RULE_PATTERN = new RegExp(
  `(^|\\n|\\s)(${[...SUDA_RULE_LABELS.keys()].map(escapeRegExp).sort((a, b) => b.length - a.length).join('|')})\\s*[:：]`,
  'giu'
)

function parseSudaRuleCommand(row) {
  const text = String(row.text || '').trim()
  if (!/^\/su\b/i.test(text)) return null
  const body = text.replace(/^\/su\b/i, '').trim()
  SUDA_RULE_PATTERN.lastIndex = 0
  const matches = [...body.matchAll(SUDA_RULE_PATTERN)]
  if (!matches.length) return null

  const rules = {}
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]
    const label = String(match[2] || '').toLowerCase()
    const key = SUDA_RULE_LABELS.get(label)
    if (!key) continue
    const start = match.index + match[0].length
    const end = matches[index + 1]?.index ?? body.length
    const value = body.slice(start, end).replace(/\s+/g, ' ').trim()
    if (value) rules[key] = value
  }

  const normalizedRules = normalizeSudaRules(rules)
  return Object.values(normalizedRules).some(Boolean) ? normalizedRules : null
}

async function handleSudaRuleCommands({ room, hub, rows, lineHelperRunner = defaultLineHelperRunner, lineRegistryLog = LINE_GROUP_REGISTRY_LOG, lineRulesFile = LINE_GROUP_RULES_FILE }) {
  const commands = rows
    .filter((row) => row.sourceType === 'group' && row.groupId && row.messageType === 'text')
    .map((row) => ({ row, parsed: parseSudaRuleCommand(row) }))
    .filter((item) => item.parsed)
  if (!commands.length) return []

  const results = []
  for (const item of commands) {
    const detailsResult = await lineHelperRunner(['group-details', '--group-id', item.row.groupId, '--member-limit', '20'])
    const details = detailsResult.ok ? detailsResult : {}
    const groupRules = upsertLineGroupRules({ file: lineRulesFile, row: item.row, details, rules: item.parsed })
    const ackText = [
      'สุดาบันทึกกฎการตอบของกลุ่มนี้แล้ว',
      `กลุ่ม: ${details.groupName || 'ไม่ทราบชื่อกลุ่ม'}`,
      ...formatRuleLines(item.parsed),
      '',
      'ต่อไปเดสจะใช้กฎนี้เป็น context เวลามีคำสั่ง /su ในกลุ่มนี้'
    ].join('\n')
    const ackResult = rulesComplete(groupRules?.responseRules)
      ? await lineHelperRunner(['send', '--group-id', item.row.groupId, '--text', ackText, '--unsafe-no-verify'])
      : { ok: true, sent: false, reason: 'group_usage_rules_incomplete_no_ack_sent' }
    appendJsonl(lineRegistryLog, lineGroupRegistryRow({
      type: 'group_response_rules_recorded',
      row: item.row,
      details,
      rules: item.parsed,
      result: { ok: ackResult.ok, sent: Boolean(ackResult.sent), reason: ackResult.reason || null, error: ackResult.error || null },
    }))
    const message = room.addMessage({
      role: 'Codex',
      text: `[STATE] @เดส บันทึกกฎกลุ่ม LINE: ${details.groupName || 'ไม่ทราบชื่อกลุ่ม'} · ${compactText(formatRuleLines(item.parsed).join(' · '), 160)}`,
    })
    results.push({ row: item.row, details, rules: item.parsed, groupRules, ackResult, message })
  }
  hub.broadcast('message', room.snapshot())
  hub.broadcast('line:suda-oagent:rules', { results })
  return results
}

function pageProfileForThread(thread) {
  return getProfileKeyForOmniPage(thread?.pageId)
}

function isCommentThread(thread) {
  return ['facebook_comment', 'facebook_video_comment', 'instagram_comment'].includes(thread?.platform)
}

function commentIdForThread(thread) {
  const inbound = (thread?.messages || [])
    .filter((message) => message.direction === 'inbound' && message.providerMessageId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0]
  return inbound?.providerMessageId || thread?.providerThreadId || null
}

function compactText(value, limit = 160) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= limit) return text
  return `${text.slice(0, limit - 1)}…`
}

function rawBodyBuffer(req) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody
  if (typeof req.rawBody === 'string') return Buffer.from(req.rawBody)
  return Buffer.from(JSON.stringify(req.body || {}))
}

function verifyEasyStoreHmac(req, secret) {
  const value = String(req.get?.('EasyStore-Hmac-SHA256') || req.get?.('Easystore-Hmac-Sha256') || '').trim()
  if (!value || !secret) return false
  const calculated = createHmac('sha256', String(secret)).update(rawBodyBuffer(req)).digest('hex')
  const expected = Buffer.from(value)
  const actual = Buffer.from(calculated)
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}

function createDexSignals({ normalized, snapshot, insertedMessages = 0 }) {
  if (!insertedMessages) return []
  const pagesById = new Map((snapshot.pages || []).map((page) => [page.id, page]))
  const customersById = new Map((snapshot.customers || []).map((customer) => [customer.id, customer]))
  const threadsById = new Map((snapshot.threads || []).map((thread) => [thread.id, thread]))

  return (normalized.messages || [])
    .filter((message) => message.direction === 'inbound')
    .map((message) => {
      const thread = threadsById.get(message.threadId)
      const page = pagesById.get(thread?.pageId)
      const customer = customersById.get(thread?.customerId)
      return {
        threadId: message.threadId,
        messageId: message.id,
        pageId: thread?.pageId || null,
        pageName: page?.name || thread?.pageId || 'unknown_page',
        platform: thread?.platform || normalized.source || 'unknown',
        customerId: thread?.customerId || null,
        customerName: customer?.displayName || message.authorName || 'Customer',
        latestInboundAt: message.createdAt,
        latestInboundText: compactText(message.text || '[attachment]'),
        status: thread?.status || 'open',
        risk: thread?.risk || 'medium',
        action: thread?.risk === 'high' || thread?.status === 'needs_approval' ? 'review_before_reply' : 'draft_reply',
      }
    })
}

function signalDex({ room, hub, signals }) {
  if (!signals.length) return null
  const first = signals[0]
  const extra = signals.length > 1 ? ` (+${signals.length - 1})` : ''
  const message = room.addMessage({
    role: 'Codex',
    text: `[STATE] @เดส มีข้อความลูกค้าใหม่${extra}: ${first.pageName}/${first.platform} · ${first.customerName} · "${first.latestInboundText}" · thread=${first.threadId} · ${first.action}`,
  })
  hub.broadcast('message', room.snapshot())
  hub.broadcast('omni:attention', { signals, message })
  return message
}

function autoReplyThreadIds({ normalized, snapshot, existingMessageIds = new Set() }) {
  const threads = snapshot?.threads || []
  const pagesById = new Map((snapshot?.pages || []).map((page) => [page.id, page]))
  const inboundThreadIds = new Set(
    (normalized.messages || [])
      .filter((message) => message.direction === 'inbound' && !existingMessageIds.has(message.id))
      .map((message) => message.threadId)
      .filter(Boolean)
  )
  const ids = []
  for (const thread of normalized.threads || []) {
    if (!inboundThreadIds.has(thread.id)) continue
    const isComment = ['facebook_comment', 'facebook_video_comment', 'instagram_comment'].includes(thread.platform)
    const resolved = threads.find((candidate) => (
      (isComment
        ? ['facebook_comment', 'facebook_video_comment', 'instagram_comment'].includes(candidate.platform)
        : candidate.platform === 'facebook') &&
      candidate.pageId === thread.pageId &&
      candidate.customerId === thread.customerId &&
      (isComment || !String(candidate.id || '').startsWith('fb_webhook_'))
    )) || threads.find((candidate) => candidate.id === thread.id)
    const page = pagesById.get(resolved?.pageId || thread.pageId)
    if (page?.autoReplyEnabled === false) continue
    if (resolved?.id && !ids.includes(resolved.id)) ids.push(resolved.id)
  }
  return ids
}

function recoverAllowedFallbackDecision(decision) {
  if (decision?.ok !== false) return decision
  if (!decision.allowed || !String(decision.draftText || '').trim()) return decision
  return {
    ...decision,
    ok: true,
    degraded: true,
    helperError: decision.error || 'ai_helper_failed',
    reason: decision.reason || 'local_fallback_after_ai_helper_failed',
  }
}

function fallbackVisibleDraftText(decision) {
  const intent = String(decision?.intent || '').trim()
  if (intent === 'productImage') {
    return 'ลูกค้าขอดูภาพสินค้า ควรให้แอดมินแนบรูปสินค้าจริงหรือ product card ก่อนตอบกลับค่ะ'
  }
  if (intent === 'humanReview') {
    return 'ขอหยุดให้แอดมินตรวจคำตอบก่อนนะคะ เพื่อไม่ให้ตอบข้อมูลผิดซ้ำค่ะ'
  }
  if (['stock', 'price', 'faq', 'sizeAdvice'].includes(intent)) {
    return 'รับทราบค่ะ เดี๋ยวแอดมินตรวจข้อมูลสินค้าให้ก่อนนะคะ เพื่อไม่ให้แจ้งไซซ์ สี หรือสต็อกผิดค่ะ'
  }
  return 'รับทราบค่ะ เดี๋ยวแอดมินตรวจข้อมูลให้ก่อนนะคะ เพื่อไม่ให้ตอบข้อมูลผิดค่ะ'
}

function productImageAttachmentsForDecision(decision) {
  if (Array.isArray(decision?.attachments) && decision.attachments.length) {
    return normalizeDecisionAttachments(decision.attachments)
  }
  if (decision?.intent !== 'productImage') return []
  return (decision.productFacts?.variants || [])
    .map((variant) => String(variant.imageUrl || '').trim())
    .filter((url, index, rows) => /^https:\/\//i.test(url) && rows.indexOf(url) === index)
    .slice(0, 1)
    .map((url, index) => ({
      id: `ai_product_image_${index + 1}`,
      name: decision.productFacts?.productName || 'product image',
      type: 'image/jpeg',
      size: 0,
      url,
    }))
}

function normalizeDecisionAttachments(input = []) {
  if (!Array.isArray(input)) return []
  return input
    .map((item, index) => {
      const url = String(item?.url || item?.imageUrl || '').trim()
      const type = String(item?.type || 'image/jpeg').trim()
      if (!/^https:\/\//i.test(url) || (!type.startsWith('image/') && type !== 'image')) return null
      return {
        id: item.id || `ai_attachment_${index + 1}`,
        name: String(item.name || item.title || 'AI attachment').slice(0, 120),
        type: type === 'image' ? 'image/jpeg' : type,
        size: Number(item.size || 0) || 0,
        url,
        source: item.source || 'ai_decision_attachment',
      }
    })
    .filter(Boolean)
    .filter((item, index, rows) => rows.findIndex((candidate) => candidate.url === item.url) === index)
    .slice(0, 5)
}

function normalizeDecisionCarousel(input = []) {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => {
      const title = String(item?.title || '').trim().slice(0, 80)
      const subtitle = String(item?.subtitle || '').trim().slice(0, 80)
      const imageUrl = String(item?.imageUrl || item?.image_url || '').trim()
      if (!title || !/^https:\/\//i.test(imageUrl)) return null
      const buttons = Array.isArray(item?.buttons)
        ? item.buttons.map((button) => {
          const type = String(button?.type || 'web_url').trim()
          const buttonTitle = String(button?.title || '').trim().slice(0, 20)
          const url = String(button?.url || '').trim()
          if (type !== 'web_url' || !buttonTitle || !/^https:\/\//i.test(url)) return null
          return { type: 'web_url', title: buttonTitle, url }
        }).filter(Boolean).slice(0, 3)
        : []
      return {
        title,
        ...(subtitle ? { subtitle } : {}),
        imageUrl,
        ...(buttons.length ? { buttons } : {}),
      }
    })
    .filter(Boolean)
    .slice(0, 10)
}

function carouselAttachments(cards = []) {
  return normalizeDecisionCarousel(cards)
    .map((card, index) => ({
      id: `ai_carousel_card_${index + 1}`,
      name: card.title,
      type: 'image/jpeg',
      size: 0,
      url: card.imageUrl,
      source: 'ai_carousel_card',
    }))
    .filter((item, index, rows) => rows.findIndex((candidate) => candidate.url === item.url) === index)
}

const DEFAULT_CUSTOMER_SILENCE_FOLLOW_UP_DELAY_MS = 20 * 60 * 1000
const DEFAULT_CUSTOMER_SILENCE_FOLLOW_UP_TEXT = 'ยังสนใจตัวนี้อยู่ไหมคะ ถ้าต้องการต่อ แอดมินช่วยสรุปรายละเอียดให้ได้ค่ะ'

function normalizeFollowUpDelayMs(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_CUSTOMER_SILENCE_FOLLOW_UP_DELAY_MS
  return Math.min(parsed, 24 * 60 * 60 * 1000)
}

function threadIdsForCustomer(omni, threadId) {
  const snapshot = omni.snapshot()
  const baseThread = (snapshot.threads || []).find((thread) => thread.id === threadId)
  if (!baseThread) return new Set()
  return new Set((snapshot.threads || [])
    .filter((thread) => thread.customerId === baseThread.customerId)
    .map((thread) => thread.id))
}

function latestMessageForThread(omni, threadId) {
  const snapshot = omni.snapshot()
  const threadIds = threadIdsForCustomer(omni, threadId)
  if (!threadIds.size) return null
  return (snapshot.messages || [])
    .filter((message) => threadIds.has(message.threadId))
    .slice()
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null
}

function inboundMessageIdsForCustomer(omni, threadId) {
  const snapshot = omni.snapshot()
  const threadIds = threadIdsForCustomer(omni, threadId)
  return new Set((snapshot.messages || [])
    .filter((message) => threadIds.has(message.threadId) && message.direction === 'inbound')
    .map((message) => message.id)
    .filter(Boolean))
}

function hasNewInboundMessage(omni, threadId, baselineInboundIds = null) {
  if (!baselineInboundIds) return false
  const baseline = baselineInboundIds instanceof Set ? baselineInboundIds : new Set(baselineInboundIds)
  const current = inboundMessageIdsForCustomer(omni, threadId)
  for (const messageId of current) {
    if (!baseline.has(messageId)) return true
  }
  return false
}

function hasFollowUpForThread(omni, threadId) {
  const snapshot = omni.snapshot()
  const threadIds = threadIdsForCustomer(omni, threadId)
  if (!threadIds.size) return false
  return (snapshot.messages || []).some((message) => threadIds.has(message.threadId) && String(message.sourceRef || '').startsWith('ai_follow_up'))
}

async function sendCustomerSilenceFollowUp({
  omni,
  threadId,
  text = DEFAULT_CUSTOMER_SILENCE_FOLLOW_UP_TEXT,
  sendReply = sendFacebookReply,
  sendCommentReply = sendFacebookCommentReply,
  sendIgCommentReply = sendInstagramCommentReply,
  baselineInboundIds = null,
} = {}) {
  const thread = omni.getThread(threadId)
  if (!thread) return { ok: false, threadId, sent: false, sendSkipped: 'thread_not_found' }
  if (hasFollowUpForThread(omni, threadId)) return { ok: true, threadId, sent: false, sendSkipped: 'follow_up_already_sent' }
  if (hasNewInboundMessage(omni, threadId, baselineInboundIds)) {
    return { ok: true, threadId, sent: false, sendSkipped: 'customer_replied_or_no_outbound' }
  }

  const latest = latestMessageForThread(omni, threadId)
  if (!latest || latest.direction === 'inbound') {
    return { ok: true, threadId, sent: false, sendSkipped: 'customer_replied_or_no_outbound' }
  }

  const wsSettings = omni.getSettingsForThread ? omni.getSettingsForThread(threadId) : omni.getSettings()
  if (wsSettings?.ai?.customerSendEnabled !== true) {
    const draft = omni.recordManualReplyDraft({
      threadId,
      authorName: 'Anna Lynn AI',
      text,
      sourceRef: 'ai_follow_up_draft:customer_silence',
      actorType: 'ai',
      auditAction: 'ai_follow_up_draft_created',
    })
    return { ok: true, threadId, sent: false, sendSkipped: 'customer_send_guard_enabled', draft: draft.message, draftAudit: draft.audit, snapshot: draft.snapshot }
  }

  const pageProfile = pageProfileForThread(thread)
  if (!pageProfile) return { ok: true, threadId, sent: false, sendSkipped: 'unsupported_page_for_follow_up' }

  if (isCommentThread(thread)) {
    const commentId = commentIdForThread(thread)
    if (!commentId) return { ok: true, threadId, sent: false, sendSkipped: 'missing_comment_id' }
    const isInstagramComment = thread.platform === 'instagram_comment'
    const sendResult = await (isInstagramComment ? sendIgCommentReply : sendCommentReply)({ pageProfile, commentId, message: text })
    if (!sendResult?.ok) return { ok: true, threadId, sent: false, sendSkipped: sendResult?.error || 'send_failed', sendResult }
    const recorded = omni.recordOutboundMessage({
      threadId,
      authorName: 'Anna Lynn AI',
      text,
      providerMessageId: sendResult.response?.id || sendResult.response?.comment_id || null,
      sourceRef: `ai_follow_up_${isInstagramComment ? 'ig_comment' : 'meta_comment'}:${pageProfile}`,
    })
    return { ok: true, threadId, sent: true, sendResult, outbound: recorded.message, outboundAudit: recorded.audit, snapshot: recorded.snapshot }
  }

  const recipientId = thread.customer?.providerCustomerId
  if (!recipientId) return { ok: true, threadId, sent: false, sendSkipped: 'missing_recipient_id' }
  const sendResult = await sendReply({ pageProfile, recipientId, message: text })
  if (!sendResult?.ok) return { ok: true, threadId, sent: false, sendSkipped: sendResult?.error || 'send_failed', sendResult }
  const recorded = omni.recordOutboundMessage({
    threadId,
    authorName: 'Anna Lynn AI',
    text,
    providerMessageId: sendResult.response?.message_id || sendResult.response?.recipient_id || null,
    sourceRef: `ai_follow_up_meta:${pageProfile}`,
  })
  return { ok: true, threadId, sent: true, sendResult, outbound: recorded.message, outboundAudit: recorded.audit, snapshot: recorded.snapshot }
}

function scheduleCustomerSilenceFollowUp({
  omni,
  hub,
  threadId,
  delayMs,
  scheduler = setTimeout,
  text,
  sendReply,
  sendCommentReply,
  sendIgCommentReply,
}) {
  const baselineInboundIds = inboundMessageIdsForCustomer(omni, threadId)
  const timer = scheduler(async () => {
    try {
      const result = await sendCustomerSilenceFollowUp({ omni, threadId, text, sendReply, sendCommentReply, sendIgCommentReply, baselineInboundIds })
      if (result.snapshot) hub.broadcast('omni', result.snapshot)
      hub.broadcast('omni:auto-follow-up', result)
    } catch (error) {
      hub.broadcast('omni:auto-follow-up', { ok: false, threadId, error: error.message || 'auto_follow_up_failed' })
    }
  }, delayMs)
  timer?.unref?.()
  return timer
}

async function draftThreadReply({ omni, ai, threadId, send = false, sendReply = sendFacebookReply, sendCommentReply = sendFacebookCommentReply, sendIgCommentReply = sendInstagramCommentReply }) {
  const thread = omni.getThread(threadId)
  if (!thread) return { ok: false, error: 'thread_not_found', threadId }
  if (omni.isPageAutoReplyEnabled?.(thread.pageId) === false) {
    return { ok: true, threadId, sent: false, sendSkipped: 'page_auto_reply_disabled' }
  }
  // Workspace-scoped settings gate: derive settings from thread's workspace
  const wsSettings = omni.getSettingsForThread ? omni.getSettingsForThread(threadId) : omni.getSettings()
  if (wsSettings?.ai?.enabled === false) {
    return { ok: true, threadId, sent: false, sendSkipped: 'ai_disabled_for_workspace' }
  }
  const snapshot = { ...omni.snapshot(), settings: wsSettings }
  const policy = omni.getPolicyForThread(thread)
  let decision = recoverAllowedFallbackDecision(await ai.draft({ thread, snapshot, policy }))
  if (!decision.ok) return decision
  const decisionAttachments = productImageAttachmentsForDecision(decision)
  const decisionCarousel = normalizeDecisionCarousel(decision.carousel || decision.cards || [])
  const visibleAttachments = [...decisionAttachments, ...carouselAttachments(decisionCarousel)]
    .filter((item, index, rows) => rows.findIndex((candidate) => candidate.url === item.url) === index)
    .slice(0, 5)
  if (decisionAttachments.length || decisionCarousel.length) {
    decision = {
      ...decision,
      allowed: true,
      action: 'draft_ready',
      reason: decision.reason === 'guard_requires_human_or_more_data'
        ? 'https_product_or_carousel_attachment_ready'
        : decision.reason,
    }
  }
  const recorded = omni.recordAiDecision({
    threadId: thread.id,
    agentProfileId: policy?.agentProfileId,
    provider: decision.provider,
    model: decision.model,
    intent: decision.intent,
    risk: decision.risk,
    confidence: decision.confidence,
    action: decision.action,
    sourceIds: decision.sourceIds,
    reason: decision.reason,
  })
  const result = { ok: true, threadId: thread.id, decision, recorded: recorded.decision, snapshot: recorded.snapshot }

  function recordVisibleDraft(sendSkipped = 'draft_only') {
    const draftText = String(decision.draftText || '').trim() || fallbackVisibleDraftText(decision)
    if (!draftText) return { ...result, sent: false, sendSkipped }
    const draft = omni.recordManualReplyDraft({
      threadId: thread.id,
      authorName: 'Anna Lynn AI',
      text: draftText,
      attachments: visibleAttachments,
      sourceRef: `ai_auto_reply_draft:${recorded.decision.id}`,
      actorType: 'ai',
      auditAction: 'ai_reply_draft_created',
    })
    return {
      ...result,
      sent: false,
      sendSkipped,
      draft: draft.message,
      draftAudit: draft.audit,
      snapshot: draft.snapshot,
    }
  }

  if (!send) return recordVisibleDraft('draft_only')
  if (wsSettings?.ai?.customerSendEnabled !== true) {
    return recordVisibleDraft('customer_send_guard_enabled')
  }
  if (decision.intent === 'productImage' && !decisionAttachments.length && !decisionCarousel.length && !omniDirectSendAllEnabled()) {
    return recordVisibleDraft('image_attachment_required')
  }

  const pageProfile = pageProfileForThread(thread)
  if (!pageProfile) return { ...result, sent: false, sendSkipped: 'unsupported_page_for_auto_send' }
  if (!decision.allowed) return recordVisibleDraft('decision_not_allowed')
  if (isCommentThread(thread)) {
    if (decisionAttachments.length || decisionCarousel.length) return recordVisibleDraft('comment_assets_require_inbox_or_manual_send')
    const commentId = commentIdForThread(thread)
    if (!commentId) return { ...result, sent: false, sendSkipped: 'missing_comment_id' }
    const isInstagramComment = thread.platform === 'instagram_comment'
    const sendResult = await (isInstagramComment ? sendIgCommentReply : sendCommentReply)({ pageProfile, commentId, message: decision.draftText })
    if (!sendResult?.ok) return { ...result, sent: false, sendSkipped: sendResult?.error || 'send_failed', sendResult }
    const recordedOutbound = omni.recordOutboundMessage({
      threadId: thread.id,
      authorName: 'Anna Lynn AI',
      text: decision.draftText,
      providerMessageId: sendResult.response?.id || sendResult.response?.comment_id || null,
      sourceRef: `${isInstagramComment ? 'ig' : 'meta'}_comment_send:${pageProfile}`,
      decisionId: recorded.decision.id,
      decision,
    })
    return { ...result, sent: true, sendResult, outbound: recordedOutbound.message, outboundAudit: recordedOutbound.audit, snapshot: recordedOutbound.snapshot }
  }
  const recipientId = thread.customer?.providerCustomerId
  if (!recipientId) return { ...result, sent: false, sendSkipped: 'missing_recipient_id' }

  const attachments = decisionAttachments
  const sendResult = await sendReply({ pageProfile, recipientId, message: decision.draftText, attachments, carousel: decisionCarousel })
  if (!sendResult?.ok) return { ...result, sent: false, sendSkipped: sendResult?.error || 'send_failed', sendResult }
  const recordedOutbound = omni.recordOutboundMessage({
    threadId: thread.id,
    authorName: 'Anna Lynn AI',
    text: decision.draftText,
    attachments: visibleAttachments,
    providerMessageId: sendResult.response?.message_id || sendResult.response?.recipient_id || null,
    sourceRef: `meta_send:${pageProfile}`,
    decisionId: recorded.decision.id,
    decision,
  })
  return { ...result, sent: true, sendResult, outbound: recordedOutbound.message, outboundAudit: recordedOutbound.audit, snapshot: recordedOutbound.snapshot }
}

async function runMetaAutoReplies({
  omni,
  ai,
  hub,
  threadIds,
  shouldSend,
  sendReply,
  sendCommentReply,
  sendIgCommentReply,
  followUpEnabled = true,
  followUpDelayMs = DEFAULT_CUSTOMER_SILENCE_FOLLOW_UP_DELAY_MS,
  followUpText = DEFAULT_CUSTOMER_SILENCE_FOLLOW_UP_TEXT,
  followUpScheduler = setTimeout,
}) {
  try {
    const autoReplies = await Promise.all(threadIds.map((threadId) => (
      draftThreadReply({ omni, ai, threadId, send: shouldSend, sendReply, sendCommentReply, sendIgCommentReply })
    )))
    const scheduledFollowUps = []
    if (followUpEnabled) {
      for (const reply of autoReplies) {
        if (reply?.sent !== true || !reply.threadId) continue
        scheduleCustomerSilenceFollowUp({
          omni,
          hub,
          threadId: reply.threadId,
          delayMs: followUpDelayMs,
          scheduler: followUpScheduler,
          text: followUpText,
          sendReply,
          sendCommentReply,
          sendIgCommentReply,
        })
        scheduledFollowUps.push({ threadId: reply.threadId, delayMs: followUpDelayMs })
      }
    }
    const latestSnapshot = autoReplies.slice().reverse().find((reply) => reply?.snapshot)?.snapshot || omni.snapshot()
    if (threadIds.length) {
      hub.broadcast('omni', latestSnapshot)
      hub.broadcast('omni:auto-replies', { ok: true, autoReplies, scheduledFollowUps })
    }
    return autoReplies
  } catch (error) {
    const payload = { ok: false, error: error.message || 'meta_auto_reply_failed', threadIds }
    hub.broadcast('omni:auto-replies', payload)
    return [{ ok: false, error: payload.error }]
  }
}

export function mountWebhook(app, hub, room, options = {}) {
  const omni = options.omni || null
  const easyStore = options.easyStore || (canUseEasyStoreLiveLookup() ? createEasyStoreRuntime() : null)
  const ai = options.ai || createAiReplyEngine({ easyStore })
  const sendReply = options.sendReply || sendFacebookReply
  const sendCommentReply = options.sendCommentReply || sendFacebookCommentReply
  const sendIgCommentReply = options.sendIgCommentReply || sendInstagramCommentReply
  const metaVerifyToken = options.metaVerifyToken || process.env.META_VERIFY_TOKEN || ''
  const metaAutoReplyDefault = options.metaAutoReplyDefault ?? (envFlag('OMNI_META_WEBHOOK_AUTO_REPLY') || omniAutoSendOnWebhookEnabled())
  const metaAutoSendDefault = options.metaAutoSendDefault ?? (envFlag('OMNI_META_WEBHOOK_SEND') || omniAutoSendOnWebhookEnabled())
  const followUpEnabled = options.followUpEnabled ?? process.env.OMNI_META_FOLLOW_UP_ENABLED === '1'
  const followUpDelayMs = normalizeFollowUpDelayMs(options.followUpDelayMs ?? process.env.OMNI_META_FOLLOW_UP_DELAY_MS)
  const followUpText = options.followUpText || process.env.OMNI_META_FOLLOW_UP_TEXT || DEFAULT_CUSTOMER_SILENCE_FOLLOW_UP_TEXT
  const followUpScheduler = options.followUpScheduler || setTimeout
  const lineHelperRunner = options.lineHelperRunner || defaultLineHelperRunner
  const lineCaptureLog = options.lineCaptureLog || LINE_CAPTURE_LOG
  const lineRegistryLog = options.lineRegistryLog || LINE_GROUP_REGISTRY_LOG
  const lineRulesFile = options.lineRulesFile || LINE_GROUP_RULES_FILE
  const lineJoinIntakePush = options.lineJoinIntakePush ?? LINE_JOIN_INTAKE_PUSH_DEFAULT
  const easyStoreClientSecret = options.easyStoreClientSecret || process.env.EASY_STORE_CLIENT_SECRET || ''
  const metaCatalog = options.metaCatalog || createMetaCatalogRuntime()
  const awaitAutoReplies = options.awaitAutoReplies === true

  app.post('/webhook/telegram', (req, res) => {
    const { update_id, message } = req.body || {}
    if (!update_id || !message?.text) {
      return res.status(400).json({ ok: false, error: 'invalid_update' })
    }
    if (seen.has(update_id)) return res.json({ ok: true, dedup: true })
    seen.add(update_id)
    const msg = room.addMessage({ sender: 'Boss', text: message.text })
    hub.broadcast('message', room.snapshot())
    res.json({ ok: true, message: msg })
  })

  app.get('/webhook/meta', (req, res) => {
    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']
    if (mode === 'subscribe' && token && token === metaVerifyToken && challenge) {
      return res.status(200).send(String(challenge))
    }
    res.status(403).json({ ok: false, error: 'invalid_meta_webhook_challenge' })
  })

  app.post('/webhook/meta', async (req, res) => {
    if (!omni) return res.status(503).json({ ok: false, error: 'omni_service_unavailable' })
    const normalized = normalizeMetaWebhookPayload(req.body || {})
    const existingMessageIds = new Set((omni.snapshot().messages || []).map((message) => message.id))
    const result = omni.syncFacebookWebhookEvents(normalized)
    const dexSignals = createDexSignals({ normalized, snapshot: result.snapshot, insertedMessages: result.messages.inserted })
    const dexSignalMessage = signalDex({ room, hub, signals: dexSignals })
    hub.broadcast('omni', result.snapshot)
    const shouldAutoReply = req.query.autoReply === '0' || req.body?.autoReply === false
      ? false
      : req.query.autoReply === '1' || req.body?.autoReply === true || metaAutoReplyDefault
    const shouldSend = req.query.send === '0' || req.body?.send === false
      ? false
      : req.query.send === '1' || req.body?.send === true || metaAutoSendDefault
    const threadIds = shouldAutoReply ? autoReplyThreadIds({ normalized, snapshot: result.snapshot, existingMessageIds }) : []
    const autoReplyJob = threadIds.length
      ? runMetaAutoReplies({
        omni,
        ai,
        hub,
        threadIds,
        shouldSend,
        sendReply,
        sendCommentReply,
        sendIgCommentReply,
        followUpEnabled,
        followUpDelayMs,
        followUpText,
        followUpScheduler,
      })
      : Promise.resolve([])
    const autoReplies = awaitAutoReplies ? await autoReplyJob : []
    res.json({
      ok: true,
      result: {
        customers: result.customers,
        threads: result.threads,
        messages: result.messages,
        autoReplies,
        autoRepliesPending: awaitAutoReplies ? 0 : threadIds.length,
        autoReplyMode: awaitAutoReplies ? 'inline' : 'background',
        dexSignals,
        dexSignalMessage,
      },
    })
  })

  app.post('/webhook/tiktok/business-messaging', async (req, res) => {
    if (!omni) return res.status(503).json({ ok: false, error: 'omni_service_unavailable' })
    const normalized = normalizeTikTokMessagingWebhookPayload(req.body || {})
    const result = omni.syncTikTokMessagingWebhookEvents(normalized)
    const dexSignals = createDexSignals({ normalized, snapshot: result.snapshot, insertedMessages: result.messages.inserted })
    const dexSignalMessage = signalDex({ room, hub, signals: dexSignals })
    hub.broadcast('omni', result.snapshot)
    res.json({ ok: true, result: { customers: result.customers, threads: result.threads, messages: result.messages, dexSignals, dexSignalMessage } })
  })

  app.post('/webhook/easystore', async (req, res) => {
    if (!omni) return res.status(503).json({ ok: false, error: 'omni_service_unavailable' })
    if (!easyStoreClientSecret) return res.status(503).json({ ok: false, error: 'easystore_secret_missing' })
    if (!verifyEasyStoreHmac(req, easyStoreClientSecret)) {
      return res.status(401).json({ ok: false, error: 'invalid_easystore_hmac' })
    }
    const topic = req.query.topic || req.get('Easystore-Topic') || req.get('EasyStore-Topic') || req.body?.topic || ''
    const shopDomain = req.get('Easystore-Shop-Domain') || req.get('EasyStore-Shop-Domain') || req.body?.shop_domain || ''
    const normalized = normalizeEasyStoreWebhookPayload(req.body || {}, { topic, shopDomain })
    const result = omni.syncEasyStoreWebhookEvents(normalized)
    const metaCatalogResult = await metaCatalog.syncEasyStoreWebhook({
      payload: req.body || {},
      topic: normalized.topic,
      shopDomain,
    })
    hub.broadcast('omni', result.snapshot)
    res.json({
      ok: true,
      result: {
        source: result.source,
        topic: result.topic,
        metaCatalog: metaCatalogResult,
        customers: result.customers,
        threads: result.threads,
        messages: result.messages,
        orders: result.orders,
        inventorySnapshots: result.inventorySnapshots,
        connectorHealth: result.connectorHealth,
      },
    })
  })

  app.post('/webhook/line/suda-oagent', async (req, res) => {
    const rows = []
    for (const event of req.body?.events || []) {
      const source = event.source || {}
      const row = {
        receivedAt: new Date().toISOString(),
        eventType: event.type || '',
        sourceType: source.type || '',
        groupId: source.groupId || '',
        roomId: source.roomId || '',
        userId: source.userId || '',
        messageType: event.message?.type || '',
        text: event.message?.text || '',
        replyToken: event.replyToken ? 'present' : '',
      }
      rows.push(row)
      appendLineCapture(row, lineCaptureLog)
      if (row.sourceType === 'group' && row.groupId) await trySaveLineGroupId(row.groupId, lineHelperRunner)
    }
    const joinSignalMessage = await signalLineGroupJoin({ room, hub, rows, lineHelperRunner, lineRegistryLog, lineRulesFile, joinIntakePush: lineJoinIntakePush })
    const ruleResults = await handleSudaRuleCommands({ room, hub, rows, lineHelperRunner, lineRegistryLog, lineRulesFile })
    res.json({
      ok: true,
      captured: rows.length,
      groups: rows.filter((row) => row.groupId).map((row) => ({ groupId: row.groupId, eventType: row.eventType, text: row.text })),
      joinSignal: joinSignalMessage ? 'recorded' : 'none',
      dutyCommands: ruleResults.length,
      ruleCommands: ruleResults.length,
    })
  })

  app.post('/webhook/dex/auto-reply', async (req, res) => {
    if (!omni) return res.status(503).json({ ok: false, error: 'omni_service_unavailable' })
    const snapshot = omni.snapshot()
    const threadId = req.body?.threadId || snapshot.threads.slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0]?.id
    if (!threadId) return res.status(400).json({ ok: false, error: 'thread_id_required' })
    const result = await draftThreadReply({ omni, ai, threadId, send: req.body?.send === true, sendReply, sendCommentReply, sendIgCommentReply })
    if (!result.ok) return res.status(404).json(result)
    hub.broadcast('omni', result.snapshot)
    res.json(result)
  })
}
