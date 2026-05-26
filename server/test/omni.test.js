import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { readFileSync } from 'node:fs'
import { OMNI_STATUSES, validatePage } from '../src/omni/schema.js'
import { createOmniSeed } from '../src/omni/seed.js'
import { createAdapterRegistry } from '../src/omni/adapters.js'
import { createOmniService } from '../src/omni/service.js'
import { listFacebookConversations, normalizeMetaConversations } from '../src/omni/metaInboxClient.js'
import { createMetaSocialRuntime } from '../src/omni/metaSocialRuntime.js'
import { createAiReplyEngine } from '../src/omni/aiReplyEngine.js'
import { normalizeMetaWebhookPayload } from '../src/omni/metaWebhook.js'
import { listTikTokOrders, normalizeTikTokOrders } from '../src/omni/tiktokOrderClient.js'
import { normalizeTikTokMessagingWebhookPayload } from '../src/omni/tiktokMessagingClient.js'
import { getOmniSchemaSummary, loadOmniSchemaSql, REQUIRED_OMNI_TABLES } from '../src/omni/db/schema.js'
import { createSqliteOmniStore } from '../src/omni/db/sqliteStore.js'
import { mountRoutes } from '../src/routes.js'
import { createZortCommerceRuntime } from '../src/omni/zortCommerceRuntime.js'

test('omni seed starts with configured production page data', () => {
  const seed = createOmniSeed()
  assert.equal(seed.pages.length, 5)
  assert.equal(seed.pages.find((page) => page.id === 'page_annalynn').name, 'Anna Lynn')
  assert.equal(seed.pages.find((page) => page.id === 'page_annalynn_tiktok').name, 'AnnaLynn')
  assert.equal(seed.platformAccounts.find((account) => account.id === 'acct_fb_annalynn').pageId, 'page_annalynn')
  assert.equal(seed.platformAccounts.find((account) => account.id === 'acct_tt_shop').pageId, 'page_annalynn_tiktok')
  assert.equal(seed.platformAccounts.find((account) => account.id === 'acct_tt_annalynn_dm').provider, 'tiktok_business_messaging')
  assert.ok(seed.pages.find((page) => page.id === 'page_fb_112154661515664'))
  assert.equal(seed.pages.find((page) => page.id === 'page_fb_112154661515664').name, 'Viris Zamara')
  assert.equal(seed.pages.some((page) => page.id === 'page_shop_4'), false)
  assert.equal(seed.pages.some((page) => page.id === 'page_shop_5'), false)
  assert.equal(seed.pages.every((page) => page.status === 'active'), true)
  assert.equal(seed.pages.every((page) => page.policySetId), true)
  assert.equal(seed.pages.every((page) => page.agentProfileId), true)
  assert.equal(seed.knowledgeSources.length, 3)
  assert.equal(seed.knowledgeSources.every((source) => source.content), true)
})

test('ZORT order body includes customer and Thai shipping address fields', async () => {
  let body
  const runtime = createZortCommerceRuntime({
    runner: async (args) => {
      const bodyFile = args[args.indexOf('--body-file') + 1]
      body = JSON.parse(readFileSync(bodyFile, 'utf8'))
      return { ok: true, response: { detail: { id: 'zort_1001' } } }
    },
  })

  const result = await runtime.createOrder({
    approved: true,
    uniquenumber: 'order_draft_1',
    order: {
      id: 'order_draft_1',
      customerName: 'ลูกค้า A',
      customerPhone: '0812345678',
      customerEmail: 'buyer@example.com',
      platform: 'facebook',
      sourceRef: 'omni_manual_draft:thread_1',
      totalAmount: 590,
      shippingMethod: 'ไปรษณีย์ไทย',
      paymentMethod: 'bank_transfer',
      shippingAddress: {
        recipientName: 'ลูกค้า A',
        recipientPhone: '0812345678',
        formattedAddress: '99/1 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพมหานคร 10110',
      },
      items: [{ sku: 'BLACK-M', name: 'Black Shirt M', quantity: 1, unitPrice: 590 }],
    },
  })

  assert.equal(result.ok, true)
  assert.equal(body.customername, 'ลูกค้า A')
  assert.equal(body.customerphone, '0812345678')
  assert.match(body.customeraddress, /สุขุมวิท/)
  assert.equal(body.shippingname, 'ลูกค้า A')
  assert.equal(body.shippingphone, '0812345678')
  assert.equal(body.shippingchannel, 'ไปรษณีย์ไทย')
  assert.equal(body.paymentmethod, 'bank_transfer')
  assert.equal(body.list[0].sku, 'BLACK-M')
})

