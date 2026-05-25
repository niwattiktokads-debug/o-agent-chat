# Omnichannel Foundation MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working local omnichannel inbox foundation inside `o-agent-chat`: configurable pages, provider-agnostic adapter contracts, mock conversations, policy-safe AI decisions, an Order Desk shell, and an approval-first Payment Desk shell.

**Architecture:** Keep the existing chat room intact and add a separate omnichannel route/API surface. The server exposes read-only seed data and safe mock action endpoints first; the client adds a new `omni` mode with inbox, thread, AI decision, page management, connector health, order desk, and payment desk panels. Real Facebook/TikTok/BigSeller/payment connectors come after this foundation.

**Tech Stack:** React 18, Vite, Tailwind, Express, Node test runner, Vitest, local JSON seed data, provider-adapter interfaces.

---

## Scope Boundary

This plan implements Foundation MVP only. It does not send customer-facing messages, mutate orders, create live payment requests, connect BigSeller live, or deploy to Vercel. Those are separate plans after the local UI/API foundation is verified.

## File Structure

- Create `/Users/babycuca/Projects/o-agent-chat/server/src/omni/schema.js`
  Defines normalized object shapes, statuses, and helper validators.
- Create `/Users/babycuca/Projects/o-agent-chat/server/src/omni/seed.js`
  Seed pages, platform accounts, policies, agents, threads, orders, inventory snapshots, and connector health.
- Create `/Users/babycuca/Projects/o-agent-chat/server/src/omni/service.js`
  Read/query service and mock action methods with write guards.
- Create `/Users/babycuca/Projects/o-agent-chat/server/src/omni/adapters.js`
  Provider-agnostic adapter contract and mock adapter registry.
- Modify `/Users/babycuca/Projects/o-agent-chat/server/src/routes.js`
  Mount `/api/omni/*` routes.
- Create `/Users/babycuca/Projects/o-agent-chat/server/test/omni.test.js`
  Server tests for pages, threads, policy decisions, action guards, and order desk.
- Create `/Users/babycuca/Projects/o-agent-chat/client/src/lib/omniApi.js`
  Client API wrapper.
- Create `/Users/babycuca/Projects/o-agent-chat/client/src/lib/omniModel.js`
  Client filtering and status helpers.
- Create `/Users/babycuca/Projects/o-agent-chat/client/src/components/omni/OmniWorkbench.jsx`
  Main omnichannel workbench.
- Create focused components under `/Users/babycuca/Projects/o-agent-chat/client/src/components/omni/`
  `PageRail.jsx`, `ThreadList.jsx`, `ThreadDetail.jsx`, `AiDecisionPanel.jsx`, `OrderDesk.jsx`, `PaymentDesk.jsx`, `PolicySummary.jsx`, `ConnectorHealth.jsx`, `PageManagement.jsx`.
- Modify `/Users/babycuca/Projects/o-agent-chat/client/src/App.jsx`
  Add `omni` mode without removing current chat room behavior.
- Create `/Users/babycuca/Projects/o-agent-chat/client/src/components/omni/OmniWorkbench.test.jsx`
  UI smoke test for rendering, filtering, and safe action states.

## Task 1: Server Schema And Seed Data

**Files:**
- Create: `/Users/babycuca/Projects/o-agent-chat/server/src/omni/schema.js`
- Create: `/Users/babycuca/Projects/o-agent-chat/server/src/omni/seed.js`
- Test: `/Users/babycuca/Projects/o-agent-chat/server/test/omni.test.js`

- [ ] **Step 1: Write failing schema/seed tests**

Add this to `/Users/babycuca/Projects/o-agent-chat/server/test/omni.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { OMNI_STATUSES, validatePage } from '../src/omni/schema.js'
import { createOmniSeed } from '../src/omni/seed.js'

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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/babycuca/Projects/o-agent-chat/server
npm test -- omni.test.js
```

Expected: FAIL with module not found for `src/omni/schema.js`.

- [ ] **Step 3: Implement schema**

Create `/Users/babycuca/Projects/o-agent-chat/server/src/omni/schema.js`:

```js
export const OMNI_STATUSES = {
  page: ['active', 'paused', 'archived'],
  thread: ['open', 'draft_ready', 'needs_approval', 'needs_data', 'auto_sent', 'escalated'],
  connector: ['healthy', 'degraded', 'disabled'],
  risk: ['low', 'medium', 'high'],
}

export function validatePage(page) {
  const errors = []
  if (!page || typeof page !== 'object') errors.push('page_required')
  if (!page?.id || typeof page.id !== 'string') errors.push('id_required')
  if (!page?.name || typeof page.name !== 'string') errors.push('name_required')
  if (!OMNI_STATUSES.page.includes(page?.status)) errors.push('invalid_status')
  return { ok: errors.length === 0, errors }
}

export function normalizeMessage(message) {
  return {
    id: message.id,
    threadId: message.threadId,
    direction: message.direction,
    authorName: message.authorName || 'Unknown',
    text: String(message.text || '').trim(),
    createdAt: message.createdAt,
    providerMessageId: message.providerMessageId,
  }
}
```

