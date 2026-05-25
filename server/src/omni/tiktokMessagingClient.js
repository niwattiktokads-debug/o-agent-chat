import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const DEFAULT_HELPER = process.env.TIKTOK_MESSAGING_HELPER || '/Users/babycuca/.codex/bin/tiktok-messaging-api'

function stringOrNull(value) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text || null
}

function numberOrNow(value) {
  const number = Number(value)
  if (Number.isFinite(number) && number > 0) return number
  return Date.now()
}

function toIso(value) {
  const number = numberOrNow(value)
  return new Date(number > 10_000_000_000 ? number : number * 1000).toISOString()
}

export function normalizeTikTokMessagingWebhookPayload(payload = {}) {
  const events = Array.isArray(payload.events)
    ? payload.events
    : Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.messages)
        ? payload.messages
        : payload.event
          ? [payload.event]
          : payload.message
            ? [payload.message]
            : []

  const customers = []
  const threads = []
  const messages = []

  for (const [index, event] of events.entries()) {
    const message = event.message || event
    const conversationId = stringOrNull(event.conversation_id || event.conversationId || message.conversation_id || message.conversationId)
    const sender = event.sender || message.sender || {}
    const senderId = stringOrNull(event.sender_id || event.senderId || sender.id || message.sender_id || message.senderId)
    const text = stringOrNull(message.text || event.text || message.content || event.content)
    if (!conversationId || !senderId || !text) continue

    const messageId = stringOrNull(message.message_id || message.messageId || event.message_id || event.messageId) || `${conversationId}:${index}`
    const customerId = `ttbm_customer_${senderId}`
    const threadId = `ttbm_${conversationId}`
    const createdAt = toIso(message.create_time || message.timestamp || event.create_time || event.timestamp)

    customers.push({
      id: customerId,
      displayName: sender.display_name || sender.name || `TikTok ${senderId}`,
      platform: 'tiktok',
      providerCustomerId: senderId,
      matchConfidence: 0.8,
      sourceRef: `tiktok_business_messaging:${conversationId}`,
    })

    threads.push({
      id: threadId,
      providerThreadId: conversationId,
      pageId: 'page_annalynn_tiktok',
      platform: 'tiktok',
      provider: 'tiktok_business_messaging',
      customerId,
      status: 'open',
      intent: 'unknown',
      risk: 'medium',
      unreadCount: 1,
      messageCount: 1,
      updatedAt: createdAt,
      sourceRef: `tiktok_business_messaging:${conversationId}`,
    })

    messages.push({
      id: `ttbm_msg_${messageId}`,
      threadId,
      direction: 'inbound',
      authorName: sender.display_name || sender.name || 'TikTok Customer',
      text,
      createdAt,
      providerMessageId: messageId,
      sourceRef: `tiktok_business_messaging:${conversationId}`,
    })
  }

  return {
    source: 'tiktok_business_messaging',
    customers,
    threads,
    messages,
  }
}

export async function sendTikTokBusinessMessage({ conversationId, message, runner = null } = {}) {
  if (!conversationId) throw new Error('conversation_id_required')
  if (!message || !String(message).trim()) throw new Error('message_required')
  if (runner) return runner({ conversationId, message })
  const { stdout } = await execFileAsync(DEFAULT_HELPER, ['send-message', '--conversation-id', conversationId, '--text', message], {
    maxBuffer: 1024 * 1024,
    env: process.env,
  })
  return JSON.parse(stdout)
}
