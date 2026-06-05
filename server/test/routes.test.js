import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createHmac } from 'node:crypto'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mountRoutes } from '../src/routes.js'
import { mountWebhook } from '../src/webhook.js'
import { createState } from '../src/state.js'
import { createOmniService } from '../src/omni/service.js'
import { createOmniSeed } from '../src/omni/seed.js'
import { createSecurityMiddleware } from '../src/security.js'
import { createConnectionRuntime } from '../src/omni/connections.js'
import { createKgpPaymentRuntime } from '../src/omni/kgpPaymentRuntime.js'

const app = express()
app.use(express.json())
const events = []
const hub = { broadcast: (event, payload) => events.push({ event, payload }) }
const room = createState()
mountRoutes(app, hub, room)
mountWebhook(app, hub, room, { omni: createOmniService(), metaVerifyToken: 'verify-token-test', awaitAutoReplies: true })
const server = app.listen(0)
const port = server.address().port
after(() => server.close())

const req = (method, path, body) => fetch(`http://localhost:${port}${path}`, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body && JSON.stringify(body),
}).then(async (r) => ({ status: r.status, body: await r.json() }))

function signEasyStorePayload(rawBody, secret = 'easy-secret-test') {
  return createHmac('sha256', secret).update(rawBody).digest('hex')
}

async function waitForCondition(assertion, { timeoutMs = 1000, intervalMs = 10 } = {}) {
  const started = Date.now()
  let lastError
  while (Date.now() - started < timeoutMs) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }
  throw lastError || new Error('condition_timeout')
}

function assertBroadcastedOmni(broadcasts) {
  assert.equal(broadcasts.some((event) => event.event === 'omni'), true)
}

function createOmniServiceWithCustomerSend() {
  const service = createOmniService()
  service.updateSettings({ settings: { ai: { customerSendEnabled: true } }, updatedBy: 'test' })
  return service
}

function zortReadyDraftPayload(overrides = {}) {
  return {
    threadId: 'thread_1',
    customerName: 'ลูกค้า A',
    customerPhone: '0812345678',
    shippingMethod: 'ไปรษณีย์ไทย',
    paymentMethod: 'bank_transfer',
    shippingAddress: {
      recipientName: 'ลูกค้า A',
      recipientPhone: '0812345678',
      addressLine: '99/1 ถนนสุขุมวิท',
      postalCode: '10110',
      province: 'กรุงเทพมหานคร',
      district: 'คลองเตย',
      subDistrict: 'คลองตัน',
      country: 'ไทย',
    },
    items: [{ sku: 'BLACK-M', name: 'Black Shirt M', quantity: 1, unitPrice: 590, zortProductId: '637' }],
    ...overrides,
  }
}

test('GET /api/state returns snapshot', async () => {
  const { body } = await req('GET', '/api/state')
  assert.equal(body.leader, '—')
  assert.ok(Array.isArray(body.messages))
})

test('POST /api/omni/pages/registry appends a page registry entry', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'omni-route-pages-'))
  const registryPath = join(dir, 'pages.json')
  const localApp = express()
  localApp.use(express.json())
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { pageRegistryPath: registryPath })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/api/omni/pages/registry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        profileKey: 'fb_extra_route',
        pageId: '999888777',
        pageName: 'Extra Route Page',
        omniPageId: 'page_extra_route',
        platform: 'facebook',
      }),
    })
    const body = await response.json()
    const rows = JSON.parse(readFileSync(registryPath, 'utf8'))

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.page.profileKey, 'fb_extra_route')
    assert.equal(body.registry.some((page) => page.profileKey === 'fb_extra_route'), true)
    assert.equal(rows[0].omniPageId, 'page_extra_route')
  } finally {
    localServer.close()
  }
})

test('security middleware sets headers and blocks disallowed cross-origin writes', async () => {
  const localApp = express()
  const security = createSecurityMiddleware({ allowedOrigins: 'https://omni.oagent.biz' })
  localApp.use(security.setSecurityHeaders)
  localApp.use(security.corsGuard)
  localApp.use(express.json({ limit: security.jsonLimit, strict: true }))
  localApp.post('/api/security-test', (_req, res) => res.json({ ok: true }))
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const denied = await fetch(`http://localhost:${localPort}/api/security-test`, {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    })
    assert.equal(denied.status, 403)
    assert.equal(denied.headers.get('x-frame-options'), 'DENY')

    const allowed = await fetch(`http://localhost:${localPort}/api/security-test`, {
      method: 'POST',
      headers: { origin: 'https://omni.oagent.biz', 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    })
    assert.equal(allowed.status, 200)
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://omni.oagent.biz')
    assert.equal(allowed.headers.get('cache-control'), 'no-store')
  } finally {
    localServer.close()
  }
})

test('access password protects Omni UI and API while leaving provider webhooks public', async () => {
  const localApp = express()
  const security = createSecurityMiddleware({ accessPassword: 'test-password' })
  localApp.use(express.json())
  localApp.use(express.urlencoded({ extended: false }))
  security.mountAccessRoutes(localApp)
  localApp.use(security.requireAccess)
  mountRoutes(localApp, { broadcast: () => {} }, createState())
  mountWebhook(localApp, { broadcast: () => {} }, createState(), {
    omni: createOmniService(),
    metaVerifyToken: 'verify-token-test',
    easyStoreClientSecret: 'easy-secret-test',
  })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const denied = await fetch(`http://localhost:${localPort}/api/state`)
    assert.equal(denied.status, 401)
    assert.equal((await denied.json()).error, 'access_password_required')

    const webhook = await fetch(`http://localhost:${localPort}/webhook/meta?hub.mode=subscribe&hub.verify_token=verify-token-test&hub.challenge=abc123`)
    assert.equal(webhook.status, 200)
    assert.equal(await webhook.text(), 'abc123')

    const easyStoreWebhook = await fetch(`http://localhost:${localPort}/webhook/easystore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'EasyStore-Hmac-SHA256': 'bad-signature' },
      body: JSON.stringify({ id: 1 }),
    })
    assert.equal(easyStoreWebhook.status, 401)
    assert.equal((await easyStoreWebhook.json()).error, 'invalid_easystore_hmac')

    const badLogin = await fetch(`http://localhost:${localPort}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ password: 'wrong' }),
    })
    assert.equal(badLogin.status, 401)

    const login = await fetch(`http://localhost:${localPort}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ password: 'test-password' }),
    })
    assert.equal(login.status, 200)
    const cookie = login.headers.get('set-cookie')
    assert.match(cookie, /omni_access=/)

    const allowed = await fetch(`http://localhost:${localPort}/api/state`, {
      headers: { cookie },
    })
    assert.equal(allowed.status, 200)
    assert.equal((await allowed.json()).leader, '—')
  } finally {
    localServer.close()
  }
})

test('EasyStore product preview API is public when Omni access password is enabled', async () => {
  const localApp = express()
  const security = createSecurityMiddleware({ accessPassword: 'test-password' })
  const calls = []
  const fakeEasyStore = {
    getProductPreview: async ({ productId }) => {
      calls.push(productId)
      return {
        ok: true,
        product: {
          id: productId,
          title: 'Amanda Jumpsuit',
          descriptionText: 'ชุดจั๊มสูทพร้อมส่ง',
          price: { amount: 1290, currency: 'THB', formatted: '฿1,290' },
          stock: { totalQuantity: 3, status: 'in_stock' },
          images: [{ url: 'https://cdn.example/amanda.jpg', alt: 'Amanda Jumpsuit' }],
          variants: [{ id: '7001', sku: 'AMANDA-BLK-M', title: 'Black / M', quantity: 3 }],
          links: { storefrontUrl: 'https://annalynna.easy.co/products/amanda-jumpsuit' },
        },
        tracking: { pixelId: '401272399141441' },
      }
    },
  }
  localApp.use(express.json())
  security.mountAccessRoutes(localApp)
  localApp.use(security.requireAccess)
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { easyStore: fakeEasyStore })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/api/omni/easystore/products/16462646/preview`)
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.product.id, '16462646')
    assert.equal(body.product.images[0].url, 'https://cdn.example/amanda.jpg')
    assert.equal(body.tracking.pixelId, '401272399141441')
    assert.deepEqual(calls, ['16462646'])
  } finally {
    localServer.close()
  }
})

test('EasyStore Meta catalog feed is public CSV when Omni access password is enabled', async () => {
  const localApp = express()
  const security = createSecurityMiddleware({ accessPassword: 'test-password' })
  const calls = []
  const fakeEasyStore = {
    getMetaCatalogFeed: async ({ limit }) => {
      calls.push({ limit })
      return {
        ok: true,
        count: 1,
        generatedAt: '2026-06-04T00:00:00.000Z',
        csv: 'id,title,description,availability,condition,price,link,image_link,brand\n16462646,Amanda,Amanda,in stock,new,890 THB,https://omni.oagent.biz/p/easystore/16462646,https://cdn.example/amanda.jpg,Annalynna\n',
      }
    },
  }
  localApp.use(express.json())
  security.mountAccessRoutes(localApp)
  localApp.use(security.requireAccess)
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { easyStore: fakeEasyStore })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/feeds/meta/annalynna.csv`)
    const text = await response.text()

    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type'), /text\/csv/)
    assert.match(response.headers.get('cache-control'), /max-age=900/)
    assert.match(text, /^id,title,description,availability,condition,price,link,image_link,brand\n/)
    assert.deepEqual(calls, [{ limit: 250 }])
  } finally {
    localServer.close()
  }
})

test('GET /api/omni/meta/catalog/status redacts credential state', async () => {
  const localApp = express()
  const fakeMetaCatalog = {
    status: () => ({
      ok: true,
      service: 'meta_catalog_api',
      mode: 'enabled',
      credentialStatus: { accessToken: { ok: true, value_present: true } },
    }),
  }
  localApp.use(express.json())
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { metaCatalog: fakeMetaCatalog })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/api/omni/meta/catalog/status`)
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.service, 'meta_catalog_api')
    assert.equal(body.credentialStatus.accessToken.value_present, true)
    assert.equal(body.credentialStatus.accessToken.value, undefined)
  } finally {
    localServer.close()
  }
})

test('GET /api/omni/connections includes ZORT Social parity options missing from the MVP', async () => {
  const { body, status } = await req('GET', '/api/omni/connections')
  assert.equal(status, 200)
  const ids = new Set(body.connections.map((connection) => connection.id))
  assert.ok(ids.has('social_instagram'))
  assert.ok(ids.has('line_oa'))
  assert.ok(ids.has('line_shopping_myshop'))
  assert.ok(ids.has('tiktok_sale_page'))
  assert.ok(ids.has('facebook_post_cf'))
  assert.ok(ids.has('facebook_live_cf'))
  assert.ok(ids.has('social_message_report'))
  assert.ok(ids.has('easystore_storefront'))
})

test('GET /api/omni/storage/status exposes persistent storage status', async () => {
  const localApp = express()
  localApp.use(express.json())
  mountRoutes(localApp, { broadcast: () => {} }, createState(), {
    storageStatus: {
      driver: 'sqlite',
      dbPath: '/data/omni.sqlite',
      configuredByEnv: true,
      persistent: true,
      volumeMountPath: '/data',
      note: 'Railway volume-backed SQLite storage',
    },
  })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/api/omni/storage/status`)
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.storage.driver, 'sqlite')
    assert.equal(body.storage.dbPath, '/data/omni.sqlite')
    assert.equal(body.storage.persistent, true)
    assert.equal(body.storage.volumeMountPath, '/data')
  } finally {
    localServer.close()
  }
})