- [ ] **Step 4: Implement seed data**

Create `/Users/babycuca/Projects/o-agent-chat/server/src/omni/seed.js`:

```js
export function createOmniSeed() {
  const pages = [
    { id: 'page_mankynd', name: 'MAN KYND', status: 'active', brandGroupId: 'brand_mankynd', policySetId: 'policy_mankynd', agentProfileId: 'agent_mankynd' },
    { id: 'page_annalynn', name: 'Anna Lynn', status: 'active', brandGroupId: 'brand_fashion', policySetId: 'policy_annalynn', agentProfileId: 'agent_annalynn' },
    { id: 'page_des', name: 'เพจเดส', status: 'active', brandGroupId: 'brand_oagent', policySetId: 'policy_page_des', agentProfileId: 'agent_page_des' },
    { id: 'page_shop_4', name: 'Seed Page 4', status: 'active', brandGroupId: 'brand_shared', policySetId: 'policy_default', agentProfileId: 'agent_default' },
    { id: 'page_shop_5', name: 'Seed Page 5', status: 'active', brandGroupId: 'brand_shared', policySetId: 'policy_default', agentProfileId: 'agent_default' },
  ]

  return {
    pages,
    platformAccounts: [
      { id: 'acct_fb_mankynd', pageId: 'page_mankynd', platform: 'facebook', provider: 'meta', status: 'healthy' },
      { id: 'acct_tt_shop', pageId: 'page_annalynn', platform: 'tiktok', provider: 'tiktok_shop', status: 'healthy' },
    ],
    policySets: [
      { id: 'policy_default', autoSend: { faq: true, stock: true, price: false, orderStatus: false }, forbidden: ['refund', 'cancel', 'คืนเงิน', 'ยกเลิก'] },
      { id: 'policy_mankynd', autoSend: { faq: true, stock: true, price: true, orderStatus: false }, forbidden: ['refund', 'cancel', 'คืนเงิน', 'ยกเลิก'] },
      { id: 'policy_annalynn', autoSend: { faq: true, stock: true, price: true, orderStatus: false }, forbidden: ['refund', 'cancel', 'คืนเงิน', 'ยกเลิก'] },
      { id: 'policy_page_des', autoSend: { faq: false, stock: false, price: false, orderStatus: false }, forbidden: ['publish', 'live', 'โพสต์เลย'] },
    ],
    agentProfiles: [
      { id: 'agent_default', name: 'Default Sales AI', provider: 'openai', model: 'configurable', role: 'page_primary' },
      { id: 'agent_mankynd', name: 'MAN KYND Page AI', provider: 'openai', model: 'configurable', role: 'page_primary' },
      { id: 'agent_annalynn', name: 'Anna Lynn Page AI', provider: 'openai', model: 'configurable', role: 'page_primary' },
      { id: 'agent_page_des', name: 'Page Des AI', provider: 'openai', model: 'configurable', role: 'page_primary' },
      { id: 'agent_stock', name: 'Stock Specialist', provider: 'openai', model: 'configurable', role: 'stock_specialist' },
      { id: 'agent_reviewer', name: 'Risk Reviewer', provider: 'openai', model: 'configurable', role: 'reviewer' },
    ],
    threads: [
      { id: 'thread_1', pageId: 'page_mankynd', platform: 'facebook', customerId: 'cust_1', status: 'draft_ready', intent: 'stock', risk: 'low', updatedAt: '2026-05-22T10:00:00.000Z' },
      { id: 'thread_2', pageId: 'page_annalynn', platform: 'tiktok', customerId: 'cust_2', status: 'needs_approval', intent: 'orderStatus', risk: 'medium', updatedAt: '2026-05-22T10:05:00.000Z' },
    ],
    messages: [
      { id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม', createdAt: '2026-05-22T10:00:00.000Z', providerMessageId: 'fb_mid_1' },
      { id: 'msg_2', threadId: 'thread_2', direction: 'inbound', authorName: 'ลูกค้า B', text: 'ขอเลขพัสดุค่ะ', createdAt: '2026-05-22T10:05:00.000Z', providerMessageId: 'tt_mid_1' },
    ],
    customers: [
      { id: 'cust_1', displayName: 'ลูกค้า A', matchConfidence: 0.98 },
      { id: 'cust_2', displayName: 'ลูกค้า B', matchConfidence: 0.62 },
    ],
    orders: [
      { id: 'order_1', customerId: 'cust_2', platform: 'tiktok', status: 'awaiting_shipment', total: 729, tracking: null },
    ],
    inventorySnapshots: [
      { id: 'stock_1', sku: 'BLACK-M', source: 'bigseller_mock', available: 4, checkedAt: '2026-05-22T10:00:00.000Z' },
    ],
    aiDecisions: [
      { id: 'decision_1', threadId: 'thread_1', agentProfileId: 'agent_stock', confidence: 0.94, action: 'draft_ready', sourceIds: ['stock_1'] },
      { id: 'decision_2', threadId: 'thread_2', agentProfileId: 'agent_reviewer', confidence: 0.61, action: 'needs_approval', sourceIds: ['order_1'] },
    ],
    paymentRequests: [
      { id: 'pay_1', threadId: 'thread_2', orderId: 'order_1', provider: 'promptpay', status: 'draft', amount: 729, currency: 'THB', approvalRequired: true },
      { id: 'pay_2', threadId: 'thread_1', orderId: null, provider: 'meta_pay_kgp', status: 'draft', amount: 0, currency: 'THB', approvalRequired: true },
    ],
    paymentEvents: [
      { id: 'pay_event_1', paymentRequestId: 'pay_1', type: 'created', source: 'mock', createdAt: '2026-05-22T10:06:00.000Z' },
    ],
    connectorHealth: [
      { id: 'health_meta', provider: 'meta', status: 'healthy', lastCheckedAt: '2026-05-22T10:00:00.000Z' },
      { id: 'health_tiktok', provider: 'tiktok_shop', status: 'healthy', lastCheckedAt: '2026-05-22T10:00:00.000Z' },
      { id: 'health_bigseller', provider: 'bigseller', status: 'disabled', lastCheckedAt: null },
      { id: 'health_shopee', provider: 'shopee', status: 'disabled', lastCheckedAt: null },
      { id: 'health_meta_pay_kgp', provider: 'meta_pay_kgp', status: 'disabled', lastCheckedAt: null },
      { id: 'health_promptpay', provider: 'promptpay', status: 'disabled', lastCheckedAt: null },
    ],
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
cd /Users/babycuca/Projects/o-agent-chat/server
npm test -- omni.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/babycuca/Projects/o-agent-chat
git add server/src/omni/schema.js server/src/omni/seed.js server/test/omni.test.js
git commit -m "feat: add omnichannel seed schema"
```

