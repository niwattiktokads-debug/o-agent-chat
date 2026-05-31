import crypto from 'node:crypto'
import { getProfile } from './pageRegistry.js'

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

function platformForProfile(profile) {
  return profile.platform === 'instagram' ? 'instagram' : 'facebook'
}

function sourceNameForProfile(profile) {
  return platformForProfile(profile) === 'instagram' ? 'instagram_webhook' : 'meta_webhook'
}

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== null && item !== '')
      .map(([key, item]) => [key, item && typeof item === 'object' && !Array.isArray(item) ? compactObject(item) : item])
      .filter(([, item]) => !(item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === 0)),
  )
}

function productHintsFromText(text = '') {
  const value = String(text || '')
  const colorMatch = value.match(/(ดำ|ขาว|ครีม|เบจ|ชมพู|แดง|ฟ้า|น้ำเงิน|เขียว|เทา|น้ำตาล|black|white|cream|pink|red|blue|green|gray|grey|brown)/i)
  const sizeMatch = value.match(/\b(xs|s|m|l|xl|xxl|2xl|3xl)\b|ไซซ์\s*([ก-ฮA-Z0-9]+)/i)
  return compactObject({
    color: colorMatch?.[1] || null,
    size: sizeMatch?.[1] || sizeMatch?.[2] || null,
  })
}

function fieldFrom(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') || null
}

function isLiveReferral(referral = {}) {
  const value = [
    referral.source,
    referral.type,
    referral.ref,
    referral.referral_ref,
    referral.source_ref,
    referral.live_id,
    referral.liveId,
    referral.video_id,
    referral.videoId,
  ].filter(Boolean).join(' ')
  return /\blive\b|ไลฟ์/i.test(value)
}

function originFromReferral(referral = {}, profile, text = '') {
  const platform = platformForProfile(profile)
  const adsContext = referral.ads_context_data || referral.adsContextData || {}
  const liveContext = referral.live_context_data || referral.liveContextData || referral.live || {}
  const postId = referral.post_id || referral.postId || adsContext.post_id || adsContext.postId
  const adId = referral.ad_id || referral.adId || adsContext.ad_id || adsContext.adId
  const adTitle = referral.ad_title || referral.adTitle || adsContext.ad_title || adsContext.adTitle
  const liveId = fieldFrom(referral.live_id, referral.liveId, liveContext.live_id, liveContext.liveId, liveContext.id)
  const liveProductName = fieldFrom(referral.product_name, referral.productName, liveContext.product_name, liveContext.productName)
  const liveSku = fieldFrom(referral.sku, referral.SKU, liveContext.sku, liveContext.SKU)
  const liveColor = fieldFrom(referral.color, liveContext.color)
  const liveSize = fieldFrom(referral.size, liveContext.size)
  const fromLive = isLiveReferral(referral) || Boolean(liveId || liveContext.product_id || liveContext.productId || liveSku)
  const ref = referral.ref || referral.referral_ref || referral.source_ref
  const productText = liveProductName || (!fromLive ? (referral.headline || adTitle || ref || '') : '')
  const productHints = productHintsFromText([text, liveProductName, referral.headline, adTitle, ref].filter(Boolean).join(' '))
  return compactObject({
    channel: fromLive ? `${platform}_live` : `${platform}_messenger`,
    sourceType: fromLive ? 'live' : (adId ? 'ad' : String(referral.source || referral.type || (postId ? 'post' : 'direct_message')).toLowerCase()),
    pageId: profile.pageId,
    pageName: profile.pageName,
    ref,
    live: {
      id: liveId,
      videoId: fieldFrom(referral.video_id, referral.videoId, liveContext.video_id, liveContext.videoId),
      commentId: fieldFrom(referral.comment_id, referral.commentId, liveContext.comment_id, liveContext.commentId),
      productId: fieldFrom(referral.product_id, referral.productId, liveContext.product_id, liveContext.productId),
      sku: liveSku,
      productName: liveProductName,
      color: liveColor,
      size: liveSize,
      clickedAt: fieldFrom(referral.clicked_at, referral.clickedAt, liveContext.clicked_at, liveContext.clickedAt),
    },
    ad: {
      id: adId,
      title: adTitle,
      campaignId: referral.campaign_id || referral.campaignId || adsContext.campaign_id || adsContext.campaignId,
      campaignName: referral.campaign_name || referral.campaignName || adsContext.campaign_name || adsContext.campaignName,
      adsetId: referral.adset_id || referral.adsetId || adsContext.adset_id || adsContext.adsetId,
      adsetName: referral.adset_name || referral.adsetName || adsContext.adset_name || adsContext.adsetName,
    },
    post: {
      id: postId,
      permalinkUrl: referral.referer_uri || referral.refererUri || referral.source_url || referral.sourceUrl,
      title: referral.headline || referral.title || adTitle,
    },
    productHint: {
      text: productText,
      ...productHints,
      color: liveColor || productHints.color,
      size: liveSize || productHints.size,
    },
    replyFrame: fromLive
      ? 'ลูกค้ามาจากไลฟ์ ให้ตอบอิงสินค้าที่กดจากไลฟ์ก่อน ถ้ายังระบุสินค้าไม่ได้ให้ถามเฉพาะชื่อ สี ไซซ์ หรือช่วงเวลาที่เห็นในไลฟ์'
      : adId || postId || ref
      ? 'ลูกค้ามาจากแอด/โพสต์นี้ ให้ตอบอิงสินค้าและข้อเสนอจากที่มานี้ก่อน ถ้าข้อมูลยังไม่พอให้ขอเฉพาะรุ่น สี ไซซ์ หรือรูปที่จำเป็น'
      : '',
  })
}

