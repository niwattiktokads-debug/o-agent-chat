import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createOmniSeed } from '../src/omni/seed.js'
import { createOmniService } from '../src/omni/service.js'
import { createSqliteOmniStore } from '../src/omni/db/sqliteStore.js'
import {
  DEFAULT_WORKSPACE,
  DEFAULT_WORKSPACE_ID,
  normalizeWorkspace,
  backfillWorkspaceId,
  filterByWorkspace,
  buildWorkspaceSummary,
  resolveWorkspaceId,
} from '../src/omni/workspace.js'

describe('Workspace Foundation — Backward Compatibility', () => {
  test('seed includes default workspace ws_oagent', () => {
    const seed = createOmniSeed()
    assert.ok(Array.isArray(seed.workspaces))
    assert.equal(seed.workspaces.length, 1)
    assert.equal(seed.workspaces[0].id, 'ws_oagent')
    assert.equal(seed.workspaces[0].name, 'O-Agent')
    assert.equal(seed.workspaces[0].status, 'active')
  })

  test('all seed pages have workspaceId = ws_oagent', () => {
    const seed = createOmniSeed()
    for (const page of seed.pages) {
      assert.equal(page.workspaceId, DEFAULT_WORKSPACE_ID, `page ${page.id} missing workspaceId`)
    }
  })

  test('all seed knowledgeSources have workspaceId = ws_oagent', () => {
    const seed = createOmniSeed()
    for (const source of seed.knowledgeSources) {
      assert.equal(source.workspaceId, DEFAULT_WORKSPACE_ID, `knowledge ${source.id} missing workspaceId`)
    }
  })

  test('service.snapshot() still returns pages, threads, messages, customers (backward-compatible shape)', () => {
    const omni = createOmniService()
    const snapshot = omni.snapshot()
    assert.ok(Array.isArray(snapshot.pages))
    assert.ok(Array.isArray(snapshot.threads))
    assert.ok(Array.isArray(snapshot.messages))
    assert.ok(Array.isArray(snapshot.customers))
    assert.ok(Array.isArray(snapshot.workspaces))
    assert.ok(snapshot.pages.length > 0)
  })

  test('service.listPages() without workspaceId returns all pages (backward-compatible)', () => {
    const omni = createOmniService()
    const allPages = omni.listPages()
    const seed = createOmniSeed()
    assert.equal(allPages.length, seed.pages.length)
  })

  test('service.listPages({ workspaceId }) filters by workspace', () => {
    const omni = createOmniService()
    const filtered = omni.listPages({ workspaceId: DEFAULT_WORKSPACE_ID })
    const all = omni.listPages()
    assert.equal(filtered.length, all.length)
    // Non-existent workspace returns empty
    const empty = omni.listPages({ workspaceId: 'ws_nonexistent' })
    assert.equal(empty.length, 0)
  })

  test('service.listWorkspaces() returns default workspace', () => {
    const omni = createOmniService()
    const workspaces = omni.listWorkspaces()
    assert.equal(workspaces.length, 1)
    assert.equal(workspaces[0].id, DEFAULT_WORKSPACE_ID)
  })

  test('service.getWorkspace() returns workspace summary with page count', () => {
    const omni = createOmniService()
    const ws = omni.getWorkspace(DEFAULT_WORKSPACE_ID)
    assert.ok(ws)
    assert.equal(ws.id, DEFAULT_WORKSPACE_ID)
    assert.equal(ws.name, 'O-Agent')
    assert.ok(ws.pageCount > 0)
    assert.ok(Array.isArray(ws.pages))
  })

  test('service.getWorkspace() returns null for non-existent workspace', () => {
    const omni = createOmniService()
    const ws = omni.getWorkspace('ws_nonexistent')
    assert.equal(ws, null)
  })

  test('service.upsertWorkspace() creates a new workspace', () => {
    const omni = createOmniService()
    const result = omni.upsertWorkspace({ name: 'Test Workspace', plan: 'starter' })
    assert.equal(result.ok, true)
    assert.equal(result.workspace.name, 'Test Workspace')
    assert.equal(result.workspace.plan, 'starter')
    assert.equal(result.workspace.status, 'active')
    // Verify it appears in list
    const workspaces = omni.listWorkspaces()
    assert.equal(workspaces.length, 2)
  })

  test('service.upsertWorkspace() rejects empty name', () => {
    const omni = createOmniService()
    const result = omni.upsertWorkspace({ name: '' })
    assert.equal(result.ok, false)
    assert.equal(result.error, 'workspace_name_required')
  })

  test('existing service methods still work without workspace context', () => {
    const omni = createOmniService()
    // getSettings should still work
    const settings = omni.getSettings()
    assert.ok(settings.postCf)
    assert.ok(settings.ai)
    // updateSettings should still work
    const result = omni.updateSettings({ settings: { ai: { enabled: false } } })
    assert.equal(result.ok, true)
    assert.equal(result.settings.ai.enabled, false)
  })

  test('page auto-reply toggle still works (backward-compatible)', () => {
    const omni = createOmniService()
    const result = omni.setPageAutoReply({ pageId: 'page_mankynd', enabled: false })
    assert.equal(result.ok, true)
    assert.equal(result.page.autoReplyEnabled, false)
    // Page still has workspaceId
    assert.equal(result.page.workspaceId, DEFAULT_WORKSPACE_ID)
  })
})