## Task 2: Provider Adapter Contract And Service

**Files:**
- Create: `/Users/babycuca/Projects/o-agent-chat/server/src/omni/adapters.js`
- Create: `/Users/babycuca/Projects/o-agent-chat/server/src/omni/service.js`
- Modify: `/Users/babycuca/Projects/o-agent-chat/server/test/omni.test.js`

- [ ] **Step 1: Add failing adapter/service tests**

Append to `/Users/babycuca/Projects/o-agent-chat/server/test/omni.test.js`:

```js
import { createAdapterRegistry } from '../src/omni/adapters.js'
import { createOmniService } from '../src/omni/service.js'

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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/babycuca/Projects/o-agent-chat/server
npm test -- omni.test.js
```

Expected: FAIL with module not found for `adapters.js`.

- [ ] **Step 3: Implement adapter registry**

Create `/Users/babycuca/Projects/o-agent-chat/server/src/omni/adapters.js`:

```js
function createMockAdapter(provider) {
  return {
    provider,
    async healthcheck() {
      return { ok: true, provider, mode: 'mock' }
    },
    async listThreads() {
      return []
    },
    async readThread() {
      return null
    },
    async sendMessage() {
      return { ok: false, error: 'write_guard_mock_adapter' }
    },
    async lookupCustomer() {
      return null
    },
    async lookupStock() {
      return null
    },
    async lookupOrder() {
      return null
    },
    async prepareInvoice() {
      return { ok: false, error: 'approval_required' }
    },
    async createPaymentRequest() {
      return { ok: false, error: 'approval_required' }
    },
    async checkPaymentStatus() {
      return { ok: false, error: 'not_connected' }
    },
  }
}

export function createAdapterRegistry() {
  const adapters = new Map([
    ['meta', createMockAdapter('meta')],
    ['tiktok_shop', createMockAdapter('tiktok_shop')],
    ['bigseller', createMockAdapter('bigseller')],
    ['shopee', createMockAdapter('shopee')],
  ])

  return {
    get(provider) {
      const adapter = adapters.get(provider)
      if (!adapter) throw new Error(`unknown_provider:${provider}`)
      return adapter
    },
    list() {
      return Array.from(adapters.keys())
    },
  }
}
```