test('Suda O-agent notification routes use injected notifier runtime', async () => {
  const localApp = express()
  localApp.use(express.json())
  const calls = []
  const fakeNotifier = {
    responseStatus: (payload) => payload.ok ? 200 : 409,
    verify: async () => {
      calls.push({ action: 'verify' })
      return { ok: true, bot: { displayName: 'สุดา', basicId: '@537mpwyq' }, target: { ok: false, reason: 'missing_target_group_id_for_O_agent' } }
    },
    chatUrl: async () => {
      calls.push({ action: 'chatUrl' })
      return { ok: true, url: 'https://chat.line.biz/', confirmedChatName: 'O-agent(4)' }
    },
    setGroupId: async (groupId) => {
      calls.push({ action: 'setGroupId', groupId })
      return { ok: true, groupName: 'O-agent(4)' }
    },
    sendTaskSummary: async ({ dryRun }) => {
      calls.push({ action: 'sendTaskSummary', dryRun })
      return dryRun ? { ok: true, dryRun: true } : { ok: false, error: 'missing_target_group_id_for_O_agent' }
    },
    listGroupRules: async () => {
      calls.push({ action: 'listGroupRules' })
      return { ok: true, groups: [{ groupId: 'Ctest', groupName: 'ผลิตออนไลน์', responseRules: { duty: 'ตามงานผลิต' } }] }
    },
    saveGroupRules: async (groupId, responseRules) => {
      calls.push({ action: 'saveGroupRules', groupId, responseRules })
      return { ok: true, group: { groupId, groupName: 'ผลิตออนไลน์', responseRules } }
    },
  }
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { sudaOagentNotifier: fakeNotifier })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port

    const healthResponse = await fetch(`http://localhost:${localPort}/api/omni/notifications/suda-oagent/health`)
    const health = await healthResponse.json()
    assert.equal(healthResponse.status, 200)
    assert.equal(health.bot.displayName, 'สุดา')

    const dryRunResponse = await fetch(`http://localhost:${localPort}/api/omni/notifications/suda-oagent/task-summary`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dryRun: true }),
    })
    const dryRun = await dryRunResponse.json()
    assert.equal(dryRunResponse.status, 200)
    assert.equal(dryRun.dryRun, true)

    const sendResponse = await fetch(`http://localhost:${localPort}/api/omni/notifications/suda-oagent/task-summary`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dryRun: false }),
    })
    const send = await sendResponse.json()
    assert.equal(sendResponse.status, 409)
    assert.equal(send.error, 'missing_target_group_id_for_O_agent')

    const saveResponse = await fetch(`http://localhost:${localPort}/api/omni/notifications/suda-oagent/group-id`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ groupId: 'Ctest' }),
    })
    const saved = await saveResponse.json()
    assert.equal(saveResponse.status, 200)
    assert.equal(saved.groupName, 'O-agent(4)')

    const rulesResponse = await fetch(`http://localhost:${localPort}/api/omni/notifications/suda-oagent/group-rules`)
    const rules = await rulesResponse.json()
    assert.equal(rulesResponse.status, 200)
    assert.equal(rules.groups[0].responseRules.duty, 'ตามงานผลิต')

    const saveRulesResponse = await fetch(`http://localhost:${localPort}/api/omni/notifications/suda-oagent/group-rules/Ctest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ responseRules: { questionPattern: 'วินส่งไปยัง' } }),
    })
    const savedRules = await saveRulesResponse.json()
    assert.equal(saveRulesResponse.status, 200)
    assert.equal(savedRules.group.responseRules.questionPattern, 'วินส่งไปยัง')

    assert.deepEqual(calls.map((call) => call.action), ['verify', 'sendTaskSummary', 'sendTaskSummary', 'setGroupId', 'listGroupRules', 'saveGroupRules'])
  } finally {
    localServer.close()
  }
})

test('LINE Suda webhook records new groups without auto-sending join intake and records /su response rules', async () => {
  const localApp = express()
  localApp.use(express.json())
  const localEvents = []
  const localRoom = createState()
  const tempDir = mkdtempSync(join(tmpdir(), 'line-suda-test-'))
  const lineCaptureLog = join(tempDir, 'capture.jsonl')
  const lineRegistryLog = join(tempDir, 'registry.jsonl')
  const lineRulesFile = join(tempDir, 'rules.json')
  const calls = []
  const fakeLineHelperRunner = async (args) => {
    calls.push(args)
    const command = args[0]
    if (command === 'set-group-id') return { ok: false, error: 'target_group_mismatch' }
    if (command === 'group-details') {
      return {
        ok: true,
        groupId: 'Cnew',
        groupIdMasked: 'Cnew',
        groupName: 'ผลิตออนไลน์',
        memberCount: 3,
        members: [{ displayName: 'บอส' }, { displayName: 'วิน' }, { displayName: 'สุดา' }],
        memberFetch: { errors: [] },
      }
    }
    if (command === 'send-join-intake') return { ok: true, sent: 'join_intake', groupName: 'ผลิตออนไลน์' }
    if (command === 'send') return { ok: true, sent: 'custom', groupName: 'ผลิตออนไลน์' }
    return { ok: true }
  }
  mountWebhook(localApp, { broadcast: (event, payload) => localEvents.push({ event, payload }) }, localRoom, {
    lineHelperRunner: fakeLineHelperRunner,
    lineCaptureLog,
    lineRegistryLog,
    lineRulesFile,
  })
  const localServer = localApp.listen(0)
  const localReq = (body) => fetch(`http://localhost:${localServer.address().port}/webhook/line/suda-oagent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (response) => ({ status: response.status, body: await response.json() }))

  try {
    const joinResponse = await localReq({
      events: [{
        type: 'join',
        replyToken: 'reply-token',
        source: { type: 'group', groupId: 'Cnew' },
      }],
    })
    assert.equal(joinResponse.status, 200)
    assert.equal(joinResponse.body.joinSignal, 'recorded')
    assert.equal(calls.some((args) => args[0] === 'send-join-intake' && args.includes('Cnew')), false)
    assert.ok(localEvents.some((event) => event.event === 'line:suda-oagent:join'))

    const dutyResponse = await localReq({
      events: [{
        type: 'message',
        replyToken: 'reply-token',
        source: { type: 'group', groupId: 'Cnew', userId: 'Uboss' },
        message: {
          type: 'text',
          text: [
            '/su',
            'หน้าที่: แจ้งเตือนงานผลิตและถามสถานะวิน',
            'รูปแบบคำถาม: สถานะงานผลิต/วินส่งไปยัง',
            'รูปแบบตอบ: สรุปสถานะล่าสุด + ถามเจ้าของงานถ้าข้อมูลไม่ครบ',
            'กฎตอบ: สุภาพ สั้น ห้ามเดาสถานะงาน',
          ].join('\n'),
        },
      }],
    })
    assert.equal(dutyResponse.status, 200)
    assert.equal(dutyResponse.body.dutyCommands, 1)
    assert.equal(dutyResponse.body.ruleCommands, 1)
    assert.ok(calls.some((args) => args[0] === 'send' && args.includes('--unsafe-no-verify')))
    assert.ok(localEvents.some((event) => event.event === 'line:suda-oagent:rules'))

    const registryRows = readFileSync(lineRegistryLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    assert.equal(registryRows[0].type, 'group_join_detected')
    assert.equal(registryRows[0].status, 'pending_boss_instruction')
    assert.equal(registryRows[1].type, 'group_response_rules_recorded')
    assert.equal(registryRows[1].duty, 'แจ้งเตือนงานผลิตและถามสถานะวิน')
    assert.equal(registryRows[1].questionPattern, 'สถานะงานผลิต/วินส่งไปยัง')
    assert.equal(registryRows[1].defaultReply, 'สรุปสถานะล่าสุด + ถามเจ้าของงานถ้าข้อมูลไม่ครบ')
    assert.equal(registryRows[1].replyRules, 'สุภาพ สั้น ห้ามเดาสถานะงาน')
    assert.equal(registryRows[1].status, 'response_rules_recorded')

    const rules = JSON.parse(readFileSync(lineRulesFile, 'utf8'))
    assert.equal(rules.groups.Cnew.groupName, 'ผลิตออนไลน์')
    assert.equal(rules.groups.Cnew.responseRules.duty, 'แจ้งเตือนงานผลิตและถามสถานะวิน')
    assert.equal(rules.groups.Cnew.responseRules.questionPattern, 'สถานะงานผลิต/วินส่งไปยัง')
    assert.equal(rules.groups.Cnew.responseRules.defaultReply, 'สรุปสถานะล่าสุด + ถามเจ้าของงานถ้าข้อมูลไม่ครบ')
    assert.equal(rules.groups.Cnew.responseRules.replyRules, 'สุภาพ สั้น ห้ามเดาสถานะงาน')
  } finally {
    localServer.close()
  }
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

test('connection metadata treats production env credentials as configured when C Snap is unavailable', async () => {
  const previousPageToken = process.env.META_PAGE_TOKEN_ANNA_LYNN
  const previousVerifyToken = process.env.META_VERIFY_TOKEN
  const previousCSnapAuthFile = process.env.CSNAP_AUTH_FILE
  process.env.META_PAGE_TOKEN_ANNA_LYNN = 'test-page-token'
  process.env.META_VERIFY_TOKEN = 'test-verify-token'
  delete process.env.CSNAP_AUTH_FILE
  try {
    const connections = createConnectionRuntime()
    const body = await connections.list()
    const meta = body.connections.find((connection) => connection.id === 'meta_anna_lynn')
    const postSession = body.connections.find((connection) => connection.id === 'facebook_post_cf')

    assert.equal(body.cSnap.ok, false)
    assert.equal(meta.fields.find((field) => field.id === 'page_token').status, 'configured')
    assert.equal(meta.fields.find((field) => field.id === 'page_token').source, 'env')
    assert.equal(meta.fields.find((field) => field.id === 'verify_token').status, 'configured')
    assert.equal(meta.status, 'ready_to_verify')
    assert.equal(postSession.fields.find((field) => field.id === 'page_token').status, 'configured')
  } finally {
    if (previousPageToken === undefined) delete process.env.META_PAGE_TOKEN_ANNA_LYNN
    else process.env.META_PAGE_TOKEN_ANNA_LYNN = previousPageToken
    if (previousVerifyToken === undefined) delete process.env.META_VERIFY_TOKEN
    else process.env.META_VERIFY_TOKEN = previousVerifyToken
    if (previousCSnapAuthFile === undefined) delete process.env.CSNAP_AUTH_FILE
    else process.env.CSNAP_AUTH_FILE = previousCSnapAuthFile
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

test('POST /api/omni/connections verifies ZORT through commerce runtime', async () => {
  const localApp = express()
  localApp.use(express.json())
  const calls = []
  const connections = createConnectionRuntime({
    commerce: {
      searchProducts: async ({ limit }) => {
        calls.push({ action: 'searchProducts', limit })
        return { ok: true, count: 1, products: [{ sku: 'LORRA-M' }] }
      },
    },
  })
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { connections })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/api/omni/connections/zort_open_api/verify`, { method: 'POST' })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.provider, 'zort')
    assert.equal(body.model, 'open-api')
    assert.equal(calls[0].action, 'searchProducts')
  } finally {
    localServer.close()
  }
})

test('POST /api/omni/connections verifies EasyStore through storefront runtime', async () => {
  const localApp = express()
  localApp.use(express.json())
  const calls = []
  const connections = createConnectionRuntime({
    easyStore: {
      verify: async ({ limit }) => {
        calls.push({ action: 'verifyEasyStore', limit })
        return { ok: true, mode: 'storefront_api_ready', productCount: 1 }
      },
    },
  })
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { connections })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/api/omni/connections/easystore_storefront/verify`, { method: 'POST' })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.provider, 'easystore')
    assert.equal(body.model, 'storefront-api-3.0')
    assert.equal(calls[0].action, 'verifyEasyStore')
    assert.equal(calls[0].limit, 1)
  } finally {
    localServer.close()
  }
})

test('POST /api/omni/connections verify reports runtime gap when no helper exists', async () => {
  const response = await fetch(`http://localhost:${port}/api/omni/connections/line_oa/verify`, { method: 'POST' })
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(body.ok, false)
  assert.equal(body.status, 'runtime_gap')
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

test('POST and DELETE /api/omni/connections manage custom options through injected runtime', async () => {
  const localApp = express()
  localApp.use(express.json())
  const calls = []
  const fakeConnections = {
    list: async () => ({ ok: true, connections: [] }),
    add: async (input) => {
      calls.push({ action: 'add', input })
      return { ok: true, connection: { id: 'custom_line', title: input.title, canDelete: true } }
    },
    remove: async (id) => {
      calls.push({ action: 'remove', id })
      return { ok: true, removedId: id }
    },
  }
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { connections: fakeConnections })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const createResponse = await fetch(`http://localhost:${localPort}/api/omni/connections`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'LINE OA', provider: 'line', group: 'customer_channel' }),
    })
    const createBody = await createResponse.json()
    assert.equal(createResponse.status, 200)
    assert.equal(createBody.ok, true)
    assert.equal(createBody.connection.id, 'custom_line')

    const deleteResponse = await fetch(`http://localhost:${localPort}/api/omni/connections/custom_line`, { method: 'DELETE' })
    const deleteBody = await deleteResponse.json()
    assert.equal(deleteResponse.status, 200)
    assert.equal(deleteBody.ok, true)
    assert.equal(deleteBody.removedId, 'custom_line')
    assert.deepEqual(calls, [
      { action: 'add', input: { title: 'LINE OA', provider: 'line', group: 'customer_channel' } },
      { action: 'remove', id: 'custom_line' },
    ])
  } finally {
    localServer.close()
  }
})

test('GET /api/omni/reports/message-volume filters by date and exports CSV', async () => {
  const localApp = express()
  localApp.use(express.json())
  const localOmni = createOmniService()
  localOmni.recordManualReplyDraft({
    threadId: 'thread_1',
    authorName: 'บอส',
    text: 'ตอบลูกค้าช่วงทดสอบ report',
  })
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { omni: localOmni })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const jsonResponse = await fetch(`http://localhost:${localPort}/api/omni/reports/message-volume?from=2026-05-22&to=2099-12-31`)
    const jsonBody = await jsonResponse.json()
    assert.equal(jsonResponse.status, 200)
    assert.equal(jsonBody.ok, true)
    assert.ok(jsonBody.report.totals.outbound >= 1)
    assert.ok(Array.isArray(jsonBody.report.byHour))

    const csvResponse = await fetch(`http://localhost:${localPort}/api/omni/reports/message-volume?from=2026-05-22&to=2099-12-31&format=csv`)
    const csvText = await csvResponse.text()
    assert.equal(csvResponse.status, 200)
    assert.match(csvResponse.headers.get('content-type'), /text\/csv/)
    assert.match(csvText, /hour,inbound,outbound,total/)
  } finally {
    localServer.close()
  }
})

test('POST /api/omni/settings persists settings and gates Post Selling Session capture', async () => {
  const localApp = express()
  localApp.use(express.json())
  const localOmni = createOmniService()
  const fakeSocial = {
    listPostComments: async () => ({
      ok: true,
      comments: [{ id: 'c1', message: 'รับ BLACK-M x2', from: { id: 'fb_cust_1', name: 'ลูกค้าโพสต์' }, createdTime: '2026-05-26T00:00:00.000Z' }],
    }),
  }
  const fakeCommerce = {
    searchProducts: async () => ({ ok: true, products: [{ id: 'p1', sku: 'BLACK-M', name: 'Black Shirt M', sellPrice: 590, availableStock: 7 }] }),
  }
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { omni: localOmni, social: fakeSocial, commerce: fakeCommerce })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const saveResponse = await fetch(`http://localhost:${localPort}/api/omni/settings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ settings: { postSession: { enabled: false } }, updatedBy: 'boss' }),
    })
    const saved = await saveResponse.json()
    assert.equal(saveResponse.status, 200)
    assert.equal(saved.settings.postSession.enabled, false)
    assert.equal(saved.settings.postCf.enabled, false)

    const captureResponse = await fetch(`http://localhost:${localPort}/api/omni/social/posts/post_1/capture`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pageProfile: 'man_kynd' }),
    })
    const captureBody = await captureResponse.json()
    assert.equal(captureResponse.status, 409)
    assert.equal(captureBody.error, 'post_session_disabled')
  } finally {
    localServer.close()
  }
})

test('POST /api/omni/settings gates AI draft routes when disabled', async () => {
  const localApp = express()
  localApp.use(express.json())
  const localOmni = createOmniService()
  let aiDraftCalls = 0
  let connectionReadCalls = 0
  const fakeAi = {
    draft: async () => {
      aiDraftCalls += 1
      return { ok: true, action: 'draft_ready' }
    },
  }
  const fakeConnections = {
    readThread: async () => {
      connectionReadCalls += 1
      return { ok: true, messages: [] }
    },
  }
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { omni: localOmni, ai: fakeAi, connections: fakeConnections })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const saveResponse = await fetch(`http://localhost:${localPort}/api/omni/settings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ settings: { ai: { enabled: false } }, updatedBy: 'boss' }),
    })
    assert.equal(saveResponse.status, 200)

    const threadResponse = await fetch(`http://localhost:${localPort}/api/omni/threads/thread_1/ai-draft`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const threadBody = await threadResponse.json()
    assert.equal(threadResponse.status, 409)
    assert.equal(threadBody.error, 'ai_disabled')

    const connectionResponse = await fetch(`http://localhost:${localPort}/api/omni/connections/meta_anna_lynn/conversations/conv_1/ai-draft`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const connectionBody = await connectionResponse.json()
    assert.equal(connectionResponse.status, 409)
    assert.equal(connectionBody.error, 'ai_disabled')
    assert.equal(aiDraftCalls, 0)
    assert.equal(connectionReadCalls, 0)
  } finally {
    localServer.close()
  }
})

