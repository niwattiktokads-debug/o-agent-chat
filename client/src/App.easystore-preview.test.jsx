import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./lib/api.js', () => ({
  subscribe: vi.fn(() => () => {}),
  sendMessage: vi.fn(),
  setLeader: vi.fn(),
  setField: vi.fn(),
  sendTyping: vi.fn(),
  onConnectivity: vi.fn((callback) => {
    callback({ online: true })
    return () => {}
  }),
  setIdentity: vi.fn(),
}))

vi.mock('./components/omni/EasyStoreProductPreview.jsx', () => ({
  default: ({ productId, threadId }) => (
    <div data-testid="easystore-preview">preview:{productId}:{threadId}</div>
  ),
}))

describe('App EasyStore preview route', () => {
  beforeEach(() => {
    window.history.pushState(null, '', '/p/easystore/16462646?threadId=thread_1')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, workspaces: [] }), { status: 200 })))
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    window.history.pushState(null, '', '/')
    vi.restoreAllMocks()
  })

  it('renders the public EasyStore product preview instead of the private Omni workbench', async () => {
    vi.resetModules()
    const { default: App } = await import('./App.jsx')

    render(<App />)

    expect(await screen.findByTestId('easystore-preview')).toHaveTextContent('preview:16462646:thread_1')
  })
})