test('normalizes TikTok Business Messaging webhook payload into Omni threads', () => {
  const normalized = normalizeTikTokMessagingWebhookPayload({
    events: [{
      conversation_id: 'conv_anna_1',
      sender: { id: 'tt_user_1', display_name: 'ลูกค้า TikTok' },
      message: { message_id: 'msg_1', text: 'มีไซซ์ไหม', timestamp: 1779470400000 },
    }],
  })

  assert.equal(normalized.source, 'tiktok_business_messaging')
  assert.equal(normalized.customers[0].id, 'ttbm_customer_tt_user_1')
  assert.equal(normalized.threads[0].id, 'ttbm_conv_anna_1')
  assert.equal(normalized.threads[0].pageId, 'page_annalynn_tiktok')
  assert.equal(normalized.messages[0].text, 'มีไซซ์ไหม')
})

test('page validation accepts active, paused, and archived statuses', () => {
  assert.deepEqual(OMNI_STATUSES.page, ['active', 'paused', 'archived'])
  assert.equal(validatePage({ id: 'page_1', name: 'MAN KYND', status: 'active' }).ok, true)
  assert.equal(validatePage({ id: 'page_2', name: '', status: 'deleted' }).ok, false)
})

test('adapter registry exposes provider-agnostic healthchecks', async () => {
  const registry = createAdapterRegistry()
  const meta = await registry.get('meta').healthcheck()
  assert.deepEqual(meta, { ok: true, provider: 'meta', mode: 'mock' })
})

test('omni service filters threads by page and blocks unsafe auto-send', () => {
  const service = createOmniService()
  assert.equal(service.listThreads({ pageId: 'page_mankynd' }).length, 1)
  const blocked = service.evaluateAutoSend({ threadId: 'thread_2' })
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.reason, 'risk_not_low')
})

test('omni report date filters and hourly buckets use configured timezone', () => {
  const seed = createOmniSeed()
  seed.messages = [
    { id: 'msg_bangkok_day', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'เข้าวันใหม่ไทย', createdAt: '2026-05-21T18:00:00.000Z' },
  ]
  const service = createOmniService(seed)

  const report = service.messageVolumeReport({ from: '2026-05-22', to: '2026-05-22' })

  assert.equal(report.timezone, 'Asia/Bangkok')
  assert.equal(report.totals.total, 1)
  assert.equal(report.byHour[1].total, 1)
  assert.match(report.from, /^2026-05-21T17:00:00/)
  assert.match(report.to, /^2026-05-22T16:59:59.999/)
})

test('chat retention deletes old message text while preserving customer phone and address', () => {
  const seed = createOmniSeed()
  seed.customers = [{ id: 'cust_retain', displayName: 'Retain Customer', matchConfidence: 1 }]
  seed.threads = [{
    id: 'thread_retain',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_retain',
    status: 'open',
    intent: 'unknown',
    risk: 'low',
    unreadCount: 2,
    messageCount: 2,
    updatedAt: '2026-05-23T00:00:00.000Z',
  }]
  seed.messages = [
    {
      id: 'msg_old_contact',
      threadId: 'thread_retain',
      direction: 'inbound',
      authorName: 'Retain Customer',
      text: 'เบอร์ 081-234-5678 ที่อยู่ 99/1 ถนนสุขุมวิท แขวงคลองตัน เขตวัฒนา กรุงเทพ 10110',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'msg_recent',
      threadId: 'thread_retain',
      direction: 'inbound',
      authorName: 'Retain Customer',
      text: 'ล่าสุดยังอยู่ไหม',
      createdAt: '2026-05-23T00:00:00.000Z',
    },
  ]
  const service = createOmniService(seed)

  const dryRun = service.runChatRetention({
    now: '2026-05-24T00:00:00.000Z',
    deleteAfterDays: 30,
    dryRun: true,
  })

  assert.equal(dryRun.dryRun, true)
  assert.equal(dryRun.counts.messagesDeleted, 1)
  assert.equal(service.getThread('thread_retain').messages.length, 2)

  const result = service.runChatRetention({
    now: '2026-05-24T00:00:00.000Z',
    deleteAfterDays: 30,
    dryRun: false,
  })
  const thread = service.getThread('thread_retain')
  const customer = service.snapshot().customers.find((item) => item.id === 'cust_retain')

  assert.equal(result.counts.messagesDeleted, 1)
  assert.equal(result.counts.customersUpdated, 1)
  assert.equal(thread.messages.length, 1)
  assert.equal(thread.messages[0].id, 'msg_recent')
  assert.equal(thread.messageCount, 1)
  assert.equal(thread.unreadCount, 1)
  assert.equal(customer.phone, '0812345678')
  assert.match(customer.address, /สุขุมวิท/)
  assert.equal(customer.contactJson.sourceMessageIds[0], 'msg_old_contact')
  assert.equal(service.listRetentionRuns().length, 1)
})