- [ ] **Step 4: Implement service**

Create `/Users/babycuca/Projects/o-agent-chat/server/src/omni/service.js`:

```js
import { createOmniSeed } from './seed.js'

export function createOmniService(seed = createOmniSeed()) {
  const data = structuredClone(seed)

  function getPolicyForThread(thread) {
    const page = data.pages.find((item) => item.id === thread.pageId)
    return data.policySets.find((item) => item.id === page?.policySetId)
  }

  return {
    snapshot() {
      return structuredClone(data)
    },
    listPages() {
      return structuredClone(data.pages)
    },
    listThreads(filters = {}) {
      return data.threads
        .filter((thread) => !filters.pageId || thread.pageId === filters.pageId)
        .filter((thread) => !filters.status || thread.status === filters.status)
        .map((thread) => structuredClone(thread))
    },
    getThread(threadId) {
      const thread = data.threads.find((item) => item.id === threadId)
      if (!thread) return null
      return {
        ...structuredClone(thread),
        messages: data.messages.filter((message) => message.threadId === threadId),
        customer: data.customers.find((customer) => customer.id === thread.customerId) || null,
        orders: data.orders.filter((order) => order.customerId === thread.customerId),
        decisions: data.aiDecisions.filter((decision) => decision.threadId === threadId),
      }
    },
    evaluateAutoSend({ threadId }) {
      const thread = data.threads.find((item) => item.id === threadId)
      if (!thread) return { allowed: false, reason: 'thread_not_found' }
      const policy = getPolicyForThread(thread)
      if (!policy) return { allowed: false, reason: 'missing_policy' }
      if (thread.risk !== 'low') return { allowed: false, reason: 'risk_not_low' }
      if (!policy.autoSend?.[thread.intent]) return { allowed: false, reason: 'intent_requires_approval' }
      return { allowed: true, reason: 'policy_whitelist' }
    },
    approveDraft({ threadId }) {
      const thread = data.threads.find((item) => item.id === threadId)
      if (!thread) return { ok: false, error: 'thread_not_found' }
      thread.status = 'auto_sent'
      return { ok: true, thread: structuredClone(thread) }
    },
  }
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
cd /Users/babycuca/Projects/o-agent-chat/server
npm test -- omni.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/babycuca/Projects/o-agent-chat
git add server/src/omni/adapters.js server/src/omni/service.js server/test/omni.test.js
git commit -m "feat: add omnichannel adapter service"
```

## Task 3: Server API Routes

**Files:**
- Modify: `/Users/babycuca/Projects/o-agent-chat/server/src/routes.js`
- Modify: `/Users/babycuca/Projects/o-agent-chat/server/test/omni.test.js`

- [ ] **Step 1: Add route tests**

Append to `/Users/babycuca/Projects/o-agent-chat/server/test/omni.test.js`:

```js
import express from 'express'
import request from 'node:test'
import { mountRoutes } from '../src/routes.js'

test('omni routes are mounted under api', async () => {
  const app = express()
  app.use(express.json())
  mountRoutes(app, { broadcast() {} }, { snapshot() { return {} } })

  const server = app.listen(0)
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  const response = await fetch(`${baseUrl}/api/omni/pages`)
  const body = await response.json()
  server.close()

  assert.equal(response.status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.pages.length, 5)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/babycuca/Projects/o-agent-chat/server
npm test -- omni.test.js
```

Expected: FAIL because `/api/omni/pages` returns 404.

- [ ] **Step 3: Mount routes**

Modify `/Users/babycuca/Projects/o-agent-chat/server/src/routes.js` by importing the service and adding routes inside `mountRoutes`:

```js
import { createOmniService } from './omni/service.js'
import { createAdapterRegistry } from './omni/adapters.js'
```

Inside `mountRoutes(app, hub, room)`, add after `/api/health`:

```js
  const omni = createOmniService()
  const adapters = createAdapterRegistry()

  app.get('/api/omni/pages', (_req, res) => {
    res.json({ ok: true, pages: omni.listPages() })
  })

  app.get('/api/omni/snapshot', (_req, res) => {
    res.json({ ok: true, snapshot: omni.snapshot() })
  })

  app.get('/api/omni/threads', (req, res) => {
    res.json({ ok: true, threads: omni.listThreads({ pageId: req.query.pageId, status: req.query.status }) })
  })

  app.get('/api/omni/threads/:threadId', (req, res) => {
    const thread = omni.getThread(req.params.threadId)
    if (!thread) return res.status(404).json({ ok: false, error: 'thread_not_found' })
    res.json({ ok: true, thread })
  })

  app.post('/api/omni/threads/:threadId/evaluate-auto-send', (req, res) => {
    res.json({ ok: true, decision: omni.evaluateAutoSend({ threadId: req.params.threadId }) })
  })

  app.get('/api/omni/connectors/health', async (_req, res) => {
    const providers = adapters.list()
    const health = await Promise.all(providers.map((provider) => adapters.get(provider).healthcheck()))
    res.json({ ok: true, health })
  })
```

