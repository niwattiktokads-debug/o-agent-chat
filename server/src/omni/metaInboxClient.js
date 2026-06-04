import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import { FALLBACK_PAGE_PROFILES, loadPageRegistry } from './pageRegistry.js'

const execFileAsync = promisify(execFile)
const DEFAULT_HELPER = ''
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0'
const FACEBOOK_GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`
const INSTAGRAM_GRAPH_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`

// Facebook page token env mapping
const FB_PAGE_TOKEN_ENV = {
  man_kynd: ['META_PAGE_TOKEN_MAN_KYND'],
  anna_lynn: ['META_PAGE_TOKEN_ANNA_LYNN'],
  page_des: ['META_PAGE_TOKEN_PAGE_DES'],
  fb_112154661515664: ['META_PAGE_TOKEN_112154661515664'],
  vz_viris_zamara: ['META_PAGE_TOKEN_VZ_VIRIS_ZAMARA'],
}

function fbPageAccessToken(pageProfile) {
  const candidates = [...(FB_PAGE_TOKEN_ENV[pageProfile] || []), 'META_PAGE_ACCESS_TOKEN']
  const envName = candidates.find((name) => process.env[name])
  return envName
    ? { ok: true, value: process.env[envName], source: envName }
    : { ok: false, source: candidates }
}

const IG_PAGE_TOKEN_ENV = {
  ig_anna_lynn: ['META_PAGE_TOKEN_IG_ANNA_LYNN', 'IG_ANNA_LYNN_PAGE_TOKEN'],
  ig_man_kynd: ['META_PAGE_TOKEN_IG_MAN_KYND', 'IG_MAN_KYND_PAGE_TOKEN'],
  ig_page_des: ['META_PAGE_TOKEN_IG_PAGE_DES', 'IG_PAGE_DES_PAGE_TOKEN'],
  ig_fb_112154661515664: ['META_PAGE_TOKEN_IG_112154661515664', 'IG_112154661515664_PAGE_TOKEN'],
  ig_vz_viris_zamara: ['META_PAGE_TOKEN_VZ_VIRIS_ZAMARA'],
}

function igPageAccessToken(pageProfile) {
  const candidates = [...(IG_PAGE_TOKEN_ENV[pageProfile] || []), 'META_IG_ACCESS_TOKEN']
  const envName = candidates.find((name) => process.env[name])
  return envName
    ? { ok: true, value: process.env[envName], source: envName }
    : { ok: false, source: candidates }
}

export const FACEBOOK_PAGE_PROFILES = FALLBACK_PAGE_PROFILES

function pageProfiles() {
  return loadPageRegistry()
}

function helperPathFrom(input = {}) {
  return input.helperPath || process.env.META_INBOX_HELPER || DEFAULT_HELPER
}

function helperExists(helperPath) {
  try {
    return Boolean(helperPath && existsSync(helperPath))
  } catch (_error) {
    return false
  }
}

function helperUnavailable(helperPath) {
  console.warn(`[meta-inbox-api] binary not found at ${helperPath || 'META_INBOX_HELPER'} — send skipped`)
  return { ok: false, error: 'helper_not_available', helperPath }
}

async function defaultRunner(args, helperPath = helperPathFrom()) {
  if (!helperPath || !helperExists(helperPath)) return helperUnavailable(helperPath)
  const { stdout } = await execFileAsync(helperPath, args, {
    maxBuffer: 1024 * 1024 * 8,
    env: process.env,
  })
  return JSON.parse(stdout)
}

function getCustomerSender(senders = [], pageId) {
  return senders.find((sender) => sender.id !== pageId) || senders[0] || null
}

function profileImageUrl(profile = {}) {
  return profile.profile_pic
    || profile.profilePic
    || profile.picture?.data?.url
    || profile.picture?.url
    || profile.avatarUrl
    || profile.imageUrl
    || ''
}

