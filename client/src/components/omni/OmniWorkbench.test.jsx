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
    liveCf: { enabled: true, mode: 'fallback_post_comment_capture' },
    report: { timezone: 'Asia/Bangkok' },
    orderDraft: { enabled: true, approvalRequired: true, createZortOrderOnApprove: true },
    orderAddressIntake: { enabled: true, createConfirmationDraft: true },
    ai: { enabled: true },
  }),
  saveOmniSettings: async (settings) => ({
    ok: true,
    settings,
  }),
  searchZortProducts: async () => ({
    ok: true,
    products: [{ id: '637', sku: 'BLACK-M', name: 'Black Shirt M', sellPrice: 590, availableStock: 7 }],
  }),
  lookupThaiAddressByPostcode: async () => ({
    ok: true,
    postalCode: '10110',
    count: 1,
    suggestions: [{
      key: '10110|กรุงเทพมหานคร|คลองเตย|คลองตัน',
      postalCode: '10110',
      province: 'กรุงเทพมหานคร',
      district: 'คลองเตย',
      subDistrict: 'คลองตัน',
    }],
    source: { package: 'thai-address-universal', provinceCount: 77 },
  }),
  extractOrderAddressFromThread: async () => ({
    ok: true,
    extracted: {
      recipientName: 'ลูกค้า A',
      recipientPhone: '0812345678',
      addressLine: '99/1 ถนนสุขุมวิท',
      postalCode: '10110',
      selectedAddressKey: '10110|กรุงเทพมหานคร|คลองเตย|คลองตัน',
      selectedAddress: {
        key: '10110|กรุงเทพมหานคร|คลองเตย|คลองตัน',
        postalCode: '10110',
        province: 'กรุงเทพมหานคร',
        district: 'คลองเตย',
        subDistrict: 'คลองตัน',
      },
      formattedAddress: '99/1 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพมหานคร 10110',
      readyForDraft: true,
      confidence: 0.95,
      missingFields: [],
    },
    addressLookup: {
      ok: true,
      suggestions: [{
        key: '10110|กรุงเทพมหานคร|คลองเตย|คลองตัน',
        postalCode: '10110',
        province: 'กรุงเทพมหานคร',
        district: 'คลองเตย',
        subDistrict: 'คลองตัน',
      }],
      source: { package: 'thai-address-universal', provinceCount: 77 },
    },
    confirmationText: 'รบกวนตรวจสอบที่อยู่จัดส่งนี้ให้หน่อยค่ะ\nชื่อผู้รับ: ลูกค้า A\nโทร: 0812345678\nที่อยู่: 99/1 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพมหานคร 10110',
    confirmationDraft: {
      message: {
        id: 'draft_address_confirm',
        text: 'รบกวนตรวจสอบที่อยู่จัดส่งนี้ให้หน่อยค่ะ\nชื่อผู้รับ: ลูกค้า A\nโทร: 0812345678\nที่อยู่: 99/1 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพมหานคร 10110',
      },
    },
    snapshot: {
      pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active' }],
      platformAccounts: [{ id: 'acct_fb_mankynd', pageId: 'page_mankynd', platform: 'facebook' }],
      threads: [{ id: 'thread_1', pageId: 'page_mankynd', platform: 'facebook', status: 'draft_ready', intent: 'stock', risk: 'low' }],
      messages: [
        { id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม' },
        { id: 'draft_address_confirm', threadId: 'thread_1', direction: 'outbound', authorName: 'AI', text: 'รบกวนตรวจสอบที่อยู่จัดส่งนี้ให้หน่อยค่ะ', sourceRef: 'ai_address_confirmation_draft' },
      ],
      customers: [{ id: 'cust_1', displayName: 'ลูกค้า A' }],
      orders: [],
      aiDecisions: [],
      paymentRequests: [],
      connectorHealth: [],
    },
  }),
  createOrderDraft: async (input) => ({
    ok: true,
    order: {
      id: 'order_draft_1',
      status: 'draft',
      totalAmount: 590,
      items: [{ sku: 'BLACK-M', quantity: 1 }],
      shippingMethod: input.shippingMethod,
      paymentMethod: input.paymentMethod,
      shippingAddress: {
        ...input.shippingAddress,
        formattedAddress: `${input.shippingAddress.addressLine} แขวง${input.shippingAddress.subDistrict} เขต${input.shippingAddress.district} ${input.shippingAddress.province} ${input.shippingAddress.postalCode}`,
      },
    },
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
  it('renders inbox, AI panel, order desk, and payment desk without system tools in context', async () => {
    render(<OmniWorkbench />)
    expect(await screen.findByText('กล่องรวม')).toBeInTheDocument()
    expect((await screen.findAllByText('MAN KYND')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('AnnaLynn')).length).toBeGreaterThan(0)
    expect(await screen.findByText('tiktok')).toBeInTheDocument()
    expect((await screen.findAllByText('Viris Zamara')).length).toBeGreaterThan(0)
    expect(await screen.findByText('AI ทำอะไรอยู่')).toBeInTheDocument()
    expect(await screen.findByText('ให้ AI ร่าง')).toBeInTheDocument()
    expect(await screen.findByText('AI ร่างคำตอบแล้ว')).toBeInTheDocument()
    expect(await screen.findByText('มั่นใจ 94%')).toBeInTheDocument()
    expect(await screen.findByText('ออเดอร์')).toBeInTheDocument()
    expect(await screen.findByText('ชำระเงิน')).toBeInTheDocument()
    expect(screen.queryByText('Connector Health')).not.toBeInTheDocument()
    expect(screen.queryByText('TikTok Order Sync')).not.toBeInTheDocument()
    expect(screen.queryByText('Facebook Live Preview')).not.toBeInTheDocument()
  })

  it('lets the operator switch through ZORT-style chat, post, live, and report workflows', async () => {
    render(<OmniWorkbench />)

    expect(await screen.findByRole('button', { name: 'แชท' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ตั้งค่า' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'โพสต์' }))

    expect(await screen.findByRole('heading', { name: 'โพสต์' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'ตั้งค่าโพสต์ขาย' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'ข้อความ' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'คำสั่งซื้อ (0)' })).toBeInTheDocument()
    expect(await screen.findByText('ยังไม่มีคำสั่งซื้อจากโพสต์นี้')).toBeInTheDocument()
    expect(screen.queryByText('tt_order_1')).not.toBeInTheDocument()
    expect(await screen.findByText('เปิด CF BLACK-M')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /จับ CF/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /สร้าง draft จาก CF/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /เปิด CF BLACK-M/ }))
    expect((await screen.findAllByText('เชื่อมโพสต์แล้ว')).length).toBeGreaterThan(0)
    fireEvent.change(screen.getByLabelText('ค้นหาสินค้า'), { target: { value: 'BLACK-M' } })
    fireEvent.click(screen.getByRole('button', { name: 'ค้นหา' }))
    fireEvent.click(await screen.findByRole('button', { name: /BLACK-M · Black Shirt M/ }))
    expect(await screen.findByText('CF rule · BLACK-M')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'เปิดการขาย' }))
    expect(await screen.findByText(/บันทึกเป็น session state/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'ไลฟ์' }))
    expect(await screen.findByRole('heading', { name: 'ไลฟ์สตรีม' })).toBeInTheDocument()
    expect(await screen.findByText('fallback_live_post_comment_capture')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'รายงาน' }))
    expect(await screen.findByRole('heading', { name: 'รายงานปริมาณการส่งข้อความ' })).toBeInTheDocument()
    expect(await screen.findByText('รวมทั้งหมด')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Export CSV')).toBeInTheDocument()
  })

  it('shows a guarded order draft workflow beside the active chat', async () => {
    render(<OmniWorkbench />)

    fireEvent.click(await screen.findByRole('button', { name: 'ออเดอร์' }))

    expect(await screen.findByRole('heading', { name: 'คำสั่งซื้อใหม่' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'AI ดึงที่อยู่จากแชท' }))
    expect(await screen.findByText('เติมฟอร์มแล้ว และสร้าง draft ให้ลูกค้าตรวจที่อยู่แล้ว')).toBeInTheDocument()
    expect(await screen.findByText('draft ให้ลูกค้าตรวจที่อยู่')).toBeInTheDocument()
    expect(screen.getByLabelText('ชื่อผู้รับ')).toHaveValue('ลูกค้า A')
    expect(screen.getByLabelText('เบอร์โทร')).toHaveValue('0812345678')
    expect(screen.getByLabelText('บ้านเลขที่ / ถนน / หมู่บ้าน')).toHaveValue('99/1 ถนนสุขุมวิท')
    expect(screen.getByLabelText('รหัสไปรษณีย์')).toHaveValue('10110')
    fireEvent.change(screen.getByLabelText('ค้นสินค้า ZORT'), { target: { value: 'BLACK-M' } })
    fireEvent.click(screen.getByRole('button', { name: 'ค้น ZORT' }))
    expect(await screen.findByText('Black Shirt M')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'เลือก BLACK-M' }))
    expect(await screen.findByText('พบที่อยู่ 1 รายการ · ครอบคลุม 77 จังหวัด')).toBeInTheDocument()
    expect(await screen.findByText('คลองตัน')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก draft ออเดอร์' }))
    expect(await screen.findByText('draft: order_draft_1')).toBeInTheDocument()
    expect((await screen.findAllByText(/99\/1 ถนนสุขุมวิท/)).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Approve ไป ZORT' }))
    expect(await screen.findByText('ยืนยัน approval ก่อนสร้าง ZORT order')).toBeInTheDocument()
    expect((await screen.findAllByText(/ผู้รับ: ลูกค้า A/)).length).toBeGreaterThan(0)
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