- [ ] **Step 4: Remove unused bad import**

If the test file includes `import request from 'node:test'`, remove that line. The route test uses native `fetch`.

- [ ] **Step 5: Run server tests**

Run:

```bash
cd /Users/babycuca/Projects/o-agent-chat/server
npm test
```

Expected: all server tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/babycuca/Projects/o-agent-chat
git add server/src/routes.js server/test/omni.test.js
git commit -m "feat: expose omnichannel api routes"
```

## Task 4: Client API And Model Helpers

**Files:**
- Create: `/Users/babycuca/Projects/o-agent-chat/client/src/lib/omniApi.js`
- Create: `/Users/babycuca/Projects/o-agent-chat/client/src/lib/omniModel.js`
- Test: `/Users/babycuca/Projects/o-agent-chat/client/src/lib/omniModel.test.js`

- [ ] **Step 1: Add failing model tests**

Create `/Users/babycuca/Projects/o-agent-chat/client/src/lib/omniModel.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { filterThreads, statusLabel } from './omniModel.js'

describe('omniModel', () => {
  it('filters threads by active page', () => {
    const threads = [
      { id: 'thread_1', pageId: 'page_a', status: 'open' },
      { id: 'thread_2', pageId: 'page_b', status: 'open' },
    ]
    expect(filterThreads(threads, { pageId: 'page_a' })).toEqual([{ id: 'thread_1', pageId: 'page_a', status: 'open' }])
  })

  it('returns human status labels', () => {
    expect(statusLabel('needs_approval')).toBe('Needs approval')
    expect(statusLabel('unknown')).toBe('unknown')
  })
})
```

- [ ] **Step 2: Run client test to verify it fails**

Run:

```bash
cd /Users/babycuca/Projects/o-agent-chat/client
npm test -- src/lib/omniModel.test.js
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement model helpers**

Create `/Users/babycuca/Projects/o-agent-chat/client/src/lib/omniModel.js`:

```js
export function filterThreads(threads, filters = {}) {
  return threads
    .filter((thread) => !filters.pageId || filters.pageId === 'all' || thread.pageId === filters.pageId)
    .filter((thread) => !filters.status || filters.status === 'all' || thread.status === filters.status)
}

export function statusLabel(status) {
  const labels = {
    open: 'Open',
    draft_ready: 'Draft ready',
    needs_approval: 'Needs approval',
    needs_data: 'Needs data',
    auto_sent: 'Auto sent',
    escalated: 'Escalated',
  }
  return labels[status] || status
}

export function riskClass(risk) {
  if (risk === 'high') return 'text-rose-300 bg-rose-950/40'
  if (risk === 'medium') return 'text-amber-300 bg-amber-950/40'
  return 'text-emerald-300 bg-emerald-950/40'
}
```

- [ ] **Step 4: Implement API wrapper**

Create `/Users/babycuca/Projects/o-agent-chat/client/src/lib/omniApi.js`:

```js
async function getJson(path) {
  const response = await fetch(path)
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || `request_failed:${path}`)
  return body
}

export async function fetchOmniSnapshot() {
  return (await getJson('/api/omni/snapshot')).snapshot
}

export async function fetchThread(threadId) {
  return (await getJson(`/api/omni/threads/${threadId}`)).thread
}

export async function fetchConnectorHealth() {
  return (await getJson('/api/omni/connectors/health')).health
}
```

- [ ] **Step 5: Run client tests**

Run:

```bash
cd /Users/babycuca/Projects/o-agent-chat/client
npm test -- src/lib/omniModel.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/babycuca/Projects/o-agent-chat
git add client/src/lib/omniApi.js client/src/lib/omniModel.js client/src/lib/omniModel.test.js
git commit -m "feat: add omnichannel client helpers"
```

## Task 5: Omnichannel Workbench UI

**Files:**
- Create focused components in `/Users/babycuca/Projects/o-agent-chat/client/src/components/omni/`
- Create: `/Users/babycuca/Projects/o-agent-chat/client/src/components/omni/OmniWorkbench.test.jsx`

- [ ] **Step 1: Add smoke test**

Create `/Users/babycuca/Projects/o-agent-chat/client/src/components/omni/OmniWorkbench.test.jsx`:

