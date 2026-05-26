import { normalizeMetaWebhookPayload } from './omni/metaWebhook.js'
import { createAiReplyEngine } from './omni/aiReplyEngine.js'
import { sendFacebookReply } from './omni/metaInboxClient.js'
import { normalizeTikTokMessagingWebhookPayload } from './omni/tiktokMessagingClient.js'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { execFile } from 'node:child_process'

const seen = new Set()
const LINE_CAPTURE_LOG = process.env.LINE_SUDA_OAGENT_CAPTURE_LOG || '/Users/babycuca/Documents/O-Agent workspace/finance/staging/line_suda_oagent_capture_events.jsonl'
const LINE_HELPER = process.env.LINE_SUDA_OAGENT_HELPER || '/Users/babycuca/.codex/bin/line-suda-oagent'

function appendLineCapture(row) {
  mkdirSync(dirname(LINE_CAPTURE_LOG), { recursive: true })
  appendFileSync(LINE_CAPTURE_LOG, `${JSON.stringify(row)}\n`)
}

function trySaveLineGroupId(groupId) {
  if (!groupId) return
  execFile(LINE_HELPER, ['set-group-id', '--group-id', groupId], { env: process.env }, () => {})
}

function signalLineGroupJoin({ room, hub, rows }) {
  const joins = rows.filter((row) => row.sourceType === 'group' && row.groupId && row.eventType === 'join')
  if (!joins.length) return null
  const first = joins[0]
  const extra = joins.length > 1 ? ` (+${joins.length - 1})` : ''
  const message = room.addMessage({
    role: 'Codex',
    text: `[STATE] @เดส สุดาถูกเพิ่มเข้ากลุ่ม LINE ใหม่${extra}: groupId=${first.groupId} · กำลัง verify กลุ่มและบันทึก target ถ้าตรง O-agent`,
  })
  hub.broadcast('message', room.snapshot())
  hub.broadcast('line:suda-oagent:join', { joins, message })
  return message
}

function pageProfileForThread(thread) {
  if (thread?.pageId === 'page_mankynd') return 'man_kynd'
  if (thread?.pageId === 'page_annalynn') return 'anna_lynn'
  if (thread?.pageId === 'page_des') return 'page_des'
  if (thread?.pageId === 'page_fb_112154661515664') return 'fb_112154661515664'
  return null
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

async function draftThreadReply({ omni, ai, threadId, send = false, sendReply = sendFacebookReply }) {
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
  const metaVerifyToken = options.metaVerifyToken || process.env.META_VERIFY_TOKEN || ''
  const metaAutoReplyDefault = options.metaAutoReplyDefault ?? process.env.OMNI_META_WEBHOOK_AUTO_REPLY === '1'
  const metaAutoSendDefault = options.metaAutoSendDefault ?? process.env.OMNI_META_WEBHOOK_SEND === '1'

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
        draftThreadReply({ omni, ai, threadId, send: shouldSend, sendReply })
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

  app.post('/webhook/line/suda-oagent', (req, res) => {
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
      appendLineCapture(row)
      if (row.sourceType === 'group' && row.groupId) trySaveLineGroupId(row.groupId)
    }
    const joinSignalMessage = signalLineGroupJoin({ room, hub, rows })
    res.json({
      ok: true,
      captured: rows.length,
      groups: rows.filter((row) => row.groupId).map((row) => ({ groupId: row.groupId, eventType: row.eventType, text: row.text })),
      joinSignal: joinSignalMessage ? 'sent' : 'none',
    })
  })

  app.post('/webhook/dex/auto-reply', async (req, res) => {
    if (!omni) return res.status(503).json({ ok: false, error: 'omni_service_unavailable' })
    const snapshot = omni.snapshot()
    const threadId = req.body?.threadId || snapshot.threads.slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0]?.id
    if (!threadId) return res.status(400).json({ ok: false, error: 'thread_id_required' })
    const result = await draftThreadReply({ omni, ai, threadId, send: req.body?.send === true, sendReply })
    if (!result.ok) return res.status(404).json(result)
    hub.broadcast('omni', result.snapshot)
    res.json(result)
  })
}