test('omni routes are mounted under api', async () => {
  const app = express()
  app.use(express.json())
  mountRoutes(app, { broadcast() {} }, { snapshot() { return {} } })

  const server = app.listen(0)
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const response = await fetch(`${baseUrl}/api/omni/pages`)
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.pages.length, 5)
  } finally {
    server.close()
  }
})

test('knowledge source routes persist searchable training sources', async () => {
  const app = express()
  app.use(express.json())
  mountRoutes(app, { broadcast() {} }, { snapshot() { return {} } })

  const server = app.listen(0)
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const createResponse = await fetch(`${baseUrl}/api/omni/knowledge-sources`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Test stock answer',
        content: 'ตอบลูกค้าว่าสินค้ามีพร้อมส่งหลังเช็กคลัง',
        tags: ['stock', 'test'],
      }),
    })
    const created = await createResponse.json()
    assert.equal(createResponse.status, 200)
    assert.equal(created.ok, true)
    assert.equal(created.source.status, 'ready')

    const searchResponse = await fetch(`${baseUrl}/api/omni/knowledge-sources?q=stock`)
    const search = await searchResponse.json()
    assert.equal(search.ok, true)
    assert.equal(search.sources.some((source) => source.id === created.source.id), true)

    const updateResponse = await fetch(`${baseUrl}/api/omni/knowledge-sources`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: created.source.id,
        title: 'Test stock answer updated',
        content: 'อัปเดตแล้ว ใช้รายการเดิม ไม่สร้างซ้ำ',
        tags: ['stock', 'test'],
      }),
    })
    const updated = await updateResponse.json()
    assert.equal(updateResponse.status, 200)
    assert.equal(updated.source.id, created.source.id)
    assert.equal(updated.snapshot.knowledgeSources.filter((source) => source.id === created.source.id).length, 1)

    const deleteResponse = await fetch(`${baseUrl}/api/omni/knowledge-sources/${created.source.id}`, { method: 'DELETE' })
    const deleted = await deleteResponse.json()
    assert.equal(deleteResponse.status, 200)
    assert.equal(deleted.deletedId, created.source.id)
  } finally {
    server.close()
  }
})

test('retention route dry-runs chat cleanup by default', async () => {
  const seed = createOmniSeed()
  seed.messages = [
    { id: 'msg_route_old', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'เก่ามาก', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'msg_route_new', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'ใหม่', createdAt: '2026-05-23T00:00:00.000Z' },
  ]
  seed.threads = seed.threads.map((thread) => thread.id === 'thread_1' ? { ...thread, messageCount: 2, unreadCount: 2 } : thread)
  const app = express()
  app.use(express.json())
  const service = createOmniService(seed)
  mountRoutes(app, { broadcast() {} }, { snapshot() { return {} } }, { omni: service })

  const server = app.listen(0)
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const response = await fetch(`${baseUrl}/api/omni/retention/chat-messages/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deleteAfterDays: 30,
        now: '2026-05-24T00:00:00.000Z',
      }),
    })
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.dryRun, true)
    assert.equal(body.counts.messagesDeleted, 1)
    assert.equal(service.getThread('thread_1').messages.length, 2)
  } finally {
    server.close()
  }
})

test('Facebook route rejects unknown page profile without mutation', async () => {
  const app = express()
  app.use(express.json())
  mountRoutes(app, { broadcast() {} }, { snapshot() { return {} } })

  const server = app.listen(0)
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const response = await fetch(`${baseUrl}/api/omni/facebook/conversations?page=unknown_page`)
    const body = await response.json()

    assert.equal(response.status, 400)
    assert.equal(body.ok, false)
    assert.match(body.error, /unknown_facebook_page/)
  } finally {
    server.close()
  }
})

test('Facebook sync route rejects unknown page profile without mutation', async () => {
  const app = express()
  app.use(express.json())
  mountRoutes(app, { broadcast() {} }, { snapshot() { return {} } })

  const server = app.listen(0)
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const response = await fetch(`${baseUrl}/api/omni/facebook/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ page: 'unknown_page' }),
    })
    const body = await response.json()

    assert.equal(response.status, 400)
    assert.equal(body.ok, false)
    assert.match(body.error, /unknown_facebook_page/)
  } finally {
    server.close()
  }
})

test('omni schema route exposes read-only database contract', async () => {
  const app = express()
  app.use(express.json())
  mountRoutes(app, { broadcast() {} }, { snapshot() { return {} } })

  const server = app.listen(0)
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const response = await fetch(`${baseUrl}/api/omni/schema`)
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.schema.tableCount, REQUIRED_OMNI_TABLES.length)
    assert.equal(body.schema.hasPaymentApprovalGuard, true)
  } finally {
    server.close()
  }
})