```jsx
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import OmniWorkbench from './OmniWorkbench.jsx'

vi.mock('../../lib/omniApi.js', () => ({
  fetchOmniSnapshot: async () => ({
    pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active' }],
    threads: [{ id: 'thread_1', pageId: 'page_mankynd', platform: 'facebook', status: 'draft_ready', intent: 'stock', risk: 'low' }],
    messages: [{ id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม' }],
    customers: [{ id: 'cust_1', displayName: 'ลูกค้า A' }],
    orders: [],
    aiDecisions: [{ id: 'decision_1', threadId: 'thread_1', confidence: 0.94, action: 'draft_ready' }],
    paymentRequests: [{ id: 'pay_1', threadId: 'thread_1', provider: 'promptpay', status: 'draft', amount: 729, currency: 'THB', approvalRequired: true }],
    connectorHealth: [{ id: 'health_meta', provider: 'meta', status: 'healthy' }],
  }),
  fetchConnectorHealth: async () => [{ provider: 'meta', status: 'healthy' }],
}))

describe('OmniWorkbench', () => {
  it('renders inbox, AI panel, connector health, and order desk', async () => {
    render(<OmniWorkbench />)
    expect(await screen.findByText('Omnichannel Inbox')).toBeInTheDocument()
    expect(await screen.findByText('MAN KYND')).toBeInTheDocument()
    expect(await screen.findByText('AI Decision')).toBeInTheDocument()
    expect(await screen.findByText('Connector Health')).toBeInTheDocument()
    expect(await screen.findByText('Order Desk')).toBeInTheDocument()
    expect(await screen.findByText('Payment Desk')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/babycuca/Projects/o-agent-chat/client
npm test -- src/components/omni/OmniWorkbench.test.jsx
```

Expected: FAIL with component not found.

- [ ] **Step 3: Implement `OmniWorkbench.jsx`**

Create `/Users/babycuca/Projects/o-agent-chat/client/src/components/omni/OmniWorkbench.jsx`:

```jsx
import React, { useEffect, useMemo, useState } from 'react'
import { fetchOmniSnapshot } from '../../lib/omniApi.js'
import { filterThreads } from '../../lib/omniModel.js'
import PageRail from './PageRail.jsx'
import ThreadList from './ThreadList.jsx'
import ThreadDetail from './ThreadDetail.jsx'
import AiDecisionPanel from './AiDecisionPanel.jsx'
import OrderDesk from './OrderDesk.jsx'
import PaymentDesk from './PaymentDesk.jsx'
import ConnectorHealth from './ConnectorHealth.jsx'
import PageManagement from './PageManagement.jsx'

export default function OmniWorkbench() {
  const [snapshot, setSnapshot] = useState(null)
  const [pageId, setPageId] = useState('all')
  const [threadId, setThreadId] = useState(null)

  useEffect(() => {
    fetchOmniSnapshot().then((data) => {
      setSnapshot(data)
      setThreadId(data.threads?.[0]?.id || null)
    })
  }, [])

  const threads = useMemo(() => filterThreads(snapshot?.threads || [], { pageId }), [snapshot, pageId])
  const selectedThread = threads.find((thread) => thread.id === threadId) || threads[0] || null

  if (!snapshot) return <div className="p-6 text-slate-300">Loading omnichannel workbench...</div>

  return (
    <div className="grid h-full grid-cols-[220px_minmax(260px,360px)_1fr_320px] bg-slate-950 text-slate-100">
      <PageRail pages={snapshot.pages} activePageId={pageId} onSelect={setPageId} />
      <ThreadList threads={threads} activeThreadId={selectedThread?.id} onSelect={setThreadId} />
      <main className="min-w-0 border-x border-slate-800">
        <header className="border-b border-slate-800 px-5 py-4">
          <h1 className="text-lg font-semibold">Omnichannel Inbox</h1>
          <p className="text-xs text-slate-500">Local-first customer inbox with guarded AI replies</p>
        </header>
        <ThreadDetail snapshot={snapshot} thread={selectedThread} />
      </main>
      <aside className="overflow-y-auto">
        <AiDecisionPanel snapshot={snapshot} thread={selectedThread} />
        <OrderDesk snapshot={snapshot} thread={selectedThread} />
        <PaymentDesk snapshot={snapshot} thread={selectedThread} />
        <ConnectorHealth health={snapshot.connectorHealth} />
        <PageManagement pages={snapshot.pages} />
      </aside>
    </div>
  )
}
```

- [ ] **Step 4: Implement child components**

Create each file:

`/Users/babycuca/Projects/o-agent-chat/client/src/components/omni/PageRail.jsx`

