import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from './runtimeConfig.js'
import { subscribeOmniSnapshots } from './omniApi.js'

vi.mock('./runtimeConfig.js', () => ({
  apiFetch: vi.fn(),
  wsUrl: vi.fn(() => 'ws://omni.test/ws'),
}))

vi.mock('./supabaseRealtime.js', () => ({
  isSupabaseRealtimeEnabled: vi.fn(() => false),
  subscribeOmniDatabaseChanges: vi.fn(),
}))

class MockWebSocket {
  static instances = []

  constructor(url) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  close() {
    this.closed = true
    this.onclose?.()
  }
}

describe('subscribeOmniSnapshots', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    MockWebSocket.instances = []
    globalThis.WebSocket = MockWebSocket
    apiFetch.mockReset()
    apiFetch.mockImplementation(async (path) => new Response(JSON.stringify({
      ok: true,
      snapshot: { path },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
  })

  afterEach(() => {
    vi.useRealTimers()
    delete globalThis.WebSocket
  })

  it('polls snapshot as a fallback while websocket subscription is open', async () => {
    const onSnapshot = vi.fn()
    const unsubscribe = subscribeOmniSnapshots(onSnapshot, { workspaceId: 'ws_oagent' })

    expect(MockWebSocket.instances).toHaveLength(1)
    expect(apiFetch).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(5000)

    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(apiFetch).toHaveBeenCalledWith('/api/omni/snapshot?workspaceId=ws_oagent')
    expect(onSnapshot).toHaveBeenCalledWith({ path: '/api/omni/snapshot?workspaceId=ws_oagent' })

    unsubscribe()
    await vi.advanceTimersByTimeAsync(5000)

    expect(apiFetch).toHaveBeenCalledTimes(1)
  })
})
