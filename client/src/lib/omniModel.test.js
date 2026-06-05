import { describe, expect, it } from 'vitest'
import { aiApprovalQueue, autoSendStatus, filterThreads, statusLabel } from './omniModel.js'

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
    expect(statusLabel('open', { platform: 'easystore', kind: 'order_event' })).toBe('ออเดอร์อัปเดต')
    expect(statusLabel('open', { platform: 'easystore', kind: 'product_event' })).toBe('สินค้าอัปเดต')
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

  it('returns only unresolved latest AI needs approval decisions', () => {
    const queue = aiApprovalQueue({
      threads: [
        { id: 'thread_pending', pageId: 'page_annalynn', updatedAt: '2026-06-05T10:00:00.000Z' },
        { id: 'thread_resolved', pageId: 'page_annalynn', updatedAt: '2026-06-05T10:01:00.000Z' },
        { id: 'thread_superseded', pageId: 'page_annalynn', updatedAt: '2026-06-05T10:02:00.000Z' },
      ],
      messages: [
        { id: 'sent_after_approval', threadId: 'thread_resolved', direction: 'outbound', deliveryStatus: 'sent', sourceRef: 'meta_send:anna_lynn', createdAt: '2026-06-05T10:04:00.000Z' },
      ],
      aiDecisions: [
        { id: 'decision_pending', threadId: 'thread_pending', action: 'needs_approval', intent: 'productImage', reason: 'image_attachment_required', createdAt: '2026-06-05T10:05:00.000Z' },
        { id: 'decision_resolved', threadId: 'thread_resolved', action: 'needs_approval', intent: 'stock', createdAt: '2026-06-05T10:03:00.000Z' },
        { id: 'decision_old', threadId: 'thread_superseded', action: 'needs_approval', intent: 'stock', createdAt: '2026-06-05T10:02:00.000Z' },
        { id: 'decision_new', threadId: 'thread_superseded', action: 'draft_ready', intent: 'stock', createdAt: '2026-06-05T10:06:00.000Z' },
      ],
    })

    expect(queue).toHaveLength(1)
    expect(queue[0].thread.id).toBe('thread_pending')
    expect(queue[0].decision.id).toBe('decision_pending')
    expect(queue[0].reason).toBe('image_attachment_required')
  })
})
