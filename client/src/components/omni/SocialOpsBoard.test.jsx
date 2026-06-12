import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import SocialOpsBoard from './SocialOpsBoard.jsx'

const apiMocks = {
  capturePostSession: vi.fn(),
  fetchConnections: vi.fn(),
  fetchLiveSources: vi.fn(),
  fetchMessageVolumeReport: vi.fn(),
  fetchSocialPosts: vi.fn(),
  searchEasyStoreProducts: vi.fn(),
  searchZortProducts: vi.fn(),
}

vi.mock('../../lib/omniApi.js', () => ({
  capturePostSession: (...args) => apiMocks.capturePostSession(...args),
  fetchConnections: (...args) => apiMocks.fetchConnections(...args),
  fetchLiveSources: (...args) => apiMocks.fetchLiveSources(...args),
  fetchMessageVolumeReport: (...args) => apiMocks.fetchMessageVolumeReport(...args),
  fetchSocialPosts: (...args) => apiMocks.fetchSocialPosts(...args),
  searchEasyStoreProducts: (...args) => apiMocks.searchEasyStoreProducts(...args),
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
    window.localStorage.clear()

    apiMocks.capturePostSession.mockReset()
    apiMocks.fetchConnections.mockReset()
    apiMocks.fetchLiveSources.mockReset()
    apiMocks.fetchSocialPosts.mockReset()
    apiMocks.fetchMessageVolumeReport.mockReset()
    apiMocks.searchEasyStoreProducts.mockReset()
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
      posts: [{ id: 'post_1', message: 'เปิดขาย BLACK-M', commentCount: 1, createdTime: '2026-06-01T00:00:00.000Z' }],
    })
    apiMocks.capturePostSession.mockResolvedValue({
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

  it('searches EasyStore SKU in Post Selling Session instead of ZORT', async () => {
    apiMocks.searchEasyStoreProducts.mockResolvedValue({
      ok: true,
      products: [{ id: 'p_llp', sku: 'llpดำ28', name: 'Lillac Pant', sellPrice: 790, availableStock: 4 }],
    })
    apiMocks.searchZortProducts.mockResolvedValue({ ok: true, products: [] })

    render(<SocialOpsBoard mode="post" snapshot={makeSnapshot()} onSnapshot={() => {}} onOpenChat={() => {}} />)

    await waitFor(() => expect(apiMocks.fetchSocialPosts).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText('ค้นหาสินค้า'), { target: { value: 'llpดำ28' } })
    fireEvent.click(screen.getByRole('button', { name: 'ค้นหา' }))

    await waitFor(() => expect(apiMocks.searchEasyStoreProducts).toHaveBeenCalledWith('llpดำ28', 8))
    expect(apiMocks.searchZortProducts).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: /llpดำ28 · Lillac Pant/ }))
    expect(await screen.findByText('Session rule · llpดำ28')).toBeInTheDocument()
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
    expect(apiMocks.capturePostSession).not.toHaveBeenCalled()
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
    expect(apiMocks.capturePostSession).not.toHaveBeenCalled()
  })

  it('shows only orders linked to the selected post session', async () => {
    const snapshot = {
      ...makeSnapshot([
        { id: 'page_mankynd', name: 'MAN KYND', workspaceId: 'ws_oagent' },
      ]),
      orders: [
        {
          id: 'order_from_post',
          platform: 'facebook',
          status: 'draft',
          sourcePostId: 'post_1',
          totalAmount: 590,
          items: [{ sku: 'BLACK-M', name: 'Black Shirt M' }],
        },
        {
          id: 'tt_order_1',
          platform: 'tiktok',
          status: 'awaiting_shipment',
          total: 729,
        },
      ],
    }

    render(<SocialOpsBoard mode="post" snapshot={snapshot} onSnapshot={() => {}} onOpenChat={() => {}} />)

    expect(await screen.findByRole('heading', { name: 'คำสั่งซื้อ (0)' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /เลือกโพสต์ เปิดขาย BLACK-M/ }))

    expect(await screen.findByRole('heading', { name: 'คำสั่งซื้อ (1)' })).toBeInTheDocument()
    expect(await screen.findByText('order_from_post')).toBeInTheDocument()
    expect(screen.queryByText('tt_order_1')).not.toBeInTheDocument()
  })

  it('persists pinned post per profile and restores it after remount', async () => {
    apiMocks.fetchSocialPosts.mockResolvedValue({
      ok: true,
      posts: [
        { id: 'post_1', message: 'เปิดขาย BLACK-M', commentCount: 1, createdTime: '2026-06-01T00:00:00.000Z' },
        { id: 'post_2', message: 'เปิดขาย BLUE-L', commentCount: 3, createdTime: '2026-06-02T00:00:00.000Z' },
      ],
    })

    const { unmount } = render(<SocialOpsBoard mode="post" snapshot={makeSnapshot()} onSnapshot={() => {}} onOpenChat={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: /เลือกโพสต์ เปิดขาย BLUE-L/ }))
    fireEvent.click(screen.getByRole('button', { name: /ปักหมุดโพสต์ เปิดขาย BLUE-L/ }))

    expect(JSON.parse(window.localStorage.getItem('omni_post_selling_pinned_posts_v1'))).toMatchObject({
      man_kynd: 'post_2',
    })
    expect(await screen.findByText('ปักหมุดใช้งาน')).toBeInTheDocument()

    unmount()
    render(<SocialOpsBoard mode="post" snapshot={makeSnapshot()} onSnapshot={() => {}} onOpenChat={() => {}} />)

    expect((await screen.findAllByText('เชื่อมโพสต์แล้ว')).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /เลิกปักหมุดโพสต์ เปิดขาย BLUE-L/ })).toBeInTheDocument()
  })

  it('keeps long EasyStore product names inside the settings column', async () => {
    const longName = 'Molly Set "ชุดเซ็ตโอเวอร์ไซซ์ เอวยางยืดขอบเรียบ ปลายขาพับใหญ่" เสื้อเชิ้ต+กางเกงเอวยางยืด ผ้าสีลาฟ เบาสบาย สีดำ'
    apiMocks.searchEasyStoreProducts.mockResolvedValue({
      ok: true,
      products: [{ id: '76013338', sku: 'mollyสีดำSize2', name: longName, sellPrice: 990, availableStock: 18 }],
    })

    render(<SocialOpsBoard mode="post" snapshot={makeSnapshot()} onSnapshot={() => {}} onOpenChat={() => {}} />)

    await waitFor(() => expect(apiMocks.fetchSocialPosts).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText('ค้นหาสินค้า'), { target: { value: 'molly' } })
    fireEvent.click(screen.getByRole('button', { name: 'ค้นหา' }))

    const resultButton = await screen.findByRole('button', { name: /mollyสีดำSize2 · Molly Set/ })
    expect(resultButton).toHaveClass('min-w-0')
    expect(resultButton.querySelector('span')).toHaveClass('line-clamp-2', 'break-words')

    fireEvent.click(resultButton)

    const configuredSection = screen.getByRole('heading', { name: 'สินค้าที่ต้องการขาย' }).closest('div')
    const configuredTitle = within(configuredSection).getByText(/mollyสีดำSize2 · Molly Set/)
    expect(configuredTitle).toHaveClass('break-words')
    expect(configuredTitle).not.toHaveClass('truncate')
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
    apiMocks.capturePostSession.mockReset()
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

  it('shows workspace badge in Post Selling Session when workspace is resolved', async () => {
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
