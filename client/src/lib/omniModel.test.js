import { describe, expect, it } from 'vitest'
import { autoSendStatus, filterThreads, statusLabel } from './omniModel.js'

describe('omniModel', () => {
  it('filters threads by active page', () => {
    const threads = [
      { id: 'thread_1', pageId: 'page_a', status: 'open' },
      { id: 'thread_2', pageId: 'page_b', status: 'open' },
    ]
    expect(filterThreads(threads, { pageId: 'page_a' })).toEqual([{ id: 'thread_1', pageId: 'page_a', status: 'open' }])
  })

  it('returns human status labels', () => {
    expect(statusLabel('needs_approval')).toBe('รออนุมัติ')
    expect(statusLabel('unknown')).toBe('unknown')
  })

  it('marks auto-send active when the page policy enables an intent', () => {
    const status = autoSendStatus({
      settings: { ai: { customerSendEnabled: true } },
      pages: [{ id: 'page_annalynn', policySetId: 'policy_annalynn' }],
      policySets: [{ id: 'policy_annalynn', autoSend: { faq: true, stock: false } }],
      messages: [],
    }, { id: 'thread_1', pageId: 'page_annalynn' })

    expect(status.active).toBe(true)
    expect(status.label).toBe('Auto-send active')
    expect(status.detail).toBe('1 intents enabled')
  })

  it('marks auto-send active when a sent outbound message is recorded', () => {
    const status = autoSendStatus({
      settings: { ai: { customerSendEnabled: true } },
      pages: [{ id: 'page_annalynn', policySetId: 'policy_annalynn' }],
      policySets: [{ id: 'policy_annalynn', autoSend: { faq: false } }],
      messages: [
        { threadId: 'thread_1', direction: 'outbound', sourceRef: 'meta_send:anna_lynn' },
      ],
    }, { id: 'thread_1', pageId: 'page_annalynn' })

    expect(status.active).toBe(true)
    expect(status.label).toBe('Auto-send active')
    expect(status.detail).toBe('sent reply recorded')
  })

  it('shows draft-only when no auto-send policy or sent message exists', () => {
    const status = autoSendStatus({
      settings: { ai: { customerSendEnabled: true } },
      pages: [{ id: 'page_annalynn', policySetId: 'policy_annalynn' }],
      policySets: [{ id: 'policy_annalynn', autoSend: { faq: false } }],
      messages: [
        { threadId: 'thread_1', direction: 'outbound', sourceRef: 'manual_draft:boss', deliveryStatus: 'draft_only' },
      ],
    }, { id: 'thread_1', pageId: 'page_annalynn' })

    expect(status.active).toBe(false)
    expect(status.label).toBe('Draft only')
  })

  it('shows draft-only when customer send guard is off even if policy allows auto-send', () => {
    const status = autoSendStatus({
      settings: { ai: { customerSendEnabled: false } },
      pages: [{ id: 'page_annalynn', policySetId: 'policy_annalynn' }],
      policySets: [{ id: 'policy_annalynn', autoSend: { faq: true } }],
      messages: [],
    }, { id: 'thread_1', pageId: 'page_annalynn' })

    expect(status.active).toBe(false)
    expect(status.label).toBe('Draft only')
    expect(status.detail).toBe('customer send guard is on')
  })
})
