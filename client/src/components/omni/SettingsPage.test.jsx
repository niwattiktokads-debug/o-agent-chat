import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import SettingsPage from './SettingsPage.jsx'
import { savePolicyAutoSend } from '../../lib/omniApi.js'

const baseSnapshot = {
  pages: [
    {
      id: 'page_annalynn',
      name: 'Anna Lynn',
      workspaceId: 'ws_oagent',
      agentProfileId: 'agent_annalynn',
      policySetId: 'policy_annalynn',
    },
  ],
  agentProfiles: [
    { id: 'agent_annalynn', name: 'Anna AI', provider: 'openai', model: 'gpt-4.1-mini' },
  ],
  policySets: [
    { id: 'policy_annalynn', autoSend: { faq: true, stock: false, price: true, product: false } },
  ],
  knowledgeSources: [
    { id: 'ks_1', title: 'Anna product rules', scope: 'all_pages', workspaceId: 'ws_oagent', content: 'ตอบจากข้อมูลสินค้าเท่านั้น' },
  ],
  platformAccounts: [
    { id: 'acct_anna_fb', pageId: 'page_annalynn', platform: 'facebook', status: 'connected' },
  ],
  pageRuntimeSettings: [],
  connectorHealth: [],
}

vi.mock('../../lib/omniApi.js', () => ({
  clearOmniTestData: async () => ({ ok: true, snapshot: baseSnapshot }),
  fetchOmniGovernanceMatrix: async () => ([]),
  fetchOmniSettings: async () => ({ ai: { enabled: true, customerSendEnabled: false } }),
  fetchOmniSnapshot: async () => baseSnapshot,
  fetchOmniStorageStatus: async () => ({ persistent: true }),
  saveOmniSettings: async (settings) => ({ ok: true, settings }),
  savePolicyAutoSend: vi.fn(async (policySetId, autoSend) => ({
    ok: true,
    policySet: { id: policySetId, autoSend },
    snapshot: {
      ...baseSnapshot,
      policySets: [{ id: policySetId, autoSend }],
    },
  })),
}))

vi.mock('../connections/ConnectionsPage.jsx', () => ({
  default: () => <div>Connections mock</div>,
}))

describe('SettingsPage AI Config', () => {
  it('updates auto-send intent from the AI Config UI and refreshes visible policy state', async () => {
    const onSnapshot = vi.fn()

    render(
      <SettingsPage
        snapshot={baseSnapshot}
        onSnapshot={onSnapshot}
        activeSection="ai-config"
        workspaceId="ws_oagent"
      />,
    )

    const autoSendBlock = await screen.findByText('ตอบอัตโนมัติได้')
    expect(within(autoSendBlock.parentElement).getByText('faq')).toBeInTheDocument()
    expect(screen.getByText('stock')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('สต็อก'))

    await waitFor(() => {
      expect(savePolicyAutoSend).toHaveBeenCalledWith(
        'policy_annalynn',
        expect.objectContaining({ stock: true }),
      )
    })
    expect(await screen.findByText('บันทึก AI auto-send แล้ว')).toBeInTheDocument()
    const refreshedAutoSendBlock = screen.getByText('ตอบอัตโนมัติได้')
    expect(within(refreshedAutoSendBlock.parentElement).getByText('stock')).toBeInTheDocument()
    expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      policySets: [expect.objectContaining({ id: 'policy_annalynn' })],
    }))
  })
})