test('POST /api/omni/threads/:threadId/ai-draft rejects EasyStore system events', async () => {
  const localApp = express()
  localApp.use(express.json())
  const localOmni = createOmniService()
  localOmni.syncEasyStoreWebhookEvents({
    source: 'easystore_webhook',
    topic: 'order/update',
    customers: [{ id: 'es_customer_501', displayName: 'Anna Buyer' }],
    threads: [{
      id: 'es_order_1014',
      providerThreadId: '1014',
      pageId: 'page_easystore_annalynna',
      platform: 'easystore',
      kind: 'order_event',
      customerId: 'es_customer_501',
      status: 'open',
      intent: 'orderStatus',
      risk: 'medium',
      updatedAt: '2026-06-05T06:25:34.000Z',
    }],
    messages: [{
      id: 'es_msg_1014',
      threadId: 'es_order_1014',
      direction: 'system',
      authorName: 'EasyStore',
      text: 'EasyStore order/update ##1014 · financial=paid',
      createdAt: '2026-06-05T06:25:34.000Z',
      sourceRef: 'easystore_webhook:order/update:1014',
    }],
    orders: [],
    inventorySnapshots: [],
  })
  let aiDraftCalls = 0
  mountRoutes(localApp, { broadcast: () => {} }, createState(), {
    omni: localOmni,
    ai: { draft: async () => { aiDraftCalls += 1; return { ok: true } } },
  })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/api/omni/threads/es_order_1014/ai-draft`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const body = await response.json()
    assert.equal(response.status, 409)
    assert.equal(body.error, 'system_event_no_ai_reply')
    assert.equal(aiDraftCalls, 0)
  } finally {
    localServer.close()
  }
})

test('Post Selling Session capture reads comments, maps product code, links ZORT product read-only, and creates order draft', async () => {
  const localApp = express()
  localApp.use(express.json())
  const localOmni = createOmniService()
  const calls = []
  const fakeSocial = {
    listPagePosts: async ({ pageProfile, limit }) => {
      calls.push({ action: 'posts', pageProfile, limit })
      return { ok: true, posts: [{ id: 'post_1', message: 'เปิดขาย BLACK-M', commentCount: 1, createdTime: '2026-05-26T00:00:00.000Z' }] }
    },
    listPostComments: async ({ objectId, pageProfile, limit }) => {
      calls.push({ action: 'comments', objectId, pageProfile, limit })
      return {
        ok: true,
        comments: [
          { id: 'comment_1', message: 'รับ BLACK-M x2', from: { id: 'fb_cust_1', name: 'ลูกค้าโพสต์' }, createdTime: '2026-05-26T00:01:00.000Z' },
          { id: 'comment_2', message: 'สวยมาก', from: { id: 'fb_cust_2', name: 'ลูกค้าคุย' }, createdTime: '2026-05-26T00:02:00.000Z' },
        ],
      }
    },
  }
  const fakeCommerce = {
    searchProducts: async ({ keyword, sku }) => {
      calls.push({ action: 'products', keyword, sku })
      return { ok: true, products: [{ id: '637', sku: 'BLACK-M', name: 'Black Shirt M', sellPrice: 590, availableStock: 7 }] }
    },
  }
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { omni: localOmni, social: fakeSocial, commerce: fakeCommerce })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const postsResponse = await fetch(`http://localhost:${localPort}/api/omni/social/posts?pageProfile=man_kynd&limit=5`)
    const postsBody = await postsResponse.json()
    assert.equal(postsResponse.status, 200)
    assert.equal(postsBody.posts[0].id, 'post_1')

    const captureResponse = await fetch(`http://localhost:${localPort}/api/omni/social/posts/post_1/capture`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pageProfile: 'man_kynd' }),
    })
    const captureBody = await captureResponse.json()
    assert.equal(captureResponse.status, 200)
    assert.equal(captureBody.ok, true)
    assert.equal(captureBody.summary.parsedCount, 1)
    assert.equal(captureBody.drafts[0].status, 'draft')
    assert.equal(captureBody.drafts[0].items[0].sku, 'BLACK-M')
    assert.equal(captureBody.drafts[0].items[0].quantity, 2)
    assert.equal(captureBody.drafts[0].items[0].zortProduct.availableStock, 7)
    assert.deepEqual(calls.find((call) => call.action === 'comments'), { action: 'comments', objectId: 'post_1', pageProfile: 'man_kynd', limit: 50 })
    assert.equal(localOmni.snapshot().orders.some((order) => order.id === captureBody.drafts[0].id), true)
  } finally {
    localServer.close()
  }
})

test('Post Selling Session capture queues review instead of draft when comment has no mapped ZORT product', async () => {
  const localApp = express()
  localApp.use(express.json())
  const localOmni = createOmniService()
  const fakeSocial = {
    listPostComments: async () => ({
      ok: true,
      comments: [
        { id: 'comment_1', message: 'รับ UNKNOWN-SKU x1', from: { id: 'fb_cust_1', name: 'ลูกค้าโพสต์' }, createdTime: '2026-05-26T00:01:00.000Z' },
        { id: 'comment_2', message: 'เอาค่ะ', from: { id: 'fb_cust_2', name: 'ลูกค้าคุย' }, createdTime: '2026-05-26T00:02:00.000Z' },
      ],
    }),
  }
  const fakeCommerce = {
    searchProducts: async () => ({ ok: true, products: [] }),
  }
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { omni: localOmni, social: fakeSocial, commerce: fakeCommerce })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const captureResponse = await fetch(`http://localhost:${localPort}/api/omni/social/posts/post_1/capture`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pageProfile: 'man_kynd' }),
    })
    const captureBody = await captureResponse.json()
    assert.equal(captureResponse.status, 200)
    assert.equal(captureBody.summary.parsedCount, 1)
    assert.equal(captureBody.summary.draftCount, 0)
    assert.equal(captureBody.summary.reviewCount, 2)
    assert.equal(captureBody.reviewItems.some((item) => item.reason === 'zort_product_not_found'), true)
    assert.equal(captureBody.reviewItems.some((item) => item.reason === 'missing_sku'), true)
    assert.equal(localOmni.snapshot().orders.some((order) => String(order.sourceRef || '').startsWith('meta_post_session:post_1')), false)
  } finally {
    localServer.close()
  }
})

test('Post Selling Session capture respects autoCreateDrafts setting', async () => {
  const localApp = express()
  localApp.use(express.json())
  const localOmni = createOmniService()
  localOmni.updateSettings({ settings: { postSession: { autoCreateDrafts: false } }, updatedBy: 'boss' })
  const fakeSocial = {
    listPostComments: async () => ({
      ok: true,
      comments: [{ id: 'comment_1', message: 'รับ BLACK-M x1', from: { id: 'fb_cust_1', name: 'ลูกค้าโพสต์' }, createdTime: '2026-05-26T00:01:00.000Z' }],
    }),
  }
  const fakeCommerce = {
    searchProducts: async () => ({ ok: true, products: [{ id: '637', sku: 'BLACK-M', name: 'Black Shirt M', sellPrice: 590, availableStock: 7 }] }),
  }
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { omni: localOmni, social: fakeSocial, commerce: fakeCommerce })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const captureResponse = await fetch(`http://localhost:${localPort}/api/omni/social/posts/post_1/capture`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pageProfile: 'man_kynd' }),
    })
    const captureBody = await captureResponse.json()
    assert.equal(captureResponse.status, 200)
    assert.equal(captureBody.summary.parsedCount, 1)
    assert.equal(captureBody.summary.draftCount, 0)
    assert.equal(captureBody.reviewItems[0].reason, 'auto_create_disabled')
    assert.equal(localOmni.snapshot().orders.some((order) => String(order.sourceRef || '').startsWith('meta_post_session:post_1')), false)
  } finally {
    localServer.close()
  }
})

test('Order draft searches ZORT products, creates draft, and requires approval before ZORT order create', async () => {
  const localApp = express()
  localApp.use(express.json())
  const localOmni = createOmniService()
  const calls = []
  const fakeCommerce = {
    searchProducts: async ({ keyword }) => {
      calls.push({ action: 'search', keyword })
      return { ok: true, products: [{ id: '637', sku: 'BLACK-M', name: 'Black Shirt M', sellPrice: 590, availableStock: 7 }] }
    },
    createOrder: async ({ order, uniquenumber, approved }) => {
      calls.push({ action: 'createOrder', orderId: order.id, uniquenumber, approved, shippingAddress: order.shippingAddress })
      return { ok: true, providerOrderId: 'zort_1001', response: { res: { resCode: '200' } } }
    },
  }
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { omni: localOmni, commerce: fakeCommerce })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const searchResponse = await fetch(`http://localhost:${localPort}/api/omni/zort/products?q=BLACK-M`)
    const searchBody = await searchResponse.json()
    assert.equal(searchResponse.status, 200)
    assert.equal(searchBody.products[0].sku, 'BLACK-M')

    const draftResponse = await fetch(`http://localhost:${localPort}/api/omni/order-drafts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(zortReadyDraftPayload()),
    })
    const draftBody = await draftResponse.json()
    assert.equal(draftResponse.status, 200)
    assert.equal(draftBody.order.status, 'draft')

    const blockedResponse = await fetch(`http://localhost:${localPort}/api/omni/order-drafts/${draftBody.order.id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approved: false }),
    })
    const blockedBody = await blockedResponse.json()
    assert.equal(blockedResponse.status, 403)
    assert.equal(blockedBody.error, 'approval_required')

    const approveResponse = await fetch(`http://localhost:${localPort}/api/omni/order-drafts/${draftBody.order.id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approved: true, approvedBy: 'boss' }),
    })
    const approveBody = await approveResponse.json()
    assert.equal(approveResponse.status, 200)
    assert.equal(approveBody.order.status, 'zort_created')
    assert.equal(approveBody.order.providerOrderId, 'zort_1001')
    assert.equal(calls.some((call) => call.action === 'createOrder' && call.approved === true), true)
    assert.match(calls.find((call) => call.action === 'createOrder').shippingAddress.formattedAddress, /สุขุมวิท/)
  } finally {
    localServer.close()
  }
})

test('Order draft can search EasyStore products and create an EasyStore order after approval', async () => {
  const localApp = express()
  localApp.use(express.json())
  const localOmni = createOmniService()
  const calls = []
  const fakeCommerce = {
    createOrder: async () => {
      throw new Error('should_not_create_zort_order')
    },
  }
  const fakeEasyStore = {
    searchProducts: async ({ keyword }) => {
      calls.push({ action: 'searchEasyStore', keyword })
      return {
        ok: true,
        products: [{
          id: '76013285',
          productId: '16462394',
          variantId: '76013285',
          sku: 'lorสีดำXL',
          name: 'Lorra สีดำ XL',
          sellPrice: 690,
          availableStock: 13,
        }],
      }
    },
    createOrder: async ({ order, uniquenumber, approved }) => {
      calls.push({ action: 'createEasyStoreOrder', orderId: order.id, uniquenumber, approved, provider: order.orderProvider })
      return { ok: true, providerOrderId: 'es_1001', response: { order: { id: 'es_1001' } } }
    },
  }
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { omni: localOmni, commerce: fakeCommerce, easyStore: fakeEasyStore })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const searchResponse = await fetch(`http://localhost:${localPort}/api/omni/easystore/products?q=Lorra`)
    const searchBody = await searchResponse.json()
    assert.equal(searchResponse.status, 200)
    assert.equal(searchBody.products[0].sku, 'lorสีดำXL')

    const draftResponse = await fetch(`http://localhost:${localPort}/api/omni/order-drafts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(zortReadyDraftPayload({
        orderProvider: 'easystore',
        sourceRef: 'omni_easystore_manual_draft:thread_1',
        items: [{
          sku: 'lorสีดำXL',
          name: 'Lorra สีดำ XL',
          quantity: 1,
          unitPrice: 690,
          easyStoreProductId: '16462394',
          easyStoreVariantId: '76013285',
        }],
      })),
    })
    const draftBody = await draftResponse.json()
    assert.equal(draftResponse.status, 200)
    assert.equal(draftBody.order.orderProvider, 'easystore')

    const approveResponse = await fetch(`http://localhost:${localPort}/api/omni/order-drafts/${draftBody.order.id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approved: true, approvedBy: 'boss', provider: 'easystore' }),
    })
    const approveBody = await approveResponse.json()
    assert.equal(approveResponse.status, 200)
    assert.equal(approveBody.order.status, 'easystore_created')
    assert.equal(approveBody.order.providerOrderId, 'es_1001')
    assert.equal(calls.some((call) => call.action === 'createEasyStoreOrder' && call.approved === true && call.provider === 'easystore'), true)
  } finally {
    localServer.close()
  }
})

test('EasyStore product API forwards SKU searches separately from broad keyword search', async () => {
  const localApp = express()
  localApp.use(express.json())
  const calls = []
  const fakeEasyStore = {
    searchProducts: async ({ keyword, sku, limit }) => {
      calls.push({ keyword, sku, limit })
      return { ok: true, products: [{ id: '76019999', sku, name: 'Amanda Jumpsuit', availableStock: 9 }] }
    },
  }
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { easyStore: fakeEasyStore })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/api/omni/easystore/products?sku=${encodeURIComponent('amdสีน้ำตาลเข้ม99')}&q=Amanda&limit=6`)
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.products[0].sku, 'amdสีน้ำตาลเข้ม99')
    assert.deepEqual(calls[0], { keyword: 'Amanda', sku: 'amdสีน้ำตาลเข้ม99', limit: 6 })
  } finally {
    localServer.close()
  }
})

test('Order draft approval blocks ZORT create until Thai shipping address is complete', async () => {
  const localApp = express()
  localApp.use(express.json())
  const localOmni = createOmniService()
  const calls = []
  const fakeCommerce = {
    createOrder: async () => {
      calls.push({ action: 'createOrder' })
      return { ok: true, providerOrderId: 'zort_should_not_create' }
    },
  }
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { omni: localOmni, commerce: fakeCommerce })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const draftResponse = await fetch(`http://localhost:${localPort}/api/omni/order-drafts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        threadId: 'thread_1',
        customerName: 'ลูกค้า A',
        customerPhone: '0812345678',
        items: [{ sku: 'BLACK-M', name: 'Black Shirt M', quantity: 1, unitPrice: 590, zortProductId: '637' }],
      }),
    })
    const draftBody = await draftResponse.json()
    assert.equal(draftResponse.status, 200)

    const approveResponse = await fetch(`http://localhost:${localPort}/api/omni/order-drafts/${draftBody.order.id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approved: true, approvedBy: 'boss' }),
    })
    const approveBody = await approveResponse.json()
    assert.equal(approveResponse.status, 400)
    assert.equal(approveBody.error, 'shipping_address_incomplete')
    assert.ok(approveBody.missingFields.includes('addressLine'))
    assert.equal(calls.length, 0)
    assert.equal(localOmni.snapshot().orders.find((order) => order.id === draftBody.order.id).status, 'draft')
  } finally {
    localServer.close()
  }
})

test('Thai postcode lookup returns province/district/subdistrict suggestions', async () => {
  const { body, status } = await req('GET', '/api/omni/thai-address/postcodes/10110')

  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.postalCode, '10110')
  assert.equal(body.source.package, 'thai-address-universal')
  assert.equal(body.source.provinceCount, 77)
  assert.equal(body.suggestions.some((item) => item.province === 'กรุงเทพมหานคร' && item.district === 'คลองเตย'), true)
})

test('Order address intake extracts name phone address from chat and drafts customer confirmation', async () => {
  const localApp = express()
  localApp.use(express.json())
  const seed = createOmniService().snapshot()
  seed.messages.push({
    id: 'msg_address_1',
    threadId: 'thread_1',
    direction: 'inbound',
    authorName: 'ลูกค้า A',
    text: 'ชื่อผู้รับ: คุณแพรว\nเบอร์ 081-234-5678\nที่อยู่ 99/1 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพมหานคร 10110',
    createdAt: '2026-05-26T04:00:00.000Z',
  })
  const localOmni = createOmniService(seed)
  const localEvents = []
  mountRoutes(localApp, { broadcast: (event, payload) => localEvents.push({ event, payload }) }, createState(), { omni: localOmni })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/api/omni/threads/thread_1/order-address-intake`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ createConfirmationDraft: true }),
    })
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.extracted.recipientName, 'คุณแพรว')
    assert.equal(body.extracted.recipientPhone, '0812345678')
    assert.equal(body.extracted.postalCode, '10110')
    assert.equal(body.extracted.selectedAddress.district, 'คลองเตย')
    assert.equal(body.extracted.selectedAddress.subDistrict, 'คลองตัน')
    assert.match(body.extracted.formattedAddress, /สุขุมวิท/)
    assert.equal(body.extracted.readyForDraft, true)
    assert.equal(body.extracted.requiresCustomerConfirmation, true)
    assert.match(body.confirmationText, /ยืนยันที่อยู่/)
    assert.equal(body.confirmationDraft.message.deliveryStatus, 'draft_only')
    assert.equal(body.confirmationDraft.message.sourceRef, 'ai_address_confirmation_draft')
    assert.equal(body.confirmationDraft.audit.actorType, 'ai')
    assert.equal(body.confirmationDraft.audit.action, 'address_confirmation_draft_created')
    assert.equal(localOmni.getThread('thread_1').messages.some((message) => message.sourceRef === 'ai_address_confirmation_draft'), true)
    assertBroadcastedOmni(localEvents)
  } finally {
    localServer.close()
  }
})

