/**
 * Omni Private SaaS — Workspace Foundation
 *
 * Additive workspace/tenant model. When no workspaceId is supplied,
 * the system behaves exactly as the existing single-tenant O-Agent runtime.
 */

export const DEFAULT_WORKSPACE_ID = 'ws_oagent'

export const DEFAULT_WORKSPACE = {
  id: DEFAULT_WORKSPACE_ID,
  name: 'O-Agent',
  slug: 'o-agent',
  plan: 'private_saas',
  status: 'active',
  ownerRef: 'boss',
  settings: {},
  createdAt: '2026-06-02T00:00:00.000Z',
  updatedAt: '2026-06-02T00:00:00.000Z',
}

const WORKSPACE_PLANS = new Set(['private_saas', 'starter', 'pro', 'enterprise'])
const WORKSPACE_STATUSES = new Set(['active', 'suspended', 'archived'])

/**
 * Normalize workspace input for upsert.
 */
export function normalizeWorkspace(input = {}) {
  const name = String(input.name || '').trim()
  if (!name) return { ok: false, error: 'workspace_name_required' }

  const now = new Date().toISOString()
  const id = input.id || `ws_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
  const slug = String(input.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).trim()
  const plan = WORKSPACE_PLANS.has(input.plan) ? input.plan : 'private_saas'
  const status = WORKSPACE_STATUSES.has(input.status) ? input.status : 'active'

  return {
    ok: true,
    workspace: {
      id,
      name,
      slug,
      plan,
      status,
      ownerRef: input.ownerRef || 'boss',
      settings: input.settings || {},
      createdAt: input.createdAt || now,
      updatedAt: now,
    },
  }
}

/**
 * Backfill workspaceId onto pages that don't have one.
 * Returns a new array — does NOT mutate the input.
 */
export function backfillWorkspaceId(pages = [], defaultWorkspaceId = DEFAULT_WORKSPACE_ID) {
  return pages.map((page) => ({
    ...page,
    workspaceId: page.workspaceId || defaultWorkspaceId,
  }))
}

/**
 * Filter pages by workspaceId. If workspaceId is null/undefined, returns all pages (backward-compatible).
 */
export function filterByWorkspace(items = [], workspaceId) {
  if (!workspaceId) return items
  return items.filter((item) => item.workspaceId === workspaceId)
}

/**
 * Resolve workspaceId from a thread or page context.
 * Falls back to DEFAULT_WORKSPACE_ID for legacy calls without workspace data.
 */
export function resolveWorkspaceId(snapshot, { threadId, pageId } = {}) {
  if (pageId) {
    const page = (snapshot.pages || []).find((p) => p.id === pageId)
    return page?.workspaceId || DEFAULT_WORKSPACE_ID
  }
  if (threadId) {
    const thread = (snapshot.threads || []).find((t) => t.id === threadId)
    if (thread?.pageId) {
      const page = (snapshot.pages || []).find((p) => p.id === thread.pageId)
      return page?.workspaceId || DEFAULT_WORKSPACE_ID
    }
  }
  return DEFAULT_WORKSPACE_ID
}

/**
 * Build workspace summary from snapshot data.
 */
export function buildWorkspaceSummary(workspace, snapshot = {}) {
  const pages = (snapshot.pages || []).filter((page) => page.workspaceId === workspace.id)
  const channels = (snapshot.platformAccounts || []).filter((account) =>
    pages.some((page) => page.id === account.pageId),
  )
  const knowledgeCount = (snapshot.knowledgeSources || []).filter(
    (source) => source.workspaceId === workspace.id,
  ).length

  return {
    ...workspace,
    pageCount: pages.length,
    channelCount: channels.length,
    knowledgeCount,
    pages: pages.map((page) => ({ id: page.id, name: page.name, status: page.status })),
  }
}