test('normalizes Meta conversations into Omni threads and customers', () => {
  const normalized = normalizeMetaConversations({
    pageProfile: 'man_kynd',
    response: {
      data: [{
        id: 't_123',
        updated_time: '2026-05-22T06:46:10+0000',
        link: '/189971841184132/inbox/abc/?section=messages',
        unread_count: 3,
        message_count: 4,
        snippet: 'สวัสดีครับ',
        senders: { data: [
          { id: 'customer_1', name: 'Customer One' },
          { id: '189971841184132', name: 'MAN KYND' },
        ] },
      }],
    },
  })

  assert.equal(normalized.page.omniPageId, 'page_mankynd')
  assert.equal(normalized.threads[0].id, 'fb_t_123')
  assert.equal(normalized.threads[0].customerId, 'fb_customer_customer_1')
  assert.equal(normalized.threads[0].status, 'open')
  assert.equal(normalized.customers[0].displayName, 'Customer One')
  assert.equal(normalized.messages[0].text, 'สวัสดีครับ')
})

test('Facebook connector calls meta helper through injectable runner', async () => {
  const calls = []
  const result = await listFacebookConversations({
    pageProfile: 'page_des',
    runner: async (args) => {
      calls.push(args)
      return { ok: true, response: { data: [] } }
    },
  })

  assert.deepEqual(calls[0], ['list-conversations', '--page=page_des'])
  assert.equal(result.page.omniPageId, 'page_des')
  assert.deepEqual(result.threads, [])
})

test('Meta social live sources attempts live comments before fallback with blocker evidence', async () => {
  const calls = []
  const social = createMetaSocialRuntime({
    runner: async (args) => {
      calls.push(args)
      if (args[0] === 'list-live-comments') throw new Error('meta_live_comments_permission_missing')
      if (args[0] === 'list-posts') {
        return {
          ok: true,
          page_id: 'page_1',
          response: { data: [{ id: 'post_1', message: 'fallback post', comment_count: 2 }] },
        }
      }
      throw new Error(`unexpected:${args[0]}`)
    },
  })

  const result = await social.listLiveCommentSources({ pageProfile: 'man_kynd', limit: 3 })

  assert.equal(result.ok, true)
  assert.equal(result.mode, 'fallback_live_post_comment_capture')
  assert.equal(result.blocker, 'meta_live_comments_permission_missing')
  assert.equal(result.blockerEvidence.command, 'list-live-comments')
  assert.equal(result.posts[0].id, 'post_1')
  assert.deepEqual(calls.map((args) => args[0]), ['list-live-comments', 'list-posts'])
})

test('Facebook connector accepts configured extra page profile', async () => {
  const result = await listFacebookConversations({
    pageProfile: 'fb_112154661515664',
    runner: async () => ({ ok: true, response: { data: [] } }),
  })

  assert.equal(result.page.pageId, '112154661515664')
  assert.equal(result.page.omniPageId, 'page_fb_112154661515664')
})

test('Facebook connector reads thread messages beyond conversation snippets', async () => {
  const calls = []
  const result = await listFacebookConversations({
    pageProfile: 'anna_lynn',
    runner: async (args) => {
      calls.push(args)
      if (args[0] === 'list-conversations') {
        return {
          ok: true,
          response: {
            data: [{
              id: 't_history_1',
              updated_time: '2026-05-23T17:14:24+0000',
              unread_count: 2,
              message_count: 3,
              snippet: 'latest preview',
              senders: { data: [
                { id: 'customer_1', name: 'Customer One' },
                { id: '122106446570001676', name: 'Anna Lynn' },
              ] },
            }],
          },
        }
      }
      if (args[0] === 'read-thread') {
        return {
          ok: true,
          response: {
            data: [
              {
                id: 'mid_out_1',
                created_time: '2026-05-23T17:14:24+0000',
                from: { id: '122106446570001676', name: 'Anna Lynn' },
                message: 'รับทราบค่ะ',
              },
              {
                id: 'mid_in_1',
                created_time: '2026-05-23T17:14:22+0000',
                from: { id: 'customer_1', name: 'Customer One' },
                message: 'ที่อยู่',
              },
            ],
          },
        }
      }
      return { ok: false, error: 'unexpected_call' }
    },
  })

  assert.deepEqual(calls[0], ['list-conversations', '--page=anna_lynn'])
  assert.deepEqual(calls[1], ['read-thread', '--page=anna_lynn', '--conversation-id=t_history_1', '--limit=20'])
  assert.equal(result.messages.length, 2)
  assert.equal(result.messages[0].id, 'fb_msg_mid_out_1')
  assert.equal(result.messages[0].direction, 'outbound')
  assert.equal(result.messages[0].authorName, 'Anna Lynn')
  assert.equal(result.messages[1].id, 'fb_msg_mid_in_1')
  assert.equal(result.messages[1].direction, 'inbound')
  assert.equal(result.messages[1].text, 'ที่อยู่')
})