function normalizeMetaThreadMessages({ conversation, customer, pageId, threadResponse }) {
  const threadId = `fb_${conversation.id}`
  const rows = threadResponse?.data || []
  return rows
    .filter((message) => message.id && (message.message || message.attachments))
    .map((message) => {
      const fromPage = message.from?.id === pageId
      return {
        id: `fb_msg_${message.id}`,
        threadId,
        direction: fromPage ? 'outbound' : 'inbound',
        authorName: message.from?.name || (fromPage ? 'Facebook Page' : customer?.name || 'Facebook Customer'),
        text: String(message.message || '').trim(),
        createdAt: message.created_time || conversation.updated_time || null,
        providerMessageId: message.id,
        sourceRef: `meta_thread:${conversation.id}`,
      }
    })
}

function normalizeMetaConversationPreview({ conversation, customer }) {
  const latestText = conversation.snippet || ''
  if (!latestText) return null
  return {
    id: `fb_preview_${conversation.id}`,
    threadId: `fb_${conversation.id}`,
    direction: 'inbound',
    authorName: customer?.name || 'Facebook Customer',
    text: latestText,
    createdAt: conversation.updated_time || null,
    providerMessageId: `${conversation.id}:snippet`,
    sourceRef: `meta_conversation:${conversation.id}`,
  }
}

export function normalizeMetaConversations({ pageProfile, response, threadMessagesByConversationId = {} }) {
  const profile = pageProfiles()[pageProfile]
  if (!profile) throw new Error(`unknown_facebook_page:${pageProfile}`)

  const conversations = response?.data || []
  const customers = []
  const threads = []
  const messages = []

  for (const conversation of conversations) {
    const customer = getCustomerSender(conversation.senders?.data, profile.pageId)
    const customerId = customer?.id ? `fb_customer_${customer.id}` : `fb_customer_unknown_${conversation.id}`
    const threadId = `fb_${conversation.id}`

    customers.push({
      id: customerId,
      displayName: customer?.name || 'Facebook Customer',
      platform: 'facebook',
      providerCustomerId: customer?.id || null,
      avatarUrl: profileImageUrl(customer),
      matchConfidence: customer?.id ? 1 : 0.2,
    })

    threads.push({
      id: threadId,
      providerThreadId: conversation.id,
      pageId: profile.omniPageId,
      platform: 'facebook',
      customerId,
      status: conversation.unread_count > 0 ? 'open' : 'draft_ready',
      intent: 'unknown',
      risk: 'medium',
      unreadCount: conversation.unread_count || 0,
      messageCount: conversation.message_count || 0,
      updatedAt: conversation.updated_time || null,
      link: conversation.link || null,
    })

    const detailedMessages = normalizeMetaThreadMessages({
      conversation,
      customer,
      pageId: profile.pageId,
      threadResponse: threadMessagesByConversationId[conversation.id],
    })

    if (detailedMessages.length) {
      messages.push(...detailedMessages)
    } else {
      const preview = normalizeMetaConversationPreview({ conversation, customer })
      if (preview) messages.push(preview)
    }
  }

  return { page: profile, threads, customers, messages }
}

export async function listFacebookConversations({ pageProfile = 'anna_lynn', runner = defaultRunner } = {}) {
  if (!pageProfiles()[pageProfile]) throw new Error(`unknown_facebook_page:${pageProfile}`)
  const payload = await runner(['list-conversations', `--page=${pageProfile}`])
  if (!payload?.ok) throw new Error(payload?.error || 'meta_inbox_failed')
  const threadMessagesByConversationId = {}
  for (const conversation of payload.response?.data || []) {
    const threadPayload = await runner(['read-thread', `--page=${pageProfile}`, `--conversation-id=${conversation.id}`, '--limit=20'])
    if (threadPayload?.ok) threadMessagesByConversationId[conversation.id] = threadPayload.response
  }
  return normalizeMetaConversations({ pageProfile, response: payload.response, threadMessagesByConversationId })
}

