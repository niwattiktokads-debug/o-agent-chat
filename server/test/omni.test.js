import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { OMNI_STATUSES, validatePage } from '../src/omni/schema.js'
import { createOmniSeed } from '../src/omni/seed.js'
import { createAdapterRegistry } from '../src/omni/adapters.js'
import { createOmniService } from '../src/omni/service.js'
import { listFacebookConversations, normalizeMetaConversations } from '../src/omni/metaInboxClient.js'
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
