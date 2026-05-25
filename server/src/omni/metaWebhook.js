import crypto from 'node:crypto'
import { FACEBOOK_PAGE_PROFILES } from './metaInboxClient.js'

function profileByPageId(pageId) {
  return Object.values(FACEBOOK_PAGE_PROFILES).find((profile) => profile.pageId === pageId) || null
}

function stableId(...parts) {
  return crypto.createHash('sha1').update(parts.filter(Boolean).join(':')).digest('hex').slice(0, 16)
}

function messageText(message) {
  return message?.text || message?.attachments?.map((item) => item.type).join(', ') || ''
}

export function normalizeMetaWebhookPayload(payload) {
  const customers = []
  const threads = []
  const messages = []

  for (const entry of payload?.entry || []) {
    const profile = profileByPageId(String(entry.id || ''))
    if (!profile) continue

    for (const event of entry.messaging || []) {
      const text = messageText(event.message)
      if (!text) continue

      const senderId = event.sender?.id
      const recipientId = event.recipient?.id
      const customerProviderId = senderId === profile.pageId ? recipientId : senderId
      const timestamp = event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString()
      const threadProviderId = event.message?.mid || `${profile.pageId}_${customerProviderId}`
      const threadId = `fb_webhook_${stableId(profile.pageId, customerProviderId)}`
      const customerId = `fb_customer_${customerProviderId || stableId(profile.pageId, threadProviderId)}`
      const messageId = `fb_msg_${event.message?.mid || stableId(profile.pageId, customerProviderId, timestamp, text)}`

      customers.push({
        id: customerId,
        displayName: 'Facebook Customer',
        platform: 'facebook',
        providerCustomerId: customerProviderId || null,
        matchConfidence: customerProviderId ? 1 : 0.2,
        sourceRef: `meta_webhook:${profile.pageId}`,
      })

      threads.push({
        id: threadId,
        providerThreadId: threadProviderId,
        pageId: profile.omniPageId,
        platform: 'facebook',
        customerId,
        status: 'open',
        intent: 'unknown',
        risk: 'medium',
        unreadCount: 1,
        messageCount: 1,
        updatedAt: timestamp,
        link: null,
      })

      messages.push({
        id: messageId,
        threadId,
        direction: senderId === profile.pageId ? 'outbound' : 'inbound',
        authorName: senderId === profile.pageId ? profile.pageName : 'Facebook Customer',
        text,
        createdAt: timestamp,
        providerMessageId: event.message?.mid || null,
        sourceRef: `meta_webhook:${profile.pageId}`,
      })
    }
  }

  return { source: 'meta_webhook', customers, threads, messages }
}