test('Order draft approval respects createZortOrderOnApprove setting', async () => {
  const localApp = express()
  localApp.use(express.json())
  const localOmni = createOmniService()
  localOmni.updateSettings({ settings: { orderDraft: { createZortOrderOnApprove: false } }, updatedBy: 'boss' })
  const fakeCommerce = {
    createOrder: async () => {
      throw new Error('should_not_create_zort_order')
    },
  }
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { omni: localOmni, commerce: fakeCommerce })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const draftResponse = await fetch(`http://localhost:${localPort}/api/omni/order-drafts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(zortReadyDraftPayload()),
    })
    const draftBody = await draftResponse.json()
    assert.equal(draftResponse.status, 200)

    const approveResponse = await fetch(`http://localhost:${localPort}/api/omni/order-drafts/${draftBody.order.id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approved: true, approvedBy: 'boss' }),
    })
    const approveBody = await approveResponse.json()
    assert.equal(approveResponse.status, 409)
    assert.equal(approveBody.error, 'zort_order_create_disabled')
    assert.equal(localOmni.snapshot().orders.find((order) => order.id === draftBody.order.id).status, 'draft')
  } finally {
    localServer.close()
  }
})

test('Order draft approval guard can be disabled from settings for human-controlled order create', async () => {
  const localApp = express()
  localApp.use(express.json())
  const localOmni = createOmniService()
  localOmni.updateSettings({ settings: { orderDraft: { approvalRequired: false } }, updatedBy: 'boss' })
  const fakeCommerce = {
    createOrder: async ({ order, approved }) => ({
      ok: true,
      providerOrderId: `zort_${order.id}`,
      response: { approved },
    }),
  }
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { omni: localOmni, commerce: fakeCommerce })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const draftResponse = await fetch(`http://localhost:${localPort}/api/omni/order-drafts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(zortReadyDraftPayload()),
    })
    const draftBody = await draftResponse.json()
    assert.equal(draftResponse.status, 200)

    const approveResponse = await fetch(`http://localhost:${localPort}/api/omni/order-drafts/${draftBody.order.id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approved: false, approvedBy: 'boss' }),
    })
    const approveBody = await approveResponse.json()

    assert.equal(approveResponse.status, 200)
    assert.equal(approveBody.ok, true)
    assert.equal(approveBody.order.status, 'zort_created')
    assert.equal(approveBody.order.providerOrderId, `zort_${draftBody.order.id}`)
  } finally {
    localServer.close()
  }
})

test('Order draft approval returns guarded JSON when ZORT order create fails', async () => {
  const localApp = express()
  localApp.use(express.json())
  const localOmni = createOmniService()
  const fakeCommerce = {
    createOrder: async () => {
      throw new Error('zort_helper_unavailable')
    },
  }
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { omni: localOmni, commerce: fakeCommerce })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const draftResponse = await fetch(`http://localhost:${localPort}/api/omni/order-drafts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(zortReadyDraftPayload()),
    })
    const draftBody = await draftResponse.json()
    assert.equal(draftResponse.status, 200)

    const approveResponse = await fetch(`http://localhost:${localPort}/api/omni/order-drafts/${draftBody.order.id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approved: true, approvedBy: 'boss' }),
    })
    const approveBody = await approveResponse.json()
    assert.equal(approveResponse.status, 400)
    assert.equal(approveBody.ok, false)
    assert.equal(approveBody.error, 'zort_order_create_failed')
    assert.equal(approveBody.provider.error, 'zort_helper_unavailable')
    assert.equal(localOmni.snapshot().orders.find((order) => order.id === draftBody.order.id).status, 'draft')
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
    assertBroadcastedOmni(localEvents)
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

test('POST /webhook/meta broadcasts inbound before background auto reply finishes', async () => {
  const app = express()
  app.use(express.json())
  const sent = []
  const localEvents = []
  const localHub = { broadcast: (event, payload) => localEvents.push({ event, payload }) }
  let releaseDraft
  let draftStarted
  const draftStartedPromise = new Promise((resolve) => { draftStarted = resolve })
  const releaseDraftPromise = new Promise((resolve) => { releaseDraft = resolve })
  mountWebhook(app, localHub, createState(), {
    omni: createOmniServiceWithCustomerSend(),
    metaVerifyToken: 'verify-token-test',
    ai: {
      async draft() {
        draftStarted()
        await releaseDraftPromise
        return {
          ok: true,
          provider: 'test',
          model: 'background-test',
          intent: 'faq',
          risk: 'low',
          confidence: 0.9,
          action: 'draft_ready',
          sourceIds: [],
          reason: 'background_latency_test',
          allowed: true,
          draftText: 'ขอบคุณที่สนใจค่ะ',
        }
      },
    },
    sendReply: async (payload) => {
      sent.push(payload)
      return { ok: true, response: { message_id: 'sent_mid_background' } }
    },
  })
  const localServer = app.listen(0)
  try {
    const localPort = localServer.address().port
    const responsePromise = fetch(`http://localhost:${localPort}/webhook/meta?autoReply=1&send=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        object: 'page',
        entry: [{
          id: '122106446570001676',
          messaging: [{
            sender: { id: 'customer_background_latency' },
            recipient: { id: '122106446570001676' },
            timestamp: 1779470080000,
            message: { mid: 'route_mid_background_latency', text: 'สนใจ' },
          }],
        }],
      }),
    })
    await draftStartedPromise
    const response = await responsePromise
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.result.autoReplyMode, 'background')
    assert.equal(body.result.autoRepliesPending, 1)
    assert.deepEqual(body.result.autoReplies, [])
    const firstOmni = localEvents.find((event) => event.event === 'omni')
    assert.ok(firstOmni)
    assert.equal(firstOmni.payload.messages.some((message) => message.direction === 'inbound' && message.text === 'สนใจ'), true)
    assert.equal(firstOmni.payload.messages.some((message) => message.sourceRef === 'meta_send:anna_lynn'), false)

    releaseDraft()
    await waitForCondition(() => {
      assert.equal(sent.length, 1)
      const omniEvents = localEvents.filter((event) => event.event === 'omni')
      assert.equal(omniEvents.length >= 2, true)
      assert.equal(omniEvents.at(-1).payload.messages.some((message) => message.sourceRef === 'meta_send:anna_lynn'), true)
    })
  } finally {
    localServer.close()
  }
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

test('POST /webhook/easystore rejects invalid HMAC without mutation', async () => {
  const localApp = express()
  localApp.use(express.json({
    verify: (req, _res, buffer) => {
      req.rawBody = Buffer.from(buffer)
    },
  }))
  const localOmni = createOmniService()
  mountWebhook(localApp, { broadcast: () => {} }, createState(), {
    omni: localOmni,
    easyStoreClientSecret: 'easy-secret-test',
  })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const beforeCount = localOmni.snapshot().orders.length
    const rawBody = JSON.stringify({ id: 11003, order_number: 'AL-1003', total_price: '100.00' })
    const response = await fetch(`http://localhost:${localPort}/webhook/easystore?topic=order/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'EasyStore-Hmac-SHA256': 'bad-signature' },
      body: rawBody,
    })
    const body = await response.json()

    assert.equal(response.status, 401)
    assert.equal(body.ok, false)
    assert.equal(body.error, 'invalid_easystore_hmac')
    assert.equal(localOmni.snapshot().orders.length, beforeCount)
  } finally {
    localServer.close()
  }
})

test('POST /webhook/easystore verifies HMAC and syncs order event', async () => {
  const localApp = express()
  localApp.use(express.json({
    verify: (req, _res, buffer) => {
      req.rawBody = Buffer.from(buffer)
    },
  }))
  const localEvents = []
  const localOmni = createOmniService()
  mountWebhook(localApp, { broadcast: (event, payload) => localEvents.push({ event, payload }) }, createState(), {
    omni: localOmni,
    easyStoreClientSecret: 'easy-secret-test',
  })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const rawBody = JSON.stringify({
      id: 11004,
      order_number: 'AL-1004',
      financial_status: 'paid',
      total_price: '1290.00',
      currency: 'THB',
      customer: { id: 504, name: 'Route Customer', phone: '0800000004' },
      line_items: [{ sku: 'LORRA-M', name: 'Lorra M', quantity: 1, price: '1290.00' }],
    })
    const response = await fetch(`http://localhost:${localPort}/webhook/easystore?topic=order/paid`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'EasyStore-Hmac-SHA256': signEasyStorePayload(rawBody),
        'Easystore-Shop-Domain': 'annalynna.easy.co',
      },
      body: rawBody,
    })
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.result.orders.inserted, 1)
    assert.equal(body.result.messages.inserted, 1)
    assert.equal(localOmni.snapshot().orders.find((order) => order.id === 'es_order_11004').total, 1290)
    assert.equal(localEvents.some((event) => event.event === 'omni'), true)
    assert.equal(localEvents.some((event) => event.event === 'omni:attention'), false)
  } finally {
    localServer.close()
  }
})

test('POST /api/omni/threads/:threadId/easystore-product-draft creates draft-only product presentation', async () => {
  const localApp = express()
  localApp.use(express.json())
  const localEvents = []
  const localOmni = createOmniService()
  mountRoutes(localApp, { broadcast: (event, payload) => localEvents.push({ event, payload }) }, createState(), {
    omni: localOmni,
    easyStore: {
      getProductPreview: async ({ productId }) => {
        if (productId === '16460004') {
          return {
            ok: true,
            product: {
              id: productId,
              title: 'Amanda Jumpsuit',
              variantTitle: 'สีดำ, XL',
              size: 'XL',
              price: { formatted: '฿1,290', amount: 1290, currency: 'THB' },
              stock: { totalQuantity: 4, status: 'in_stock' },
              images: [{ url: 'https://cdn.example/amanda.jpg', alt: 'Amanda Jumpsuit' }],
            },
          }
        }
        return {
          ok: true,
          product: {
            id: productId,
            title: 'Julai เสื้อ คอวี ระบายข้าง และกางเกงขาบาน เอวยาง คนอวบใส่สวย Lady ผู้หญิง Women Clothing ชุด รับปริญญา',
            variantTitle: 'Set เขียว, 0=S,M',
            color: 'Set เขียว',
            size: '0=S,M',
            price: { formatted: '฿990', amount: 990, currency: 'THB' },
            stock: { totalQuantity: 10, status: 'in_stock' },
            images: [{ url: 'https://cdn.example/julai.jpg', alt: 'Julai Set เขียว' }],
            links: { storefrontUrl: 'https://annalynna.easy.co/products/julai-set-green' },
          },
        }
      },
    },
  })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/api/omni/threads/thread_1/easystore-product-draft`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: '16462646' }),
    })
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.message.deliveryStatus, 'draft_only')
    assert.equal(body.message.sourceRef, 'easystore_product_draft:16462646')
    assert.match(body.message.text, /มี Julai Set เขียวค่ะ/)
    assert.match(body.message.text, /ไซซ์ S\/M ราคา 990 บาท พร้อมส่ง/)
    assert.match(body.message.text, /\n\nดูสินค้า:\nhttps:\/\/omni\.oagent\.biz\/p\/easystore\/16462646$/)
    assert.doesNotMatch(body.message.text, /10 ชิ้น|threadId=|SKU:|ตัวเลือก:|ลิงก์ร้าน:|ปิดออเดอร์/)
    assert.equal(body.message.attachments[0].url, 'https://cdn.example/julai.jpg')

    const lowStockResponse = await fetch(`http://localhost:${localPort}/api/omni/threads/thread_1/easystore-product-draft`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: '16460004' }),
    })
    const lowStockBody = await lowStockResponse.json()
    assert.equal(lowStockResponse.status, 200)
    assert.match(lowStockBody.message.text, /ไซซ์ XL ราคา 1,290 บาท เหลือน้อยแล้ว/)
    assert.doesNotMatch(lowStockBody.message.text, /4 ชิ้น|threadId=/)
    assert.equal(localEvents.some((event) => event.event === 'omni'), true)
  } finally {
    localServer.close()
  }
})

