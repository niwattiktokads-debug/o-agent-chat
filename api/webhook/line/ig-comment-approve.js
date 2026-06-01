/**
 * /api/webhook/line/ig-comment-approve
 *
 * รับข้อความจากบอสผ่าน LINE (push reply จาก LINE Messaging API webhook)
 * Flow:
 *   บอสพิมพ์ "ok" → ส่ง AI draft ที่บันทึกไว้
 *   บอสพิมพ์ข้อความอื่น → ใช้ข้อความนั้นแทน draft
 *   บอสพิมพ์ "skip" → ข้ามไม่ตอบ
 *
 * State: เก็บ pending comment ใน Supabase table omni_ig_comment_pending
 *        (ถ้าไม่มี table ใช้ in-memory KV แทนชั่วคราว)
 */

import { json, readJsonBody, supabaseRpc, recordActionAuditToSupabase } from '../_omniSupabase.js'

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`
const LINE_VERIFY_TOKEN = process.env.LINE_CHANNEL_SECRET || ''

// In-memory fallback store: Map<lineUserId, pendingComment>
// { commentId, draftText, pageProfile, threadId, createdAt }
const pendingStore = new Map()

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' })

  let body
  try { body = await readJsonBody(req) } catch { return json(res, 400, { ok: false, error: 'invalid_json' }) }

  const events = body?.events || []
  const results = []

  for (const event of events) {
    if (event.type !== 'message' || event.message?.type !== 'text') continue
    const lineUserId = event.source?.userId || ''
    const replyToken = event.replyToken || ''
    const text = (event.message?.text || '').trim()

    // ดึง pending comment ของ user นี้
    const pending = await getPending(lineUserId)
    if (!pending) {
      // ไม่มี pending — ไม่ตอบ (ไม่ใช่ IG comment approval flow)
      continue
    }

    if (text.toLowerCase() === 'skip') {
      await clearPending(lineUserId)
      await lineReply(replyToken, '⏭️ ข้ามแล้ว ไม่ตอบคอมเมนต์นี้')
      results.push({ lineUserId, action: 'skipped', commentId: pending.commentId })
      continue
    }

    // ถ้าพิมพ์ "ok" ใช้ draft เดิม ถ้าพิมพ์อื่นใช้ข้อความนั้น
    const replyText = text.toLowerCase() === 'ok' ? pending.draftText : text

    if (!replyText) {
      await lineReply(replyToken, '❌ ไม่มีข้อความ draft — พิมพ์ข้อความที่ต้องการตอบโดยตรงครับ')
      continue
    }

    // ส่ง IG comment reply
    const sendResult = await sendIgCommentReply({
      commentId: pending.commentId,
      message: replyText,
      pageProfile: pending.pageProfile,
    })

    // บันทึก audit
    try {
      await recordActionAuditToSupabase({
        threadId: pending.threadId,
        action: sendResult.ok ? 'ig_comment_reply_sent' : 'ig_comment_reply_failed',
        actorType: 'boss',
        actorId: lineUserId,
        before: { draftText: pending.draftText },
        after: {
          replyText,
          commentId: pending.commentId,
          sent: sendResult.ok,
          usedDraft: text.toLowerCase() === 'ok',
          error: sendResult.error || null,
        },
        sourceRef: 'line_ig_comment_approve',
      })
    } catch (_) { /* non-fatal */ }

    if (sendResult.ok) {
      await clearPending(lineUserId)
      await lineReply(replyToken, `✅ ตอบแล้ว:\n"${replyText}"`)
      results.push({ lineUserId, action: 'sent', commentId: pending.commentId, replyText })
    } else {
      await lineReply(replyToken, `❌ ส่งไม่สำเร็จ: ${sendResult.error}\nลองพิมพ์ใหม่อีกครั้งครับ`)
      results.push({ lineUserId, action: 'failed', commentId: pending.commentId, error: sendResult.error })
    }
  }

  return json(res, 200, { ok: true, processed: results.length, results })
}

// ─── Pending Store (Supabase-first, in-memory fallback) ──────────────────────

export async function savePending(lineUserId, { commentId, draftText, pageProfile, threadId }) {
  const record = { lineUserId, commentId, draftText, pageProfile, threadId, createdAt: Date.now() }
  // ลอง Supabase ก่อน
  try {
    await supabaseRpc('omni_ig_comment_pending_upsert', record)
  } catch (_) {
    // fallback in-memory
    pendingStore.set(lineUserId, record)
  }
}

async function getPending(lineUserId) {
  try {
    const result = await supabaseRpc('omni_ig_comment_pending_get', { line_user_id: lineUserId })
    if (result?.data) return result.data
  } catch (_) { /* fallback */ }
  return pendingStore.get(lineUserId) || null
}

async function clearPending(lineUserId) {
  try {
    await supabaseRpc('omni_ig_comment_pending_clear', { line_user_id: lineUserId })
  } catch (_) { /* fallback */ }
  pendingStore.delete(lineUserId)
}

// ─── IG Comment Reply via Graph API ─────────────────────────────────────────

async function sendIgCommentReply({ commentId, message, pageProfile }) {
  const token = pageAccessToken(pageProfile)
  if (!token.ok) return { ok: false, error: `page_token_missing: ${pageProfile}` }

  const url = new URL(`${GRAPH_BASE}/${commentId}/replies`)
  url.searchParams.set('access_token', token.value)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message }),
    })
    const text = await res.text()
    const payload = text ? JSON.parse(text) : {}
    if (!res.ok) return { ok: false, status: res.status, error: payload?.error?.message || 'graph_api_error' }
    return { ok: true, status: res.status, response: payload }
  } catch (err) {
    return { ok: false, error: err.message || 'fetch_error' }
  }
}

// ─── LINE Reply ──────────────────────────────────────────────────────────────

async function lineReply(replyToken, text) {
  if (!replyToken) return
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
  if (!token) return
  try {
    await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
    })
  } catch (_) { /* non-fatal */ }
}

// ─── Page Token Helper ───────────────────────────────────────────────────────

const PAGE_TOKEN_ENV = {
  anna_lynn: ['META_PAGE_TOKEN_ANNA_LYNN', 'FB_ANNA_LYNN_PAGE_TOKEN', 'META_PAGE_ACCESS_TOKEN_ANNA_LYNN'],
  pl_store: ['META_PAGE_TOKEN_ANNA_LYNN', 'FB_ANNA_LYNN_PAGE_TOKEN'],
  man_kynd: ['META_PAGE_TOKEN_MAN_KYND', 'FB_PAGE_TOKEN_MAN_KYND'],
  page_des: ['META_PAGE_TOKEN_PAGE_DES', 'FB_PAGE_TOKEN_PAGE_DES'],
}

function pageAccessToken(pageProfile) {
  const candidates = [...(PAGE_TOKEN_ENV[pageProfile] || []), 'META_PAGE_ACCESS_TOKEN']
  const envName = candidates.find((name) => process.env[name])
  return envName ? { ok: true, value: process.env[envName], source: envName } : { ok: false, source: candidates }
}