test('omni service syncs normalized Facebook conversations into memory store', () => {
  const service = createOmniService()
  const result = service.syncFacebookConversations({
    page: { pageId: '189971841184132', pageName: 'MAN KYND', omniPageId: 'page_mankynd' },
    customers: [{ id: 'fb_customer_1', displayName: 'Customer One', platform: 'facebook', providerCustomerId: '1', matchConfidence: 1 }],
    threads: [{ id: 'fb_thread_1', providerThreadId: 't_1', pageId: 'page_mankynd', platform: 'facebook', customerId: 'fb_customer_1', status: 'open', intent: 'unknown', risk: 'medium', unreadCount: 1, messageCount: 1, updatedAt: '2026-05-22T00:00:00+0000' }],
    messages: [{ id: 'fb_preview_t_1', threadId: 'fb_thread_1', direction: 'inbound', authorName: 'Customer One', text: 'hello', createdAt: '2026-05-22T00:00:00+0000', providerMessageId: 't_1:snippet' }],
  })

  assert.equal(result.threads.inserted, 1)
  assert.equal(service.getThread('fb_thread_1').messages[0].text, 'hello')

  const second = service.syncFacebookConversations({
    page: result.page,
    customers: [{ id: 'fb_customer_1', displayName: 'Customer One Updated', platform: 'facebook', providerCustomerId: '1', matchConfidence: 1 }],
    threads: [{ id: 'fb_thread_1', providerThreadId: 't_1', pageId: 'page_mankynd', platform: 'facebook', customerId: 'fb_customer_1', status: 'draft_ready', intent: 'unknown', risk: 'medium', unreadCount: 0, messageCount: 2, updatedAt: '2026-05-22T00:01:00+0000' }],
    messages: [{ id: 'fb_preview_t_1', threadId: 'fb_thread_1', direction: 'inbound', authorName: 'Customer One', text: 'updated', createdAt: '2026-05-22T00:01:00+0000', providerMessageId: 't_1:snippet' }],
  })

  assert.equal(second.threads.updated, 1)
  assert.equal(service.getThread('fb_thread_1').status, 'draft_ready')
  assert.equal(service.getThread('fb_thread_1').messages[0].text, 'updated')
})

test('omni service removes stale Facebook snippet previews when detailed messages arrive', () => {
  const service = createOmniService()
  service.syncFacebookConversations({
    page: { pageId: '122106446570001676', pageName: 'Anna Lynn', omniPageId: 'page_annalynn' },
    customers: [{ id: 'fb_customer_1', displayName: 'Customer One', platform: 'facebook', providerCustomerId: '1', matchConfidence: 1 }],
    threads: [{ id: 'fb_t_stale', providerThreadId: 't_stale', pageId: 'page_annalynn', platform: 'facebook', customerId: 'fb_customer_1', status: 'open', intent: 'unknown', risk: 'medium', unreadCount: 1, messageCount: 1, updatedAt: '2026-05-23T00:00:00+0000' }],
    messages: [{ id: 'fb_preview_t_stale', threadId: 'fb_t_stale', direction: 'inbound', authorName: 'Customer One', text: 'preview text', createdAt: '2026-05-23T00:00:00+0000', providerMessageId: 't_stale:snippet', sourceRef: 'meta_conversation:t_stale' }],
  })

  service.syncFacebookConversations({
    page: { pageId: '122106446570001676', pageName: 'Anna Lynn', omniPageId: 'page_annalynn' },
    customers: [{ id: 'fb_customer_1', displayName: 'Customer One', platform: 'facebook', providerCustomerId: '1', matchConfidence: 1 }],
    threads: [{ id: 'fb_t_stale', providerThreadId: 't_stale', pageId: 'page_annalynn', platform: 'facebook', customerId: 'fb_customer_1', status: 'open', intent: 'unknown', risk: 'medium', unreadCount: 1, messageCount: 2, updatedAt: '2026-05-23T00:01:00+0000' }],
    messages: [{ id: 'fb_msg_mid_stale_1', threadId: 'fb_t_stale', direction: 'outbound', authorName: 'Anna Lynn', text: 'real message', createdAt: '2026-05-23T00:01:00+0000', providerMessageId: 'mid_stale_1', sourceRef: 'meta_thread:t_stale' }],
  })

  const messages = service.getThread('fb_t_stale').messages
  assert.equal(messages.some((message) => message.id === 'fb_preview_t_stale'), false)
  assert.equal(messages.length, 1)
  assert.equal(messages[0].text, 'real message')
})