test('GET /api/omni/threads/:threadId/sales-context enriches customer memory and EasyStore images', async () => {
  const seed = createOmniSeed()
  seed.customers.push({
    id: 'cust_sales_route',
    displayName: 'Facebook Customer',
    phone: '0812345678',
    matchConfidence: 0.98,
  })
  seed.threads.push({
    id: 'thread_sales_route',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'cust_sales_route',
    status: 'open',
    intent: 'stock',
    risk: 'low',
    updatedAt: '2026-06-04T07:00:00.000Z',
    originContext: { channel: 'facebook', sourceType: 'post', productHint: { text: 'Lorra', color: 'ดำ', size: 'XL' } },
  })
  seed.messages.push({
    id: 'msg_sales_route',
    threadId: 'thread_sales_route',
    direction: 'inbound',
    authorName: 'Facebook Customer',
    text: 'ขอดูรูป Lorra สีดำ XL',
    createdAt: '2026-06-04T07:00:00.000Z',
  })
  seed.orders.push({
    id: 'es_order_route',
    orderNumber: 'AL-2001',
    customerId: 'cust_sales_route',
    platform: 'easystore',
    status: 'paid',
    updatedAt: '2026-06-03T07:00:00.000Z',
    shippingAddress: {
      recipientPhone: '0812345678',
      formattedAddress: '99/1 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพมหานคร 10110',
      district: 'คลองเตย',
      province: 'กรุงเทพมหานคร',
      postalCode: '10110',
    },
    itemSummary: [{ sellerSku: 'LORRA-BLK-XL', productName: 'Lorra สีดำ XL' }],
  })
  seed.inventorySnapshots.push({
    id: 'es_stock_route_lorra_xl',
    sku: 'LORRA-BLK-XL',
    source: 'easystore',
    available: 4,
    checkedAt: '2026-06-04T06:55:00.000Z',
    productId: '16462646',
    variantId: '7601',
    productName: 'Lorra เดรสเชิ้ต Polo สีดำ',
    price: 1290,
  })
  const calls = []
  const localApp = express()
  localApp.use(express.json())
  const localOmni = createOmniService(seed)
  mountRoutes(localApp, { broadcast: () => {} }, createState(), {
    omni: localOmni,
    easyStore: {
      getProductPreview: async ({ productId }) => {
        calls.push(productId)
        return {
          ok: true,
          product: {
            id: productId,
            title: 'Lorra เดรสเชิ้ต Polo',
            images: [{ id: 'main', url: 'https://cdn.example/lorra-main.jpg', alt: 'Lorra สีดำ' }],
            variants: [{ id: '7601', sku: 'LORRA-BLK-XL', title: 'ดำ / XL', imageUrl: 'https://cdn.example/lorra-black-xl.jpg' }],
          },
        }
      },
    },
  })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/api/omni/threads/thread_sales_route/sales-context`)
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.deepEqual(calls, ['16462646'])
    assert.equal(body.customer.match.safeToUsePrivateData, true)
    assert.equal(body.customer.memory.phoneMasked, '081***5678')
    assert.equal(body.customer.memory.lastSize, 'XL')
    assert.equal(body.product.product.productId, '16462646')
    assert.equal(body.imagePicker.images[0].url, 'https://cdn.example/lorra-black-xl.jpg')
    assert.doesNotMatch(JSON.stringify(body.customer), /0812345678/)
    assert.doesNotMatch(JSON.stringify(body.customer), /สุขุมวิท/)
  } finally {
    localServer.close()
  }
})

test('POST /webhook/easystore syncs product events to Meta Catalog runtime', async () => {
  const localApp = express()
  localApp.use(express.json({
    verify: (req, _res, buffer) => {
      req.rawBody = Buffer.from(buffer)
    },
  }))
  const localOmni = createOmniService()
  const metaCatalogCalls = []
  const fakeMetaCatalog = {
    syncEasyStoreWebhook: async (input) => {
      metaCatalogCalls.push(input)
      return { ok: true, skipped: false, requestCount: 1 }
    },
  }
  mountWebhook(localApp, { broadcast: () => {} }, createState(), {
    omni: localOmni,
    easyStoreClientSecret: 'easy-secret-test',
    metaCatalog: fakeMetaCatalog,
  })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const rawBody = JSON.stringify({
      product: {
        id: 16462646,
        title: 'Amanda Jumpsuit',
        handle: 'amanda-jumpsuit',
        min_price: '890.0',
        total_quantity: 12,
        images: [{ url: 'https://cdn.example/amanda.jpg' }],
      },
    })
    const response = await fetch(`http://localhost:${localPort}/webhook/easystore?topic=product/update`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'EasyStore-Hmac-SHA256': signEasyStorePayload(rawBody),
        'Easystore-Shop-Domain': 'annalynna.easy.co',
      },
      body: rawBody,
    })
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.result.metaCatalog.ok, true)
    assert.equal(body.result.metaCatalog.requestCount, 1)
    assert.equal(metaCatalogCalls.length, 1)
    assert.equal(metaCatalogCalls[0].topic, 'product/update')
    assert.equal(metaCatalogCalls[0].shopDomain, 'annalynna.easy.co')
    assert.equal(metaCatalogCalls[0].payload.product.handle, 'amanda-jumpsuit')
  } finally {
    localServer.close()
  }
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
  assertBroadcastedOmni(events)
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
    awaitAutoReplies: true,
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
    assert.equal(body.result.autoReplies[0].sent, false)
    assert.equal(body.result.autoReplies[0].sendSkipped, 'draft_only')
    assert.equal(body.result.autoReplies[0].draft.deliveryStatus, 'draft_only')
    assertBroadcastedOmni(localEvents)
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
    awaitAutoReplies: true,
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
    assert.equal(body.result.autoReplies[0].sent, false)
    assert.equal(body.result.autoReplies[0].sendSkipped, 'draft_only')
    assert.equal(body.result.autoReplies[0].draft.deliveryStatus, 'draft_only')
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
    awaitAutoReplies: true,
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
    assert.equal(body.result.autoReplies[0].sent, false)
    assert.equal(body.result.autoReplies[0].sendSkipped, 'draft_only')
    assert.equal(body.result.autoReplies[0].draft.deliveryStatus, 'draft_only')
    assertBroadcastedOmni(localEvents)
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
  assertBroadcastedOmni(events)
})

test('POST /api/omni/threads/:threadId/send sends approved Facebook text and records outbound', async () => {
  const localApp = express()
  localApp.use(express.json())
  const localEvents = []
  const localHub = { broadcast: (event, payload) => localEvents.push({ event, payload }) }
  const seed = createOmniService().snapshot()
  seed.customers.push({
    id: 'fb_customer_send_test',
    displayName: 'Send Test Customer',
    platform: 'facebook',
    providerCustomerId: 'psid_send_test',
    matchConfidence: 1,
  })
  seed.threads.push({
    id: 'fb_send_test_thread',
    providerThreadId: 'fb_send_test_thread_provider',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'fb_customer_send_test',
    status: 'open',
    intent: 'unknown',
    risk: 'medium',
    unreadCount: 1,
    messageCount: 1,
    updatedAt: '2026-06-04T00:00:00.000Z',
  })
  seed.messages.push({
    id: 'fb_send_test_msg_1',
    threadId: 'fb_send_test_thread',
    direction: 'inbound',
    authorName: 'Send Test Customer',
    text: 'สนใจสินค้า',
    createdAt: '2026-06-04T00:00:00.000Z',
    providerMessageId: 'mid_send_test_1',
    sourceRef: 'meta_webhook:122106446570001676',
  })
  const sent = []
  mountRoutes(localApp, localHub, createState(), {
    omni: createOmniService(seed),
    sendFacebookReply: async (input) => {
      sent.push(input)
      return { ok: true, response: { message_id: 'mid_out_send_test' } }
    },
  })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/api/omni/threads/fb_send_test_thread/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'ขอบคุณค่ะ เดี๋ยวเช็กให้ค่ะ', approved: true, authorName: 'บอส' }),
    })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.sent, true)
    assert.equal(body.message.sourceRef, 'manual_send:anna_lynn')
    assert.equal(body.message.providerMessageId, 'mid_out_send_test')
    assert.equal(sent.length, 1)
    assert.equal(sent[0].pageProfile, 'anna_lynn')
    assert.equal(sent[0].recipientId, 'psid_send_test')
    assertBroadcastedOmni(localEvents)
  } finally {
    localServer.close()
  }
})

test('POST /api/omni/threads/:threadId/send requires approval', async () => {
  const { body, status } = await req('POST', '/api/omni/threads/thread_1/send', {
    text: 'ยังไม่อนุมัติ',
  })

  assert.equal(status, 403)
  assert.equal(body.ok, false)
  assert.equal(body.error, 'approval_required')
})

test('POST /api/omni/threads/:threadId/send passes HTTPS image attachments and records outbound', async () => {
  const localApp = express()
  localApp.use(express.json())
  const localEvents = []
  const localHub = { broadcast: (event, payload) => localEvents.push({ event, payload }) }
  const seed = createOmniService().snapshot()
  seed.customers.push({
    id: 'fb_customer_image_send',
    displayName: 'Image Customer',
    platform: 'facebook',
    providerCustomerId: 'psid_image_send',
    matchConfidence: 1,
  })
  seed.threads.push({
    id: 'fb_image_send_thread',
    providerThreadId: 'fb_image_send_provider',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'fb_customer_image_send',
    status: 'open',
    intent: 'stock',
    risk: 'medium',
    unreadCount: 1,
    messageCount: 1,
    updatedAt: '2026-06-04T00:00:00.000Z',
  })
  const sent = []
  mountRoutes(localApp, localHub, createState(), {
    omni: createOmniService(seed),
    sendFacebookReply: async (input) => {
      sent.push(input)
      return { ok: true, response: { message_id: 'mid_image_out' } }
    },
  })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/api/omni/threads/fb_image_send_thread/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'ส่งภาพสีดำให้ดูค่ะ',
        attachments: [{ id: 'img_1', name: 'black-m.jpg', type: 'image/jpeg', url: 'https://cdn.example.com/black-m.jpg' }],
        approved: true,
        authorName: 'บอส',
      }),
    })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.sent, true)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].attachments[0].url, 'https://cdn.example.com/black-m.jpg')
    assert.equal(body.message.attachments[0].url, 'https://cdn.example.com/black-m.jpg')
    assertBroadcastedOmni(localEvents)
  } finally {
    localServer.close()
  }
})

test('POST /api/omni/threads/:threadId/send passes approved carousel cards to Facebook runtime', async () => {
  const localApp = express()
  localApp.use(express.json())
  const localEvents = []
  const localHub = { broadcast: (event, payload) => localEvents.push({ event, payload }) }
  const seed = createOmniService().snapshot()
  seed.customers.push({
    id: 'fb_customer_carousel_send',
    displayName: 'Carousel Customer',
    platform: 'facebook',
    providerCustomerId: 'psid_carousel_send',
    matchConfidence: 1,
  })
  seed.threads.push({
    id: 'fb_carousel_send_thread',
    providerThreadId: 'fb_carousel_send_provider',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'fb_customer_carousel_send',
    status: 'open',
    intent: 'stock',
    risk: 'medium',
    unreadCount: 1,
    messageCount: 1,
    updatedAt: '2026-06-04T00:00:00.000Z',
  })
  const sent = []
  mountRoutes(localApp, localHub, createState(), {
    omni: createOmniService(seed),
    sendFacebookReply: async (input) => {
      sent.push(input)
      return { ok: true, response: { message_id: 'mid_carousel_out' } }
    },
  })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/api/omni/threads/fb_carousel_send_thread/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'ส่งตัวเลือกให้ดูค่ะ',
        cards: [{
          title: 'Lorra สีดำ XL',
          subtitle: 'พร้อมส่ง 5 ชิ้น',
          imageUrl: 'https://cdn.example.com/lorra-black-xl.jpg',
          buttons: [{ type: 'web_url', title: 'ดูสินค้า', url: 'https://annalynna.easy.co/products/lorra-black-xl' }],
        }, {
          title: 'Lorra สีดำ M',
          subtitle: 'พร้อมส่ง 3 ชิ้น',
          imageUrl: 'https://cdn.example.com/lorra-black-m.jpg',
        }],
        approved: true,
        authorName: 'บอส',
      }),
    })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.sent, true)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].carousel[0].title, 'Lorra สีดำ XL')
    assert.equal(sent[0].carousel[1].imageUrl, 'https://cdn.example.com/lorra-black-m.jpg')
    assert.equal(body.message.attachments.length, 2)
    assert.equal(body.message.attachments[0].source, 'facebook_carousel_card')
    assert.equal(body.message.attachments[0].url, 'https://cdn.example.com/lorra-black-xl.jpg')
    assertBroadcastedOmni(localEvents)
  } finally {
    localServer.close()
  }
})

test('POST /api/omni/threads/:threadId/send rejects non-HTTPS live image attachments', async () => {
  const localApp = express()
  localApp.use(express.json())
  const localHub = { broadcast: () => {} }
  const seed = createOmniService().snapshot()
  seed.customers.push({
    id: 'fb_customer_bad_image',
    displayName: 'Bad Image Customer',
    platform: 'facebook',
    providerCustomerId: 'psid_bad_image',
    matchConfidence: 1,
  })
  seed.threads.push({
    id: 'fb_bad_image_thread',
    providerThreadId: 'fb_bad_image_provider',
    pageId: 'page_annalynn',
    platform: 'facebook',
    customerId: 'fb_customer_bad_image',
    status: 'open',
    intent: 'stock',
    risk: 'medium',
    unreadCount: 1,
    messageCount: 1,
    updatedAt: '2026-06-04T00:00:00.000Z',
  })
  const sent = []
  mountRoutes(localApp, localHub, createState(), {
    omni: createOmniService(seed),
    sendFacebookReply: async (input) => {
      sent.push(input)
      return { ok: true, response: { message_id: 'mid_bad_image' } }
    },
  })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/api/omni/threads/fb_bad_image_thread/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'ส่งรูปให้ดูค่ะ',
        attachments: [{ id: 'img_bad', name: 'local.png', type: 'image/png', dataUrl: 'data:image/png;base64,AAAA' }],
        approved: true,
        authorName: 'บอส',
      }),
    })
    const body = await response.json()
    assert.equal(response.status, 400)
    assert.equal(body.ok, false)
    assert.equal(body.sent, false)
    assert.equal(body.error, 'live_attachment_https_image_required')
    assert.equal(sent.length, 0)
  } finally {
    localServer.close()
  }
})

test('GET /api/omni/payments/providers/meta_pay_kgp/health reports guarded setup status', async () => {
  const { body, status } = await req('GET', '/api/omni/payments/providers/meta_pay_kgp/health')

  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.provider, 'meta_pay_kgp')
  assert.equal(body.health.status, 'disabled')
  assert.equal(body.health.mode, 'credentials_pending')
  assert.equal(body.health.liveReady, false)
  assert.equal(body.health.credentialsReady, false)
  assert.equal(body.health.checkoutEndpointReady, false)
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

test('POST /api/omni/payment-requests/:id/kgp/checkout stays disabled until KGP is enabled', async () => {
  const draft = await req('POST', '/api/omni/payment-requests', {
    threadId: 'thread_1',
    provider: 'meta_pay_kgp',
    amount: 729,
    currency: 'THB',
    approved: true,
  })

  const missingMessageApproval = await req('POST', `/api/omni/payment-requests/${draft.body.payment.id}/kgp/checkout`, {
    approved: true,
  })
  assert.equal(missingMessageApproval.status, 403)
  assert.equal(missingMessageApproval.body.error, 'message_approval_required')

  const checkout = await req('POST', `/api/omni/payment-requests/${draft.body.payment.id}/kgp/checkout`, {
    approved: true,
    messageApproved: true,
  })
  assert.equal(checkout.status, 409)
  assert.equal(checkout.body.error, 'kgp_provider_not_enabled')
  assert.equal(checkout.body.health.liveReady, false)
})

test('POST /webhook/kgp/meta-pay verifies signature and updates payment status', async () => {
  const localApp = express()
  localApp.use(express.json({
    verify: (req, _res, buffer) => {
      if (req.path.startsWith('/webhook/kgp')) req.rawBody = Buffer.from(buffer)
    },
  }))
  const localOmni = createOmniService()
  const localEvents = []
  const webhookSecret = 'kgp-webhook-secret-test'
  mountRoutes(localApp, { broadcast: (event, payload) => localEvents.push({ event, payload }) }, createState(), {
    omni: localOmni,
    kgpPayment: createKgpPaymentRuntime({
      env: {
        META_PAY_KGP_WEBHOOK_SECRET: webhookSecret,
      },
    }),
  })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const draftResponse = await fetch(`http://localhost:${localPort}/api/omni/payment-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        threadId: 'thread_1',
        provider: 'meta_pay_kgp',
        amount: 729,
        currency: 'THB',
        approved: true,
      }),
    })
    const draft = await draftResponse.json()
    assert.equal(draftResponse.status, 200)

    const payload = {
      eventId: 'kgp_evt_paid_1',
      paymentRequestId: draft.payment.id,
      transactionId: 'kgp_tx_1',
      status: 'paid',
    }
    const raw = JSON.stringify(payload)
    const signature = createHmac('sha256', webhookSecret).update(raw).digest('hex')

    const invalid = await fetch(`http://localhost:${localPort}/webhook/kgp/meta-pay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kgp-signature': 'bad-signature' },
      body: raw,
    })
    assert.equal(invalid.status, 401)

    const valid = await fetch(`http://localhost:${localPort}/webhook/kgp/meta-pay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kgp-signature': signature },
      body: raw,
    })
    const body = await valid.json()
    assert.equal(valid.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.payment.status, 'paid')
    assert.equal(body.event.sourceRef, 'kgp_webhook:kgp_evt_paid_1')
    assertBroadcastedOmni(localEvents)

    const duplicate = await fetch(`http://localhost:${localPort}/webhook/kgp/meta-pay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kgp-signature': signature },
      body: raw,
    })
    const duplicateBody = await duplicate.json()
    assert.equal(duplicate.status, 200)
    assert.equal(duplicateBody.deduped, true)
  } finally {
    localServer.close()
  }
})

