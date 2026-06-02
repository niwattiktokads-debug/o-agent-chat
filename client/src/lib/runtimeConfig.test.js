import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from './runtimeConfig.js'

describe('runtimeConfig apiFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('includes cross-domain credentials for Railway API calls', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/api/omni/snapshot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://omni-server-production.up.railway.app/api/omni/snapshot',
      {
        credentials: 'include',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      },
    )
  })
})