```jsx
import React from 'react'

export default function PageRail({ pages, activePageId, onSelect }) {
  return (
    <aside className="border-r border-slate-800 p-3">
      <button className="mb-3 w-full rounded bg-slate-800 px-3 py-2 text-left text-sm" onClick={() => onSelect('all')}>All pages</button>
      <div className="space-y-2">
        {pages.map((page) => (
          <button key={page.id} className={`w-full rounded px-3 py-2 text-left text-sm ${activePageId === page.id ? 'bg-cyan-950 text-cyan-100' : 'bg-slate-900 text-slate-300'}`} onClick={() => onSelect(page.id)}>
            <span className="block font-medium">{page.name}</span>
            <span className="text-xs text-slate-500">{page.status}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}
```

`/Users/babycuca/Projects/o-agent-chat/client/src/components/omni/ThreadList.jsx`

```jsx
import React from 'react'
import { statusLabel } from '../../lib/omniModel.js'

export default function ThreadList({ threads, activeThreadId, onSelect }) {
  return (
    <section className="overflow-y-auto border-r border-slate-800">
      {threads.map((thread) => (
        <button key={thread.id} className={`w-full border-b border-slate-800 px-4 py-3 text-left ${activeThreadId === thread.id ? 'bg-slate-800' : 'bg-slate-950'}`} onClick={() => onSelect(thread.id)}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{thread.platform}</span>
            <span className="text-xs text-slate-400">{statusLabel(thread.status)}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{thread.intent} · {thread.risk}</p>
        </button>
      ))}
    </section>
  )
}
```

`/Users/babycuca/Projects/o-agent-chat/client/src/components/omni/ThreadDetail.jsx`

```jsx
import React from 'react'

export default function ThreadDetail({ snapshot, thread }) {
  if (!thread) return <div className="p-5 text-slate-400">No thread selected</div>
  const messages = snapshot.messages.filter((message) => message.threadId === thread.id)
  return (
    <div className="space-y-3 p-5">
      {messages.map((message) => (
        <article key={message.id} className="rounded border border-slate-800 bg-slate-900 p-3">
          <div className="text-xs text-slate-500">{message.authorName}</div>
          <p className="mt-1 text-sm text-slate-100">{message.text}</p>
        </article>
      ))}
    </div>
  )
}
```

`/Users/babycuca/Projects/o-agent-chat/client/src/components/omni/AiDecisionPanel.jsx`

```jsx
import React from 'react'

export default function AiDecisionPanel({ snapshot, thread }) {
  const decisions = thread ? snapshot.aiDecisions.filter((decision) => decision.threadId === thread.id) : []
  return (
    <section className="border-b border-slate-800 p-4">
      <h2 className="text-sm font-semibold">AI Decision</h2>
      {decisions.map((decision) => (
        <div key={decision.id} className="mt-3 rounded bg-slate-900 p-3 text-xs text-slate-300">
          <div>Action: {decision.action}</div>
          <div>Confidence: {Math.round(decision.confidence * 100)}%</div>
        </div>
      ))}
    </section>
  )
}
```

`/Users/babycuca/Projects/o-agent-chat/client/src/components/omni/OrderDesk.jsx`

```jsx
import React from 'react'

export default function OrderDesk({ snapshot, thread }) {
  const orders = thread ? snapshot.orders.filter((order) => order.customerId === thread.customerId) : []
  return (
    <section className="border-b border-slate-800 p-4">
      <h2 className="text-sm font-semibold">Order Desk</h2>
      {orders.length === 0 ? <p className="mt-2 text-xs text-slate-500">No linked orders</p> : null}
      {orders.map((order) => (
        <div key={order.id} className="mt-3 rounded bg-slate-900 p-3 text-xs text-slate-300">
          <div>{order.platform} · {order.status}</div>
          <div>Total: {order.total}</div>
        </div>
      ))}
    </section>
  )
}
```

`/Users/babycuca/Projects/o-agent-chat/client/src/components/omni/PaymentDesk.jsx`

```jsx
import React from 'react'

export default function PaymentDesk({ snapshot, thread }) {
  const payments = thread ? (snapshot.paymentRequests || []).filter((payment) => payment.threadId === thread.id) : []
  return (
    <section className="border-b border-slate-800 p-4">
      <h2 className="text-sm font-semibold">Payment Desk</h2>
      {payments.length === 0 ? <p className="mt-2 text-xs text-slate-500">No payment drafts</p> : null}
      {payments.map((payment) => (
        <div key={payment.id} className="mt-3 rounded bg-slate-900 p-3 text-xs text-slate-300">
          <div>{payment.provider} · {payment.status}</div>
          <div>{payment.currency} {payment.amount}</div>
          <div className="mt-1 text-amber-300">Approval required before sending</div>
        </div>
      ))}
    </section>
  )
}
```

