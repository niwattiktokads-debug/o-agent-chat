import { describe, expect, it } from 'vitest'
import { filterSnapshotByWorkspace } from './omniApi.js'

const fullSnapshot = {
  workspaces: [
    { id: 'ws_oagent', name: 'O-Agent' },
    { id: 'ws_custom', name: 'Custom Tenant' },
  ],
  pages: [
    { id: 'page_mankynd', name: 'MAN KYND', workspaceId: 'ws_oagent' },
    { id: 'page_annalynn', name: 'Anna Lynn', workspaceId: 'ws_oagent' },
    { id: 'page_custom', name: 'Custom Page', workspaceId: 'ws_custom' },
  ],
  platformAccounts: [
    { id: 'acct_fb_mankynd', pageId: 'page_mankynd', platform: 'facebook' },
    { id: 'acct_custom', pageId: 'page_custom', platform: 'facebook' },
  ],
  threads: [
    { id: 'thread_1', pageId: 'page_mankynd', customerId: 'cust_1' },
    { id: 'thread_2', pageId: 'page_custom', customerId: 'cust_2' },
  ],
  messages: [
    { id: 'msg_1', threadId: 'thread_1', text: 'hello' },
    { id: 'msg_2', threadId: 'thread_2', text: 'hi custom' },
  ],
  customers: [
    { id: 'cust_1', displayName: 'Customer A' },
    { id: 'cust_2', displayName: 'Customer B' },
  ],
  orders: [
    { id: 'order_1', customerId: 'cust_1' },
    { id: 'order_2', customerId: 'cust_2' },
  ],
  pageRuntimeSettings: [
    { pageId: 'page_mankynd', autoReplyEnabled: true },
    { pageId: 'page_custom', autoReplyEnabled: false },
  ],
  actionAudits: [
    { id: 'audit_1', threadId: 'thread_1', workspaceId: 'ws_oagent' },
    { id: 'audit_2', threadId: 'thread_2', workspaceId: 'ws_custom' },
  ],
  aiDecisions: [
    { id: 'dec_1', threadId: 'thread_1' },
    { id: 'dec_2', threadId: 'thread_2' },
  ],
  knowledgeSources: [
    { id: 'ks_1', workspaceId: 'ws_oagent', title: 'FAQ' },
    { id: 'ks_2', workspaceId: 'ws_custom', title: 'Custom FAQ' },
    { id: 'ks_3', title: 'No workspace (defaults to ws_oagent)' },
  ],
}

describe('filterSnapshotByWorkspace', () => {
  it('returns full snapshot when workspaceId is empty/null', () => {
    expect(filterSnapshotByWorkspace(fullSnapshot, '')).toBe(fullSnapshot)
    expect(filterSnapshotByWorkspace(fullSnapshot, null)).toBe(fullSnapshot)
    expect(filterSnapshotByWorkspace(fullSnapshot, undefined)).toBe(fullSnapshot)
  })

  it('filters to ws_oagent pages/threads/messages only', () => {
    const scoped = filterSnapshotByWorkspace(fullSnapshot, 'ws_oagent')
    expect(scoped.pages.map((p) => p.id)).toEqual(['page_mankynd', 'page_annalynn'])
    expect(scoped.threads.map((t) => t.id)).toEqual(['thread_1'])
    expect(scoped.messages.map((m) => m.id)).toEqual(['msg_1'])
    expect(scoped.customers.map((c) => c.id)).toEqual(['cust_1'])
    expect(scoped.orders.map((o) => o.id)).toEqual(['order_1'])
    expect(scoped.platformAccounts.map((a) => a.id)).toEqual(['acct_fb_mankynd'])
    expect(scoped.pageRuntimeSettings.map((s) => s.pageId)).toEqual(['page_mankynd'])
    expect(scoped.actionAudits.map((a) => a.id)).toEqual(['audit_1'])
    expect(scoped.aiDecisions.map((d) => d.id)).toEqual(['dec_1'])
    // ks_1 + ks_3 (no workspaceId defaults to ws_oagent)
    expect(scoped.knowledgeSources.map((k) => k.id)).toEqual(['ks_1', 'ks_3'])
  })

  it('filters to ws_custom pages/threads/messages only', () => {
    const scoped = filterSnapshotByWorkspace(fullSnapshot, 'ws_custom')
    expect(scoped.pages.map((p) => p.id)).toEqual(['page_custom'])
    expect(scoped.threads.map((t) => t.id)).toEqual(['thread_2'])
    expect(scoped.messages.map((m) => m.id)).toEqual(['msg_2'])
    expect(scoped.customers.map((c) => c.id)).toEqual(['cust_2'])
    expect(scoped.orders.map((o) => o.id)).toEqual(['order_2'])
    expect(scoped.platformAccounts.map((a) => a.id)).toEqual(['acct_custom'])
    expect(scoped.pageRuntimeSettings.map((s) => s.pageId)).toEqual(['page_custom'])
    expect(scoped.actionAudits.map((a) => a.id)).toEqual(['audit_2'])
    expect(scoped.aiDecisions.map((d) => d.id)).toEqual(['dec_2'])
    expect(scoped.knowledgeSources.map((k) => k.id)).toEqual(['ks_2'])
  })

  it('returns empty collections for nonexistent workspace', () => {
    const scoped = filterSnapshotByWorkspace(fullSnapshot, 'ws_nonexistent')
    expect(scoped.pages).toEqual([])
    expect(scoped.threads).toEqual([])
    expect(scoped.messages).toEqual([])
    expect(scoped.customers).toEqual([])
    expect(scoped.orders).toEqual([])
    expect(scoped.platformAccounts).toEqual([])
    expect(scoped.knowledgeSources).toEqual([])
  })

  it('simulates realtime: full snapshot filtered before reaching UI preserves scope', () => {
    // This simulates what happens when WebSocket sends a full snapshot
    // and the subscription filter ensures only scoped data reaches UI
    const scopedBefore = filterSnapshotByWorkspace(fullSnapshot, 'ws_custom')
    expect(scopedBefore.pages).toHaveLength(1)
    expect(scopedBefore.pages[0].id).toBe('page_custom')

    // Simulate a new full snapshot arriving via WebSocket (e.g., after settings update)
    const updatedFull = {
      ...fullSnapshot,
      pages: [
        ...fullSnapshot.pages,
        { id: 'page_new_oagent', name: 'New Page', workspaceId: 'ws_oagent' },
      ],
    }
    const scopedAfter = filterSnapshotByWorkspace(updatedFull, 'ws_custom')
    // The new page from ws_oagent should NOT appear in ws_custom scope
    expect(scopedAfter.pages).toHaveLength(1)
    expect(scopedAfter.pages[0].id).toBe('page_custom')
    expect(scopedAfter.pages.find((p) => p.id === 'page_new_oagent')).toBeUndefined()
  })
})
