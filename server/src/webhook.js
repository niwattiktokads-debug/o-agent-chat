import { normalizeMetaWebhookPayload } from './omni/metaWebhook.js'
import { createAiReplyEngine } from './omni/aiReplyEngine.js'
import { sendFacebookCommentReply, sendFacebookReply } from './omni/metaInboxClient.js'
import { getProfileKeyForOmniPage } from './omni/pageRegistry.js'
import { normalizeTikTokMessagingWebhookPayload } from './omni/tiktokMessagingClient.js'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { execFile } from 'node:child_process'

const seen = new Set()
const LINE_CAPTURE_LOG = process.env.LINE_SUDA_OAGENT_CAPTURE_LOG || '/Users/babycuca/Documents/O-Agent workspace/finance/staging/line_suda_oagent_capture_events.jsonl'
const LINE_GROUP_REGISTRY_LOG = process.env.LINE_SUDA_GROUP_REGISTRY_LOG || '/Users/babycuca/Documents/O-Agent workspace/finance/staging/line_suda_group_registry.jsonl'
const LINE_GROUP_RULES_FILE = process.env.LINE_SUDA_GROUP_RULES_FILE || '/Users/babycuca/Documents/O-Agent workspace/finance/staging/line_suda_group_rules.json'
const LINE_HELPER = process.env.LINE_SUDA_OAGENT_HELPER || '/Users/babycuca/.codex/bin/line-suda-oagent'
const LINE_JOIN_INTAKE_PUSH_DEFAULT = process.env.LINE_SUDA_JOIN_INTAKE_PUSH === '1'

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
  return ['facebook_comment', 'instagram_comment'].includes(thread?.platform)
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

function autoReplyThreadIds({ normalized, snapshot }) {
  const threads = snapshot?.threads || []
  const pagesById = new Map((snapshot?.pages || []).map((page) => [page.id, page]))
  const ids = []
  for (const thread of normalized.threads || []) {
    const resolved = threads.find((candidate) => (
      candidate.platform === 'facebook' &&
      candidate.pageId === thread.pageId &&
      candidate.customerId === thread.customerId &&
      !String(candidate.id || '').startsWith('fb_webhook_')
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

async function draftThreadReply({ omni, ai, threadId, send = false, sendReply = sendFacebookReply, sendCommentReply = sendFacebookCommentReply }) {
  const thread = omni.getThread(threadId)
  if (!thread) return { ok: false, error: 'thread_not_found', threadId }
  if (omni.isPageAutoReplyEnabled?.(thread.pageId) === false) {
    return { ok: true, threadId, sent: false, sendSkipped: 'page_auto_reply_disabled' }
  }
  const snapshot = omni.snapshot()
  const policy = omni.getPolicyForThread(thread)
  const decision = recoverAllowedFallbackDecision(await ai.draft({ thread, snapshot, policy }))
  if (!decision.ok) return decision
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
  const result = { ok: true, decision, recorded: recorded.decision, snapshot: recorded.snapshot }
  if (!send) return result

  const pageProfile = pageProfileForThread(thread)
  if (!pageProfile) return { ...result, sent: false, sendSkipped: 'unsupported_page_for_auto_send' }
  if (!decision.allowed) return { ...result, sent: false, sendSkipped: 'decision_not_allowed' }
  if (isCommentThread(thread)) {
    const commentId = commentIdForThread(thread)
    if (!commentId) return { ...result, sent: false, sendSkipped: 'missing_comment_id' }
    const sendResult = await sendCommentReply({ pageProfile, commentId, message: decision.draftText })
    const recordedOutbound = omni.recordOutboundMessage({
      threadId: thread.id,
      authorName: 'Anna Lynn AI',
      text: decision.draftText,
      providerMessageId: sendResult.response?.id || sendResult.response?.comment_id || null,
      sourceRef: `meta_comment_send:${pageProfile}`,
      decisionId: recorded.decision.id,
      decision,
    })
    return { ...result, sent: true, sendResult, outbound: recordedOutbound.message, outboundAudit: recordedOutbound.audit, snapshot: recordedOutbound.snapshot }
  }
  const recipientId = thread.customer?.providerCustomerId
  if (!recipientId) return { ...result, sent: false, sendSkipped: 'missing_recipient_id' }

  const sendResult = await sendReply({ pageProfile, recipientId, message: decision.draftText })
  const recordedOutbound = omni.recordOutboundMessage({
    threadId: thread.id,
    authorName: 'Anna Lynn AI',
    text: decision.draftText,
    providerMessageId: sendResult.response?.message_id || sendResult.response?.recipient_id || null,
    sourceRef: `meta_send:${pageProfile}`,
    decisionId: recorded.decision.id,
    decision,
  })
  return { ...result, sent: true, sendResult, outbound: recordedOutbound.message, outboundAudit: recordedOutbound.audit, snapshot: recordedOutbound.snapshot }
}

export function mountWebhook(app, hub, room, options = {}) {
  const omni = options.omni || null
  const ai = options.ai || createAiReplyEngine()
  const sendReply = options.sendReply || sendFacebookReply
  const sendCommentReply = options.sendCommentReply || sendFacebookCommentReply
  const metaVerifyToken = options.metaVerifyToken || process.env.META_VERIFY_TOKEN || ''
  const metaAutoReplyDefault = options.metaAutoReplyDefault ?? process.env.OMNI_META_WEBHOOK_AUTO_REPLY === '1'
  const metaAutoSendDefault = options.metaAutoSendDefault ?? process.env.OMNI_META_WEBHOOK_SEND === '1'
  const lineHelperRunner = options.lineHelperRunner || defaultLineHelperRunner
  const lineCaptureLog = options.lineCaptureLog || LINE_CAPTURE_LOG
  const lineRegistryLog = options.lineRegistryLog || LINE_GROUP_REGISTRY_LOG
  const lineRulesFile = options.lineRulesFile || LINE_GROUP_RULES_FILE
  const lineJoinIntakePush = options.lineJoinIntakePush ?? LINE_JOIN_INTAKE_PUSH_DEFAULT

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
    const result = omni.syncFacebookWebhookEvents(normalized)
    const dexSignals = createDexSignals({ normalized, snapshot: result.snapshot, insertedMessages: result.messages.inserted })
    const dexSignalMessage = signalDex({ room, hub, signals: dexSignals })
    const shouldAutoReply = req.query.autoReply === '0' || req.body?.autoReply === false
      ? false
      : req.query.autoReply === '1' || req.body?.autoReply === true || metaAutoReplyDefault
    const shouldSend = req.query.send === '0' || req.body?.send === false
      ? false
      : req.query.send === '1' || req.body?.send === true || metaAutoSendDefault
    const autoReplies = shouldAutoReply
      ? await Promise.all(autoReplyThreadIds({ normalized, snapshot: result.snapshot }).map((threadId) => (
        draftThreadReply({ omni, ai, threadId, send: shouldSend, sendReply, sendCommentReply })
      )))
      : []
    hub.broadcast('omni', autoReplies.at(-1)?.snapshot || result.snapshot)
    res.json({ ok: true, result: { customers: result.customers, threads: result.threads, messages: result.messages, autoReplies, dexSignals, dexSignalMessage } })
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
    const result = await draftThreadReply({ omni, ai, threadId, send: req.body?.send === true, sendReply, sendCommentReply })
    if (!result.ok) return res.status(404).json(result)
    hub.broadcast('omni', result.snapshot)
    res.json(result)
  })
}
