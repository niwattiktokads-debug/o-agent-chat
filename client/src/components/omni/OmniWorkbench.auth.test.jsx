import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const snapshot = {
  pages: [{ id: 'page_mankynd', name: 'MAN KYND', status: 'active', autoReplyEnabled: true }],
  platformAccounts: [{ id: 'acct_fb_mankynd', pageId: 'page_mankynd', platform: 'facebook' }],
  threads: [{ id: 'thread_1', pageId: 'page_mankynd', platform: 'facebook', status: 'draft_ready' }],
  messages: [{ id: 'msg_1', threadId: 'thread_1', direction: 'inbound', authorName: 'ลูกค้า A', text: 'มีไซซ์ M สีดำไหม' }],
  customers: [{ id: 'cust_1', displayName: 'ลูกค้า A' }],
  orders: [],
  aiDecisions: [],
  paymentRequests: [],
  connectorHealth: [],
}

describe('OmniWorkbench access gate', () => {
  it('lets the operator log in when the snapshot API requires access', async () => {
    vi.resetModules()
    const fetchOmniSnapshot = vi.fn()
      .mockRejectedValueOnce(new Error('access_password_required'))
      .mockResolvedValueOnce(snapshot)
    const loginOmniAccess = vi.fn(async () => ({ ok: true, authenticated: true }))
    const subscribeOmniSnapshots = vi.fn(() => () => {})

    vi.doMock('../../lib/omniApi.js', async () => {
      const actual = await vi.importActual('../../lib/omniApi.js')
      return {
        ...actual,
        fetchOmniSnapshot,
        loginOmniAccess,
        subscribeOmniSnapshots,
      }
    })

    const { default: OmniWorkbench } = await import('./OmniWorkbench.jsx')
    render(<OmniWorkbench />)

    expect(await screen.findByRole('heading', { name: 'เข้าสู่ระบบ Omni' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('รหัสเข้าใช้งาน'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }))

    await waitFor(() => expect(loginOmniAccess).toHaveBeenCalledWith('secret'))
    expect(await screen.findByText('กล่องรวม')).toBeInTheDocument()
    expect(fetchOmniSnapshot).toHaveBeenCalledTimes(2)
  })
})
