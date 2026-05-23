import { normalizeMetaWebhookPayload } from './omni/metaWebhook.js'
import { createAiReplyEngine } from './omni/aiReplyEngine.js'
import { sendFacebookReply } from './omni/metaInboxClient.js'

const seen = new Set()

function pageProfileForThread(thread) {
  if (thread?.pageId === 'page_annalynn') return 'anna_lynn'
  return null
}

async function draftThreadReply({ omni, ai, threadId, send = false, sendReply = sendFacebookReply }) {
  const thread = omni.getThread(threadId)
  if (!thread) return { ok: false, error: 'thread_not_found', threadId }
  const snapshot = omni.snapshot()
  const policy = omni.getPolicyForThread(thread)
  const decision = ai.draft({ thread, snapshot, policy })
  if (!decision.ok) return decision
  const recorded = omni.recordAiDecision({
    threadId: thread.id,
    agentProfileId: policy?.agentProfileId,
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
  })
  return { ...result, sent: true, sendResult, outbound: recordedOutbound.message, snapshot: recordedOutbound.snapshot }
}

export function mountWebhook(app, hub, room, options = {}) {
  const omni = options.omni || null
  const ai = options.ai || createAiReplyEngine()
  const sendReply = options.sendReply || sendFacebookReply
  const metaVerifyToken = options.metaVerifyToken || process.env.META_VERIFY_TOKEN || ''

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
    const shouldAutoReply = req.query.autoReply === '1' || req.body?.autoReply === true
    const shouldSend = req.query.send === '1' || req.body?.send === true
    const autoReplies = shouldAutoReply
      ? await Promise.all(normalized.threads.map((thread) => draftThreadReply({ omni, ai, threadId: thread.id, send: shouldSend, sendReply })))
      : []
    hub.broadcast('omni', autoReplies.at(-1)?.snapshot || result.snapshot)
    res.json({ ok: true, result: { customers: result.customers, threads: result.threads, messages: result.messages, autoReplies } })
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
