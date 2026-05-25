import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ConnectionsPage from './ConnectionsPage.jsx'
import { fetchConnectionConversations, saveConnectionSecrets, sendConnectionReply, verifyConnection } from '../../lib/omniApi.js'

const apiMocks = vi.hoisted(() => ({
  fetchConnections: vi.fn(),
  fetchConnectionConversations: vi.fn(),
  fetchConnectionThread: vi.fn(),
  createConnectionAiDraft: vi.fn(),
  sendConnectionReply: vi.fn(),
  saveConnectionSecrets: vi.fn(),
  verifyConnection: vi.fn(),
}))

vi.mock('../../lib/omniApi.js', () => ({
  fetchConnections: apiMocks.fetchConnections,
  fetchConnectionConversations: apiMocks.fetchConnectionConversations,
  fetchConnectionThread: apiMocks.fetchConnectionThread,
  createConnectionAiDraft: apiMocks.createConnectionAiDraft,
  sendConnectionReply: apiMocks.sendConnectionReply,
  saveConnectionSecrets: apiMocks.saveConnectionSecrets,
  verifyConnection: apiMocks.verifyConnection,
}))

const payload = {
  ok: true,
  cSnap: { ok: true },
  connections: [
    {
      id: 'meta_anna_lynn',
      title: 'Meta: Anna Lynn',
      provider: 'meta',
      description: 'Facebook Page token and webhook settings',
      helper: '/Users/babycuca/.codex/bin/meta-inbox-api verify --page=anna_lynn',
      group: 'customer_channel',
      status: 'needs_key',
      fields: [
        {
          id: 'page_token',
          label: 'Page token',
          credentialName: 'FB Anna Lynn Page Token -OA',
          secret: true,
          status: 'missing',
        },
      ],
      endpoints: [{
        method: 'GET',
        path: '/me/conversations?fields=id,snippet,senders,updated_time,message_count,unread_count&limit=5',
        purpose: 'ดู inbox conversation ล่าสุดของเพจ',
      }],
      productionNotes: ['ใช้ C Snap เป็น secret store', 'ต้อง verify ก่อนใช้จริง'],
    },
    {
      id: 'omni_ai_gemini',
      title: 'Gemini CLI',
      provider: 'gemini_cli',
      description: 'Local Gemini provider',
      helper: 'omni-ai-reply verify',
      group: 'ai_provider',
      status: 'ready_to_verify',
      fields: [
        {
          id: 'local_profile',
          label: 'Local OAuth profile',
          credentialName: '~/.gemini',
          readOnly: true,
          status: 'configured',
        },
      ],
      productionNotes: ['ใช้ local OAuth ในเครื่องนี้'],
    },
    {
      id: 'zort_open_api',
      title: 'ZORT · Open API',
      provider: 'zort',
      description: 'API-first stock master and order backend for Omni Facebook Order Assist',
      helper: '/Users/babycuca/.codex/bin/zort-api',
      group: 'commerce_backend',
      status: 'needs_key',
      fields: [
        {
          id: 'store_name',
          label: 'Store name',
          credentialName: 'ZORT Store Name -OA',
          secret: false,
          status: 'missing',
        },
        {
          id: 'api_key',
          label: 'API key',
          credentialName: 'ZORT API Key -OA',
          secret: true,
          status: 'missing',
        },
        {
          id: 'api_secret',
          label: 'API secret',
          credentialName: 'ZORT API Secret -OA',
          secret: true,
          status: 'missing',
        },
      ],
      endpoints: [{
        method: 'POST',
        path: '/Product/DecreaseProductStockList',
        purpose: 'ตัดสต็อกจริงหลังแอดมินอนุมัติ',
      }],
      productionNotes: ['create order / decrease stock ต้องมี approval guard'],
    },
  ],
}

