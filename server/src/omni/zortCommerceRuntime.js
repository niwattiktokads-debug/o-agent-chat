import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const DEFAULT_HELPER = process.env.ZORT_HELPER || '/Users/babycuca/.codex/bin/zort-api'

async function defaultRunner(args) {
  const { stdout } = await execFileAsync(DEFAULT_HELPER, args, {
    maxBuffer: 1024 * 1024 * 8,
    env: process.env,
  })
  return JSON.parse(stdout)
}

function normalizeProduct(product = {}) {
  return {
    id: String(product.id || product.productid || ''),
    sku: String(product.sku || ''),
    name: product.name || '',
    sellPrice: Number(product.sellprice ?? product.sellPrice ?? 0),
    stock: Number(product.stock ?? 0),
    availableStock: Number(product.availablestock ?? product.availableStock ?? 0),
    imagePath: product.imagepath || null,
    raw: product,
  }
}

function buildZortOrderBody(order = {}) {
  const amount = Number(order.totalAmount ?? order.total ?? 0)
  return {
    number: order.number || order.id,
    amount,
    status: 'Pending',
    reference: order.sourceRef || `omni:${order.id}`,
    customername: order.customerName || 'Omni Customer',
    customerphone: order.customerPhone || '',
    customeremail: order.customerEmail || '',
    description: `Created from Omni draft ${order.id}`,
    list: (order.items || []).map((item) => ({
      sku: item.sku,
      name: item.name || item.sku,
      number: Number(item.quantity || 1),
      pricepernumber: Number(item.unitPrice || 0),
      totalprice: Number(item.quantity || 1) * Number(item.unitPrice || 0),
    })),
  }
}

function extractProviderOrderId(response) {
  return response?.response?.detail?.id || response?.response?.id || response?.response?.detail?.number || null
}

export function createZortCommerceRuntime({ runner = defaultRunner } = {}) {
  return {
    async searchProducts({ keyword = '', sku = '', limit = 10 } = {}) {
      const args = ['get-products', '--limit', String(limit)]
      if (sku) args.push('--sku', sku)
      else if (keyword) args.push('--keyword', keyword)
      const payload = await runner(args)
      if (!payload?.ok) throw new Error(payload?.error || payload?.reason || 'zort_products_failed')
      return {
        ok: true,
        products: (payload.response?.list || []).map(normalizeProduct),
        count: payload.response?.count || 0,
      }
    },
    async createOrder({ order, uniquenumber, approved = false } = {}) {
      if (!approved) throw new Error('approval_required')
      const dir = mkdtempSync(join(tmpdir(), 'omni-zort-order-'))
      const bodyFile = join(dir, 'order.json')
      try {
        writeFileSync(bodyFile, JSON.stringify(buildZortOrderBody(order), null, 2))
        const args = ['add-order', '--body-file', bodyFile, '--uniquenumber', uniquenumber || order.id, '--approve-write']
        const payload = await runner(args)
        if (!payload?.ok) throw new Error(payload?.error || payload?.reason || 'zort_order_create_failed')
        return {
          ok: true,
          providerOrderId: extractProviderOrderId(payload) || `zort_${order.id}`,
          response: payload.response || payload,
        }
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  }
}