function originFromFeedChange(entry, value = {}, profile, text = '') {
  const postId = String(value.post_id || value.parent_id || value.comment_id || '')
  const platform = platformForProfile(profile)
  return compactObject({
    channel: `${platform}_feed`,
    sourceType: value.item === 'comment' ? 'post_comment' : 'post',
    pageId: profile.pageId,
    pageName: profile.pageName,
    post: {
      id: value.post_id || value.parent_id || postId,
      commentId: value.comment_id || null,
      permalinkUrl: value.permalink_url || value.permalinkUrl || null,
      title: value.post_title || value.title || null,
      text: value.post_message || value.parent_message || null,
    },
    productHint: {
      text: value.post_message || value.parent_message || text,
      ...productHintsFromText([value.post_message, value.parent_message, text].filter(Boolean).join(' ')),
    },
    replyFrame: 'ลูกค้ามาจากคอมเมนต์ใต้โพสต์ ให้ตอบสั้น กระชับ อิงโพสต์นี้ และชวนเข้า inbox ถ้าต้องเช็กข้อมูลเฉพาะตัว',
    eventTime: entry.time ? new Date(Number(entry.time) * 1000).toISOString() : null,
  })
}

function normalizeFeedChange(entry, change, profile) {
  if (change?.field !== 'feed' || change.value?.item !== 'comment') return null

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
  const originContext = originFromFeedChange(entry, value, profile, text)
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
      platform: 'facebook_comment',
      customerId,
      status: 'open',
      intent: value.item === 'comment' ? 'comment' : 'post',
      risk: 'medium',
      unreadCount: isOutbound ? 0 : 1,
      messageCount: 1,
      updatedAt: timestamp,
      link: null,
      originContext,
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
      originContext,
    },
  }
}

