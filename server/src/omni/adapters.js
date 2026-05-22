function createMockAdapter(provider) {
  return {
    provider,
    async healthcheck() {
      return { ok: true, provider, mode: 'mock' }
    },
    async listThreads() {
      return []
    },
    async readThread() {
      return null
    },
    async sendMessage() {
      return { ok: false, error: 'write_guard_mock_adapter' }
    },
    async lookupCustomer() {
      return null
    },
    async lookupStock() {
      return null
    },
    async lookupOrder() {
      return null
    },
    async prepareInvoice() {
      return { ok: false, error: 'approval_required' }
    },
    async createPaymentRequest() {
      return { ok: false, error: 'approval_required' }
    },
    async checkPaymentStatus() {
      return { ok: false, error: 'not_connected' }
    },
  }
}

export function createAdapterRegistry() {
  const adapters = new Map([
    ['meta', createMockAdapter('meta')],
    ['tiktok_shop', createMockAdapter('tiktok_shop')],
    ['bigseller', createMockAdapter('bigseller')],
    ['shopee', createMockAdapter('shopee')],
    ['meta_pay_kgp', createMockAdapter('meta_pay_kgp')],
    ['promptpay', createMockAdapter('promptpay')],
  ])

  return {
    get(provider) {
      const adapter = adapters.get(provider)
      if (!adapter) throw new Error(`unknown_provider:${provider}`)
      return adapter
    },
    list() {
      return Array.from(adapters.keys())
    },
  }
}
