import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { OMNI_STATUSES, validatePage } from '../src/omni/schema.js'
import { createOmniSeed } from '../src/omni/seed.js'
import { createAdapterRegistry } from '../src/omni/adapters.js'
import { createOmniService } from '../src/omni/service.js'
import { listFacebookConversations, normalizeMetaConversations } from '../src/omni/metaInboxClient.js'
import { getOmniSchemaSummary, loadOmniSchemaSql, REQUIRED_OMNI_TABLES } from '../src/omni/db/schema.js'
import { createSqliteOmniStore } from '../src/omni/db/sqliteStore.js'
import { mountRoutes } from '../src/routes.js'

test('omni seed starts with configurable five-page seed data', () => {
  const seed = createOmniSeed()
  assert.equal(seed.pages.length, 5)
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
    assert.equal(body.pages.length, 5)
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
