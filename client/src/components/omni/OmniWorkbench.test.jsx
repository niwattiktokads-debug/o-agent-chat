import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import OmniWorkbench from './OmniWorkbench.jsx'

vi.mock('../../lib/omniApi.js', () => ({
  fetchOmniSnapshot: async () => ({
    pages: [
      { id: 'page_mankynd', name: 'MAN KYND', status: 'active' },
      { id: 'page_fb_112154661515664', name: 'VZ', status: 'active' },
    ],
    threads: [{ id: 'thread_1', pageId: 'page_mankynd', platform: 'facebook', status: 'draft_ready', intent: 'stock', risk: 'low' }],
    messages: [{ id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม' }],
    customers: [{ id: 'cust_1', displayName: 'ลูกค้า A' }],
    orders: [{ id: 'tt_order_1', customerId: 'tt_customer_1', platform: 'tiktok', providerOrderId: '1', status: 'AWAITING_COLLECTION', total: 841.5, currency: 'THB' }],
    aiDecisions: [{ id: 'decision_1', threadId: 'thread_1', confidence: 0.94, action: 'draft_ready' }],
    paymentRequests: [{ id: 'pay_1', threadId: 'thread_1', provider: 'promptpay', status: 'draft', amount: 729, currency: 'THB', approvalRequired: true }],
    connectorHealth: [{ id: 'health_meta', provider: 'meta', status: 'healthy' }],
  }),
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
}))

describe('OmniWorkbench', () => {
  it('renders inbox, AI panel, connector health, order desk, and payment desk', async () => {
    render(<OmniWorkbench />)
    expect(await screen.findByText('Omnichannel Inbox')).toBeInTheDocument()
    expect((await screen.findAllByText('MAN KYND')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('VZ')).length).toBeGreaterThan(1)
    expect(await screen.findByText('AI Decision')).toBeInTheDocument()
    expect(await screen.findByText('Connector Health')).toBeInTheDocument()
    expect(await screen.findByText('Order Desk')).toBeInTheDocument()
    expect(await screen.findByText('Recent TikTok Orders')).toBeInTheDocument()
    expect(await screen.findByText('Payment Desk')).toBeInTheDocument()
    expect(await screen.findByText('TikTok Order Sync')).toBeInTheDocument()
    expect(await screen.findByText('Facebook Live Preview')).toBeInTheDocument()
    expect((await screen.findAllByText('Sync')).length).toBeGreaterThan(1)
  })
})
