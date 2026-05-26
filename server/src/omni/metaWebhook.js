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

function feedText(value = {}) {
  if (value.message) return value.message
  const item = value.item || 'feed'
  const verb = value.verb || 'update'
  return `Facebook ${item} ${verb}`
}

function normalizeFeedChange(entry, change, profile) {
  if (change?.field !== 'feed' || !change.value) return null

  const value = change.value
  const postId = String(value.post_id || value.parent_id || value.comment_id || '')
  if (!postId) return null

  const senderId = String(value.sender_id || '')
  const actorProviderId = senderId || `post_${postId}`
  const timestamp = value.created_time
    ? new Date(Number(value.created_time) * 1000).toISOString()
    : entry.time
      ? new Date(Number(entry.time) * 1000).toISOString()
      : new Date().toISOString()
  const text = feedText(value)
  const providerMessageId = String(value.comment_id || value.post_id || stableId(profile.pageId, postId, timestamp, text))
  const threadId = `fb_feed_${stableId(profile.pageId, postId)}`
  const customerId = senderId === profile.pageId
    ? `fb_page_actor_${profile.pageId}`
    : `fb_feed_actor_${actorProviderId}`
  const isOutbound = senderId === profile.pageId
  const authorName = value.sender_name || (isOutbound ? profile.pageName : 'Facebook Feed')

  return {
    customer: {
      id: customerId,
      displayName: authorName,
      platform: 'facebook',
      providerCustomerId: actorProviderId,
      matchConfidence: senderId ? 0.8 : 0.2,
      sourceRef: `meta_feed:${profile.pageId}`,
    },
    thread: {
      id: threadId,
      providerThreadId: postId,
      pageId: profile.omniPageId,
      platform: 'facebook',
      customerId,
      status: 'open',
      intent: value.item === 'comment' ? 'comment' : 'post',
      risk: 'medium',
      unreadCount: isOutbound ? 0 : 1,
      messageCount: 1,
      updatedAt: timestamp,
      link: null,
    },
    message: {
      id: `fb_feed_msg_${providerMessageId}`,
      threadId,
      direction: isOutbound ? 'outbound' : 'inbound',
      authorName,
      text,
      createdAt: timestamp,
      providerMessageId,
      sourceRef: `meta_feed:${profile.pageId}:${value.item || 'feed'}:${value.verb || 'update'}`,
    },
  }
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

    for (const change of entry.changes || []) {
      const normalized = normalizeFeedChange(entry, change, profile)
      if (!normalized) continue
      customers.push(normalized.customer)
      threads.push(normalized.thread)
      messages.push(normalized.message)
    }
  }

  return { source: 'meta_webhook', customers, threads, messages }
}