test('normalizes Meta webhook messages into Omni memory rows', () => {
  const normalized = normalizeMetaWebhookPayload({
    object: 'page',
    entry: [{
      id: '112154661515664',
      messaging: [{
        sender: { id: 'customer_vz_1' },
        recipient: { id: '112154661515664' },
        timestamp: 1779470000000,
        message: { mid: 'mid_vz_1', text: 'มีสินค้าไหม' },
      }],
    }],
  })

  assert.equal(normalized.threads[0].pageId, 'page_fb_112154661515664')
  assert.equal(normalized.messages[0].direction, 'inbound')
  assert.equal(normalized.messages[0].text, 'มีสินค้าไหม')
})

test('omni service syncs Meta webhook messages into memory store', () => {
  const service = createOmniService()
  const result = service.syncFacebookWebhookEvents(normalizeMetaWebhookPayload({
    object: 'page',
    entry: [{
      id: '122106446570001676',
      messaging: [{
        sender: { id: 'customer_anna_1' },
        recipient: { id: '122106446570001676' },
        timestamp: 1779470000000,
        message: { mid: 'mid_anna_1', text: 'ราคาเท่าไหร่' },
      }],
    }],
  }))

  assert.equal(result.threads.inserted, 1)
  assert.equal(result.messages.inserted, 1)
})

test('omni service merges Meta webhook messages into existing conversation thread', () => {
  const service = createOmniService()
  service.syncFacebookConversations({
    page: { pageId: '122106446570001676', pageName: 'Anna Lynn', omniPageId: 'page_annalynn' },
    customers: [{ id: 'fb_customer_customer_1', displayName: 'Customer One', platform: 'facebook', providerCustomerId: 'customer_1', matchConfidence: 1 }],
    threads: [{ id: 'fb_t_conversation_1', providerThreadId: 't_conversation_1', pageId: 'page_annalynn', platform: 'facebook', customerId: 'fb_customer_customer_1', status: 'draft_ready', intent: 'unknown', risk: 'medium', unreadCount: 0, messageCount: 2, updatedAt: '2026-05-23T17:00:00+0000' }],
    messages: [{ id: 'fb_msg_existing_1', threadId: 'fb_t_conversation_1', direction: 'inbound', authorName: 'Customer One', text: 'old message', createdAt: '2026-05-23T17:00:00+0000', providerMessageId: 'existing_1', sourceRef: 'meta_thread:t_conversation_1' }],
  })

  service.syncFacebookWebhookEvents(normalizeMetaWebhookPayload({
    object: 'page',
    entry: [{
      id: '122106446570001676',
      messaging: [{
        sender: { id: 'customer_1' },
        recipient: { id: '122106446570001676' },
        timestamp: Date.parse('2026-05-23T18:00:00.000Z'),
        message: { mid: 'webhook_mid_1', text: 'new realtime message' },
      }],
    }],
  }))

  const existing = service.getThread('fb_t_conversation_1')
  assert.equal(existing.messages.some((message) => message.providerMessageId === 'webhook_mid_1'), true)
  assert.equal(existing.messageCount, 3)
  assert.equal(existing.unreadCount, 1)
  assert.equal(service.listThreads().some((thread) => thread.id.startsWith('fb_webhook_') && thread.customerId === 'fb_customer_customer_1'), false)
})

test('AI reply engine drafts guarded replies from thread memory', async () => {
  const service = createOmniService()
  const thread = service.getThread('thread_1')
  const ai = createAiReplyEngine({ provider: 'local_rules', model: 'test' })
  const decision = await ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

  assert.equal(decision.ok, true)
  assert.equal(decision.intent, 'stock')
  assert.equal(decision.allowed, true)
  assert.match(decision.draftText, /เช็กสต็อก/)
  assert.equal(decision.sourceIds.some((id) => id.startsWith('ks_')), true)
  assert.equal(decision.sourceIds.every((id) => id.startsWith('ks_')), true)
  assert.deepEqual(decision.evidenceIds, ['msg_1'])
})