test('POST /webhook/meta can send guarded auto reply for Anna Lynn only', async () => {
  const app = express()
  app.use(express.json())
  const sent = []
  const localEvents = []
  const localHub = { broadcast: (event, payload) => localEvents.push({ event, payload }) }
  const localOmni = createOmniService()
  localOmni.updateSettings({ settings: { ai: { customerSendEnabled: true } }, updatedBy: 'test' })
  mountWebhook(app, localHub, createState(), {
    omni: localOmni,
    metaVerifyToken: 'verify-token-test',
    awaitAutoReplies: true,
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
    assertBroadcastedOmni(localEvents)
  } finally {
    localServer.close()
  }
})

test('POST /webhook/meta sends one follow-up when customer is silent past delay', async () => {
  const app = express()
  app.use(express.json())
  const sent = []
  const localEvents = []
  const localHub = { broadcast: (event, payload) => localEvents.push({ event, payload }) }
  const localOmni = createOmniServiceWithCustomerSend()
  mountWebhook(app, localHub, createState(), {
    omni: localOmni,
    metaVerifyToken: 'verify-token-test',
    awaitAutoReplies: true,
    followUpEnabled: true,
    followUpDelayMs: 5,
    sendReply: async (payload) => {
      sent.push(payload)
      return { ok: true, response: { message_id: `sent_mid_follow_${sent.length}` } }
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
            sender: { id: 'customer_anna_follow_up' },
            recipient: { id: '122106446570001676' },
            timestamp: 1779470300500,
            message: { mid: 'route_mid_anna_follow_up', text: 'มีของไหม' },
          }],
        }],
      }),
    })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.result.autoReplies[0].sent, true)
    assert.equal(sent.length, 1)

    await waitForCondition(() => {
      assert.equal(sent.length, 2)
      assert.equal(localEvents.some((event) => event.event === 'omni:auto-follow-up' && event.payload.sent === true), true)
    }, { timeoutMs: 500 })

    const followUpMessage = sent[1]
    assert.equal(followUpMessage.pageProfile, 'anna_lynn')
    assert.equal(followUpMessage.recipientId, 'customer_anna_follow_up')
    assert.match(followUpMessage.message, /ยังสนใจตัวนี้อยู่ไหม|แอดมินช่วยสรุปรายละเอียด/)
    const followUps = localOmni.snapshot().messages.filter((message) => String(message.sourceRef || '').startsWith('ai_follow_up'))
    assert.equal(followUps.length, 1)
    assert.match(followUps[0].text, /ยังสนใจตัวนี้อยู่ไหม|แอดมินช่วยสรุปรายละเอียด/)
  } finally {
    localServer.close()
  }
})

test('POST /webhook/meta skips follow-up when customer replies before delay', async () => {
  const app = express()
  app.use(express.json())
  const sent = []
  const localEvents = []
  const localHub = { broadcast: (event, payload) => localEvents.push({ event, payload }) }
  const localOmni = createOmniServiceWithCustomerSend()
  mountWebhook(app, localHub, createState(), {
    omni: localOmni,
    metaVerifyToken: 'verify-token-test',
    awaitAutoReplies: true,
    followUpEnabled: true,
    followUpDelayMs: 25,
    sendReply: async (payload) => {
      sent.push(payload)
      return { ok: true, response: { message_id: `sent_mid_skip_follow_${sent.length}` } }
    },
  })
  const localServer = app.listen(0)
  try {
    const localPort = localServer.address().port
    const first = await fetch(`http://localhost:${localPort}/webhook/meta?autoReply=1&send=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        object: 'page',
        entry: [{
          id: '122106446570001676',
          messaging: [{
            sender: { id: 'customer_anna_follow_skip' },
            recipient: { id: '122106446570001676' },
            timestamp: 1779470300600,
            message: { mid: 'route_mid_anna_follow_skip_1', text: 'มีของไหม' },
          }],
        }],
      }),
    })
    assert.equal(first.status, 200)
    assert.equal(sent.length, 1)

    const second = await fetch(`http://localhost:${localPort}/webhook/meta?autoReply=0&send=0`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        object: 'page',
        entry: [{
          id: '122106446570001676',
          messaging: [{
            sender: { id: 'customer_anna_follow_skip' },
            recipient: { id: '122106446570001676' },
            timestamp: 1779470300610,
            message: { mid: 'route_mid_anna_follow_skip_2', text: 'ตอบแล้วค่ะ' },
          }],
        }],
      }),
    })
    assert.equal(second.status, 200)

    await waitForCondition(() => {
      assert.equal(localEvents.some((event) => event.event === 'omni:auto-follow-up'), true)
    }, { timeoutMs: 500 })
    assert.equal(sent.length, 1)
    const followUpEvent = localEvents.find((event) => event.event === 'omni:auto-follow-up')
    assert.equal(followUpEvent.payload.sendSkipped, 'customer_replied_or_no_outbound')
  } finally {
    localServer.close()
  }
})

test('POST /webhook/meta does not schedule customer silence follow-up by default', async () => {
  const app = express()
  app.use(express.json())
  const sent = []
  const localEvents = []
  const localHub = { broadcast: (event, payload) => localEvents.push({ event, payload }) }
  const localOmni = createOmniServiceWithCustomerSend()
  mountWebhook(app, localHub, createState(), {
    omni: localOmni,
    metaVerifyToken: 'verify-token-test',
    awaitAutoReplies: true,
    followUpDelayMs: 5,
    sendReply: async (payload) => {
      sent.push(payload)
      return { ok: true, response: { message_id: `sent_mid_no_default_follow_${sent.length}` } }
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
            sender: { id: 'customer_anna_no_default_follow' },
            recipient: { id: '122106446570001676' },
            timestamp: 1779470300900,
            message: { mid: 'route_mid_anna_no_default_follow', text: 'มีของไหม' },
          }],
        }],
      }),
    })
    assert.equal(response.status, 200)
    assert.equal(sent.length, 1)
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(sent.length, 1)
    assert.equal(localEvents.some((event) => event.event === 'omni:auto-follow-up'), false)
  } finally {
    localServer.close()
  }
})

test('POST /webhook/meta keeps customer send blocked until customerSendEnabled is on', async () => {
  const app = express()
  app.use(express.json())
  const sent = []
  mountWebhook(app, { broadcast: () => {} }, createState(), {
    omni: createOmniService(),
    metaVerifyToken: 'verify-token-test',
    awaitAutoReplies: true,
    sendReply: async (payload) => {
      sent.push(payload)
      return { ok: true, response: { message_id: 'sent_mid_blocked' } }
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
            sender: { id: 'customer_anna_guard_blocked' },
            recipient: { id: '122106446570001676' },
            timestamp: 1779470301000,
            message: { mid: 'route_mid_anna_guard_blocked', text: 'มีสินค้าไหม' },
          }],
        }],
      }),
    })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.result.autoReplies[0].sent, false)
    assert.equal(body.result.autoReplies[0].sendSkipped, 'customer_send_guard_enabled')
    assert.equal(body.result.autoReplies[0].draft.deliveryStatus, 'draft_only')
    assert.equal(body.result.autoReplies[0].draft.authorName, 'Anna Lynn AI')
    assert.equal(body.result.autoReplies[0].draftAudit.action, 'ai_reply_draft_created')
    assert.equal(sent.length, 0)
  } finally {
    localServer.close()
  }
})

test('POST /webhook/meta creates a visible draft when customer send is on but AI needs approval', async () => {
  const app = express()
  app.use(express.json())
  const sent = []
  mountWebhook(app, { broadcast: () => {} }, createState(), {
    omni: createOmniServiceWithCustomerSend(),
    metaVerifyToken: 'verify-token-test',
    awaitAutoReplies: true,
    ai: {
      async draft() {
        return {
          ok: true,
          provider: 'test',
          model: 'needs-approval-test',
          intent: 'stock',
          risk: 'medium',
          confidence: 0.85,
          action: 'needs_approval',
          sourceIds: ['ks_annalynn_product_faq'],
          reason: 'product_question_without_inventory_fact',
          allowed: false,
          draftText: 'ได้ค่ะ เดี๋ยวช่วยเช็กขนาดสินค้าให้ก่อนนะคะ รบกวนแจ้งสีหรือไซซ์ที่สนใจเพิ่มนิดนึงค่ะ',
        }
      },
    },
    sendReply: async (payload) => {
      sent.push(payload)
      return { ok: true, response: { message_id: 'should_not_send' } }
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
            sender: { id: 'customer_anna_needs_approval_draft' },
            recipient: { id: '122106446570001676' },
            timestamp: 1779470301500,
            message: { mid: 'route_mid_anna_needs_approval_draft', text: 'ขนาดสินค้า' },
          }],
        }],
      }),
    })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.result.autoReplies[0].sent, false)
    assert.equal(body.result.autoReplies[0].sendSkipped, 'decision_not_allowed')
    assert.equal(body.result.autoReplies[0].draft.deliveryStatus, 'draft_only')
    assert.match(body.result.autoReplies[0].draft.text, /เช็กขนาดสินค้า/)
    assert.equal(body.result.autoReplies[0].draftAudit.action, 'ai_reply_draft_created')
    assert.equal(sent.length, 0)
  } finally {
    localServer.close()
  }
})

test('POST /webhook/meta creates a safe fallback draft when AI needs approval without draftText', async () => {
  const app = express()
  app.use(express.json())
  const sent = []
  mountWebhook(app, { broadcast: () => {} }, createState(), {
    omni: createOmniServiceWithCustomerSend(),
    metaVerifyToken: 'verify-token-test',
    awaitAutoReplies: true,
    ai: {
      async draft() {
        return {
          ok: true,
          provider: 'test',
          model: 'blank-draft-needs-approval-test',
          intent: 'stock',
          risk: 'medium',
          confidence: 0.95,
          action: 'needs_approval',
          sourceIds: ['ks_annalynn_product_faq'],
          reason: 'product_question_without_inventory_fact',
          allowed: false,
          draftText: '',
        }
      },
    },
    sendReply: async (payload) => {
      sent.push(payload)
      return { ok: true, response: { message_id: 'should_not_send_blank_draft' } }
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
            sender: { id: 'customer_anna_blank_needs_approval_draft' },
            recipient: { id: '122106446570001676' },
            timestamp: 1779470301600,
            message: { mid: 'route_mid_anna_blank_needs_approval_draft', text: 'ขนาดสินค้า' },
          }],
        }],
      }),
    })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.result.autoReplies[0].sent, false)
    assert.equal(body.result.autoReplies[0].sendSkipped, 'decision_not_allowed')
    assert.equal(body.result.autoReplies[0].draft.deliveryStatus, 'draft_only')
    assert.match(body.result.autoReplies[0].draft.text, /แอดมินตรวจข้อมูลสินค้า/)
    assert.equal(body.result.autoReplies[0].draftAudit.action, 'ai_reply_draft_created')
    assert.equal(sent.length, 0)
  } finally {
    localServer.close()
  }
})

test('POST /webhook/meta does not auto send text-only loops for product image requests', async () => {
  const app = express()
  app.use(express.json())
  const sent = []
  const localOmni = createOmniService()
  localOmni.updateSettings({ settings: { ai: { customerSendEnabled: true } }, updatedBy: 'test' })
  mountWebhook(app, { broadcast: () => {} }, createState(), {
    omni: localOmni,
    metaVerifyToken: 'verify-token-test',
    awaitAutoReplies: true,
    sendReply: async (payload) => {
      sent.push(payload)
      return { ok: true, response: { message_id: 'sent_mid_image_loop' } }
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
            sender: { id: 'customer_anna_image_request' },
            recipient: { id: '122106446570001676' },
            timestamp: 1779470302000,
            message: { mid: 'route_mid_anna_image_request', text: 'ขอดูภาพสีเทา 2xl' },
          }],
        }],
      }),
    })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.result.autoReplies[0].sent, false)
    assert.equal(body.result.autoReplies[0].recorded.intent, 'productImage')
    assert.equal(body.result.autoReplies[0].sendSkipped, 'image_attachment_required')
    assert.equal(body.result.autoReplies[0].draft.deliveryStatus, 'draft_only')
    assert.match(body.result.autoReplies[0].draft.text, /แนบรูปสินค้าจริง|product card/)
    assert.equal(sent.length, 0)
  } finally {
    localServer.close()
  }
})

test('POST /webhook/meta sends HTTPS product image attachment for product image requests', async () => {
  const app = express()
  app.use(express.json())
  const sent = []
  const localEvents = []
  const localHub = { broadcast: (event, payload) => localEvents.push({ event, payload }) }
  const seed = createOmniSeed()
  seed.customers.push({
    id: 'cust_anna_image_send',
    displayName: 'Image Customer',
    providerCustomerId: 'customer_anna_image_send',
  })
  seed.inventorySnapshots.push({
    id: 'es_stock_lorra_black_image',
    sku: 'LORRA-BLK-XL',
    source: 'easystore',
    available: 5,
    checkedAt: '2026-06-04T05:20:00.000Z',
    productId: 'lorra-black',
    variantId: 'xl',
    productName: 'Lorra เดรสเชิ้ต Polo สีดำ',
    price: 1290,
    imageUrl: 'https://cdn.example/lorra-black-xl.jpg',
  })
  const localOmni = createOmniService(seed)
  localOmni.updateSettings({ settings: { ai: { customerSendEnabled: true } }, updatedBy: 'test' })
  mountWebhook(app, localHub, createState(), {
    omni: localOmni,
    metaVerifyToken: 'verify-token-test',
    awaitAutoReplies: true,
    sendReply: async (payload) => {
      sent.push(payload)
      return { ok: true, response: { message_id: 'sent_mid_product_image' } }
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
            sender: { id: 'customer_anna_image_send' },
            recipient: { id: '122106446570001676' },
            timestamp: 1779470303000,
            message: { mid: 'route_mid_anna_image_send', text: 'ขอดูภาพ Lorra สีดำ XL' },
          }],
        }],
      }),
    })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.result.autoReplies[0].sent, true)
    assert.equal(body.result.autoReplies[0].recorded.intent, 'productImage')
    assert.equal(body.result.autoReplies[0].outbound.attachments[0].url, 'https://cdn.example/lorra-black-xl.jpg')
    assert.equal(body.result.autoReplies[0].outboundAudit.afterJson.attachmentCount, 1)
    assert.equal(sent[0].recipientId, 'customer_anna_image_send')
    assert.equal(sent[0].attachments[0].url, 'https://cdn.example/lorra-black-xl.jpg')
    assertBroadcastedOmni(localEvents)
  } finally {
    localServer.close()
  }
})

