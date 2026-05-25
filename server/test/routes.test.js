import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mountRoutes } from '../src/routes.js'
import { mountWebhook } from '../src/webhook.js'
import { createState } from '../src/state.js'
import { createOmniService } from '../src/omni/service.js'

const app = express()
app.use(express.json())
const events = []
const hub = { broadcast: (event, payload) => events.push({ event, payload }) }
const room = createState()
mountRoutes(app, hub, room)
mountWebhook(app, hub, room, { omni: createOmniService(), metaVerifyToken: 'verify-token-test' })
const server = app.listen(0)
const port = server.address().port
after(() => server.close())

const req = (method, path, body) => fetch(`http://localhost:${port}${path}`, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body && JSON.stringify(body),
}).then(async (r) => ({ status: r.status, body: await r.json() }))

test('GET /api/state returns snapshot', async () => {
  const { body } = await req('GET', '/api/state')
  assert.equal(body.leader, '—')
  assert.ok(Array.isArray(body.messages))
})

test('POST /api/message appends and broadcasts', async () => {
  events.length = 0
  const { body } = await req('POST', '/api/message', { role: 'Boss', text: 'hello' })
  assert.equal(body.ok, true)
  assert.equal(body.message.role, 'Boss')
  assert.equal(events[0].event, 'message')
  assert.equal(events[0].payload.messages.at(-1).text, 'hello')
})

test('POST /api/leader normalizes case and broadcasts state', async () => {
  events.length = 0
  const { body } = await req('POST', '/api/leader', { leader: 'code' })
  assert.equal(body.ok, true)
  assert.equal(events[0].event, 'leader')
  assert.equal(events[0].payload.leader, 'Code')
  assert.equal(body.state.operator, 'Codex')
})

test('POST /api/message rejects empty text', async () => {
  const { body, status } = await req('POST', '/api/message', { sender: 'Boss', text: '' })
  assert.equal(status, 400)
  assert.equal(body.ok, false)
})

test('GET /api/omni/connections lists safe connection metadata', async () => {
  const localApp = express()
  localApp.use(express.json())
  const fakeConnections = {
    list: async () => ({
      ok: true,
      cSnap: { ok: true },
      connections: [{
        id: 'omni_ai_openai',
        title: 'OpenAI',
        status: 'ready_to_verify',
        fields: [{ id: 'api_key', label: 'API key', status: 'configured', maskedValue: 'sk-...1234' }],
      }],
    }),
  }
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { connections: fakeConnections })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/api/omni/connections`)
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.connections[0].id, 'omni_ai_openai')
    assert.equal(body.connections[0].fields[0].maskedValue, 'sk-...1234')
  } finally {
    localServer.close()
  }
})

test('POST /api/omni/connections verifies through injected runtime', async () => {
  const localApp = express()
  localApp.use(express.json())
  let verifiedId = ''
  const fakeConnections = {
    list: async () => ({ ok: true, connections: [] }),
    verify: async (id) => {
      verifiedId = id
      return { ok: true, status: 'healthy', summary: 'verified' }
    },
  }
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { connections: fakeConnections })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/api/omni/connections/meta_anna_lynn/verify`, { method: 'POST' })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.status, 'healthy')
    assert.equal(verifiedId, 'meta_anna_lynn')
  } finally {
    localServer.close()
  }
})

test('POST /api/omni/connections saves secrets through injected runtime', async () => {
  const localApp = express()
  localApp.use(express.json())
  let savedPayload = null
  const fakeConnections = {
    list: async () => ({ ok: true, connections: [] }),
    saveSecrets: async (id, fields) => {
      savedPayload = { id, fields }
      return { ok: true, savedCount: 1 }
    },
  }
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { connections: fakeConnections })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/api/omni/connections/meta_anna_lynn/secrets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fields: { page_token: 'test-token' } }),
    })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.deepEqual(savedPayload, { id: 'meta_anna_lynn', fields: { page_token: 'test-token' } })
  } finally {
    localServer.close()
  }
})

test('POST /api/omni/pages/:pageId/auto-reply toggles page auto reply', async () => {
  const localApp = express()
  localApp.use(express.json())
  const localEvents = []
  const localOmni = createOmniService()
  mountRoutes(localApp, { broadcast: (event, payload) => localEvents.push({ event, payload }) }, createState(), { omni: localOmni })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/api/omni/pages/page_annalynn/auto-reply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: false, updatedBy: 'boss' }),
    })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.page.autoReplyEnabled, false)
    assert.equal(body.setting.autoReplyEnabled, false)
    assert.equal(localOmni.isPageAutoReplyEnabled('page_annalynn'), false)
    assert.equal(localEvents.at(-1).event, 'omni')
  } finally {
    localServer.close()
  }
})

