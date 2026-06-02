import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import SocialOpsBoard from './SocialOpsBoard.jsx'

const apiMocks = {
  capturePostCf: vi.fn(),
  fetchConnections: vi.fn(),
  fetchLiveSources: vi.fn(),
  fetchMessageVolumeReport: vi.fn(),
  fetchSocialPosts: vi.fn(),
  searchZortProducts: vi.fn(),
}

vi.mock('../../lib/omniApi.js', () => ({
  capturePostCf: (...args) => apiMocks.capturePostCf(...args),
  fetchConnections: (...args) => apiMocks.fetchConnections(...args),
  fetchLiveSources: (...args) => apiMocks.fetchLiveSources(...args),
  fetchMessageVolumeReport: (...args) => apiMocks.fetchMessageVolumeReport(...args),
  fetchSocialPosts: (...args) => apiMocks.fetchSocialPosts(...args),
  searchZortProducts: (...args) => apiMocks.searchZortProducts(...args),
}))

function makeSnapshot(pages = []) {
  return {
    pages,
    threads: [],
    messages: [],
    customers: [],
    orders: [],
    aiDecisions: [],
    paymentRequests: [],
    connectorHealth: [],
  }
}

describe('SocialOpsBoard workspace derivation', () => {
  beforeEach(() => {
    apiMocks.capturePostCf.mockReset()
    apiMocks.fetchConnections.mockReset()
    apiMocks.fetchLiveSources.mockReset()
    apiMocks.fetchSocialPosts.mockReset()
    apiMocks.fetchMessageVolumeReport.mockReset()
    apiMocks.searchZortProducts.mockReset()

    apiMocks.fetchConnections.mockResolvedValue({
      ok: true,
      connections: [
        { id: 'meta_man_kynd', title: 'Meta · MAN KYND', provider: 'meta', pageProfile: 'man_kynd' },
        { id: 'meta_anna_lynn', title: 'Meta · Anna Lynn', provider: 'meta', pageProfile: 'anna_lynn' },
      ],
    })
    apiMocks.fetchSocialPosts.mockResolvedValue({
      ok: true,
      posts: [{ id: 'post_1', message: 'CF test', commentCount: 1, createdTime: '2026-06-01T00:00:00.000Z' }],
    })
    apiMocks.capturePostCf.mockResolvedValue({
      ok: true,
      summary: { parsedCount: 1, draftCount: 1, reviewCount: 0 },
      drafts: [{ id: 'order_1', status: 'draft' }],
      snapshot: makeSnapshot([{ id: 'page_annalynn', name: 'Anna Lynn', workspaceId: 'ws_custom' }]),
    })
    apiMocks.fetchLiveSources.mockResolvedValue({
      ok: true,
      mode: 'fallback_live_post_comment_capture',
      blocker: 'none',
      posts: [],
    })
  })

  it('anna_lynn profile maps to page_annalynn and shows ws_custom workspaceId without capture', async () => {
    const snapshot = makeSnapshot([
      { id: 'page_mankynd', name: 'MAN KYND', workspaceId: 'ws_oagent' },
      { id: 'page_annalynn', name: 'Anna Lynn', workspaceId: 'ws_custom' },
    ])

    render(<SocialOpsBoard mode="post" snapshot={snapshot} onSnapshot={() => {}} onOpenChat={() => {}} />)

    // Wait for posts to load
    await waitFor(() => expect(apiMocks.fetchSocialPosts).toHaveBeenCalled())

    // Change to anna_lynn profile
    const select = screen.getByLabelText('ร้าน / เพจ')
    fireEvent.change(select, { target: { value: 'anna_lynn' } })

    // Wait for posts to reload with new profile
    await waitFor(() => expect(apiMocks.fetchSocialPosts).toHaveBeenCalledWith('anna_lynn', 10))
    expect(await screen.findByText('ws_custom')).toBeInTheDocument()
    expect(apiMocks.capturePostCf).not.toHaveBeenCalled()
  })

  it('unresolved custom profile does not show guessed ws_oagent or capture', async () => {
    // Snapshot has no page matching 'custom_new_page' profileKey
    const snapshot = makeSnapshot([
      { id: 'page_mankynd', name: 'MAN KYND', workspaceId: 'ws_oagent' },
    ])

    // Mock connections to include a custom profile
    apiMocks.fetchConnections.mockResolvedValue({
      ok: true,
      connections: [
        { id: 'meta_man_kynd', title: 'Meta · MAN KYND', provider: 'meta', pageProfile: 'man_kynd' },
        { id: 'meta_custom', title: 'Meta · Custom Page', provider: 'meta', pageProfile: 'custom_new_page' },
      ],
    })

    render(<SocialOpsBoard mode="post" snapshot={snapshot} onSnapshot={() => {}} onOpenChat={() => {}} />)

    await waitFor(() => expect(apiMocks.fetchSocialPosts).toHaveBeenCalled())

    // Change to custom_new_page profile (unresolved)
    const select = screen.getByLabelText('ร้าน / เพจ')
    fireEvent.change(select, { target: { value: 'custom_new_page' } })

    await waitFor(() => expect(apiMocks.fetchSocialPosts).toHaveBeenCalledWith('custom_new_page', 10))
    await waitFor(() => expect(screen.queryByText('ws_oagent')).not.toBeInTheDocument())
    expect(apiMocks.capturePostCf).not.toHaveBeenCalled()
  })

  it('Live CF with anna_lynn sends ws_custom workspaceId', async () => {
    const snapshot = makeSnapshot([
      { id: 'page_mankynd', name: 'MAN KYND', workspaceId: 'ws_oagent' },
      { id: 'page_annalynn', name: 'Anna Lynn', workspaceId: 'ws_custom' },
    ])

    render(<SocialOpsBoard mode="live" snapshot={snapshot} onSnapshot={() => {}} onOpenChat={() => {}} />)

    await waitFor(() => expect(apiMocks.fetchLiveSources).toHaveBeenCalled())

    // Change to anna_lynn profile
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'anna_lynn' } })

    await waitFor(() => {
      const calls = apiMocks.fetchLiveSources.mock.calls
      const lastCall = calls[calls.length - 1]
      expect(lastCall[0]).toBe('anna_lynn')
      expect(lastCall[2]).toBe('ws_custom')
    })
  })

  it('Live CF with unresolved profile does not send workspaceId', async () => {
    const snapshot = makeSnapshot([
      { id: 'page_mankynd', name: 'MAN KYND', workspaceId: 'ws_oagent' },
    ])

    apiMocks.fetchConnections.mockResolvedValue({
      ok: true,
      connections: [
        { id: 'meta_man_kynd', title: 'Meta · MAN KYND', provider: 'meta', pageProfile: 'man_kynd' },
        { id: 'meta_custom', title: 'Meta · Custom', provider: 'meta', pageProfile: 'unknown_profile' },
      ],
    })

    render(<SocialOpsBoard mode="live" snapshot={snapshot} onSnapshot={() => {}} onOpenChat={() => {}} />)

    await waitFor(() => expect(apiMocks.fetchLiveSources).toHaveBeenCalled())

    // Change to unknown_profile
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'unknown_profile' } })

    await waitFor(() => {
      const calls = apiMocks.fetchLiveSources.mock.calls
      const lastCall = calls[calls.length - 1]
      expect(lastCall[0]).toBe('unknown_profile')
      expect(lastCall[2]).toBeUndefined()
    })
  })
})

