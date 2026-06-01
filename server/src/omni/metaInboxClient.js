import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import { FALLBACK_PAGE_PROFILES, loadPageRegistry } from './pageRegistry.js'

const execFileAsync = promisify(execFile)
const DEFAULT_HELPER = process.env.META_INBOX_HELPER || '/Users/babycuca/.codex/bin/meta-inbox-api'

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
  console.warn(`[meta-inbox-api] binary not found at ${helperPath} — send skipped`)
  return { ok: false, error: 'helper_not_available', helperPath }
}

async function defaultRunner(args, helperPath = helperPathFrom()) {
  const { stdout } = await execFileAsync(helperPath, args, {
    maxBuffer: 1024 * 1024 * 8,
    env: process.env,
  })
  return JSON.parse(stdout)
}

function getCustomerSender(senders = [], pageId) {
  return senders.find((sender) => sender.id !== pageId) || senders[0] || null
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
  const { pageProfile = 'anna_lynn', recipientId, message } = input
  if (!pageProfiles()[pageProfile]) throw new Error(`unknown_facebook_page:${pageProfile}`)
  if (!recipientId) throw new Error('recipient_id_required')
  if (!String(message || '').trim()) throw new Error('message_required')
  const helperPath = helperPathFrom(input)
  if (!input.runner && !runnerArg && !helperExists(helperPath)) return helperUnavailable(helperPath)
  const runner = input.runner || runnerArg || ((args) => defaultRunner(args, helperPath))
  const payload = await runner([
    'send-reply',
    `--page=${pageProfile}`,
    `--recipient-id=${recipientId}`,
    `--message=${String(message).trim()}`,
    '--approved',
  ])
  if (!payload?.ok) throw new Error(payload?.error || 'meta_send_reply_failed')
  return payload
}

export async function sendFacebookCommentReply(input = {}, runnerArg = null) {
  const { pageProfile = 'anna_lynn', commentId, message } = input
  if (!pageProfiles()[pageProfile]) throw new Error(`unknown_facebook_page:${pageProfile}`)
  if (!commentId) throw new Error('comment_id_required')
  if (!String(message || '').trim()) throw new Error('message_required')
  const helperPath = helperPathFrom(input)
  if (!input.runner && !runnerArg && !helperExists(helperPath)) return helperUnavailable(helperPath)
  const runner = input.runner || runnerArg || ((args) => defaultRunner(args, helperPath))
  const payload = await runner([
    'reply-comment',
    `--page=${pageProfile}`,
    `--comment-id=${commentId}`,
    `--message=${String(message).trim()}`,
    '--approved',
  ])
  if (!payload?.ok) throw new Error(payload?.error || 'meta_comment_reply_failed')
  return payload
}

// TODO: requires meta-inbox-api binary update to support reply-ig-comment
export async function sendInstagramCommentReply(input = {}, runnerArg = null) {
  const { pageProfile = 'ig_anna_lynn', commentId, message } = input
  const profile = pageProfiles()[pageProfile]
  if (!profile || profile.platform !== 'instagram') throw new Error(`unknown_instagram_page:${pageProfile}`)
  if (!commentId) throw new Error('comment_id_required')
  if (!String(message || '').trim()) throw new Error('message_required')
  const helperPath = helperPathFrom(input)
  if (!input.runner && !runnerArg && !helperExists(helperPath)) return helperUnavailable(helperPath)
  const runner = input.runner || runnerArg || ((args) => defaultRunner(args, helperPath))
  const payload = await runner([
    'reply-ig-comment',
    `--page=${pageProfile}`,
    `--comment-id=${commentId}`,
    `--message=${String(message).trim()}`,
    '--approved',
  ])
  if (!payload?.ok) throw new Error(payload?.error || 'instagram_comment_reply_failed')
  return payload
}
