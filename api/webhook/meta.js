import { normalizeMetaWebhookPayload } from '../../server/src/omni/metaWebhook.js'
import { createAiReplyEngine } from '../../server/src/omni/aiReplyEngine.js'
import { fetchOmniSnapshotFromSupabase, getWebhookSecret, json, readJsonBody, recordActionAuditToSupabase, recordAiDecisionToSupabase, supabaseRpc } from '../_omniSupabase.js'

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`
const AUTO_SEND_ENABLED = process.env.OMNI_AI_AUTO_SEND_ON_WEBHOOK === '1' || process.env.OMNI_AI_AUTO_SEND_ALL === '1'

const PAGE_PROFILE_BY_OMNI_PAGE = {
  page_annalynn: 'anna_lynn',
  page_mankynd: 'man_kynd',
  page_des: 'page_des',
  page_tangtob: 'tangtob',
  page_vz_dot: 'vz_dot',
  page_vz_viris_zamara: 'vz_viris_zamara',
}

const PAGE_TOKEN_ENV = {
  anna_lynn: ['META_PAGE_TOKEN_ANNA_LYNN', 'FB_ANNA_LYNN_PAGE_TOKEN', 'META_PAGE_ACCESS_TOKEN_ANNA_LYNN'],
  man_kynd: ['META_PAGE_TOKEN_MAN_KYND', 'FB_PAGE_TOKEN_MAN_KYND', 'META_PAGE_ACCESS_TOKEN_MAN_KYND'],
  page_des: ['META_PAGE_TOKEN_PAGE_DES', 'FB_PAGE_TOKEN_PAGE_DES', 'META_PAGE_ACCESS_TOKEN_PAGE_DES'],
  tangtob: ['META_PAGE_TOKEN_TANGTOB', 'FB_PAGE_TOKEN_TANGTOB'],
  vz_dot: ['META_PAGE_TOKEN_VZ_DOT', 'FB_PAGE_TOKEN_VZ_DOT'],
  vz_viris_zamara: ['META_PAGE_TOKEN_VZ_VIRIS_ZAMARA', 'FB_PAGE_TOKEN_VZ_VIRIS_ZAMARA'],
}

const PAGE_POLICY_FALLBACKS = {
  page_annalynn: 'policy_annalynn',
  page_annalynn_tiktok: 'policy_annalynn',
  page_mankynd: 'policy_mankynd',
  page_des: 'policy_page_des',
  page_tangtob: 'policy_default',
  page_vz_dot: 'policy_default',
  page_vz_viris_zamara: 'policy_default',
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const query = req.query || Object.fromEntries(new URL(req.url, 'https://omni.local').searchParams)
    const mode = query['hub.mode']
    const token = query['hub.verify_token']
    const challenge = query['hub.challenge']
    if (mode === 'subscribe' && challenge && token === process.env.META_VERIFY_TOKEN) {
      res.statusCode = 200
      return res.end(String(challenge))
    }
    return json(res, 403, { ok: false, error: 'invalid_meta_webhook_challenge' })
  }

  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' })

  try {
    const secret = getWebhookSecret()
    if (!secret) return json(res, 500, { ok: false, error: 'webhook_ingest_secret_missing' })
    const normalized = normalizeMetaWebhookPayload(await readJsonBody(req))
    const result = await supabaseRpc('omni_ingest_normalized', {
      payload: normalized,
      ingest_secret: secret,
    })
    const dryRun = String(req.query?.send || '') === '0'
    const autoReply = await autoReplyToMessengerInbox({ normalized, dryRun })
    return json(res, 200, { ok: true, result, autoReply })
  } catch (error) {
    return json(res, 400, { ok: false, error: error.message || 'meta_webhook_failed' })
  }
}

async function autoReplyToMessengerInbox({ normalized, dryRun }) {
  if (!AUTO_SEND_ENABLED && !dryRun) return { ok: true, enabled: false, sent: 0, skipped: 'auto_send_disabled' }

  const inboundThreadIds = [...new Set((normalized.messages || [])
    .filter((message) => message.direction === 'inbound')
    .map((message) => message.threadId)
    .filter((threadId) => String(threadId || '').startsWith('fb_webhook_')))]

  if (!inboundThreadIds.length) return { ok: true, enabled: AUTO_SEND_ENABLED, sent: 0, skipped: 'no_inbound_messenger_threads' }

  const snapshot = await fetchOmniSnapshotFromSupabase()
  const engine = createAiReplyEngine({
    provider: process.env.OMNI_AI_PROVIDER || 'local_rules',
    model: process.env.OMNI_AI_MODEL || 'dex-local-rules-v1',
  })
  const results = []

  for (const threadId of inboundThreadIds) {
    const thread = (snapshot.threads || []).find((item) => item.id === threadId)
    if (!thread) {
      results.push({ threadId, ok: false, sent: false, error: 'thread_not_found_after_ingest' })
      continue
    }

    const policy = policyForThread(snapshot, thread)
    const decision = await engine.draft({ thread, snapshot, policy })
    if (!decision.ok) {
      results.push({ threadId, ok: false, sent: false, error: decision.error || 'ai_draft_failed' })
      continue
    }
    const recorded = await recordDecision({ snapshot, thread, decision })
    if (!decision.allowed && process.env.OMNI_AI_AUTO_SEND_ALL !== '1') {
      const audit = await recordAutoReplyAudit({ thread, decision, recorded, sent: false, dryRun: false, sourceRef: 'vercel_webhook_meta_policy_skip' })
      results.push({ threadId, ok: true, sent: false, decision, recorded: recorded.decision, audit: audit.audit, skipped: 'policy_requires_approval' })
      continue
    }

    const recipientId = recipientIdForThread(snapshot, thread)
    const pageProfile = PAGE_PROFILE_BY_OMNI_PAGE[thread.pageId]
    const token = pageAccessToken(pageProfile)
    if (!recipientId || !pageProfile || !token.ok) {
      results.push({
        threadId,
        ok: false,
        sent: false,
        decision,
        error: !recipientId ? 'recipient_id_missing' : !pageProfile ? 'page_profile_missing' : 'page_token_missing',
      })
      continue
    }

    if (dryRun) {
      const audit = await recordAutoReplyAudit({ thread, decision, recorded, sent: false, dryRun: true, sourceRef: 'vercel_webhook_meta_dry_run' })
      results.push({ threadId, ok: true, sent: false, dryRun: true, recipientIdPresent: true, pageProfile, decision, recorded: recorded.decision, audit: audit.audit })
      continue
    }

    const sendResult = await sendMessengerReply({
      accessToken: token.value,
      recipientId,
      message: decision.draftText,
    })
    const audit = await recordAutoReplyAudit({
      thread,
      decision,
      recorded,
      sent: sendResult.ok,
      dryRun: false,
      providerMessageId: sendResult.response?.message_id || null,
      sourceRef: 'vercel_webhook_meta_auto_send',
    })
    results.push({
      threadId,
      ok: sendResult.ok,
      sent: sendResult.ok,
      pageProfile,
      decision,
      recorded: recorded.decision,
      audit: audit.audit,
      error: sendResult.error,
      status: sendResult.status,
    })
  }

  return {
    ok: results.every((item) => item.ok),
    enabled: AUTO_SEND_ENABLED,
    dryRun,
    sent: results.filter((item) => item.sent).length,
    results,
  }
}

function policyForThread(snapshot, thread) {
  const page = (snapshot.pages || []).find((item) => item.id === thread.pageId)
  const policyId = page?.policySetId || PAGE_POLICY_FALLBACKS[thread.pageId]
  return (snapshot.policySets || []).find((item) => item.id === policyId) || { autoSend: {} }
}

async function recordDecision({ snapshot, thread, decision }) {
  try {
    const page = (snapshot.pages || []).find((item) => item.id === thread.pageId)
    const row = await recordAiDecisionToSupabase(decision, { agentProfileId: page?.agentProfileId || null })
    return { ok: true, decision: row }
  } catch (error) {
    return { ok: false, decision: null, error: error.message || 'ai_decision_record_failed' }
  }
}

async function recordAutoReplyAudit({ thread, decision, recorded, sent, dryRun, providerMessageId = null, sourceRef }) {
  try {
    const audit = await recordActionAuditToSupabase({
      threadId: thread.id,
      action: sent ? 'customer_message_sent' : 'ai_reply_draft_created',
      actorType: 'ai',
      actorId: decision.provider || 'omni_ai_reply',
      before: {
        threadStatus: thread.status,
        unreadCount: thread.unreadCount || 0,
      },
      after: {
        decisionId: recorded.decision?.id || decision.id || null,
        intent: decision.intent || null,
        risk: decision.risk || null,
        confidence: decision.confidence || null,
        sourceIds: decision.sourceIds || [],
        originContext: decision.originContext || thread.originContext || {},
        policyDecision: decision.allowed ? 'allowed' : 'not_allowed',
        replyText: decision.draftText || '',
        sent,
        dryRun,
        providerMessageId,
      },
      sourceRef,
    })
    return { ok: true, audit }
  } catch (error) {
    return { ok: false, audit: null, error: error.message || 'auto_reply_audit_record_failed' }
  }
}

function recipientIdForThread(snapshot, thread) {
  const customer = (snapshot.customers || []).find((item) => item.id === thread.customerId)
  const providerId = String(customer?.providerCustomerId || '').trim()
  if (!providerId || providerId.startsWith('post_')) return ''
  return providerId
}

function pageAccessToken(pageProfile) {
  const candidates = [
    ...(PAGE_TOKEN_ENV[pageProfile] || []),
    'META_PAGE_ACCESS_TOKEN',
  ]
  const envName = candidates.find((name) => process.env[name])
  return envName ? { ok: true, value: process.env[envName], source: envName } : { ok: false, source: candidates }
}

async function sendMessengerReply({ accessToken, recipientId, message }) {
  const url = new URL(`${GRAPH_BASE}/me/messages`)
  url.searchParams.set('access_token', accessToken)
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
      message: { text: message },
    }),
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : {}
  if (!response.ok) return { ok: false, status: response.status, error: payload?.error?.message || payload?.error || 'meta_graph_error' }
  return { ok: true, status: response.status, response: payload }
}