test('POST /api/omni/connections send reply requires approval guard', async () => {
  const localApp = express()
  localApp.use(express.json())
  const fakeConnections = {
    list: async () => ({ ok: true, connections: [] }),
    sendReply: async (_id, _conversationId, payload) => {
      if (payload.approved !== true) throw new Error('approval_required')
      return { ok: true }
    },
  }
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { connections: fakeConnections })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/api/omni/connections/meta_anna_lynn/conversations/t_1/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    })
    const body = await response.json()
    assert.equal(response.status, 403)
    assert.equal(body.ok, false)
    assert.equal(body.sent, false)
    assert.equal(body.error, 'approval_required')
  } finally {
    localServer.close()
  }
})

test('POST /api/omni/connections send reply passes approved payload to runtime', async () => {
  const localApp = express()
  localApp.use(express.json())
  let sentPayload = null
  const fakeConnections = {
    list: async () => ({ ok: true, connections: [] }),
    sendReply: async (id, conversationId, payload) => {
      sentPayload = { id, conversationId, payload }
      return { ok: true, message: payload.message, recipientId: 'fb_customer' }
    },
  }
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { connections: fakeConnections })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/api/omni/connections/meta_anna_lynn/conversations/t_1/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hello', approved: true }),
    })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.sent, true)
    assert.deepEqual(sentPayload, {
      id: 'meta_anna_lynn',
      conversationId: 't_1',
      payload: { message: 'hello', approved: true },
    })
  } finally {
    localServer.close()
  }
})

test('POST /api/field updates goal and broadcasts', async () => {
  events.length = 0
  const { body } = await req('POST', '/api/field', { key: 'goal', value: 'ship MVP' })
  assert.equal(body.ok, true)
  assert.equal(events[0].event, 'room')
  assert.equal(events[0].payload.goal, 'ship MVP')
})

test('POST /api/field accepts doneDefinition alias', async () => {
  events.length = 0
  const { body } = await req('POST', '/api/field', { key: 'doneDefinition', value: 'green E2E' })
  assert.equal(body.ok, true)
  assert.equal(body.state.dod, 'green E2E')
  assert.equal(body.state.doneDefinition, 'green E2E')
})

test('GET /webhook/meta verifies Meta challenge', async () => {
  const response = await fetch(`http://localhost:${port}/webhook/meta?hub.mode=subscribe&hub.verify_token=verify-token-test&hub.challenge=abc123`)
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'abc123')
})

test('POST /webhook/meta syncs Meta messenger event', async () => {
  const { body, status } = await req('POST', '/webhook/meta', {
    object: 'page',
    entry: [{
      id: '112154661515664',
      messaging: [{
        sender: { id: 'customer_vz_route' },
        recipient: { id: '112154661515664' },
        timestamp: 1779470000000,
        message: { mid: 'route_mid_vz', text: 'มีของไหม' },
      }],
    }],
  })

  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.result.threads.inserted, 1)
  assert.equal(body.result.dexSignals.length, 1)
})

test('POST /webhook/meta sends event-driven Dex signal only for new inbound messages', async () => {
  events.length = 0
  const payload = {
    object: 'page',
    entry: [{
      id: '122106446570001676',
      messaging: [{
        sender: { id: 'customer_anna_signal' },
        recipient: { id: '122106446570001676' },
        timestamp: 1779470050000,
        message: { mid: 'route_mid_anna_signal', text: 'มีสินค้าไหม' },
      }],
    }],
  }

  const first = await req('POST', '/webhook/meta', payload)
  assert.equal(first.status, 200)
  assert.equal(first.body.result.dexSignals.length, 1)
  assert.equal(first.body.result.dexSignals[0].pageName, 'Anna Lynn')
  assert.equal(first.body.result.dexSignalMessage.role, 'Codex')
  assert.match(first.body.result.dexSignalMessage.text, /@เดส มีข้อความลูกค้าใหม่/)
  assert.equal(events.some((event) => event.event === 'omni:attention'), true)
  assert.equal(events.some((event) => event.event === 'message'), true)

  events.length = 0
  const second = await req('POST', '/webhook/meta', payload)
  assert.equal(second.status, 200)
  assert.equal(second.body.result.messages.inserted, 0)
  assert.equal(second.body.result.dexSignals.length, 0)
  assert.equal(events.some((event) => event.event === 'omni:attention'), false)
})

