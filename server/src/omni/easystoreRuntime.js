import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import { buildMetaCatalogFeed } from './easystoreMetaFeed.js'

const execFileAsync = promisify(execFile)
const LOCAL_HELPER = '/Users/babycuca/.codex/bin/easystore-api'
const DEFAULT_META_PIXEL_ID = '401272399141441'

function buildQuery(params) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== null && value !== undefined && value !== '') search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

function normalizeShop(shop) {
  const value = String(shop || '').trim()
  if (!value) return null
  const withScheme = value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`
  const url = new URL(withScheme)
  return `${url.protocol}//${url.host}`
}

function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeSearchText(value) {
  return cleanText(value).toLowerCase()
}

function normalizeSkuText(value) {
  return normalizeSearchText(value).replace(/\s+/g, '')
}

function numberOrNull(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatMoney(amount, currency = 'THB') {
  if (!Number.isFinite(amount)) return ''
  try {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount}`
  }
}

function resolvePixelId(env = process.env) {
  return String(env.OMNI_META_PIXEL_ID || env.META_PIXEL_ID || env.META_DATASET_ID || DEFAULT_META_PIXEL_ID).trim()
}

function resolveCatalogProductUrlBase(shopBase, env = process.env) {
  return String(env.META_CATALOG_PRODUCT_URL_BASE || env.EASY_STORE_PUBLIC_URL || env.EASY_STORE_SHOP || shopBase || 'https://annalynna.easy.co').trim()
}

function resolveDirectCredentials(env = process.env) {
  return {
    shop: env.EASY_STORE_SHOP || '',
    accessToken: env.EASY_STORE_ACCESS_TOKEN || '',
    clientId: env.EASY_STORE_CLIENT_ID || '',
    clientSecret: env.EASY_STORE_CLIENT_SECRET || '',
  }
}

function missingDirectCredentials(credentials) {
  return Object.entries(credentials)
    .filter(([, value]) => !String(value || '').trim())
    .map(([key]) => key)
}

function missingCredentialsError({ credentials, helper } = {}) {
  const error = new Error('missing_easystore_credentials')
  error.missing = missingDirectCredentials(credentials || {})
  error.helper = helper || null
  return error
}

function canUseHelper(helper, env = process.env) {
  return Boolean(env.EASYSTORE_HELPER || env.EASY_STORE_HELPER) || existsSync(helper)
}

function createHelperRunner({ helper, env = process.env } = {}) {
  return async function helperRunner(args) {
    const { stdout } = await execFileAsync(helper, args, {
      maxBuffer: 1024 * 1024 * 8,
      env,
    })
    return JSON.parse(stdout)
  }
}

async function runHelper(runner, args) {
  const payload = await runner(args)
  if (!payload?.ok) throw new Error(payload?.error || payload?.reason || payload?.response?.error?.message || 'easystore_helper_failed')
  return payload
}

async function easyStoreApiRequest({ fetchImpl, credentials, method, pathname, query = {}, body = null }) {
  if (typeof fetchImpl !== 'function') throw new Error('easystore_fetch_unavailable')
  const shopBase = normalizeShop(credentials.shop)
  if (!shopBase) throw missingCredentialsError({ credentials })
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  const apiPath = cleanPath.startsWith('/api/3.0/') ? cleanPath : `/api/3.0${cleanPath}`
  const url = `${shopBase}${apiPath}${buildQuery(query)}`
  let res
  try {
    res = await fetchImpl(url, {
      method,
      headers: {
        'EasyStore-Access-Token': credentials.accessToken,
        'Content-Type': 'application/json',
      },
      body: body === null || body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    const wrapped = new Error('easystore_api_unreachable')
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
    const error = new Error(data?.error?.message || data?.error || 'easystore_api_http_error')
    error.status = res.status
    error.response = data
    error.url = url
    throw error
  }
  return {
    ok: true,
    status: res.status,
    method,
    url,
    response: data,
    rateLimit: {
      remaining: res.headers.get('X-RateLimit-Remaining'),
      limit: res.headers.get('X-RateLimit-Limit'),
    },
  }
}

function unwrapProduct(payload) {
  return payload?.response?.product
    || payload?.response?.data?.product
    || payload?.response?.data
    || payload?.response
    || payload?.product
    || payload?.data?.product
    || payload?.data
    || null
}

function unwrapProducts(payload) {
  const products = payload?.response?.products
    || payload?.response?.data?.products
    || payload?.response?.data
    || payload?.products
    || payload?.data?.products
    || payload?.data
    || []
  return Array.isArray(products) ? products : []
}

function unwrapOrder(payload) {
  return payload?.response?.order
    || payload?.response?.data?.order
    || payload?.response?.data
    || payload?.response
    || payload?.order
    || payload?.data?.order
    || payload?.data
    || null
}

function imageUrl(image = {}) {
  return image.url || image.src || image.image_url || image.imageUrl || image.path || ''
}

function variantQuantity(variant = {}) {
  return numberOrNull(variant.inventory_quantity ?? variant.quantity ?? variant.stock ?? variant.available_quantity) ?? 0
}

function variantPrice(variant = {}) {
  return numberOrNull(variant.price ?? variant.sell_price ?? variant.sellPrice ?? variant.unitPrice)
}

function normalizeVariant(variant = {}, imageById = new Map(), currency = 'THB') {
  const quantity = variantQuantity(variant)
  const price = variantPrice(variant)
  const linkedImage = imageById.get(String(variant.image_id || variant.imageId || ''))
  const options = [
    variant.option1,
    variant.option2,
    variant.option3,
    variant.color,
    variant.size,
    ...(Array.isArray(variant.options) ? variant.options : []),
    ...(Array.isArray(variant.option_values) ? variant.option_values.map((item) => item?.value || item?.name || item) : []),
  ].map(cleanText).filter(Boolean)
  return {
    id: String(variant.id || variant.variant_id || ''),
    sku: String(variant.sku || ''),
    title: cleanText(variant.title || variant.name || variant.options || ''),
    options,
    price: {
      amount: price,
      currency,
      formatted: price === null ? '' : formatMoney(price, currency),
    },
    quantity,
    stockStatus: quantity > 0 ? 'in_stock' : 'out_of_stock',
    enabled: variant.is_enabled !== false && variant.enabled !== false,
    imageUrl: linkedImage?.url || '',
  }
}

function variantAttribute(variant = {}, type = '') {
  const explicit = cleanText(variant[type])
  if (explicit) return explicit
  const options = Array.isArray(variant.options) ? variant.options : []
  if (type === 'color' && options[0]) return cleanText(options[0])
  if (type === 'size' && options[1]) return cleanText(options[1])
  const parts = cleanText(variant.title).split(/[\/,|·]/).map((part) => part.trim()).filter(Boolean)
  if (type === 'color') return parts[0] || ''
  if (type === 'size') return parts[1] || ''
  return ''
}

function normalizeImages(images = []) {
  return (Array.isArray(images) ? images : [])
    .map((image) => ({
      id: String(image.id || ''),
      url: imageUrl(image),
      alt: cleanText(image.alt || image.title || ''),
      width: numberOrNull(image.width),
      height: numberOrNull(image.height),
    }))
    .filter((image) => image.url)
}

function resolveProductPrice(product = {}, variants = []) {
  const prices = [
    numberOrNull(product.min_price),
    numberOrNull(product.price),
    ...variants.map((variant) => variant.price.amount),
  ].filter((value) => Number.isFinite(value) && value > 0)
  return prices.length ? Math.min(...prices) : null
}

function normalizeProductPreview(product = {}, { shopBase, pixelId } = {}) {
  const currency = product.currency || 'THB'
  const images = normalizeImages(product.images)
  const imageById = new Map(images.map((image) => [image.id, image]))
  const variants = (Array.isArray(product.variants) ? product.variants : []).map((variant) => normalizeVariant(variant, imageById, currency))
  const totalQuantity = numberOrNull(product.total_quantity) ?? variants.reduce((sum, variant) => sum + Number(variant.quantity || 0), 0)
  const amount = resolveProductPrice(product, variants)
  const handle = String(product.handle || '').trim()
  const storefrontUrl = shopBase && handle ? `${shopBase}/products/${encodeURIComponent(handle)}` : ''

  return {
    ok: true,
    product: {
      id: String(product.id || product.product_id || ''),
      handle,
      title: cleanText(product.title || product.name || ''),
      descriptionText: cleanText(product.description || product.body_html || product.note || ''),
      price: {
        amount,
        currency,
        formatted: amount === null ? '' : formatMoney(amount, currency),
      },
      stock: {
        totalQuantity,
        status: totalQuantity > 0 ? 'in_stock' : 'out_of_stock',
      },
      images,
      variants,
      links: {
        storefrontUrl,
      },
    },
    tracking: {
      pixelId: pixelId || '',
    },
  }
}

function normalizeProductSearchRows(products = [], { shopBase } = {}) {
  const rows = []
  for (const product of products) {
    const preview = normalizeProductPreview(product, { shopBase, pixelId: '' }).product
    const fallbackVariant = {
      id: '',
      sku: '',
      title: preview.title,
      quantity: preview.stock.totalQuantity,
      price: preview.price,
      imageUrl: preview.images[0]?.url || '',
    }
    for (const variant of (preview.variants.length ? preview.variants : [fallbackVariant])) {
      rows.push({
        id: variant.id || preview.id,
        productId: preview.id,
        variantId: variant.id || '',
        sku: variant.sku || String(variant.id || preview.id),
        name: [preview.title, variant.title && variant.title !== preview.title ? variant.title : ''].filter(Boolean).join(' · '),
        productName: preview.title,
        variantTitle: variant.title || '',
        color: variantAttribute(variant, 'color'),
        size: variantAttribute(variant, 'size'),
        sellPrice: variant.price?.amount ?? preview.price.amount ?? 0,
        unitPrice: variant.price?.amount ?? preview.price.amount ?? 0,
        stock: variant.quantity ?? preview.stock.totalQuantity,
        availableStock: variant.quantity ?? preview.stock.totalQuantity,
        imageUrl: variant.imageUrl || preview.images[0]?.url || '',
        storefrontUrl: preview.links.storefrontUrl || '',
      })
    }
  }
  return rows
}

function scoreProductSearchRow(row = {}, { keyword = '', sku = '' } = {}) {
  const cleanKeyword = normalizeSearchText(keyword)
  const cleanSku = normalizeSkuText(sku)
  const rowSku = normalizeSkuText(row.sku)
  const rowText = normalizeSearchText([row.name, row.productName, row.productId, row.variantId].filter(Boolean).join(' '))
  const rowSkuText = normalizeSkuText([row.sku, row.productId, row.variantId].filter(Boolean).join(' '))
  let score = 0

  if (cleanSku) {
    if (rowSku === cleanSku) score += 100
    else if (rowSku.startsWith(cleanSku) || cleanSku.startsWith(rowSku)) score += 85
    else if (rowSkuText.includes(cleanSku) || cleanSku.includes(rowSku)) score += 70
  }
  if (cleanKeyword) {
    const compactKeyword = normalizeSkuText(cleanKeyword)
    if (rowSku === compactKeyword) score += 80
    else if (rowSkuText.includes(compactKeyword) || compactKeyword.includes(rowSku)) score += 55
    if (rowText.includes(cleanKeyword)) score += 35
  }
  return score
}

function rankProductSearchRows(rows = [], search = {}) {
  const hasSearch = Boolean(normalizeSearchText(search.keyword) || normalizeSkuText(search.sku))
  if (!hasSearch) return rows
  return rows
    .map((row, index) => ({ row, index, score: scoreProductSearchRow(row, search) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.row)
}

function orderShippingAddress(order = {}) {
  const shippingAddress = order.shippingAddress || {}
  const formattedAddress = cleanText(shippingAddress.formattedAddress || [
    shippingAddress.addressLine,
    shippingAddress.subDistrict,
    shippingAddress.district,
    shippingAddress.province,
    shippingAddress.postalCode,
  ].filter(Boolean).join(' '))
  return {
    name: cleanText(shippingAddress.recipientName || order.customerName || 'Omni Customer'),
    phone: cleanText(shippingAddress.recipientPhone || order.customerPhone || ''),
    address1: formattedAddress,
    zip: cleanText(shippingAddress.postalCode || ''),
    city: cleanText(shippingAddress.district || ''),
    province: cleanText(shippingAddress.province || ''),
    country: cleanText(shippingAddress.country || 'ไทย'),
  }
}

function buildEasyStoreOrderBody(order = {}) {
  const shippingAddress = orderShippingAddress(order)
  return {
    order: {
      email: order.customerEmail || '',
      phone: order.customerPhone || shippingAddress.phone,
      currency: order.currency || 'THB',
      financial_status: 'pending',
      fulfillment_status: 'unfulfilled',
      note: `Created from Omni draft ${order.id}`,
      source_name: order.platform || 'omni',
      line_items: (order.items || []).map((item) => ({
        variant_id: item.easyStoreVariantId || undefined,
        product_id: item.easyStoreProductId || undefined,
        sku: item.sku || undefined,
        title: item.name || item.sku || 'สินค้า',
        quantity: Number(item.quantity || 1),
        price: Number(item.unitPrice || 0),
      })),
      shipping_address: shippingAddress,
      billing_address: shippingAddress,
      transactions: [{
        kind: 'sale',
        status: 'pending',
        amount: Number(order.totalAmount || 0),
        gateway: order.paymentMethod || 'bank_transfer',
      }],
    },
  }
}

function extractProviderOrderId(payload) {
  const order = unwrapOrder(payload)
  return order?.id || order?.order_id || order?.order_number || order?.name || null
}

export function createEasyStoreRuntime({
  runner,
  env = process.env,
  fetchImpl = globalThis.fetch,
  helper = env.EASYSTORE_HELPER || env.EASY_STORE_HELPER || LOCAL_HELPER,
} = {}) {
  const directCredentials = resolveDirectCredentials(env)
  const directReady = missingDirectCredentials(directCredentials).length === 0
  const effectiveRunner = runner || (!directReady && canUseHelper(helper, env) ? createHelperRunner({ helper, env }) : null)
  const shopBase = normalizeShop(directCredentials.shop || env.EASY_STORE_SHOP || env.EASYSTORE_SHOP || 'https://annalynna.easy.co')

  async function listProducts({ limit = 250, page = 1, sku = '' } = {}) {
    if (directReady) {
      const payload = await easyStoreApiRequest({
        fetchImpl,
        credentials: directCredentials,
        method: 'GET',
        pathname: '/products.json',
        query: { page, limit, skus: sku },
      })
      return {
        ok: true,
        mode: 'storefront_api_ready',
        status: payload.status,
        endpoint: 'GET /products.json',
        products: unwrapProducts(payload),
        rateLimit: payload.rateLimit,
      }
    }
    if (!effectiveRunner) throw missingCredentialsError({ credentials: directCredentials, helper })
    const payload = await runHelper(effectiveRunner, ['raw', 'GET', `/products.json${buildQuery({ page, limit, skus: sku })}`])
    return {
      ok: true,
      mode: 'local_helper_ready',
      endpoint: 'GET /products.json',
      products: unwrapProducts(payload),
    }
  }

  return {
    async verify({ limit = 1 } = {}) {
      const payload = await listProducts({ limit })
      return {
        ok: true,
        mode: payload.mode,
        status: payload.status,
        endpoint: 'GET /products.json',
        productCount: payload.products.length,
        rateLimit: payload.rateLimit,
      }
    },
    listProducts,
    async searchProducts({ keyword = '', sku = '', limit = 10 } = {}) {
      const cleanKeyword = normalizeSearchText(keyword)
      const cleanSku = normalizeSkuText(sku)
      const requestedLimit = Number(limit || 10)
      const pageLimit = Math.max(Math.min(requestedLimit, 50), 50)
      const maxPages = Math.max(1, Number(env.EASY_STORE_PRODUCT_SEARCH_MAX_PAGES || 8))
      const hasSearch = Boolean(cleanKeyword || cleanSku)
      const rows = []

      if (cleanSku) {
        const skuPayload = await listProducts({ limit: Math.max(Math.min(requestedLimit, 50), 1), page: 1, sku })
        const ranked = rankProductSearchRows(normalizeProductSearchRows(skuPayload.products, { shopBase }), { keyword, sku })
        if (ranked.length) {
          return {
            ok: true,
            products: ranked.slice(0, requestedLimit),
            count: ranked.length,
          }
        }
      }

      for (let page = 1; page <= (hasSearch ? maxPages : 1); page += 1) {
        const payload = await listProducts({ limit: pageLimit, page })
        rows.push(...normalizeProductSearchRows(payload.products, { shopBase }))
        if (!hasSearch || payload.products.length < pageLimit) break
        const ranked = rankProductSearchRows(rows, { keyword, sku })
        const exactSkuMatches = cleanSku ? ranked.filter((row) => normalizeSkuText(row.sku) === cleanSku) : []
        if (exactSkuMatches.length >= requestedLimit) break
      }

      const filtered = rankProductSearchRows(rows, { keyword, sku })
      return {
        ok: true,
        products: filtered.slice(0, requestedLimit),
        count: filtered.length,
      }
    },
    async createOrder({ order, uniquenumber, approved = false } = {}) {
      if (!approved) throw new Error('approval_required')
      const body = buildEasyStoreOrderBody(order)
      if (directReady) {
        const payload = await easyStoreApiRequest({
          fetchImpl,
          credentials: directCredentials,
          method: 'POST',
          pathname: '/orders.json',
          body,
        })
        return {
          ok: true,
          providerOrderId: extractProviderOrderId(payload) || `es_${order.id}`,
          response: payload.response || payload,
        }
      }
      if (!effectiveRunner) throw missingCredentialsError({ credentials: directCredentials, helper })
      const payload = await runHelper(effectiveRunner, ['raw', 'POST', '/orders.json', JSON.stringify(body), '--approve-write'])
      return {
        ok: true,
        providerOrderId: extractProviderOrderId(payload) || `es_${uniquenumber || order.id}`,
        response: payload.response || payload,
      }
    },
    async getProductPreview({ productId, pixelId = resolvePixelId(env) } = {}) {
      const cleanProductId = String(productId || '').trim()
      if (!cleanProductId) throw new Error('easystore_product_id_required')
      let payload
      if (directReady) {
        payload = await easyStoreApiRequest({
          fetchImpl,
          credentials: directCredentials,
          method: 'GET',
          pathname: `/products/${encodeURIComponent(cleanProductId)}.json`,
        })
      } else {
        if (!effectiveRunner) throw missingCredentialsError({ credentials: directCredentials, helper })
        payload = await runHelper(effectiveRunner, ['raw', 'GET', `/products/${cleanProductId}.json`])
      }
      const product = unwrapProduct(payload)
      if (!product?.id) {
        const error = new Error('easystore_product_not_found')
        error.status = 404
        throw error
      }
      return normalizeProductPreview(product, { shopBase, pixelId })
    },
    async getMetaCatalogFeed({ limit = 250, brand = 'Annalynna', productUrlBase = resolveCatalogProductUrlBase(shopBase, env) } = {}) {
      const result = await listProducts({ limit })
      return buildMetaCatalogFeed({
        products: result.products,
        brand,
        productUrlBase,
      })
    },
  }
}