describe('ConnectionsPage', () => {
  beforeEach(() => {
    apiMocks.fetchConnections.mockReset()
    apiMocks.fetchConnectionConversations.mockReset()
    apiMocks.fetchConnectionThread.mockReset()
    apiMocks.createConnectionAiDraft.mockReset()
    apiMocks.sendConnectionReply.mockReset()
    apiMocks.saveConnectionSecrets.mockReset()
    apiMocks.verifyConnection.mockReset()
    apiMocks.fetchConnections.mockResolvedValue(payload)
    apiMocks.fetchConnectionConversations.mockResolvedValue({
      ok: true,
      conversations: [{
        id: 't_test_1',
        customerName: 'Niwat Eakratchadakron',
        snippet: 'เทส',
        unreadCount: 1,
        messageCount: 3,
      }],
    })
    apiMocks.fetchConnectionThread.mockResolvedValue({
      ok: true,
      messages: [{ id: 'm1', direction: 'inbound', authorName: 'Niwat', text: 'เทส' }],
    })
    apiMocks.createConnectionAiDraft.mockResolvedValue({
      ok: true,
      decision: { draftText: 'รับทราบค่ะ เดี๋ยวช่วยดูให้ค่ะ' },
    })
    apiMocks.sendConnectionReply.mockResolvedValue({ ok: true, sent: true })
  })

  it('renders connection groups and secure fields', async () => {
    render(<ConnectionsPage />)

    expect(await screen.findByText('การเชื่อมต่อและ API')).toBeInTheDocument()
    expect(screen.getByText('Meta: Anna Lynn')).toBeInTheDocument()
    expect(screen.getByText('Gemini CLI')).toBeInTheDocument()
    expect(screen.getByText('ZORT · Open API')).toBeInTheDocument()
    expect(screen.getByText('/me/conversations?fields=id,snippet,senders,updated_time,message_count,unread_count&limit=5')).toBeInTheDocument()
    expect(screen.getByText('/Product/DecreaseProductStockList')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('วางค่า API key หรือ token')).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'เปิด' })[0])
    expect(screen.getByPlaceholderText('วางค่า API key หรือ token')).toHaveAttribute('type', 'password')
    fireEvent.click(screen.getAllByRole('button', { name: 'เปิด' })[0])
    expect(screen.getByPlaceholderText('จัดการจาก local profile')).toBeDisabled()
  })

  it('saves a changed credential and clears the input', async () => {
    apiMocks.saveConnectionSecrets.mockResolvedValue({ ok: true, savedCount: 1 })
    apiMocks.fetchConnections
      .mockResolvedValueOnce(payload)
      .mockResolvedValueOnce({
        ...payload,
        connections: [{
          ...payload.connections[0],
          status: 'ready_to_verify',
          fields: [{ ...payload.connections[0].fields[0], status: 'configured' }],
        }],
      })

    render(<ConnectionsPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'ขยายทั้งหมด' }))
    const input = (await screen.findAllByPlaceholderText('วางค่า API key หรือ token'))[0]
    fireEvent.change(input, { target: { value: 'secret-token' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'บันทึก key' })[0])

    await waitFor(() => {
      expect(saveConnectionSecrets).toHaveBeenCalledWith('meta_anna_lynn', { page_token: 'secret-token' })
    })
    expect(await screen.findByText('saved 1 credential(s)')).toBeInTheDocument()
  })

  it('verifies a provider and displays the latest result', async () => {
    apiMocks.verifyConnection.mockResolvedValue({ ok: true, status: 'healthy', summary: 'verified meta' })

    render(<ConnectionsPage />)

    await screen.findByText('Meta: Anna Lynn')
    fireEvent.click(screen.getAllByRole('button', { name: 'Verify' })[0])

    await waitFor(() => {
      expect(verifyConnection).toHaveBeenCalledWith('meta_anna_lynn')
    })
    expect(await screen.findByText(/verified meta/)).toBeInTheDocument()
  })

  it('loads latest Meta conversations, opens a thread, and drafts without sending', async () => {
    render(<ConnectionsPage />)

    await screen.findByText('Meta: Anna Lynn')
    fireEvent.click(screen.getAllByRole('button', { name: 'เปิด' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'ดูแชทล่าสุด' }))

    expect(await screen.findByText('Niwat Eakratchadakron')).toBeInTheDocument()
    expect((await screen.findAllByText('เทส')).length).toBeGreaterThan(0)
    fireEvent.click(await screen.findByRole('button', { name: 'AI ร่างตอบ' }))

    expect(fetchConnectionConversations).toHaveBeenCalledWith('meta_anna_lynn', 5)
    expect(await screen.findByText('รับทราบค่ะ เดี๋ยวช่วยดูให้ค่ะ')).toBeInTheDocument()
    expect(screen.getByText(/ยังไม่ส่งจริง/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ส่งจริง' }))
    expect(screen.getByRole('button', { name: 'ยืนยันส่งจริง' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันส่งจริง' }))
    await waitFor(() => {
      expect(sendConnectionReply).toHaveBeenCalledWith('meta_anna_lynn', 't_test_1', 'รับทราบค่ะ เดี๋ยวช่วยดูให้ค่ะ')
    })
  })
})
