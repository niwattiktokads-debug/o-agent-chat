import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createOmniService } from '../src/omni/service.js'
import { DEFAULT_WORKSPACE, DEFAULT_WORKSPACE_ID } from '../src/omni/workspace.js'

function createSeed() {
  return {
    workspaces: [
      DEFAULT_WORKSPACE,
      {
        id: 'ws_test',
        name: 'Test Tenant',
        slug: 'test-tenant',
        plan: 'starter',
        status: 'active',
        ownerRef: 'tester',
        settings: {},
        createdAt: '2026-06-02T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z',
      },
    ],
    pages: [],
    pageRuntimeSettings: [],
    platformAccounts: [],
    brandGroups: [],
    policySets: [],
    agentProfiles: [],
    customers: [],
    threads: [],
    messages: [],
    orders: [],
    orderLinks: [],
    inventorySnapshots: [],
    paymentRequests: [],
    paymentEvents: [],
    omniSettings: [
      {
        id: 'default',
        workspaceId: DEFAULT_WORKSPACE_ID,
        settings: { ai: { enabled: true }, report: { timezone: 'Asia/Bangkok' } },
        updatedAt: '2026-06-02T00:00:00.000Z',
        updatedBy: 'seed',
      },
      {
        id: 'workspace:ws_test',
        workspaceId: 'ws_test',
        settings: { ai: { enabled: false }, report: { timezone: 'Asia/Bangkok' } },
        updatedAt: '2026-06-02T00:00:00.000Z',
        updatedBy: 'seed',
      },
    ],
    aiDecisions: [],
    actionAudits: [],
    approvalTasks: [],
    connectorHealth: [],
    knowledgeSources: [],
    retentionPolicies: [],
    retentionRuns: [],
  }
}

describe('Omni workspace settings', () => {
  test('legacy settings read still returns default workspace settings', () => {
    const omni = createOmniService({ seed: createSeed() })
    assert.equal(omni.getSettings().ai.enabled, true)
  })

  test('workspace settings read is isolated by workspaceId', () => {
    const omni = createOmniService({ seed: createSeed() })
    assert.equal(omni.getSettings({ workspaceId: DEFAULT_WORKSPACE_ID }).ai.enabled, true)
    assert.equal(omni.getSettings({ workspaceId: 'ws_test' }).ai.enabled, false)
  })

  test('workspace settings update does not mutate another workspace', () => {
    const omni = createOmniService({ seed: createSeed() })
    const result = omni.updateSettings({
      workspaceId: 'ws_test',
      settings: { ai: { enabled: true } },
      updatedBy: 'test',
    })
    assert.equal(result.ok, true)
    assert.equal(omni.getSettings({ workspaceId: 'ws_test' }).ai.enabled, true)
    assert.equal(omni.getSettings({ workspaceId: DEFAULT_WORKSPACE_ID }).ai.enabled, true)
    assert.equal(result.audit.sourceRef, 'omni_settings:workspace:ws_test')
  })

  test('default workspace update is read from workspace override before legacy default row', () => {
    const omni = createOmniService({ seed: createSeed() })
    const result = omni.updateSettings({
      workspaceId: DEFAULT_WORKSPACE_ID,
      settings: { ai: { customerSendEnabled: true } },
      updatedBy: 'test',
    })

    assert.equal(result.ok, true)
    assert.equal(result.settings.ai.customerSendEnabled, true)
    assert.equal(omni.getSettings({ workspaceId: DEFAULT_WORKSPACE_ID }).ai.customerSendEnabled, true)
    assert.equal(omni.getSettings().ai.customerSendEnabled, false)
    assert.equal(result.audit.sourceRef, `omni_settings:workspace:${DEFAULT_WORKSPACE_ID}`)
  })
})
