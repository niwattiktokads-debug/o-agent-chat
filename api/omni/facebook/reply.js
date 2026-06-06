import { json, readJsonBody } from '../../_omniSupabase.js'

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`
const INSTAGRAM_GRAPH_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`

const PAGE_TOKEN_ENV = {
  anna_lynn: ['META_PAGE_TOKEN_ANNA_LYNN', 'FB_ANNA_LYNN_PAGE_TOKEN', 'META_PAGE_ACCESS_TOKEN_ANNA_LYNN'],
  ig_anna_lynn: ['META_PAGE_TOKEN_IG_ANNA_LYNN', 'IG_ANNA_LYNN_PAGE_TOKEN', 'META_IG_ACCESS_TOKEN_ANNA_LYNN'],
  man_kynd: ['META_PAGE_TOKEN_MAN_KYND', 'FB_PAGE_TOKEN_MAN_KYND', 'META_PAGE_ACCESS_TOKEN_MAN_KYND'],
  page_des: ['META_PAGE_TOKEN_PAGE_DES', 'FB_PAGE_TOKEN_PAGE_DES', 'META_PAGE_ACCESS_TOKEN_PAGE_DES'],
  fb_112154661515664: ['META_PAGE_TOKEN_112154661515664', 'FB_PAGE_TOKEN_112154661515664'],
  vz_dot: ['META_PAGE_TOKEN_VZ_DOT', 'FB_PAGE_TOKEN_VZ_DOT'],
  vz_viris_zamara: ['META_PAGE_TOKEN_VZ_VIRIS_ZAMARA', 'FB_PAGE_TOKEN_VZ_VIRIS_ZAMARA'],
}

function actionToken() {
  return process.env.OMNI_ACTION_TOKEN || process.env.OMNI_WEBHOOK_INGEST_SECRET || ''
}

function hasApproval(req, body) {
  const expected = actionToken()
  const received = req.headers['x-omni-action-token'] || body.actionToken || ''
  return body.approved === true && expected && received === expected
}

function pageAccessToken(pageProfile) {
  const candidates = [
    ...(PAGE_TOKEN_ENV[pageProfile] || []),
    'META_PAGE_ACCESS_TOKEN',
  ]
  const envName = candidates.find((name) => process.env[name])
  return envName ? { ok: true, value: process.env[envName], source: envName } : { ok: false, source: candidates }
}

function normalizeMetaGraphError(payload = {}, fallback = 'meta_graph_error') {
  const error = payload?.error || {}
  const message = typeof error === 'string' ? error : String(error.message || fallback)
  const code = Number(error.code || 0)
  const subcode = Number(error.error_subcode || 0)
  if (code === 190 || /validating access token|invalidated|expired|session/i.test(message)) {
    return {
      error: 'meta_page_token_invalid',
      detail: message,
      metaCode: code || null,
      metaSubcode: subcode || null,
      userMessage: 'Meta Page token ใช้ไม่ได้หรือหมดอายุ ต้องเปลี่ยน token ของเพจก่อน Omni จึงจะส่งตอบลูกค้าได้',
    }
  }
  return {
    error: message || fallback,
    detail: message || fallback,
    metaCode: code || null,
    metaSubcode: subcode || null,
    userMessage: 'Meta ส่งข้อความไม่สำเร็จ ตรวจ connector health และ permission ของเพจ',
  }
}

async function graphRequest(pathname, accessToken, { method = 'POST', body = {}, baseUrl = GRAPH_BASE } = {}) {
  const url = new URL(`${baseUrl}${pathname}`)
  url.searchParams.set('access_token', accessToken)
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : {}
  if (!response.ok) {
    return { ok: false, status: response.status, ...normalizeMetaGraphError(payload, 'meta_graph_error'), response: payload }
  }
  return { ok: true, status: response.status, response: payload }
}

async function sendInboxReply({ accessToken, recipientId, message }) {
  if (!recipientId) return { ok: false, error: 'recipient_id_required' }
  return graphRequest('/me/messages', accessToken, {
    body: {
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
      message: { text: message },
    },
  })
}

async function replyComment({ accessToken, commentId, message }) {
  if (!commentId) return { ok: false, error: 'comment_id_required' }
  return graphRequest(`/${encodeURIComponent(commentId)}/comments`, accessToken, {
    body: { message },
  })
}

async function replyInstagramComment({ accessToken, commentId, message }) {
  if (!commentId) return { ok: false, error: 'comment_id_required' }
  return graphRequest(`/${encodeURIComponent(commentId)}/replies`, accessToken, {
    baseUrl: INSTAGRAM_GRAPH_BASE,
    body: { message },
  })
}

async function privateReplyComment({ accessToken, commentId, message }) {
  if (!commentId) return { ok: false, error: 'comment_id_required' }
  return graphRequest(`/${encodeURIComponent(commentId)}/private_replies`, accessToken, {
    body: { message },
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' })

  try {
    const body = await readJsonBody(req)
    if (!hasApproval(req, body)) return json(res, 403, { ok: false, error: 'approval_required' })

    const message = String(body.message || '').trim()
    if (!message) return json(res, 400, { ok: false, error: 'message_required' })

    const pageProfile = String(body.pageProfile || body.page || 'anna_lynn').trim()
    const token = pageAccessToken(pageProfile)
    if (!token.ok) return json(res, 500, { ok: false, error: 'page_token_missing', pageProfile, expectedEnv: token.source })

    const action = String(body.action || 'send_inbox_reply').trim()
    const result = action === 'reply_comment'
      ? await replyComment({ accessToken: token.value, commentId: body.commentId, message })
      : action === 'reply_ig_comment'
        ? await replyInstagramComment({ accessToken: token.value, commentId: body.commentId, message })
      : action === 'private_reply_comment'
        ? await privateReplyComment({ accessToken: token.value, commentId: body.commentId, message })
        : await sendInboxReply({ accessToken: token.value, recipientId: body.recipientId, message })

    if (!result.ok) return json(res, result.status || 400, { ...result, pageProfile, action })
    return json(res, 200, {
      ok: true,
      pageProfile,
      action,
      tokenSource: token.source,
      response: result.response,
    })
  } catch (error) {
    return json(res, 400, { ok: false, error: error.message || 'facebook_reply_failed' })
  }
}