test('POST /webhook/tiktok/business-messaging syncs TikTok DM event', async () => {
  events.length = 0
  const { body, status } = await req('POST', '/webhook/tiktok/business-messaging', {
    events: [{
      conversation_id: 'conv_route_1',
      sender: { id: 'tt_customer_route', display_name: 'TikTok Customer' },
      message: { message_id: 'tt_route_mid_1', text: 'ยังมีของไหม', timestamp: 1779470500000 },
    }],
  })

  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.result.threads.inserted, 1)
  assert.equal(body.result.messages.inserted, 1)
  assert.equal(body.result.dexSignals.length, 1)
  assert.equal(events.some((event) => event.event === 'omni:attention'), true)
})

test('POST /webhook/meta can auto draft a reply for synced messages', async () => {
  events.length = 0
  const { body, status } = await req('POST', '/webhook/meta?autoReply=1', {
    object: 'page',
    entry: [{
      id: '189971841184132',
      messaging: [{
        sender: { id: 'customer_mk_auto' },
        recipient: { id: '189971841184132' },
        timestamp: 1779470100000,
        message: { mid: 'route_mid_mk_auto', text: 'มีไซซ์ M ไหม' },
      }],
    }],
  })

  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.result.autoReplies.length, 1)
  assert.equal(body.result.autoReplies[0].ok, true)
  assert.equal(body.result.autoReplies[0].decision.sourceIds.every((id) => id.startsWith('ks_')), true)
  assert.equal(events.at(-1).event, 'omni')
})

test('POST /webhook/meta skips auto draft when page auto reply is disabled', async () => {
  const app = express()
  app.use(express.json())
  const localEvents = []
  const localHub = { broadcast: (event, payload) => localEvents.push({ event, payload }) }
  const localOmni = createOmniService()
  localOmni.setPageAutoReply({ pageId: 'page_annalynn', enabled: false, updatedBy: 'test' })
  mountWebhook(app, localHub, createState(), {
    omni: localOmni,
    metaVerifyToken: 'verify-token-test',
  })
  const localServer = app.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/webhook/meta?autoReply=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        object: 'page',
        entry: [{
          id: '122106446570001676',
          messaging: [{
            sender: { id: 'customer_anna_disabled_auto' },
            recipient: { id: '122106446570001676' },
            timestamp: 1779470150000,
            message: { mid: 'route_mid_anna_disabled_auto', text: 'มีไซซ์ M ไหม' },
          }],
        }],
      }),
    })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.result.autoReplies.length, 0)
    assert.equal(localOmni.snapshot().pages.find((page) => page.id === 'page_annalynn').autoReplyEnabled, false)
  } finally {
    localServer.close()
  }
})

test('POST /webhook/meta can auto draft from realtime default without query flags', async () => {
  const app = express()
  app.use(express.json())
  const localEvents = []
  const localHub = { broadcast: (event, payload) => localEvents.push({ event, payload }) }
  mountWebhook(app, localHub, createState(), {
    omni: createOmniService(),
    metaVerifyToken: 'verify-token-test',
    metaAutoReplyDefault: true,
  })
  const localServer = app.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/webhook/meta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        object: 'page',
        entry: [{
          id: '122106446570001676',
          messaging: [{
            sender: { id: 'customer_anna_realtime' },
            recipient: { id: '122106446570001676' },
            timestamp: 1779470200000,
            message: { mid: 'route_mid_anna_realtime', text: 'มีไซซ์ M ไหม' },
          }],
        }],
      }),
    })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.result.autoReplies.length, 1)
    assert.equal(body.result.autoReplies[0].ok, true)
    assert.equal(body.result.autoReplies[0].sent, undefined)
    assert.equal(localEvents.at(-1).event, 'omni')
  } finally {
    localServer.close()
  }
})

