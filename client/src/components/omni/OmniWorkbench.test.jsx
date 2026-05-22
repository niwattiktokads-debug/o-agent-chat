import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import OmniWorkbench from './OmniWorkbench.jsx'

vi.mock('../../lib/omniApi.js', () => ({
  fetchOmniSnapshot: async () => ({
    pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active' }],
    threads: [{ id: 'thread_1', pageId: 'page_mankynd', platform: 'facebook', status: 'draft_ready', intent: 'stock', risk: 'low' }],
    messages: [{ id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม' }],
    customers: [{ id: 'cust_1', displayName: 'ลูกค้า A' }],
    orders: [],
    aiDecisions: [{ id: 'decision_1', threadId: 'thread_1', confidence: 0.94, action: 'draft_ready' }],
    paymentRequests: [{ id: 'pay_1', threadId: 'thread_1', provider: 'promptpay', status: 'draft', amount: 729, currency: 'THB', approvalRequired: true }],
    connectorHealth: [{ id: 'health_meta', provider: 'meta', status: 'healthy' }],
  }),
  fetchConnectorHealth: async () => [{ provider: 'meta', status: 'healthy' }],
}))

describe('OmniWorkbench', () => {
  it('renders inbox, AI panel, connector health, order desk, and payment desk', async () => {
    render(<OmniWorkbench />)
    expect(await screen.findByText('Omnichannel Inbox')).toBeInTheDocument()
    expect(await screen.findByText('MAN KYND')).toBeInTheDocument()
    expect(await screen.findByText('AI Decision')).toBeInTheDocument()
    expect(await screen.findByText('Connector Health')).toBeInTheDocument()
    expect(await screen.findByText('Order Desk')).toBeInTheDocument()
    expect(await screen.findByText('Payment Desk')).toBeInTheDocument()
  })
})