test('SQLite Omni store persists synced Facebook conversations across service instances', () => {
  const dbPath = `${process.cwd()}/.tmp-test/omni-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
  const firstStore = createSqliteOmniStore({ dbPath })
  const firstService = createOmniService({ store: firstStore })

  firstService.syncFacebookConversations({
    page: { pageId: '189971841184132', pageName: 'MAN KYND', omniPageId: 'page_mankynd' },
    customers: [{ id: 'fb_customer_persist', displayName: 'Persist Customer', platform: 'facebook', providerCustomerId: 'persist', matchConfidence: 1 }],
    threads: [{ id: 'fb_thread_persist', providerThreadId: 't_persist', pageId: 'page_mankynd', platform: 'facebook', customerId: 'fb_customer_persist', status: 'open', intent: 'unknown', risk: 'medium', unreadCount: 1, messageCount: 1, updatedAt: '2026-05-23T00:00:00+0000' }],
    messages: [{ id: 'fb_preview_persist', threadId: 'fb_thread_persist', direction: 'inbound', authorName: 'Persist Customer', text: 'persisted hello', createdAt: '2026-05-23T00:00:00+0000', providerMessageId: 't_persist:snippet' }],
  })
  firstStore.close()

  const secondStore = createSqliteOmniStore({ dbPath })
  const secondService = createOmniService({ store: secondStore })
  const persisted = secondService.getThread('fb_thread_persist')

  assert.equal(persisted.customer.displayName, 'Persist Customer')
  assert.equal(persisted.messages[0].text, 'persisted hello')
  secondStore.close()
})

test('SQLite Omni store backfills missing seed pages for existing databases', () => {
  const dbPath = `${process.cwd()}/.tmp-test/omni-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
  const initialSeed = createOmniSeed()
  initialSeed.pages = initialSeed.pages.filter((page) => page.id !== 'page_fb_112154661515664')
  initialSeed.platformAccounts = initialSeed.platformAccounts.filter((account) => account.id !== 'acct_fb_112154661515664')

  const firstStore = createSqliteOmniStore({ dbPath, seed: initialSeed })
  assert.equal(firstStore.snapshot().pages.some((page) => page.id === 'page_fb_112154661515664'), false)
  firstStore.close()

  const migratedStore = createSqliteOmniStore({ dbPath, seed: createOmniSeed() })
  const snapshot = migratedStore.snapshot()

  assert.equal(snapshot.pages.some((page) => page.id === 'page_fb_112154661515664'), true)
  assert.equal(snapshot.platformAccounts.some((account) => account.id === 'acct_fb_112154661515664'), true)
  migratedStore.close()
})

test('SQLite Omni store removes deprecated seed pages and updates seed names', () => {
  const dbPath = `${process.cwd()}/.tmp-test/omni-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
  const legacySeed = createOmniSeed()
  legacySeed.pages.push(
    { id: 'page_shop_4', name: 'Seed Page 4', status: 'active', brandGroupId: 'brand_shared', policySetId: 'policy_default', agentProfileId: 'agent_default' },
    { id: 'page_shop_5', name: 'Seed Page 5', status: 'active', brandGroupId: 'brand_shared', policySetId: 'policy_default', agentProfileId: 'agent_default' },
  )
  legacySeed.pages = legacySeed.pages.map((page) => (
    page.id === 'page_fb_112154661515664' ? { ...page, name: 'Facebook Page 112154661515664' } : page
  ))

  const legacyStore = createSqliteOmniStore({ dbPath, seed: legacySeed })
  assert.equal(legacyStore.snapshot().pages.some((page) => page.id === 'page_shop_4'), true)
  assert.equal(legacyStore.snapshot().pages.find((page) => page.id === 'page_fb_112154661515664').name, 'Facebook Page 112154661515664')
  legacyStore.close()

  const migratedStore = createSqliteOmniStore({ dbPath, seed: createOmniSeed() })
  const pages = migratedStore.snapshot().pages

  assert.equal(pages.some((page) => page.id === 'page_shop_4'), false)
  assert.equal(pages.some((page) => page.id === 'page_shop_5'), false)
  assert.equal(pages.find((page) => page.id === 'page_fb_112154661515664').name, 'Viris Zamara')
  migratedStore.close()
})

test('SQLite Omni store separates Anna Lynn Facebook and AnnaLynn TikTok source pages', () => {
  const dbPath = `${process.cwd()}/.tmp-test/omni-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
  const legacySeed = createOmniSeed()
  legacySeed.pages = legacySeed.pages.filter((page) => page.id !== 'page_annalynn_tiktok')
  legacySeed.platformAccounts = legacySeed.platformAccounts
    .filter((account) => account.id !== 'acct_fb_annalynn')
    .map((account) => account.id === 'acct_tt_shop' ? { ...account, pageId: 'page_annalynn' } : account)
  legacySeed.threads = legacySeed.threads.map((thread) => thread.id === 'thread_2' ? { ...thread, pageId: 'page_annalynn' } : thread)

  const legacyStore = createSqliteOmniStore({ dbPath, seed: legacySeed })
  legacyStore.close()

  const migratedStore = createSqliteOmniStore({ dbPath, seed: createOmniSeed() })
  const snapshot = migratedStore.snapshot()

  assert.equal(snapshot.pages.find((page) => page.id === 'page_annalynn').name, 'Anna Lynn')
  assert.equal(snapshot.pages.find((page) => page.id === 'page_annalynn_tiktok').name, 'AnnaLynn')
  assert.equal(snapshot.platformAccounts.find((account) => account.id === 'acct_fb_annalynn').platform, 'facebook')
  assert.equal(snapshot.platformAccounts.find((account) => account.id === 'acct_tt_shop').pageId, 'page_annalynn_tiktok')
  assert.equal(snapshot.threads.find((thread) => thread.id === 'thread_2').pageId, 'page_annalynn_tiktok')
  migratedStore.close()
})

