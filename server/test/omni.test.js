import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { OMNI_STATUSES, validatePage } from '../src/omni/schema.js'
import { createOmniSeed } from '../src/omni/seed.js'
import { createAdapterRegistry } from '../src/omni/adapters.js'
import { createOmniService } from '../src/omni/service.js'
import { listFacebookConversations, normalizeMetaConversations } from '../src/omni/metaInboxClient.js'
import { createAiReplyEngine } from '../src/omni/aiReplyEngine.js'
import { normalizeMetaWebhookPayload } from '../src/omni/metaWebhook.js'
import { listTikTokOrders, normalizeTikTokOrders } from '../src/omni/tiktokOrderClient.js'
import { getOmniSchemaSummary, loadOmniSchemaSql, REQUIRED_OMNI_TABLES } from '../src/omni/db/schema.js'
import { createSqliteOmniStore } from '../src/omni/db/sqliteStore.js'
import { mountRoutes } from '../src/routes.js'

test('omni seed starts with configured production page data', () => {
  const seed = createOmniSeed()
  assert.equal(seed.pages.length, 4)
  assert.ok(seed.pages.find((page) => page.id === 'page_fb_112154661515664'))
  assert.equal(seed.pages.find((page) => page.id === 'page_fb_112154661515664').name, 'VZ')
  assert.equal(seed.pages.some((page) => page.id === 'page_shop_4'), false)
  assert.equal(seed.pages.some((page) => page.id === 'page_shop_5'), false)
  assert.equal(seed.pages.every((page) => page.status === 'active'), true)
  assert.equal(seed.pages.every((page) => page.policySetId), true)
  assert.equal(seed.pages.every((page) => page.agentProfileId), true)
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
  assert.equal(blocked.reason, 'intent_requires_approval')
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
    assert.equal(body.pages.length, 4)
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

test('Facebook connector accepts configured extra page profile', async () => {
  const result = await listFacebookConversations({
    pageProfile: 'fb_112154661515664',
    runner: async () => ({ ok: true, response: { data: [] } }),
  })

  assert.equal(result.page.pageId, '112154661515664')
  assert.equal(result.page.omniPageId, 'page_fb_112154661515664')
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

test('AI reply engine drafts guarded replies from thread memory', () => {
  const service = createOmniService()
  const thread = service.getThread('thread_1')
  const ai = createAiReplyEngine({ provider: 'local_rules', model: 'test' })
  const decision = ai.draft({ thread, snapshot: service.snapshot(), policy: service.getPolicyForThread(thread) })

  assert.equal(decision.ok, true)
  assert.equal(decision.intent, 'stock')
  assert.equal(decision.allowed, true)
  assert.match(decision.draftText, /เช็กสต็อก/)
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
  assert.equal(pages.find((page) => page.id === 'page_fb_112154661515664').name, 'VZ')
  migratedStore.close()
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
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_messages_thread_created/)
})