describe('Workspace Foundation — Utility Functions', () => {
  test('normalizeWorkspace validates input', () => {
    const valid = normalizeWorkspace({ name: 'My Workspace', plan: 'pro' })
    assert.equal(valid.ok, true)
    assert.equal(valid.workspace.name, 'My Workspace')
    assert.equal(valid.workspace.plan, 'pro')
    assert.ok(valid.workspace.id.startsWith('ws_'))

    const invalid = normalizeWorkspace({ name: '' })
    assert.equal(invalid.ok, false)
  })

  test('backfillWorkspaceId adds default workspaceId to pages without one', () => {
    const pages = [
      { id: 'p1', name: 'Page 1' },
      { id: 'p2', name: 'Page 2', workspaceId: 'ws_custom' },
    ]
    const result = backfillWorkspaceId(pages)
    assert.equal(result[0].workspaceId, DEFAULT_WORKSPACE_ID)
    assert.equal(result[1].workspaceId, 'ws_custom') // Preserved
  })

  test('filterByWorkspace returns all when no workspaceId', () => {
    const items = [
      { id: '1', workspaceId: 'ws_a' },
      { id: '2', workspaceId: 'ws_b' },
    ]
    assert.equal(filterByWorkspace(items).length, 2)
    assert.equal(filterByWorkspace(items, null).length, 2)
    assert.equal(filterByWorkspace(items, undefined).length, 2)
  })

  test('filterByWorkspace filters correctly', () => {
    const items = [
      { id: '1', workspaceId: 'ws_a' },
      { id: '2', workspaceId: 'ws_b' },
      { id: '3', workspaceId: 'ws_a' },
    ]
    assert.equal(filterByWorkspace(items, 'ws_a').length, 2)
    assert.equal(filterByWorkspace(items, 'ws_b').length, 1)
    assert.equal(filterByWorkspace(items, 'ws_c').length, 0)
  })

  test('buildWorkspaceSummary computes page and channel counts', () => {
    const workspace = { id: 'ws_test', name: 'Test' }
    const snapshot = {
      pages: [
        { id: 'p1', name: 'P1', status: 'active', workspaceId: 'ws_test' },
        { id: 'p2', name: 'P2', status: 'active', workspaceId: 'ws_other' },
      ],
      platformAccounts: [
        { id: 'a1', pageId: 'p1', platform: 'facebook' },
        { id: 'a2', pageId: 'p2', platform: 'tiktok' },
      ],
      knowledgeSources: [
        { id: 'k1', workspaceId: 'ws_test', scope: 'p1' },
        { id: 'k2', workspaceId: 'ws_other', scope: 'all_pages' },
        { id: 'k3', workspaceId: 'ws_test', scope: 'all_pages' },
      ],
    }
    const summary = buildWorkspaceSummary(workspace, snapshot)
    assert.equal(summary.pageCount, 1)
    assert.equal(summary.channelCount, 1)
    assert.equal(summary.knowledgeCount, 2) // k1 + k3; k2 belongs to ws_other
  })
})