function normalizeInstagramCommentChange(entry, change, profile) {
  if (change?.field !== 'comments' || !change.value) return null

  const value = change.value
  const mediaId = String(value.media_id || value.post_id || value.parent_id || value.comment_id || '')
  if (!mediaId) return null

  const senderId = String(value.from?.id || value.sender_id || value.user_id || '')
  const actorProviderId = senderId || `ig_media_${mediaId}`
  const timestamp = value.created_time
    ? new Date(Number(value.created_time) * 1000).toISOString()
    : entry.time
      ? new Date(Number(entry.time) * 1000).toISOString()
      : new Date().toISOString()
  const text = value.text || value.message || 'Instagram comment'
  const originContext = originFromFeedChange(entry, {
    ...value,
    post_id: mediaId,
    post_message: value.media_caption || value.caption || value.post_message,
    item: 'comment',
  }, profile, text)
  const providerMessageId = String(value.comment_id || stableId(profile.pageId, mediaId, timestamp, text))
  const threadId = `ig_comment_${stableId(profile.pageId, mediaId)}`
  const customerId = senderId === profile.pageId
    ? `ig_page_actor_${profile.pageId}`
    : `ig_comment_actor_${actorProviderId}`
  const isOutbound = senderId === profile.pageId
  const authorName = value.from?.username || value.from?.name || value.sender_name || (isOutbound ? profile.pageName : 'Instagram Customer')

  return {
    customer: {
      id: customerId,
      displayName: authorName,
      platform: 'instagram',
      providerCustomerId: actorProviderId,
      matchConfidence: senderId ? 0.8 : 0.2,
      sourceRef: `instagram_comments:${profile.pageId}`,
    },
    thread: {
      id: threadId,
      providerThreadId: mediaId,
      pageId: profile.omniPageId,
      platform: 'instagram_comment',
      customerId,
      status: 'open',
      intent: 'comment',
      risk: 'medium',
      unreadCount: isOutbound ? 0 : 1,
      messageCount: 1,
      updatedAt: timestamp,
      link: null,
      originContext,
    },
    message: {
      id: `ig_comment_msg_${providerMessageId}`,
      threadId,
      direction: isOutbound ? 'outbound' : 'inbound',
      authorName,
      text,
      createdAt: timestamp,
      providerMessageId,
      sourceRef: `instagram_comments:${profile.pageId}:comment`,
      originContext,
    },
  }
}

export function normalizeMetaWebhookPayload(payload) {
  const customers = []
  const threads = []
  const messages = []

  for (const entry of payload?.entry || []) {
    const profile = getProfile(String(entry.id || ''))
    if (!profile) continue
    const platform = platformForProfile(profile)
    const sourceName = sourceNameForProfile(profile)

    for (const event of entry.messaging || []) {
      const text = messageText(event.message)
      if (!text) continue
      const originContext = originFromReferral(event.referral || event.postback?.referral || event.message?.referral || {}, profile, text)

      const senderId = event.sender?.id
      const recipientId = event.recipient?.id
      const customerProviderId = senderId === profile.pageId ? recipientId : senderId
      const timestamp = event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString()
      const threadProviderId = event.message?.mid || `${profile.pageId}_${customerProviderId}`
      const prefix = platform === 'instagram' ? 'ig' : 'fb'
      const threadId = `${prefix}_webhook_${stableId(profile.pageId, customerProviderId)}`
      const customerId = `${prefix}_customer_${customerProviderId || stableId(profile.pageId, threadProviderId)}`
      const messageId = `${prefix}_msg_${event.message?.mid || stableId(profile.pageId, customerProviderId, timestamp, text)}`

      customers.push({
        id: customerId,
        displayName: platform === 'instagram' ? 'Instagram Customer' : 'Facebook Customer',
        platform,
        providerCustomerId: customerProviderId || null,
        matchConfidence: customerProviderId ? 1 : 0.2,
        sourceRef: `${sourceName}:${profile.pageId}`,
      })

      threads.push({
        id: threadId,
        providerThreadId: threadProviderId,
        pageId: profile.omniPageId,
        platform,
        customerId,
        status: 'open',
        intent: 'unknown',
        risk: 'medium',
        unreadCount: 1,
        messageCount: 1,
        updatedAt: timestamp,
        link: null,
        originContext,
      })

      messages.push({
        id: messageId,
        threadId,
        direction: senderId === profile.pageId ? 'outbound' : 'inbound',
        authorName: senderId === profile.pageId ? profile.pageName : (platform === 'instagram' ? 'Instagram Customer' : 'Facebook Customer'),
        text,
        createdAt: timestamp,
        providerMessageId: event.message?.mid || null,
        sourceRef: `${sourceName}:${profile.pageId}`,
        originContext,
      })
    }

    for (const change of entry.changes || []) {
      const normalized = normalizeFeedChange(entry, change, profile) || normalizeInstagramCommentChange(entry, change, profile)
      if (!normalized) continue
      customers.push(normalized.customer)
      threads.push(normalized.thread)
      messages.push(normalized.message)
    }
  }

  return { source: 'meta_webhook', customers, threads, messages }
}