describe('SocialOpsBoard workspace badge visibility', () => {
  beforeEach(() => {
    apiMocks.capturePostCf.mockReset()
    apiMocks.fetchConnections.mockReset()
    apiMocks.fetchLiveSources.mockReset()
    apiMocks.fetchSocialPosts.mockReset()
    apiMocks.fetchMessageVolumeReport.mockReset()

    apiMocks.fetchConnections.mockResolvedValue({
      ok: true,
      connections: [
        { id: 'meta_man_kynd', title: 'Meta · MAN KYND', provider: 'meta', pageProfile: 'man_kynd' },
      ],
    })
    apiMocks.fetchSocialPosts.mockResolvedValue({ ok: true, posts: [] })
    apiMocks.fetchLiveSources.mockResolvedValue({ ok: true, mode: null, blocker: 'none', posts: [] })
  })

  it('shows workspace badge in Post CF when workspace is resolved', async () => {
    const snapshot = makeSnapshot([
      { id: 'page_mankynd', name: 'MAN KYND', workspaceId: 'ws_oagent' },
    ])

    render(<SocialOpsBoard mode="post" snapshot={snapshot} onSnapshot={() => {}} onOpenChat={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('ws_oagent')).toBeTruthy()
    })
  })

  it('shows workspace badge in Live CF when workspace is resolved', async () => {
    const snapshot = makeSnapshot([
      { id: 'page_mankynd', name: 'MAN KYND', workspaceId: 'ws_oagent' },
    ])

    render(<SocialOpsBoard mode="live" snapshot={snapshot} onSnapshot={() => {}} onOpenChat={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('ws_oagent')).toBeTruthy()
    })
  })
})