describe('Workspace Foundation — SQLite Store Persistence', () => {
  test('workspaces collection persists in SQLite store', () => {
    const dir = mkdtempSync(join(tmpdir(), 'omni-ws-test-'))
    const store = createSqliteOmniStore({ dbPath: join(dir, 'test.sqlite') })
    const snapshot = store.snapshot()
    assert.ok(Array.isArray(snapshot.workspaces))
    assert.equal(snapshot.workspaces.length, 1)
    assert.equal(snapshot.workspaces[0].id, DEFAULT_WORKSPACE_ID)
    store.close()
  })

  test('upsert workspace persists and is retrievable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'omni-ws-test-'))
    const store = createSqliteOmniStore({ dbPath: join(dir, 'test.sqlite') })
    store.upsert('workspaces', [{ id: 'ws_new', name: 'New WS', slug: 'new-ws', plan: 'starter', status: 'active', ownerRef: 'test', settings: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }])
    const snapshot = store.snapshot()
    assert.equal(snapshot.workspaces.length, 2)
    assert.ok(snapshot.workspaces.find((ws) => ws.id === 'ws_new'))
    store.close()
  })

  test('pages in store have workspaceId backfilled from seed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'omni-ws-test-'))
    const store = createSqliteOmniStore({ dbPath: join(dir, 'test.sqlite') })
    const snapshot = store.snapshot()
    for (const page of snapshot.pages) {
      assert.equal(page.workspaceId, DEFAULT_WORKSPACE_ID, `stored page ${page.id} missing workspaceId`)
    }
    store.close()
  })

  test('workspace seed does not overwrite existing workspace runtime fields', () => {
    const dir = mkdtempSync(join(tmpdir(), 'omni-ws-seed-test-'))
    const dbPath = join(dir, 'test.sqlite')
    const store = createSqliteOmniStore({ dbPath })
    store.upsert('workspaces', [{
      id: DEFAULT_WORKSPACE_ID,
      name: 'O-Agent Runtime Name',
      slug: 'o-agent',
      plan: 'enterprise',
      status: 'active',
      ownerRef: 'runtime-owner',
      settings: { aiProvider: 'gemini' },
      createdAt: '2026-06-02T00:00:00.000Z',
      updatedAt: '2026-06-02T10:00:00.000Z',
    }])
    store.close()

    const reopened = createSqliteOmniStore({ dbPath })
    const workspace = reopened.snapshot().workspaces.find((item) => item.id === DEFAULT_WORKSPACE_ID)
    assert.equal(workspace.name, 'O-Agent Runtime Name')
    assert.equal(workspace.plan, 'enterprise')
    assert.deepEqual(workspace.settings, { aiProvider: 'gemini' })
    reopened.close()
  })
})

describe('Workspace Foundation — resolveWorkspaceId with pageProfiles', () => {
  test('resolves workspace from omniPageId directly', () => {
    const snapshot = {
      pages: [
        { id: 'page_mankynd', workspaceId: 'ws_oagent' },
        { id: 'page_custom', workspaceId: 'ws_custom' },
      ],
      threads: [],
    }
    assert.equal(resolveWorkspaceId(snapshot, { pageId: 'page_mankynd' }), 'ws_oagent')
    assert.equal(resolveWorkspaceId(snapshot, { pageId: 'page_custom' }), 'ws_custom')
  })

  test('resolves workspace from profileKey via pageProfiles mapping', () => {
    const snapshot = {
      pages: [
        { id: 'page_mankynd', workspaceId: 'ws_oagent' },
        { id: 'page_annalynn', workspaceId: 'ws_custom' },
      ],
      threads: [],
    }
    const pageProfiles = {
      man_kynd: { profileKey: 'man_kynd', omniPageId: 'page_mankynd' },
      anna_lynn: { profileKey: 'anna_lynn', omniPageId: 'page_annalynn' },
    }
    assert.equal(resolveWorkspaceId(snapshot, { pageId: 'man_kynd', pageProfiles }), 'ws_oagent')
    assert.equal(resolveWorkspaceId(snapshot, { pageId: 'anna_lynn', pageProfiles }), 'ws_custom')
  })

  test('falls back to DEFAULT_WORKSPACE_ID when profileKey not in mapping', () => {
    const snapshot = { pages: [], threads: [] }
    const pageProfiles = { man_kynd: { profileKey: 'man_kynd', omniPageId: 'page_mankynd' } }
    assert.equal(resolveWorkspaceId(snapshot, { pageId: 'unknown_profile', pageProfiles }), DEFAULT_WORKSPACE_ID)
  })

  test('resolves workspace from threadId', () => {
    const snapshot = {
      pages: [{ id: 'page_mankynd', workspaceId: 'ws_oagent' }],
      threads: [{ id: 'thread_1', pageId: 'page_mankynd' }],
    }
    assert.equal(resolveWorkspaceId(snapshot, { threadId: 'thread_1' }), 'ws_oagent')
  })
})
