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
