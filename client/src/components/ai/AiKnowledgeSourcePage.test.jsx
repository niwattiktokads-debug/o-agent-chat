import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AiKnowledgeSourcePage from './AiKnowledgeSourcePage.jsx'
import { deleteKnowledgeSource, saveKnowledgeSource } from '../../lib/omniApi.js'

const apiMocks = vi.hoisted(() => ({
  saveKnowledgeSource: vi.fn(),
  deleteKnowledgeSource: vi.fn(),
  fetchKnowledgeSources: vi.fn(),
  fetchOmniSnapshot: vi.fn(),
}))

vi.mock('../../lib/omniApi.js', () => ({
  fetchKnowledgeSources: apiMocks.fetchKnowledgeSources,
  fetchOmniSnapshot: apiMocks.fetchOmniSnapshot,
  saveKnowledgeSource: apiMocks.saveKnowledgeSource,
  deleteKnowledgeSource: apiMocks.deleteKnowledgeSource,
}))

const sources = [
  {
    id: 'ks_return_exchange',
    title: 'Return and exchange policy',
    type: 'manual',
    scope: 'all_pages',
    status: 'ready',
    content: 'สินค้ายังไม่ใช้งานสามารถส่งเรื่องให้แอดมินตรวจสอบการเปลี่ยนหรือคืนได้',
    tags: ['policy', 'refund'],
    updatedAt: '2026-05-23T01:20:00.000Z',
  },
]

describe('AiKnowledgeSourcePage', () => {
  beforeEach(() => {
    apiMocks.fetchKnowledgeSources.mockReset()
    apiMocks.fetchOmniSnapshot.mockReset()
    apiMocks.saveKnowledgeSource.mockReset()
    apiMocks.deleteKnowledgeSource.mockReset()
    apiMocks.fetchOmniSnapshot.mockResolvedValue({
      pages: [
        { id: 'page_annalynn', name: 'Anna Lynn' },
        { id: 'page_annalynn_tiktok', name: 'AnnaLynn' },
      ],
    })
  })

  it('runs a source test from the knowledge list', async () => {
    apiMocks.fetchKnowledgeSources.mockResolvedValue(sources)

    render(<AiKnowledgeSourcePage />)

    expect(await screen.findByText('Return and exchange policy')).toBeInTheDocument()
    expect(await screen.findByText(/7,500,000/)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Test' })[0])

    expect(await screen.findByText(/ใช้ข้อมูลจาก "Return and exchange policy"/)).toBeInTheDocument()
  })

  it('saves a new knowledge source from the form', async () => {
    apiMocks.fetchKnowledgeSources.mockResolvedValue(sources)
    apiMocks.saveKnowledgeSource.mockResolvedValue({
      ok: true,
      source: { ...sources[0], id: 'ks_new', title: 'New FAQ' },
    })

    render(<AiKnowledgeSourcePage />)

    await screen.findByText('Return and exchange policy')
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }))
    fireEvent.change(screen.getByPlaceholderText('Knowledge title'), { target: { value: 'New FAQ' } })
    fireEvent.change(screen.getByPlaceholderText(/Paste trusted answer/), { target: { value: 'ตอบจาก FAQ ใหม่' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save source' }))

    await waitFor(() => {
      expect(saveKnowledgeSource).toHaveBeenCalledWith(expect.objectContaining({
        title: 'New FAQ',
        content: 'ตอบจาก FAQ ใหม่',
      }))
    })
  })

  it('saves a page-scoped source with workspaceId derived from selected page', async () => {
    apiMocks.fetchKnowledgeSources.mockResolvedValue(sources)
    apiMocks.fetchOmniSnapshot.mockResolvedValue({
      pages: [
        { id: 'page_annalynn', name: 'Anna Lynn', workspaceId: 'ws_oagent' },
        { id: 'page_custom', name: 'Custom Page', workspaceId: 'ws_custom' },
      ],
    })
    apiMocks.saveKnowledgeSource.mockResolvedValue({
      ok: true,
      source: { id: 'ks_scoped', title: 'Scoped FAQ', workspaceId: 'ws_custom' },
    })

    render(<AiKnowledgeSourcePage />)

    await screen.findByText('Return and exchange policy')
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }))
    fireEvent.change(screen.getByPlaceholderText('Knowledge title'), { target: { value: 'Scoped FAQ' } })
    fireEvent.change(screen.getByPlaceholderText(/Paste trusted answer/), { target: { value: 'Page-scoped content' } })

    // Select page_custom scope from the scope dropdown (find by option text)
    const scopeSelects = screen.getAllByRole('combobox')
    const scopeSelect = scopeSelects.find((el) => el.querySelector('option[value="all_pages"]'))
    fireEvent.change(scopeSelect, { target: { value: 'page_custom' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save source' }))

    await waitFor(() => {
      expect(saveKnowledgeSource).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Scoped FAQ',
        workspaceId: 'ws_custom',
      }))
    })
  })

  it('deletes a knowledge source from the list', async () => {
    apiMocks.fetchKnowledgeSources
      .mockResolvedValueOnce(sources)
      .mockResolvedValueOnce([])
    apiMocks.deleteKnowledgeSource.mockResolvedValue({ ok: true, deletedId: 'ks_return_exchange' })

    render(<AiKnowledgeSourcePage />)

    expect(await screen.findByText('Return and exchange policy')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(deleteKnowledgeSource).toHaveBeenCalledWith('ks_return_exchange')
    })
  })
})

describe('AiKnowledgeSourcePage workspace reload', () => {
  beforeEach(() => {
    apiMocks.fetchKnowledgeSources.mockReset()
    apiMocks.fetchOmniSnapshot.mockReset()
    apiMocks.saveKnowledgeSource.mockReset()
    apiMocks.deleteKnowledgeSource.mockReset()
  })

  it('reloads sources when workspaceId prop changes and clears stale state', async () => {
    const sourcesWs1 = [{ id: 'ks_1', title: 'WS1 Source', type: 'manual', scope: 'all_pages', status: 'ready', content: 'ws1 content', tags: [], updatedAt: '2026-05-23T01:20:00.000Z' }]
    const sourcesWs2 = [{ id: 'ks_2', title: 'WS2 Source', type: 'manual', scope: 'all_pages', status: 'ready', content: 'ws2 content', tags: [], updatedAt: '2026-05-23T02:00:00.000Z' }]

    apiMocks.fetchKnowledgeSources.mockResolvedValue(sourcesWs1)
    apiMocks.fetchOmniSnapshot.mockResolvedValue({ pages: [{ id: 'page_annalynn', name: 'Anna Lynn', workspaceId: 'ws_1' }] })

    const { rerender } = render(<AiKnowledgeSourcePage workspaceId="ws_1" />)

    expect(await screen.findByText('WS1 Source')).toBeInTheDocument()
    expect(apiMocks.fetchKnowledgeSources).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws_1' }))

    // Change workspace
    apiMocks.fetchKnowledgeSources.mockResolvedValue(sourcesWs2)
    apiMocks.fetchOmniSnapshot.mockResolvedValue({ pages: [{ id: 'page_custom', name: 'Custom', workspaceId: 'ws_2' }] })

    rerender(<AiKnowledgeSourcePage workspaceId="ws_2" />)

    expect(await screen.findByText('WS2 Source')).toBeInTheDocument()
    expect(apiMocks.fetchKnowledgeSources).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws_2' }))
    // Old source should no longer be visible
    expect(screen.queryByText('WS1 Source')).not.toBeInTheDocument()
  })
})
