import { afterEach, describe, expect, it, vi } from 'vitest'

describe('fetchEasyStoreProductPreview', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads a product preview from the public EasyStore preview API', async () => {
    vi.resetModules()
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      product: { id: '16462646', title: 'Amanda Jumpsuit' },
      tracking: { pixelId: '401272399141441' },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const { fetchEasyStoreProductPreview } = await import('./omniApi.js')
    const body = await fetchEasyStoreProductPreview('16462646')

    expect(body.product.title).toBe('Amanda Jumpsuit')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/omni/easystore/products/16462646/preview'),
      expect.objectContaining({ credentials: 'include' }),
    )
  })
})
