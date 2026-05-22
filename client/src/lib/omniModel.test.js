import { describe, expect, it } from 'vitest'
import { filterThreads, statusLabel } from './omniModel.js'

describe('omniModel', () => {
  it('filters threads by active page', () => {
    const threads = [
      { id: 'thread_1', pageId: 'page_a', status: 'open' },
      { id: 'thread_2', pageId: 'page_b', status: 'open' },
    ]
    expect(filterThreads(threads, { pageId: 'page_a' })).toEqual([{ id: 'thread_1', pageId: 'page_a', status: 'open' }])
  })

  it('returns human status labels', () => {
    expect(statusLabel('needs_approval')).toBe('Needs approval')
    expect(statusLabel('unknown')).toBe('unknown')
  })
})
