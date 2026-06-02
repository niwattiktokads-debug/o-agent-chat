import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const LOCAL_HELPER = '/Users/babycuca/.codex/bin/zort-api'
const DEFAULT_API_BASE_URL = 'https://open-api.zortout.com/v4'

function cleanText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function createHelperRunner({ helper = process.env.ZORT_HELPER || LOCAL_HELPER, env = process.env } = {}) {
  return async function helperRunner(args) {
    const { stdout } = await execFileAsync(helper, args, {
      maxBuffer: 1024 * 1024 * 8,
      env,
    })
    return JSON.parse(stdout)
  }
}

function buildQuery(params) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== null && value !== undefined && value !== '') search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

function resolveDirectCredentials(env = process.env) {
  return {
    storeName: env.ZORT_STORE_NAME || '',
    apiKey: env.ZORT_API_KEY || '',
    apiSecret: env.ZORT_API_SECRET || '',
  }
}

function missingDirectCredentials(credentials) {
  return Object.entries(credentials)
    .filter(([, value]) => !String(value || '').trim())
    .map(([key]) => key)
}

function missingCredentialsError({ credentials, helper } = {}) {
  const error = new Error('missing_zort_credentials')
  error.missing = missingDirectCredentials(credentials || {})
  error.helper = helper || null
  return error
}

async function zortApiRequest({ fetchImpl, apiBaseUrl, credentials, method, pathname, query = {}, body = null }) {
  if (typeof fetchImpl !== 'function') throw new Error('zort_fetch_unavailable')
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  const url = `${apiBaseUrl}${cleanPath}${buildQuery(query)}`
  let res
  try {
    res = await fetchImpl(url, {
      method,
      headers: {
        storename: credentials.storeName,
        apikey: credentials.apiKey,
        apisecret: credentials.apiSecret,
        'Content-Type': 'application/json',
      },
      body: body === null || body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    const wrapped = new Error('zort_api_unreachable')
    wrapped.detail = error.message
    throw wrapped
  }

  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    const error = new Error('zort_api_http_error')
    error.status = res.status
    error.response = data
    throw error
  }
  return { ok: true, status: res.status, method, url, response: data }
}

function canUseHelper(helper, env = process.env) {
  return Boolean(env.ZORT_HELPER) || existsSync(helper)
}

async function runHelper(runner, args) {
  const payload = await runner(args)
  if (!payload?.ok) throw new Error(payload?.error || payload?.reason || 'zort_helper_failed')
  return payload
}

function helperConfigured(env = process.env) {
  return env.ZORT_HELPER || LOCAL_HELPER
}

async function defaultRunner(args) {
  const { stdout } = await execFileAsync(helperConfigured(), args, {
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
  const shippingAddress = order.shippingAddress || {}
  const shippingName = cleanText(shippingAddress.recipientName || order.shippingName || order.customerName || 'Omni Customer')
  const shippingPhone = cleanText(shippingAddress.recipientPhone || order.shippingPhone || order.customerPhone)
  const fullShippingAddress = cleanText(shippingAddress.formattedAddress || [
    shippingAddress.addressLine,
    shippingAddress.subDistrict,
    shippingAddress.district,
    shippingAddress.province,
    shippingAddress.postalCode,
  ].filter(Boolean).join(' '))
  return {
    number: order.number || order.id,
    amount,
    status: 'Pending',
    reference: order.sourceRef || `omni:${order.id}`,
    customername: order.customerName || 'Omni Customer',
    customerphone: order.customerPhone || '',
    customeremail: order.customerEmail || '',
    customeraddress: fullShippingAddress,
    shippingname: shippingName,
    shippingphone: shippingPhone,
    shippingemail: order.customerEmail || '',
    shippingaddress: fullShippingAddress,
    shippingchannel: order.shippingMethod || 'ไปรษณีย์ไทย',
    paymentmethod: order.paymentMethod || 'bank_transfer',
    paymentamount: amount,
    saleschannel: order.platform || 'omni',
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

export function createZortCommerceRuntime({
  runner,
  env = process.env,
  fetchImpl = globalThis.fetch,
  apiBaseUrl = env.ZORT_API_BASE_URL || DEFAULT_API_BASE_URL,
  helper = env.ZORT_HELPER || LOCAL_HELPER,
} = {}) {
  const directCredentials = resolveDirectCredentials(env)
  const directReady = missingDirectCredentials(directCredentials).length === 0
  const effectiveRunner = runner || (!directReady && canUseHelper(helper, env) ? createHelperRunner({ helper, env }) : null)

  return {
    async searchProducts({ keyword = '', sku = '', limit = 10 } = {}) {
      if (directReady) {
        const payload = await zortApiRequest({
          fetchImpl,
          apiBaseUrl,
          credentials: directCredentials,
          method: 'GET',
          pathname: '/Product/GetProducts',
          query: { keyword: sku ? '' : keyword, searchsku: sku, page: 1, limit },
        })
        return {
          ok: true,
          products: (payload.response?.list || []).map(normalizeProduct),
          count: payload.response?.count || 0,
        }
      }
      if (!effectiveRunner) throw missingCredentialsError({ credentials: directCredentials, helper })
      const args = ['get-products', '--limit', String(limit)]
      if (sku) args.push('--sku', sku)
      else if (keyword) args.push('--keyword', keyword)
      const payload = await runHelper(effectiveRunner, args)
      return {
        ok: true,
        products: (payload.response?.list || []).map(normalizeProduct),
        count: payload.response?.count || 0,
      }
    },
    async createOrder({ order, uniquenumber, approved = false } = {}) {
      if (!approved) throw new Error('approval_required')
      if (directReady) {
        const payload = await zortApiRequest({
          fetchImpl,
          apiBaseUrl,
          credentials: directCredentials,
          method: 'POST',
          pathname: '/Order/AddOrder',
          query: { uniquenumber: uniquenumber || order.id },
          body: buildZortOrderBody(order),
        })
        return {
          ok: true,
          providerOrderId: extractProviderOrderId(payload) || `zort_${order.id}`,
          response: payload.response || payload,
        }
      }
      if (!effectiveRunner) throw missingCredentialsError({ credentials: directCredentials, helper })
      const dir = mkdtempSync(join(tmpdir(), 'omni-zort-order-'))
      const bodyFile = join(dir, 'order.json')
      try {
        writeFileSync(bodyFile, JSON.stringify(buildZortOrderBody(order), null, 2))
        const args = ['add-order', '--body-file', bodyFile, '--uniquenumber', uniquenumber || order.id, '--approve-write']
        const payload = await runHelper(effectiveRunner, args)
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