test('POST /webhook/meta does not auto reply to Meta message echoes', async () => {
  const app = express()
  app.use(express.json())
  const sent = []
  const fakeAi = {
    draft: async ({ thread }) => ({
      ok: true,
      provider: 'test',
      model: 'echo-guard-test',
      intent: 'faq',
      risk: 'low',
      confidence: 0.9,
      action: 'draft_ready',
      sourceIds: [],
      reason: 'echo_guard_test',
      allowed: true,
      draftText: `reply for ${thread.id}`,
    }),
  }
  mountWebhook(app, { broadcast: () => {} }, createState(), {
    omni: createOmniServiceWithCustomerSend(),
    ai: fakeAi,
    metaVerifyToken: 'verify-token-test',
    awaitAutoReplies: true,
    sendReply: async (payload) => {
      sent.push(payload)
      return { ok: true, response: { message_id: `sent_mid_${sent.length}` } }
    },
  })
  const localServer = app.listen(0)
  try {
    const localPort = localServer.address().port
    const inbound = await fetch(`http://localhost:${localPort}/webhook/meta?autoReply=1&send=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        object: 'page',
        entry: [{
          id: '122106446570001676',
          messaging: [{
            sender: { id: 'customer_anna_echo_guard' },
            recipient: { id: '122106446570001676' },
            timestamp: 1779470300000,
            message: { mid: 'route_mid_anna_echo_guard_in', text: 'สนใจค่ะ' },
          }],
        }],
      }),
    })
    const inboundBody = await inbound.json()
    assert.equal(inbound.status, 200)
    assert.equal(inboundBody.result.autoReplies.length, 1)
    assert.equal(inboundBody.result.autoReplies[0].sent, true)
    assert.equal(sent.length, 1)

    const echo = await fetch(`http://localhost:${localPort}/webhook/meta?autoReply=1&send=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        object: 'page',
        entry: [{
          id: '122106446570001676',
          messaging: [{
            sender: { id: '122106446570001676' },
            recipient: { id: 'customer_anna_echo_guard' },
            timestamp: 1779470300001,
            message: { mid: 'route_mid_anna_echo_guard_echo', text: 'reply echo', is_echo: true },
          }],
        }],
      }),
    })
    const echoBody = await echo.json()
    assert.equal(echo.status, 200)
    assert.equal(echoBody.result.messages.inserted, 0)
    assert.equal(echoBody.result.autoReplies.length, 0)
    assert.equal(sent.length, 1)
  } finally {
    localServer.close()
  }
})

test('POST /webhook/meta sends comment auto reply through comment endpoint', async () => {
  const app = express()
  app.use(express.json())
  const sent = []
  const fakeAi = {
    draft: async () => ({
      ok: true,
      provider: 'test',
      model: 'comment-test',
      intent: 'faq',
      risk: 'low',
      confidence: 0.9,
      action: 'draft_ready',
      sourceIds: [],
      reason: 'comment_test',
      allowed: true,
      draftText: 'ทัก inbox ได้เลยค่ะ เดี๋ยวแอดมินเช็กให้',
    }),
  }
  mountWebhook(app, { broadcast: () => {} }, createState(), {
    omni: createOmniServiceWithCustomerSend(),
    ai: fakeAi,
    metaVerifyToken: 'verify-token-test',
    awaitAutoReplies: true,
    sendReply: async () => {
      throw new Error('dm_send_should_not_be_called')
    },
    sendCommentReply: async (payload) => {
      sent.push(payload)
      return { ok: true, response: { id: 'comment_reply_1' } }
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
          changes: [{
            field: 'feed',
            value: {
              item: 'comment',
              verb: 'add',
              post_id: '122106446570001676_555',
              comment_id: '122106446570001676_555_888',
              sender_id: 'customer_comment_send',
              sender_name: 'Comment Customer',
              message: 'สนใจค่ะ',
              created_time: 1779470401,
            },
          }],
        }],
      }),
    })
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.result.autoReplies[0].sent, true)
    assert.equal(body.result.autoReplies[0].outbound.sourceRef, 'meta_comment_send:anna_lynn')
    assert.equal(sent[0].pageProfile, 'anna_lynn')
    assert.equal(sent[0].commentId, '122106446570001676_555_888')
    assert.match(sent[0].message, /ทัก inbox/)
  } finally {
    localServer.close()
  }
})

test('POST /webhook/meta sends video comment auto reply through comment endpoint', async () => {
  const app = express()
  app.use(express.json())
  const sent = []
  const fakeAi = {
    draft: async () => ({
      ok: true,
      provider: 'test',
      model: 'video-comment-test',
      intent: 'faq',
      risk: 'low',
      confidence: 0.9,
      action: 'draft_ready',
      sourceIds: [],
      reason: 'video_comment_test',
      allowed: true,
      draftText: 'ทัก inbox ได้เลยค่ะ เดี๋ยวแอดมินเช็กให้',
    }),
  }
  mountWebhook(app, { broadcast: () => {} }, createState(), {
    omni: createOmniServiceWithCustomerSend(),
    ai: fakeAi,
    metaVerifyToken: 'verify-token-test',
    awaitAutoReplies: true,
    sendReply: async () => {
      throw new Error('dm_send_should_not_be_called')
    },
    sendCommentReply: async (payload) => {
      sent.push(payload)
      return { ok: true, response: { id: 'video_comment_reply_1' } }
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
          changes: [{
            field: 'feed',
            value: {
              item: 'video_comment',
              verb: 'add',
              video_id: 'video_route_555',
              comment_id: 'video_comment_route_888',
              sender_id: 'customer_video_comment_send',
              sender_name: 'Video Comment Customer',
              message: 'สนใจรีลค่ะ',
              created_time: 1779470401,
            },
          }],
        }],
      }),
    })
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.result.autoReplies[0].sent, true)
    assert.equal(body.result.autoReplies[0].outbound.sourceRef, 'meta_comment_send:anna_lynn')
    assert.equal(sent[0].pageProfile, 'anna_lynn')
    assert.equal(sent[0].commentId, 'video_comment_route_888')
    assert.match(sent[0].message, /ทัก inbox/)
  } finally {
    localServer.close()
  }
})

test('POST /webhook/meta sends Instagram comment auto reply through IG comment endpoint', async () => {
  const app = express()
  app.use(express.json())
  const sent = []
  const fakeAi = {
    draft: async () => ({
      ok: true,
      provider: 'test',
      model: 'ig-comment-test',
      intent: 'faq',
      risk: 'low',
      confidence: 0.9,
      action: 'draft_ready',
      sourceIds: [],
      reason: 'ig_comment_test',
      allowed: true,
      draftText: 'ทัก inbox ได้เลยค่ะ เดี๋ยวแอดมินเช็กให้',
    }),
  }
  mountWebhook(app, { broadcast: () => {} }, createState(), {
    omni: createOmniServiceWithCustomerSend(),
    ai: fakeAi,
    metaVerifyToken: 'verify-token-test',
    awaitAutoReplies: true,
    sendReply: async () => {
      throw new Error('dm_send_should_not_be_called')
    },
    sendCommentReply: async () => {
      throw new Error('facebook_comment_send_should_not_be_called')
    },
    sendIgCommentReply: async (payload) => {
      sent.push(payload)
      return { ok: true, response: { id: 'ig_comment_reply_1' } }
    },
  })
  const localServer = app.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/webhook/meta?autoReply=1&send=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        object: 'instagram',
        entry: [{
          id: '17841456216401165',
          time: 1779470400,
          changes: [{
            field: 'comments',
            value: {
              media_id: 'ig_media_route_555',
              comment_id: 'ig_comment_route_888',
              from: { id: 'ig_customer_route', username: 'buyer_ig' },
              text: 'สนใจค่ะ',
              created_time: 1779470401,
            },
          }],
        }],
      }),
    })
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.result.autoReplies[0].sent, true)
    assert.equal(body.result.autoReplies[0].outbound.sourceRef, 'ig_comment_send:ig_anna_lynn')
    assert.equal(sent[0].pageProfile, 'ig_anna_lynn')
    assert.equal(sent[0].commentId, 'ig_comment_route_888')
    assert.match(sent[0].message, /ทัก inbox/)
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
    omni: createOmniServiceWithCustomerSend(),
    metaVerifyToken: 'verify-token-test',
    awaitAutoReplies: true,
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
    assertBroadcastedOmni(localEvents)
  } finally {
    localServer.close()
  }
})


test('Post Selling Session derives non-default workspace from profileKey mapping and respects workspace-specific disabled settings', async () => {
  const localApp = express()
  localApp.use(express.json())
  // Create a custom seed with page_annalynn in ws_custom
  const seed = createOmniSeed()
  seed.workspaces.push({ id: 'ws_custom', name: 'Custom Workspace', slug: 'custom', plan: 'private_saas', status: 'active', ownerRef: 'boss', settings: {}, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' })
  const annaPage = seed.pages.find((p) => p.id === 'page_annalynn')
  if (annaPage) annaPage.workspaceId = 'ws_custom'
  const localOmni = createOmniService({ seed })

  const calls = []
  const fakeSocial = {
    listPagePosts: async ({ pageProfile, limit }) => {
      calls.push({ action: 'posts', pageProfile, limit })
      return { ok: true, posts: [{ id: 'post_ws', message: 'เปิดขาย BLACK-M', commentCount: 1, createdTime: '2026-06-01T00:00:00.000Z' }] }
    },
    listPostComments: async ({ objectId, pageProfile, limit }) => {
      calls.push({ action: 'comments', objectId, pageProfile, limit })
      return {
        ok: true,
        comments: [
          { id: 'comment_ws_1', message: 'รับ BLACK-M x1', from: { id: 'fb_cust_ws', name: 'WS Customer' }, createdTime: '2026-06-01T00:01:00.000Z' },
        ],
      }
    },
  }
  const fakeCommerce = {
    searchProducts: async ({ keyword, sku }) => {
      calls.push({ action: 'products', keyword, sku })
      return { ok: true, products: [{ id: '999', sku: 'BLACK-M', name: 'Black Shirt M', sellPrice: 590, availableStock: 5 }] }
    },
  }
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { omni: localOmni, social: fakeSocial, commerce: fakeCommerce })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port

    // Post Selling Session with anna_lynn should derive ws_custom workspace via loadPageRegistry mapping
    const captureResponse = await fetch(`http://localhost:${localPort}/api/omni/social/posts/post_ws/capture`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pageProfile: 'anna_lynn' }),
    })
    const captureBody = await captureResponse.json()
    assert.equal(captureResponse.status, 200)
    assert.equal(captureBody.ok, true)
    // The route should have used ws_custom settings (not ws_oagent)
    // Verify draft was created (settings allow it)
    assert.equal(captureBody.summary.parsedCount, 1)
    assert.equal(captureBody.summary.draftCount, 1)

    // Now disable Post Selling Session for ws_custom workspace
    localOmni.updateSettings({ workspaceId: 'ws_custom', settings: { postSession: { enabled: false } } })

    // Post Selling Session with anna_lynn should now be rejected because ws_custom has postSession disabled
    const disabledResponse = await fetch(`http://localhost:${localPort}/api/omni/social/posts/post_ws/capture`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pageProfile: 'anna_lynn' }),
    })
    assert.equal(disabledResponse.status, 409)
    const disabledBody = await disabledResponse.json()
    assert.equal(disabledBody.error, 'post_session_disabled')
  } finally {
    localServer.close()
  }
})

test('Live CF derives non-default workspace from profileKey mapping and respects workspace-specific disabled settings', async () => {
  const localApp = express()
  localApp.use(express.json())
  // Create a custom seed with page_annalynn in ws_custom
  const seed = createOmniSeed()
  seed.workspaces.push({ id: 'ws_custom', name: 'Custom Workspace', slug: 'custom', plan: 'private_saas', status: 'active', ownerRef: 'boss', settings: {}, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' })
  const annaPage = seed.pages.find((p) => p.id === 'page_annalynn')
  if (annaPage) annaPage.workspaceId = 'ws_custom'
  const localOmni = createOmniService({ seed })

  const fakeSocial = {
    listLiveCommentSources: async ({ pageProfile, limit }) => {
      return { ok: true, mode: 'fallback_live_post_comment_capture', posts: [] }
    },
  }
  mountRoutes(localApp, { broadcast: () => {} }, createState(), { omni: localOmni, social: fakeSocial, commerce: { searchProducts: async () => ({ ok: true, products: [] }) } })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port

    // Live CF with anna_lynn should work (settings allow it)
    const liveResponse = await fetch(`http://localhost:${localPort}/api/omni/social/live?pageProfile=anna_lynn`)
    assert.equal(liveResponse.status, 200)
    const liveBody = await liveResponse.json()
    assert.equal(liveBody.ok, true)

    // Disable liveCf for ws_custom workspace
    localOmni.updateSettings({ workspaceId: 'ws_custom', settings: { liveCf: { enabled: false } } })

    // Live CF with anna_lynn should now be rejected
    const disabledResponse = await fetch(`http://localhost:${localPort}/api/omni/social/live?pageProfile=anna_lynn`)
    assert.equal(disabledResponse.status, 409)
    const disabledBody = await disabledResponse.json()
    assert.equal(disabledBody.error, 'live_cf_disabled')
  } finally {
    localServer.close()
  }
})

test('POST /api/omni/policy-sets/:id/auto-send updates auto-send policy and broadcasts snapshot', async () => {
  const localApp = express()
  localApp.use(express.json())
  const localOmni = createOmniService()
  const localEvents = []
  mountRoutes(localApp, { broadcast: (event, payload) => localEvents.push({ event, payload }) }, createState(), { omni: localOmni })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/api/omni/policy-sets/policy_annalynn/auto-send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ autoSend: { faq: true, stock: true, refund: false }, updatedBy: 'boss' }),
    })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.policySet.autoSend.stock, true)
    assert.equal(body.policySet.autoSend.refund, false)
    assert.equal(body.snapshot.policySets.find((item) => item.id === 'policy_annalynn').autoSend.stock, true)
    assert.equal(localEvents.some((event) => event.event === 'omni'), true)
  } finally {
    localServer.close()
  }
})