export async function sendFacebookReply(input = {}, runnerArg = null) {
  const { pageProfile = 'anna_lynn', recipientId, message, fetchImpl = fetch } = input
  if (!pageProfiles()[pageProfile]) throw new Error(`unknown_facebook_page:${pageProfile}`)
  if (!recipientId) throw new Error('recipient_id_required')
  const text = String(message || '').trim()
  const attachments = normalizeFacebookSendAttachments(input.attachments || [])
  if (!text && attachments.length === 0) throw new Error('message_required')
  // ถ้ามี custom runner inject มา (เช่นใน test) ให้ใช้ runner นั้นแทน
  if (input.runner || runnerArg) {
    if (attachments.length > 0) return { ok: false, error: 'facebook_attachment_helper_not_supported' }
    const runner = input.runner || runnerArg
    const payload = await runner([
      'send-reply',
      `--page=${pageProfile}`,
      `--recipient-id=${recipientId}`,
      `--message=${text}`,
      '--approved',
    ])
    if (!payload?.ok) throw new Error(payload?.error || 'meta_send_reply_failed')
    return payload
  }
  if (input.helperPath) {
    if (attachments.length > 0) return { ok: false, error: 'facebook_attachment_helper_not_supported' }
    const helperPath = helperPathFrom(input)
    if (!helperExists(helperPath)) return helperUnavailable(helperPath)
    const payload = await defaultRunner([
      'send-reply',
      `--page=${pageProfile}`,
      `--recipient-id=${recipientId}`,
      `--message=${text}`,
      '--approved',
    ], helperPath)
    if (!payload?.ok) throw new Error(payload?.error || 'meta_send_reply_failed')
    return payload
  }
  // Direct Graph API call (production path — no binary required)
  const token = fbPageAccessToken(pageProfile)
  if (!token.ok) {
    return { ok: false, error: 'fb_page_token_missing', pageProfile, expectedEnv: token.source }
  }
  const url = new URL(`${FACEBOOK_GRAPH_BASE}/me/messages`)
  url.searchParams.set('access_token', token.value)
  const messages = []
  if (text) messages.push({ text })
  for (const attachment of attachments) {
    messages.push({
      attachment: {
        type: attachment.sendType,
        payload: {
          url: attachment.url,
          is_reusable: true,
        },
      },
    })
  }
  const responses = []
  for (const messagePayload of messages) {
    let response
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recipient: { id: recipientId }, messaging_type: 'RESPONSE', message: messagePayload }),
      })
    } catch (networkError) {
      return { ok: false, error: 'fb_graph_network_error', detail: networkError.message, responses }
    }
    const responseText = await response.text()
    const payload = responseText ? JSON.parse(responseText) : {}
    responses.push({ status: response.status, response: payload })
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: payload?.error?.message || payload?.error || 'fb_graph_error',
        response: payload,
        responses,
      }
    }
  }
  const last = responses[responses.length - 1] || { status: 200, response: {} }
  return { ok: true, status: last.status, response: last.response, responses }
}

function normalizeFacebookSendAttachments(input = []) {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => {
      const type = String(item?.type || '').trim()
      const url = String(item?.url || item?.imageUrl || '').trim()
      if (!url || !/^https:\/\//i.test(url)) return null
      const sendType = type.startsWith('image/') || type === 'image' || !type ? 'image' : type
      if (sendType !== 'image') return null
      return {
        id: item.id || null,
        name: item.name || item.alt || 'image',
        type: type || 'image/jpeg',
        sendType,
        url,
      }
    })
    .filter(Boolean)
    .slice(0, 5)
}

export async function sendFacebookCommentReply(input = {}, runnerArg = null) {
  const { pageProfile = 'anna_lynn', commentId, message } = input
  if (!pageProfiles()[pageProfile]) throw new Error(`unknown_facebook_page:${pageProfile}`)
  if (!commentId) throw new Error('comment_id_required')
  const text = String(message || '').trim()
  if (!text) throw new Error('message_required')
  // ถ้ามี custom runner inject มา (เช่นใน test) ให้ใช้ runner นั้นแทน
  if (input.runner || runnerArg) {
    const runner = input.runner || runnerArg
    const payload = await runner([
      'reply-comment',
      `--page=${pageProfile}`,
      `--comment-id=${commentId}`,
      `--message=${text}`,
      '--approved',
    ])
    if (!payload?.ok) throw new Error(payload?.error || 'meta_comment_reply_failed')
    return payload
  }
  if (input.helperPath) {
    const helperPath = helperPathFrom(input)
    if (!helperExists(helperPath)) return helperUnavailable(helperPath)
    const payload = await defaultRunner([
      'reply-comment',
      `--page=${pageProfile}`,
      `--comment-id=${commentId}`,
      `--message=${text}`,
      '--approved',
    ], helperPath)
    if (!payload?.ok) throw new Error(payload?.error || 'meta_comment_reply_failed')
    return payload
  }
  // Direct Graph API call (production path — no binary required)
  const token = fbPageAccessToken(pageProfile)
  if (!token.ok) {
    return { ok: false, error: 'fb_page_token_missing', pageProfile, expectedEnv: token.source }
  }
  const url = new URL(`${FACEBOOK_GRAPH_BASE}/${encodeURIComponent(commentId)}/comments`)
  url.searchParams.set('access_token', token.value)
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: text }),
    })
  } catch (networkError) {
    return { ok: false, error: 'fb_graph_network_error', detail: networkError.message }
  }
  const responseText = await response.text()
  const payload = responseText ? JSON.parse(responseText) : {}
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: payload?.error?.message || payload?.error || 'fb_graph_comment_error',
      response: payload,
    }
  }
  return { ok: true, status: response.status, response: payload }
}