test('SQLite Omni store preserves customized chat retention policy across restarts', () => {
  const dbPath = `${process.cwd()}/.tmp-test/omni-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
  const firstStore = createSqliteOmniStore({ dbPath })
  const firstService = createOmniService({ store: firstStore })
  firstService.upsertRetentionPolicy({ deleteAfterDays: 90, enabled: false })
  firstStore.close()

  const secondStore = createSqliteOmniStore({ dbPath })
  const secondService = createOmniService({ store: secondStore })
  const policy = secondService.listRetentionPolicies().find((item) => item.id === 'retention_chat_messages')

  assert.equal(policy.deleteAfterDays, 90)
  assert.equal(policy.enabled, false)
  secondStore.close()
})

test('normalizes TikTok orders into Omni customers and orders', () => {
  const normalized = normalizeTikTokOrders({
    code: 0,
    data: {
      total_count: 1,
      orders: [{
        id: '584032386060683081',
        user_id: '7494557570104855369',
        status: 'AWAITING_COLLECTION',
        tracking_number: '796906652754',
        create_time: 1778812319,
        update_time: 1778815864,
        payment_method_name: 'Mbanking',
        payment: { total_amount: '841.5', currency: 'THB' },
        recipient_address: { name: 'เ***จา พ***์โภสคราม', phone_number: '(+66)080*****42' },
        line_items: [{
          id: 'line_1',
          product_name: 'Lorra เดรสเชิ้ต Polo',
          sku_name: 'สีเทา, XL',
          seller_sku: 'lorสีเทาXL',
          sale_price: '841.5',
          tracking_number: '796906652754',
        }],
      }],
    },
  })

  assert.equal(normalized.orders[0].id, 'tt_order_584032386060683081')
  assert.equal(normalized.orders[0].total, 841.5)
  assert.equal(normalized.orders[0].itemSummary[0].sellerSku, 'lorสีเทาXL')
  assert.equal(normalized.customers[0].id, 'tt_customer_7494557570104855369')
})

test('TikTok order connector calls finance helper through injectable runner', async () => {
  const calls = []
  const result = await listTikTokOrders({
    status: 'AWAITING_COLLECTION',
    pageSize: 2,
    runner: async (args) => {
      calls.push(args)
      return { code: 0, data: { orders: [], total_count: 0, next_page_token: '' } }
    },
  })

  assert.deepEqual(calls[0], ['orders', '--status', 'AWAITING_COLLECTION', '--page-size', '2'])
  assert.equal(result.source, 'tiktok_shop')
  assert.deepEqual(result.orders, [])
})

test('omni service syncs normalized TikTok orders into memory store', () => {
  const service = createOmniService()
  const result = service.syncTikTokOrders({
    source: 'tiktok_shop',
    totalCount: 1,
    nextPageToken: '',
    customers: [{ id: 'tt_customer_1', displayName: 'TikTok Customer', platform: 'tiktok', providerCustomerId: '1', matchConfidence: 1 }],
    orders: [{ id: 'tt_order_1', customerId: 'tt_customer_1', platform: 'tiktok', providerOrderId: '1', status: 'AWAITING_COLLECTION', total: 841.5, currency: 'THB' }],
  })

  assert.equal(result.customers.inserted, 1)
  assert.equal(result.orders.inserted, 1)
  assert.equal(service.snapshot().orders.find((order) => order.id === 'tt_order_1').total, 841.5)
})

test('TikTok order route rejects unknown status before helper mutation', async () => {
  const app = express()
  app.use(express.json())
  mountRoutes(app, { broadcast() {} }, { snapshot() { return {} } })

  const server = app.listen(0)
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const response = await fetch(`${baseUrl}/api/omni/tiktok/orders?status=UNKNOWN`)
    const body = await response.json()

    assert.equal(response.status, 400)
    assert.equal(body.ok, false)
    assert.match(body.error, /unknown_tiktok_order_status/)
  } finally {
    server.close()
  }
})

test('omni database schema includes durable memory tables and guards', () => {
  const sql = loadOmniSchemaSql()
  const summary = getOmniSchemaSummary()

  for (const table of REQUIRED_OMNI_TABLES) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`))
  }

  assert.equal(summary.dialect, 'sqlite_first_postgres_compatible')
  assert.equal(summary.hasPaymentApprovalGuard, true)
  assert.equal(summary.hasAuditLog, true)
  assert.equal(summary.hasSourceRefs, true)
  assert.equal(summary.hasChatRetention, true)
  assert.equal(summary.preservesCustomerContacts, true)
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_messages_thread_created/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS retention_policies/)
})
