import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AiKnowledgeSourcePage from './AiKnowledgeSourcePage.jsx'
import { applyOmniGovernanceAction, deleteKnowledgeSource, saveKnowledgeSource } from '../../lib/omniApi.js'

const apiMocks = vi.hoisted(() => ({
  saveKnowledgeSource: vi.fn(),
  deleteKnowledgeSource: vi.fn(),
  applyOmniGovernanceAction: vi.fn(),
  fetchKnowledgeSources: vi.fn(),
  fetchOmniSnapshot: vi.fn(),
}))

vi.mock('../../lib/omniApi.js', () => ({
  fetchKnowledgeSources: apiMocks.fetchKnowledgeSources,
  fetchOmniSnapshot: apiMocks.fetchOmniSnapshot,
  saveKnowledgeSource: apiMocks.saveKnowledgeSource,
  deleteKnowledgeSource: apiMocks.deleteKnowledgeSource,
  applyOmniGovernanceAction: apiMocks.applyOmniGovernanceAction,
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
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    apiMocks.fetchKnowledgeSources.mockReset()
    apiMocks.fetchOmniSnapshot.mockReset()
    apiMocks.saveKnowledgeSource.mockReset()
    apiMocks.deleteKnowledgeSource.mockReset()
    apiMocks.applyOmniGovernanceAction.mockReset()
    apiMocks.applyOmniGovernanceAction.mockResolvedValue({ ok: true })
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

  it('deletes a knowledge source from the list', async () => {
    apiMocks.fetchKnowledgeSources
      .mockResolvedValueOnce(sources)
      .mockResolvedValueOnce([])
    apiMocks.deleteKnowledgeSource.mockResolvedValue({ ok: true, deletedId: 'ks_return_exchange' })

    render(<AiKnowledgeSourcePage />)

    expect(await screen.findByText('Return and exchange policy')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0])

    await waitFor(() => {
      expect(deleteKnowledgeSource).toHaveBeenCalledWith('ks_return_exchange')
    })
  })

  it('runs governance action with confirm for knowledge sources', async () => {
    apiMocks.fetchKnowledgeSources.mockResolvedValue(sources)

    render(<AiKnowledgeSourcePage />)

    expect(await screen.findByText('Return and exchange policy')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))

    await waitFor(() => {
      expect(applyOmniGovernanceAction).toHaveBeenCalledWith('knowledge_source', 'ks_return_exchange', 'archive')
    })
  })
})