export async function sendInstagramCommentReply(input = {}, _runnerArg = null) {
  const { pageProfile = 'ig_anna_lynn', commentId, message } = input
  const profile = pageProfiles()[pageProfile]
  if (!profile || profile.platform !== 'instagram') throw new Error(`unknown_instagram_page:${pageProfile}`)
  if (!commentId) throw new Error('comment_id_required')
  const text = String(message || '').trim()
  if (!text) throw new Error('message_required')

  // ถ้ามี custom runner inject มา (เช่นใน test) ให้ใช้ runner นั้นแทน
  if (input.runner || _runnerArg) {
    const runner = input.runner || _runnerArg
    const payload = await runner([
      'reply-ig-comment',
      `--page=${pageProfile}`,
      `--comment-id=${commentId}`,
      `--message=${text}`,
      '--approved',
    ])
    if (!payload?.ok) throw new Error(payload?.error || 'instagram_comment_reply_failed')
    return payload
  }

  // Direct Graph API call (production path — no binary required)
  const token = igPageAccessToken(pageProfile)
  if (!token.ok) {
    return { ok: false, error: 'ig_page_token_missing', pageProfile, expectedEnv: token.source }
  }

  const url = new URL(`${INSTAGRAM_GRAPH_BASE}/${encodeURIComponent(commentId)}/replies`)
  url.searchParams.set('access_token', token.value)

  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: text }),
    })
  } catch (networkError) {
    return { ok: false, error: 'ig_graph_network_error', detail: networkError.message }
  }

  const responseText = await response.text()
  const payload = responseText ? JSON.parse(responseText) : {}

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: payload?.error?.message || payload?.error || 'ig_graph_error',
      response: payload,
    }
  }

  return { ok: true, status: response.status, response: payload }
}

export async function fetchInstagramProfile(input = {}) {
  const { pageProfile = 'ig_anna_lynn', fetchImpl = fetch } = input
  const profile = pageProfiles()[pageProfile]
  if (!profile || profile.platform !== 'instagram') throw new Error(`unknown_instagram_page:${pageProfile}`)

  const token = igPageAccessToken(pageProfile)
  if (!token.ok) {
    return { ok: false, error: 'ig_page_token_missing', pageProfile, expectedEnv: token.source }
  }

  const url = new URL(`${FACEBOOK_GRAPH_BASE}/${encodeURIComponent(profile.pageId)}`)
  url.searchParams.set('fields', 'id,username,name,profile_picture_url')
  url.searchParams.set('access_token', token.value)

  let response
  try {
    response = await fetchImpl(url)
  } catch (networkError) {
    return { ok: false, error: 'ig_graph_network_error', detail: networkError.message }
  }

  const responseText = await response.text()
  const payload = responseText ? JSON.parse(responseText) : {}
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: payload?.error?.message || payload?.error || 'ig_graph_profile_error',
      response: payload,
    }
  }

  return {
    ok: true,
    status: response.status,
    pageProfile,
    profile: {
      id: payload.id || profile.pageId,
      username: payload.username || null,
      name: payload.name || profile.pageName || null,
      avatarUrl: payload.profile_picture_url || '',
      provider: 'instagram',
      sourceRef: `instagram_profile:${pageProfile}`,
    },
  }
}
