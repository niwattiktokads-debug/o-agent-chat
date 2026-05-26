import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import OmniWorkbench from './OmniWorkbench.jsx'

vi.mock('../../lib/omniApi.js', () => ({
  fetchOmniSnapshot: async () => ({
    pages: [
      { id: 'page_mankynd', name: 'MAN KYND', status: 'active' },
      { id: 'page_annalynn_tiktok', name: 'AnnaLynn', status: 'active' },
      { id: 'page_fb_112154661515664', name: 'Viris Zamara', status: 'active' },
    ],
    platformAccounts: [
      { id: 'acct_fb_mankynd', pageId: 'page_mankynd', platform: 'facebook' },
      { id: 'acct_tt_shop', pageId: 'page_annalynn_tiktok', platform: 'tiktok' },
      { id: 'acct_fb_vz', pageId: 'page_fb_112154661515664', platform: 'facebook' },
    ],
    threads: [{ id: 'thread_1', pageId: 'page_mankynd', platform: 'facebook', status: 'draft_ready', intent: 'stock', risk: 'low' }],
    messages: [{ id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม' }],
    customers: [{ id: 'cust_1', displayName: 'ลูกค้า A' }],
    orders: [{ id: 'tt_order_1', customerId: 'tt_customer_1', platform: 'tiktok', providerOrderId: '1', status: 'AWAITING_COLLECTION', total: 841.5, currency: 'THB' }],
    aiDecisions: [{ id: 'decision_1', threadId: 'thread_1', confidence: 0.94, action: 'draft_ready' }],
    paymentRequests: [{ id: 'pay_1', threadId: 'thread_1', provider: 'promptpay', status: 'draft', amount: 729, currency: 'THB', approvalRequired: true }],
    connectorHealth: [{ id: 'health_meta', provider: 'meta', status: 'healthy' }],
  }),
  subscribeOmniSnapshots: () => () => {},
  fetchConnectorHealth: async () => [{ provider: 'meta', status: 'healthy' }],
  fetchConnections: async () => ({
    ok: true,
    connections: [
      { id: 'meta_man_kynd', title: 'Meta · MAN KYND', provider: 'meta', pageProfile: 'man_kynd' },
      { id: 'meta_anna_lynn', title: 'Meta · Anna Lynn', provider: 'meta', pageProfile: 'anna_lynn' },
    ],
  }),
  fetchFacebookConversations: async () => ({ threads: [] }),
  syncFacebookConversations: async () => ({
    page: { omniPageId: 'page_mankynd' },
    threads: { inserted: 0, updated: 0 },
    snapshot: {
      pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active' }],
      threads: [],
      messages: [],
      customers: [],
      orders: [],
      aiDecisions: [],
      paymentRequests: [],
      connectorHealth: [],
    },
  }),
  fetchTikTokOrders: async () => ({ totalCount: 0, orders: [] }),
  syncTikTokOrders: async () => ({
    totalCount: 0,
    snapshot: {
      pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active' }],
      threads: [],
      messages: [],
      customers: [],
      orders: [],
      aiDecisions: [],
      paymentRequests: [],
      connectorHealth: [],
    },
  }),
  createAiDraft: async () => ({
    decision: { action: 'draft_ready', confidence: 0.82, draftText: 'เดี๋ยวเช็กสต็อกให้ค่ะ' },
    snapshot: {
      pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active' }],
      threads: [],
      messages: [],
      customers: [],
      orders: [],
      aiDecisions: [],
      paymentRequests: [],
      connectorHealth: [],
    },
  }),
  saveManualReplyDraft: async (threadId, draft) => ({
    ok: true,
    message: {
      id: 'draft_1',
      threadId,
      direction: 'outbound',
      authorName: draft.authorName,
      text: draft.text,
      attachments: draft.attachments || [],
      sourceRef: 'manual_draft',
      createdAt: '2026-05-24T00:00:00.000Z',
      deliveryStatus: 'draft_only',
    },
    snapshot: {
      pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active' }],
      platformAccounts: [{ id: 'acct_fb_mankynd', pageId: 'page_mankynd', platform: 'facebook' }],
      threads: [{ id: 'thread_1', pageId: 'page_mankynd', platform: 'facebook', status: 'draft_ready', intent: 'stock', risk: 'low' }],
      messages: [
        { id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม' },
        { id: 'draft_1', threadId: 'thread_1', direction: 'outbound', authorName: draft.authorName, text: draft.text, sourceRef: 'manual_draft', createdAt: '2026-05-24T00:00:00.000Z' },
      ],
      customers: [{ id: 'cust_1', displayName: 'ลูกค้า A' }],
      orders: [],
      aiDecisions: [],
      paymentRequests: [],
      connectorHealth: [],
    },
  }),
  setPageAutoReply: async (pageId, enabled) => ({
    ok: true,
    snapshot: {
      pages: [{ id: pageId, name: 'MAN KYND', status: 'active', autoReplyEnabled: enabled }],
      platformAccounts: [{ id: 'acct_fb_mankynd', pageId, platform: 'facebook' }],
      threads: [{ id: 'thread_1', pageId, platform: 'facebook', status: 'draft_ready', intent: 'stock', risk: 'low' }],
      messages: [{ id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม' }],
      customers: [{ id: 'cust_1', displayName: 'ลูกค้า A' }],
      orders: [],
      aiDecisions: [],
      paymentRequests: [],
      connectorHealth: [],
    },
  }),
  fetchSocialPosts: async () => ({
    ok: true,
    posts: [{ id: 'post_1', message: 'เปิด CF BLACK-M', commentCount: 1, createdTime: '2026-05-26T00:00:00.000Z' }],
  }),
  capturePostCf: async () => ({
    ok: true,
    summary: { parsedCount: 1, draftCount: 1 },
    drafts: [{ id: 'order_draft_1', status: 'draft', items: [{ sku: 'BLACK-M', quantity: 2 }] }],
    snapshot: {
      pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active' }],
      platformAccounts: [{ id: 'acct_fb_mankynd', pageId: 'page_mankynd', platform: 'facebook' }],
      threads: [{ id: 'thread_1', pageId: 'page_mankynd', platform: 'facebook', status: 'draft_ready', intent: 'stock', risk: 'low' }],
      messages: [{ id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม' }],
      customers: [{ id: 'cust_1', displayName: 'ลูกค้า A' }],
      orders: [{ id: 'order_draft_1', customerId: 'cust_1', platform: 'facebook', status: 'draft', totalAmount: 1180, items: [{ sku: 'BLACK-M', quantity: 2 }] }],
      aiDecisions: [],
      paymentRequests: [],
      connectorHealth: [],
    },
  }),
  fetchLiveSources: async () => ({
    ok: true,
    mode: 'fallback_live_post_comment_capture',
    blocker: 'meta_live_comment_stream_not_available_in_current_helper',
    posts: [{ id: 'live_fallback_1', message: 'Live fallback post', commentCount: 3 }],
  }),
  fetchMessageVolumeReport: async () => ({
    totals: { inbound: 2, outbound: 1, total: 3 },
    byHour: [{ hour: '10', inbound: 2, outbound: 1, total: 3 }],
    byPage: [{ pageId: 'page_mankynd', inbound: 2, outbound: 1, total: 3 }],
  }),
  fetchOmniSettings: async () => ({
    postCf: { enabled: true, autoCreateDrafts: true },
    liveCf: { enabled: true },
    orderDraft: { enabled: true, approvalRequired: true, createZortOrderOnApprove: true },
    ai: { enabled: true },
  }),
  saveOmniSettings: async ({ postCf }) => ({
    ok: true,
    settings: {
      postCf,
      liveCf: { enabled: true },
      orderDraft: { enabled: true, approvalRequired: true, createZortOrderOnApprove: true },
      ai: { enabled: true },
    },
  }),
  searchZortProducts: async () => ({
    ok: true,
    products: [{ id: '637', sku: 'BLACK-M', name: 'Black Shirt M', sellPrice: 590, availableStock: 7 }],
  }),
  createOrderDraft: async () => ({
    ok: true,
    order: { id: 'order_draft_1', status: 'draft', totalAmount: 590, items: [{ sku: 'BLACK-M', quantity: 1 }] },
    snapshot: {
      pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active' }],
      platformAccounts: [{ id: 'acct_fb_mankynd', pageId: 'page_mankynd', platform: 'facebook' }],
      threads: [{ id: 'thread_1', pageId: 'page_mankynd', platform: 'facebook', status: 'draft_ready', intent: 'stock', risk: 'low' }],
      messages: [{ id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม' }],
      customers: [{ id: 'cust_1', displayName: 'ลูกค้า A' }],
      orders: [{ id: 'order_draft_1', customerId: 'cust_1', platform: 'omni', status: 'draft', totalAmount: 590, items: [{ sku: 'BLACK-M', quantity: 1 }] }],
      aiDecisions: [],
      paymentRequests: [],
      connectorHealth: [],
    },
  }),
  approveOrderDraft: async () => ({
    ok: true,
    order: { id: 'order_draft_1', status: 'zort_created', providerOrderId: 'zort_1001' },
  }),
}))

describe('OmniWorkbench', () => {
  it('renders inbox, AI panel, connector health, order desk, and payment desk', async () => {
    render(<OmniWorkbench />)
    expect(await screen.findByText('กล่องรวม')).toBeInTheDocument()
    expect((await screen.findAllByText('MAN KYND')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('AnnaLynn')).length).toBeGreaterThan(0)
    expect(await screen.findByText('tiktok')).toBeInTheDocument()
    expect((await screen.findAllByText('Viris Zamara')).length).toBeGreaterThan(1)
    expect(await screen.findByText('AI ทำอะไรอยู่')).toBeInTheDocument()
    expect(await screen.findByText('ให้ AI ร่าง')).toBeInTheDocument()
    expect(await screen.findByText('AI ร่างคำตอบแล้ว')).toBeInTheDocument()
    expect(await screen.findByText('มั่นใจ 94%')).toBeInTheDocument()
    expect(await screen.findByText('Connector Health')).toBeInTheDocument()
    expect(await screen.findByText('ออเดอร์')).toBeInTheDocument()
    expect(await screen.findByText('ชำระเงิน')).toBeInTheDocument()
    expect(await screen.findByText('TikTok Order Sync')).toBeInTheDocument()
    expect(await screen.findByText('Facebook Live Preview')).toBeInTheDocument()
    expect((await screen.findAllByText('Sync')).length).toBeGreaterThan(1)
  })

  it('lets the operator switch through ZORT-style chat, post, live, report, and setting workflows', async () => {
    render(<OmniWorkbench />)

    expect(await screen.findByRole('button', { name: 'แชท' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'โพสต์' }))

    expect(await screen.findByRole('heading', { name: 'โพสต์' })).toBeInTheDocument()
    expect(await screen.findByText('เปิด CF BLACK-M')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'สร้าง draft จาก CF post_1' }))
    expect(await screen.findByText('สร้าง draft แล้ว 1 รายการ')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'ไลฟ์' }))
    expect(await screen.findByRole('heading', { name: 'ไลฟ์สตรีม' })).toBeInTheDocument()
    expect(await screen.findByText('fallback_live_post_comment_capture')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'รายงาน' }))
    expect(await screen.findByRole('heading', { name: 'รายงานปริมาณการส่งข้อความ' })).toBeInTheDocument()
    expect(await screen.findByText('รวมทั้งหมด')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Export CSV')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่า' }))
    expect(await screen.findByRole('heading', { name: 'ตั้งค่าระบบ' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Post CF enabled')).toBeChecked()
    fireEvent.click(screen.getByLabelText('Post CF enabled'))
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก setting' }))
    expect(await screen.findByText('บันทึก setting แล้ว')).toBeInTheDocument()
  })

  it('shows a guarded order draft workflow beside the active chat', async () => {
    render(<OmniWorkbench />)

    fireEvent.click(await screen.findByRole('button', { name: 'ออเดอร์' }))

    expect(await screen.findByRole('heading', { name: 'คำสั่งซื้อใหม่' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('ค้นสินค้า ZORT'), { target: { value: 'BLACK-M' } })
    fireEvent.click(screen.getByRole('button', { name: 'ค้น ZORT' }))
    expect(await screen.findByText('Black Shirt M')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'เลือก BLACK-M' }))
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก draft ออเดอร์' }))
    expect(await screen.findByText('draft: order_draft_1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve ไป ZORT' }))
    expect(await screen.findByText('ยืนยัน approval ก่อนสร้าง ZORT order')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันสร้าง ZORT order' }))
    expect(await screen.findByText('สร้าง ZORT order แล้ว zort_1001')).toBeInTheDocument()
  })

  it('lets the operator type a manual draft in the selected thread', async () => {
    render(<OmniWorkbench />)
    const draftBox = await screen.findByPlaceholderText(/พิมพ์ข้อความตอบลูกค้า/)

    fireEvent.change(draftBox, { target: { value: 'ตอบจากช่องพิมพ์ใหม่' } })
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก draft' }))

    await waitFor(() => {
      expect(screen.getByText('ตอบจากช่องพิมพ์ใหม่')).toBeInTheDocument()
    })
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })
})