`/Users/babycuca/Projects/o-agent-chat/client/src/components/omni/ConnectorHealth.jsx`

```jsx
import React from 'react'

export default function ConnectorHealth({ health }) {
  return (
    <section className="border-b border-slate-800 p-4">
      <h2 className="text-sm font-semibold">Connector Health</h2>
      <div className="mt-3 space-y-2">
        {health.map((item) => (
          <div key={item.id || item.provider} className="flex justify-between rounded bg-slate-900 px-3 py-2 text-xs">
            <span>{item.provider}</span>
            <span>{item.status}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
```

`/Users/babycuca/Projects/o-agent-chat/client/src/components/omni/PageManagement.jsx`

```jsx
import React from 'react'

export default function PageManagement({ pages }) {
  return (
    <section className="p-4">
      <h2 className="text-sm font-semibold">Page Management</h2>
      <p className="mt-2 text-xs text-slate-500">{pages.length} configured pages. Add, pause, archive, and soft-delete actions come after the read-only foundation.</p>
    </section>
  )
}
```

- [ ] **Step 5: Run component test**

Run:

```bash
cd /Users/babycuca/Projects/o-agent-chat/client
npm test -- src/components/omni/OmniWorkbench.test.jsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/babycuca/Projects/o-agent-chat
git add client/src/components/omni client/src/components/omni/OmniWorkbench.test.jsx
git commit -m "feat: add omnichannel workbench shell"
```

## Task 6: Add Omni Mode To Existing App

**Files:**
- Modify: `/Users/babycuca/Projects/o-agent-chat/client/src/App.jsx`

- [ ] **Step 1: Add import**

Modify `/Users/babycuca/Projects/o-agent-chat/client/src/App.jsx`:

```jsx
import OmniWorkbench from './components/omni/OmniWorkbench.jsx'
```

- [ ] **Step 2: Render omni mode before chat room layout**

In `App()`, after hooks and before `const panel = (...)`, add:

```jsx
  if (mode === 'omni') {
    return (
      <div className="h-full bg-slate-950">
        <div className="border-b border-slate-800 px-4 py-2">
          <ModeTabs value={mode} onChange={setMode} />
        </div>
        <OmniWorkbench />
      </div>
    )
  }
```

- [ ] **Step 3: Ensure ModeTabs has an omni option**

Open `/Users/babycuca/Projects/o-agent-chat/client/src/components/ModeTabs.jsx`. Add this option to the mode list:

```js
{ value: 'omni', label: 'Omni' }
```

- [ ] **Step 4: Run build**

Run:

```bash
cd /Users/babycuca/Projects/o-agent-chat/client
npm run build
```

Expected: PASS and Vite emits `dist/`.

- [ ] **Step 5: Commit**

```bash
cd /Users/babycuca/Projects/o-agent-chat
git add client/src/App.jsx client/src/components/ModeTabs.jsx
git commit -m "feat: expose omnichannel mode"
```

## Task 7: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run server tests**

```bash
cd /Users/babycuca/Projects/o-agent-chat/server
npm test
```

Expected: all tests PASS.

- [ ] **Step 2: Run client tests**

```bash
cd /Users/babycuca/Projects/o-agent-chat/client
npm test
```

Expected: all tests PASS.

- [ ] **Step 3: Run client build**

```bash
cd /Users/babycuca/Projects/o-agent-chat/client
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Start local services**

```bash
cd /Users/babycuca/Projects/o-agent-chat/server
npm run dev
```

In another terminal:

```bash
cd /Users/babycuca/Projects/o-agent-chat/client
npm run dev
```

Expected: server listens on its configured port and Vite opens the client.

- [ ] **Step 5: Manual smoke check**

Open the Vite URL and switch to `Omni`.

Expected:

- Page rail shows 5 seed pages.
- Thread list shows Facebook/TikTok mock threads.
- Thread detail shows customer message.
- AI Decision panel shows confidence/action.
- Order Desk shows linked TikTok order where available.
- Payment Desk shows payment drafts and approval-required status.
- Connector Health shows meta, TikTok, BigSeller, Shopee statuses.

- [ ] **Step 6: Record verification result in the final implementation response**

Do not create a verification commit unless an implementation task changed a documentation file. The final response must list the exact commands run and whether each passed.

## Follow-Up Plans

After this foundation passes:

1. Facebook multi-page connector plan using `meta-inbox-api`.
2. TikTok Shop customer/order context adapter plan using `tt-product-api`.
3. BigSeller read-only stock/order adapter plan.
4. Payment adapter plan for Meta Pay/KGP and QR PromptPay.
5. Vercel + Supabase cloud beta plan.
6. Auto-send production guard plan with replay testing.