test('POST /api/omni/pages/:pageId/provider-profile syncs Instagram avatar and broadcasts snapshot', async () => {
  const localApp = express()
  localApp.use(express.json())
  const localOmni = createOmniService()
  const localEvents = []
  const fetchInstagramProfile = async ({ pageProfile }) => ({
    ok: true,
    pageProfile,
    profile: {
      id: '17841456216401165',
      username: 'annalynn.co',
      name: 'Anna Lynn IG',
      avatarUrl: 'https://cdn.example/ig-annalynn.jpg',
      provider: 'instagram',
    },
  })
  mountRoutes(localApp, { broadcast: (event, payload) => localEvents.push({ event, payload }) }, createState(), { omni: localOmni, fetchInstagramProfile })
  const localServer = localApp.listen(0)
  try {
    const localPort = localServer.address().port
    const response = await fetch(`http://localhost:${localPort}/api/omni/pages/page_ig_annalynn/provider-profile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pageProfile: 'ig_anna_lynn', updatedBy: 'test' }),
    })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.page.avatarUrl, 'https://cdn.example/ig-annalynn.jpg')
    assert.equal(body.account.providerAccountId, '17841456216401165')
    assert.equal(body.account.avatarUrl, 'https://cdn.example/ig-annalynn.jpg')
    assert.equal(body.snapshot.pages.find((item) => item.id === 'page_ig_annalynn').avatarUrl, 'https://cdn.example/ig-annalynn.jpg')
    assert.equal(localEvents.some((event) => event.event === 'omni'), true)
  } finally {
    localServer.close()
  }
})

test('audit rows include workspaceId after settings update', async () => {
  const omni = createOmniService()
  const result = omni.updateSettings({ workspaceId: 'ws_test', settings: { ai: { enabled: false } } })
  assert.equal(result.ok, true)
  assert.equal(result.audit.workspaceId, 'ws_test')
})

test('audit rows include workspaceId after page auto-reply toggle', async () => {
  const omni = createOmniService()
  const result = omni.setPageAutoReply({ pageId: 'page_annalynn', enabled: true })
  assert.equal(result.ok, true)
  assert.equal(result.audit.workspaceId, 'ws_oagent')
})

test('audit rows include workspaceId after order draft creation', async () => {
  const omni = createOmniService()
  const result = omni.createOrderDraft({
    threadId: 'thread_1',
    items: [{ sku: 'TEST-SKU', name: 'Test', quantity: 1, unitPrice: 100 }],
    workspaceId: 'ws_oagent',
  })
  assert.equal(result.ok, true)
  assert.equal(result.audit.workspaceId, 'ws_oagent')
})

test('audit rows include workspaceId for outbound message recording', async () => {
  const omni = createOmniService()
  const result = omni.recordOutboundMessage({
    threadId: 'thread_1',
    authorName: 'AI',
    text: 'Hello customer',
    sourceRef: 'test_outbound',
  })
  assert.equal(result.ok, true)
  assert.ok(result.audit.workspaceId !== undefined, 'workspaceId should be present in audit')
})

test('audit rows include workspaceId for manual reply draft', async () => {
  const omni = createOmniService()
  const result = omni.recordManualReplyDraft({
    threadId: 'thread_1',
    authorName: 'บอส',
    text: 'ตอบลูกค้า',
  })
  assert.equal(result.ok, true)
  assert.ok(result.audit.workspaceId !== undefined, 'workspaceId should be present in audit')
})

test('GET /api/omni/snapshot?workspaceId filters pages/threads/messages by workspace', async () => {
  const { body, status } = await req('GET', '/api/omni/snapshot?workspaceId=ws_oagent')
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  // All seed pages belong to ws_oagent, so all should be present
  assert.ok(body.snapshot.pages.length > 0)
  assert.ok(body.snapshot.pages.every((p) => p.workspaceId === 'ws_oagent'))
  // Threads should only be for pages in this workspace
  const pageIds = new Set(body.snapshot.pages.map((p) => p.id))
  assert.ok(body.snapshot.threads.every((t) => pageIds.has(t.pageId)))
})

test('GET /api/omni/snapshot?workspaceId=nonexistent returns empty collections', async () => {
  const { body, status } = await req('GET', '/api/omni/snapshot?workspaceId=ws_nonexistent')
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.snapshot.pages.length, 0)
  assert.equal(body.snapshot.threads.length, 0)
  assert.equal(body.snapshot.messages.length, 0)
})

test('GET /api/omni/snapshot without workspaceId returns full unfiltered snapshot', async () => {
  const { body, status } = await req('GET', '/api/omni/snapshot')
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.ok(body.snapshot.pages.length > 0)
})

test('GET /api/omni/snapshot?workspaceId scopes paymentRequests/paymentEvents/orderLinks by workspace threads', async () => {
  // The default seed has all pages in ws_oagent, so all payments should be present
  const { body, status } = await req('GET', '/api/omni/snapshot?workspaceId=ws_oagent')
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  // All seed threads belong to ws_oagent pages, so all payments should be scoped correctly
  const threadIds = new Set(body.snapshot.threads.map((t) => t.id))
  // Every paymentRequest must belong to a thread in this workspace
  for (const pay of body.snapshot.paymentRequests || []) {
    assert.ok(threadIds.has(pay.threadId), `paymentRequest ${pay.id} threadId ${pay.threadId} should be in workspace threads`)
  }
  // Every paymentEvent must reference a paymentRequest that is in scope
  const payIds = new Set((body.snapshot.paymentRequests || []).map((p) => p.id))
  for (const evt of body.snapshot.paymentEvents || []) {
    assert.ok(payIds.has(evt.paymentRequestId), `paymentEvent ${evt.id} references out-of-scope paymentRequest ${evt.paymentRequestId}`)
  }
})

test('GET /api/omni/snapshot?workspaceId=ws_nonexistent returns empty payment/orderLinks/approvalTasks', async () => {
  const { body, status } = await req('GET', '/api/omni/snapshot?workspaceId=ws_nonexistent')
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal((body.snapshot.paymentRequests || []).length, 0)
  assert.equal((body.snapshot.paymentEvents || []).length, 0)
  assert.equal((body.snapshot.orderLinks || []).length, 0)
  assert.equal((body.snapshot.approvalTasks || []).length, 0)
})

test('GET /api/omni/snapshot?workspaceId includes order-only payments (threadId null) when orderId is in scope', async () => {
  // Use a local app with custom seed that has an order-only payment in ws_custom
  const localApp = express()
  localApp.use(express.json())
  const seed = createOmniSeed()
  seed.workspaces.push({ id: 'ws_custom', name: 'Custom', slug: 'custom', plan: 'private_saas', status: 'active', ownerRef: 'boss', settings: {}, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' })
  // Move page_annalynn to ws_custom
  const annaPage = seed.pages.find((p) => p.id === 'page_annalynn')
  if (annaPage) annaPage.workspaceId = 'ws_custom'
  // Add a customer and order in ws_custom scope
  seed.customers.push({ id: 'cust_custom', displayName: 'Custom Customer' })
  seed.threads.push({ id: 'thread_custom', pageId: 'page_annalynn', customerId: 'cust_custom', status: 'open' })
  seed.orders.push({ id: 'order_custom', customerId: 'cust_custom', platform: 'manual', status: 'draft', total: 500 })
  // Add an order-only payment (no threadId)
  seed.paymentRequests.push({ id: 'pay_order_only', threadId: null, orderId: 'order_custom', provider: 'bank', status: 'draft', amount: 500, currency: 'THB', approvalRequired: false })
  seed.paymentEvents.push({ id: 'pay_event_order_only', paymentRequestId: 'pay_order_only', type: 'created', source: 'test', createdAt: '2026-06-02T00:00:00.000Z' })
  const localOmni = createOmniService({ seed })
  const localHub = { broadcast: () => {} }
  const localRoom = createState()
  mountRoutes(localApp, localHub, localRoom, { omni: localOmni })
  const localServer = localApp.listen(0)
  const localPort = localServer.address().port
  try {
    const res = await fetch(`http://localhost:${localPort}/api/omni/snapshot?workspaceId=ws_custom`)
    const body = await res.json()
    assert.equal(res.status, 200)
    assert.equal(body.ok, true)
    // order_custom should be in scope
    assert.ok(body.snapshot.orders.some((o) => o.id === 'order_custom'), 'order_custom should be in ws_custom scope')
    // order-only payment should be included via orderId match
    assert.ok(body.snapshot.paymentRequests.some((p) => p.id === 'pay_order_only'), 'order-only payment should be in ws_custom scope')
    assert.ok(body.snapshot.paymentEvents.some((e) => e.id === 'pay_event_order_only'), 'order-only payment event should be in ws_custom scope')
    // ws_oagent should NOT see the order-only payment
    const res2 = await fetch(`http://localhost:${localPort}/api/omni/snapshot?workspaceId=ws_oagent`)
    const body2 = await res2.json()
    assert.ok(!body2.snapshot.paymentRequests.some((p) => p.id === 'pay_order_only'), 'order-only payment should NOT be in ws_oagent scope')
    assert.ok(!body2.snapshot.paymentEvents.some((e) => e.id === 'pay_event_order_only'), 'order-only payment event should NOT be in ws_oagent scope')
  } finally {
    localServer.close()
  }
})

test('GET /api/omni/snapshot?workspaceId includes workspace-only order drafts (workspaceId on order, no thread/customer match)', async () => {
  const localApp = express()
  localApp.use(express.json())
  const seed = createOmniSeed()
  seed.workspaces.push({ id: 'ws_custom', name: 'Custom', slug: 'custom', plan: 'private_saas', status: 'active', ownerRef: 'boss', settings: {}, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' })
  // Add a workspace-only order (no customerId, no thread, but has workspaceId)
  seed.orders.push({ id: 'order_ws_only', customerId: null, workspaceId: 'ws_custom', platform: 'manual', status: 'draft', totalAmount: 300 })
  // Add payment referencing that order
  seed.paymentRequests.push({ id: 'pay_ws_only', threadId: null, orderId: 'order_ws_only', provider: 'bank', status: 'draft', amount: 300, currency: 'THB', approvalRequired: false })
  seed.paymentEvents.push({ id: 'pay_event_ws_only', paymentRequestId: 'pay_ws_only', type: 'created', source: 'test', createdAt: '2026-06-02T00:00:00.000Z' })
  const localOmni = createOmniService({ seed })
  const localHub = { broadcast: () => {} }
  const localRoom = createState()
  mountRoutes(localApp, localHub, localRoom, { omni: localOmni })
  const localServer = localApp.listen(0)
  const localPort = localServer.address().port
  try {
    const res = await fetch(`http://localhost:${localPort}/api/omni/snapshot?workspaceId=ws_custom`)
    const body = await res.json()
    assert.equal(res.status, 200)
    assert.equal(body.ok, true)
    // workspace-only order should be in scope via workspaceId match
    assert.ok(body.snapshot.orders.some((o) => o.id === 'order_ws_only'), 'workspace-only order should be in ws_custom scope')
    // payment referencing that order should also be in scope
    assert.ok(body.snapshot.paymentRequests.some((p) => p.id === 'pay_ws_only'), 'payment for workspace-only order should be in ws_custom scope')
    assert.ok(body.snapshot.paymentEvents.some((e) => e.id === 'pay_event_ws_only'), 'payment event for workspace-only order should be in ws_custom scope')
    // ws_oagent should NOT see this workspace-only order
    const res2 = await fetch(`http://localhost:${localPort}/api/omni/snapshot?workspaceId=ws_oagent`)
    const body2 = await res2.json()
    assert.ok(!body2.snapshot.orders.some((o) => o.id === 'order_ws_only'), 'workspace-only order should NOT be in ws_oagent scope')
    assert.ok(!body2.snapshot.paymentRequests.some((p) => p.id === 'pay_ws_only'), 'payment for workspace-only order should NOT be in ws_oagent scope')
  } finally {
    localServer.close()
  }
})

test('createOrderDraft persists workspaceId on order row', async () => {
  const localApp = express()
  localApp.use(express.json())
  const seed = createOmniSeed()
  seed.workspaces.push({ id: 'ws_custom', name: 'Custom', slug: 'custom', plan: 'private_saas', status: 'active', ownerRef: 'boss', settings: {}, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' })
  const localOmni = createOmniService({ seed })
  const localHub = { broadcast: () => {} }
  const localRoom = createState()
  mountRoutes(localApp, localHub, localRoom, { omni: localOmni })
  const localServer = localApp.listen(0)
  const localPort = localServer.address().port
  try {
    // Create order draft with workspaceId but no threadId
    const createRes = await fetch(`http://localhost:${localPort}/api/omni/order-drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: 'ws_custom',
        customerName: 'Test Customer',
        customerPhone: '0812345678',
        items: [{ name: 'Test Item', quantity: 1, unitPrice: 100, sku: 'SKU001' }],
      }),
    })
    const createBody = await createRes.json()
    assert.equal(createBody.ok, true, 'createOrderDraft should succeed')
    assert.equal(createBody.order.workspaceId, 'ws_custom', 'order row should have workspaceId persisted')
    // Verify it appears in scoped snapshot
    const snapRes = await fetch(`http://localhost:${localPort}/api/omni/snapshot?workspaceId=ws_custom`)
    const snapBody = await snapRes.json()
    assert.ok(snapBody.snapshot.orders.some((o) => o.id === createBody.order.id), 'created order should appear in ws_custom scoped snapshot')
    // Verify it does NOT appear in ws_oagent
    const snapRes2 = await fetch(`http://localhost:${localPort}/api/omni/snapshot?workspaceId=ws_oagent`)
    const snapBody2 = await snapRes2.json()
    assert.ok(!snapBody2.snapshot.orders.some((o) => o.id === createBody.order.id), 'created order should NOT appear in ws_oagent scoped snapshot')
  } finally {
    localServer.close()
  }
})

test('createPaymentRequest audit derives workspaceId from order when threadId is null', async () => {
  const localApp = express()
  localApp.use(express.json())
  const seed = createOmniSeed()
  seed.workspaces.push({ id: 'ws_custom', name: 'Custom', slug: 'custom', plan: 'private_saas', status: 'active', ownerRef: 'boss', settings: {}, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' })
  // Add a workspace-only order
  seed.orders.push({ id: 'order_custom_pay', customerId: null, workspaceId: 'ws_custom', platform: 'manual', status: 'draft', totalAmount: 100 })
  const localOmni = createOmniService({ seed })
  const localHub = { broadcast: () => {} }
  const localRoom = createState()
  mountRoutes(localApp, localHub, localRoom, { omni: localOmni })
  const localServer = localApp.listen(0)
  const localPort = localServer.address().port
  try {
    // Create payment request with orderId but no threadId
    const payRes = await fetch(`http://localhost:${localPort}/api/omni/payment-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approved: true,
        approvedBy: 'boss',
        orderId: 'order_custom_pay',
        provider: 'promptpay',
        amount: 100,
        currency: 'THB',
      }),
    })
    const payBody = await payRes.json()
    assert.equal(payBody.ok, true, 'createPaymentRequest should succeed')
    // Check audit workspaceId is ws_custom (derived from order)
    assert.equal(payBody.audit.workspaceId, 'ws_custom', 'audit workspaceId should be derived from order.workspaceId')
    // Verify scoped snapshot: ws_custom sees the audit, ws_oagent does not
    const snapCustom = await fetch(`http://localhost:${localPort}/api/omni/snapshot?workspaceId=ws_custom`).then((r) => r.json())
    assert.ok(
      snapCustom.snapshot.actionAudits.some((a) => a.action === 'payment_request_created' && a.workspaceId === 'ws_custom'),
      'ws_custom should see payment_request_created audit'
    )
    const snapOagent = await fetch(`http://localhost:${localPort}/api/omni/snapshot?workspaceId=ws_oagent`).then((r) => r.json())
    assert.ok(
      !snapOagent.snapshot.actionAudits.some((a) => a.action === 'payment_request_created' && a.after?.orderId === 'order_custom_pay'),
      'ws_oagent should NOT see payment_request_created audit for ws_custom order'
    )
  } finally {
    localServer.close()
  }
})