test('POST /webhook/meta send=0 overrides live send default for smoke tests', async () => {
  const app = express()
  app.use(express.json())
  const sent = []
  const localHub = { broadcast: () => {} }
  mountWebhook(app, localHub, createState(), {
    omni: createOmniService(),
    metaVerifyToken: 'verify-token-test',
    metaAutoReplyDefault: true,
    metaAutoSendDefault: true,
    sendReply: async (payload) => {
      sent.push(payload)
      return { ok: true, response: { message_id: 'should_not_send' } }
    },
  })
  const localServer = app.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/webhook/meta?send=0`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        object: 'page',
        entry: [{
          id: '122106446570001676',
          messaging: [{
            sender: { id: 'customer_anna_smoke_no_send' },
            recipient: { id: '122106446570001676' },
            timestamp: 1779470210000,
            message: { mid: 'route_mid_anna_smoke_no_send', text: 'มีสินค้าไหม' },
          }],
        }],
      }),
    })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.result.autoReplies.length, 1)
    assert.equal(body.result.autoReplies[0].sent, undefined)
    assert.equal(sent.length, 0)
  } finally {
    localServer.close()
  }
})

test('POST /webhook/meta auto drafts after webhook thread is remapped to existing Meta thread', async () => {
  const app = express()
  app.use(express.json())
  const localEvents = []
  const localHub = { broadcast: (event, payload) => localEvents.push({ event, payload }) }
  const seed = createOmniService().snapshot()
  seed.customers.push({
    id: 'fb_customer_existing_anna',
    displayName: 'Existing Anna Customer',
    platform: 'facebook',
    providerCustomerId: 'existing_anna',
    matchConfidence: 1,
  })
  seed.threads.push({
    id: 'fb_t_existing_anna',
    providerThreadId: 't_existing_anna',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'fb_customer_existing_anna',
    status: 'open',
    intent: 'unknown',
    risk: 'medium',
    unreadCount: 0,
    messageCount: 1,
    updatedAt: '2026-05-24T00:00:00.000Z',
  })
  mountWebhook(app, localHub, createState(), {
    omni: createOmniService(seed),
    metaVerifyToken: 'verify-token-test',
    metaAutoReplyDefault: true,
  })
  const localServer = app.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/webhook/meta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        object: 'page',
        entry: [{
          id: '122106446570001676',
          messaging: [{
            sender: { id: 'existing_anna' },
            recipient: { id: '122106446570001676' },
            timestamp: 1779470220000,
            message: { mid: 'route_mid_existing_anna', text: 'มีสินค้าไหม' },
          }],
        }],
      }),
    })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.result.autoReplies.length, 1)
    assert.equal(body.result.autoReplies[0].ok, true)
    assert.equal(body.result.autoReplies[0].decision.threadId, 'fb_t_existing_anna')
    assert.equal(body.result.autoReplies[0].sent, undefined)
    assert.equal(localEvents.at(-1).event, 'omni')
  } finally {
    localServer.close()
  }
})

test('POST /webhook/dex/auto-reply drafts from existing thread memory', async () => {
  const { body, status } = await req('POST', '/webhook/dex/auto-reply', { threadId: 'thread_1' })

  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.decision.threadId, 'thread_1')
  assert.match(body.decision.draftText, /เช็กสต็อก/)
  assert.equal(body.decision.sourceIds.every((id) => id.startsWith('ks_')), true)
})

test('POST /api/omni/threads/:threadId/manual-draft stores text and image attachments without customer send', async () => {
  events.length = 0
  const { body, status } = await req('POST', '/api/omni/threads/thread_1/manual-draft', {
    authorName: 'บอส',
    text: 'ส่งรูปนี้ให้ลูกค้าดู',
    attachments: [{
      id: 'att_test_1',
      name: 'look.png',
      type: 'image/png',
      size: 42,
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    }],
  })

  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.message.direction, 'outbound')
  assert.equal(body.message.sourceRef, 'manual_draft')
  assert.equal(body.message.deliveryStatus, 'draft_only')
  assert.equal(body.message.attachments.length, 1)
  assert.equal(body.audit.action, 'manual_reply_draft_created')
  assert.equal(body.audit.actorType, 'human')
  assert.equal(body.audit.afterJson.messageId, body.message.id)
  assert.equal(body.thread.status, 'draft_ready')
  assert.equal(events.at(-1).event, 'omni')
})

test('GET /api/omni/payments/providers/meta_pay_kgp/health reports guarded setup status', async () => {
  const { body, status } = await req('GET', '/api/omni/payments/providers/meta_pay_kgp/health')

  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.provider, 'meta_pay_kgp')
  assert.equal(body.health.status, 'disabled')
  assert.equal(body.health.mode, 'guarded_setup')
  assert.equal(body.health.liveReady, false)
})

test('POST /api/omni/payment-requests requires approval for customer-facing payment links', async () => {
  const { body, status } = await req('POST', '/api/omni/payment-requests', {
    threadId: 'thread_1',
    provider: 'meta_pay_kgp',
    amount: 729,
    currency: 'THB',
  })

  assert.equal(status, 403)
  assert.equal(body.ok, false)
  assert.equal(body.error, 'approval_required')
})

test('POST /api/omni/payment-requests creates guarded KGP draft after approval', async () => {
  const { body, status } = await req('POST', '/api/omni/payment-requests', {
    threadId: 'thread_1',
    provider: 'meta_pay_kgp',
    amount: 729,
    currency: 'THB',
    approved: true,
  })

  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.payment.provider, 'meta_pay_kgp')
  assert.equal(body.payment.status, 'draft')
  assert.equal(body.payment.approvalRequired, true)
  assert.match(body.payment.providerRef, /^kgp_draft_/)
  assert.equal(body.event.type, 'created')
  assert.equal(body.event.source, 'meta_pay_kgp')
  assert.equal(body.audit.action, 'payment_request_created')
  assert.equal(body.audit.afterJson.paymentRequestId, body.payment.id)
})

test('POST /webhook/meta can send guarded auto reply for Anna Lynn only', async () => {
  const app = express()
  app.use(express.json())
  const sent = []
  const localEvents = []
  const localHub = { broadcast: (event, payload) => localEvents.push({ event, payload }) }
  mountWebhook(app, localHub, createState(), {
    omni: createOmniService(),
    metaVerifyToken: 'verify-token-test',
    sendReply: async (payload) => {
      sent.push(payload)
      return { ok: true, response: { message_id: 'sent_mid_anna' } }
    },
  })
  const localServer = app.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/webhook/meta?autoReply=1&send=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        object: 'page',
        entry: [{
          id: '122106446570001676',
          messaging: [{
            sender: { id: 'customer_anna_send' },
            recipient: { id: '122106446570001676' },
            timestamp: 1779470300000,
            message: { mid: 'route_mid_anna_send', text: 'มีสินค้าไหม' },
          }],
        }],
      }),
    })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.result.autoReplies[0].sent, true)
    assert.equal(body.result.autoReplies[0].recorded.provider, 'local_rules')
    assert.equal(body.result.autoReplies[0].recorded.intent, 'stock')
    assert.equal(body.result.autoReplies[0].outboundAudit.action, 'customer_message_sent')
    assert.equal(body.result.autoReplies[0].outboundAudit.afterJson.decisionId, body.result.autoReplies[0].recorded.id)
    assert.deepEqual(body.result.autoReplies[0].outboundAudit.afterJson.sourceIds, body.result.autoReplies[0].decision.sourceIds)
    assert.equal(sent[0].pageProfile, 'anna_lynn')
    assert.equal(sent[0].recipientId, 'customer_anna_send')
    assert.match(sent[0].message, /เช็กสต็อก/)
    assert.equal(localEvents.at(-1).event, 'omni')
  } finally {
    localServer.close()
  }
})

test('POST /webhook/meta sends guarded fallback reply when AI helper fails after local draft', async () => {
  const app = express()
  app.use(express.json())
  const sent = []
  const localEvents = []
  const localHub = { broadcast: (event, payload) => localEvents.push({ event, payload }) }
  mountWebhook(app, localHub, createState(), {
    omni: createOmniService(),
    metaVerifyToken: 'verify-token-test',
    ai: {
      async draft() {
        return {
          ok: false,
          provider: 'gemini_cli',
          model: 'gemini-3-flash-preview',
          threadId: 'fb_webhook_fallback',
          intent: 'stock',
          risk: 'low',
          action: 'draft_ready',
          confidence: 0.82,
          allowed: true,
          draftText: 'เดี๋ยวเช็กสต็อกให้ค่ะ ขอทราบสีและไซซ์ที่ต้องการอีกครั้งนะคะ',
          reason: 'policy_allows_low_risk_intent',
          sourceIds: ['ks_annalynn_product_faq'],
          evidenceIds: ['route_mid_anna_fallback'],
          error: 'empty_ai_reply',
        }
      },
    },
    sendReply: async (payload) => {
      sent.push(payload)
      return { ok: true, response: { message_id: 'sent_mid_fallback' } }
    },
  })
  const localServer = app.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/webhook/meta?autoReply=1&send=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        object: 'page',
        entry: [{
          id: '122106446570001676',
          messaging: [{
            sender: { id: 'customer_anna_fallback' },
            recipient: { id: '122106446570001676' },
            timestamp: 1779470400000,
            message: { mid: 'route_mid_anna_fallback', text: 'มีไซซ์ M สีดำไหม' },
          }],
        }],
      }),
    })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.result.autoReplies[0].sent, true)
    assert.equal(body.result.autoReplies[0].decision.degraded, true)
    assert.equal(body.result.autoReplies[0].decision.helperError, 'empty_ai_reply')
    assert.equal(sent[0].pageProfile, 'anna_lynn')
    assert.equal(sent[0].recipientId, 'customer_anna_fallback')
    assert.match(sent[0].message, /เช็กสต็อก/)
    assert.equal(localEvents.at(-1).event, 'omni')
  } finally {
    localServer.close()
  }
})
