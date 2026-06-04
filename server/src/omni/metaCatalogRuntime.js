import { buildMetaCatalogRows } from './easystoreMetaFeed.js'

const DEFAULT_GRAPH_BASE_URL = 'https://graph.facebook.com'
const DEFAULT_GRAPH_VERSION = 'v23.0'
const DEFAULT_CATALOG_ID = '1689072115772849'
const DEFAULT_PRODUCT_URL_BASE = 'https://annalynna.easy.co'
const DEFAULT_UPLOAD_TAG = 'omni_easystore_realtime'

function normalizeBaseUrl(value, fallback = DEFAULT_PRODUCT_URL_BASE) {
  const raw = String(value || fallback || '').trim().replace(/\/+$/, '')
  if (!raw) return ''
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  return `https://${raw}`
}

function resolveConfig(env = process.env) {
  return {
    enabled: env.META_CATALOG_SYNC_ENABLED === '1' || env.META_CATALOG_API_ENABLED === '1',
    dryRun: env.META_CATALOG_SYNC_DRY_RUN === '1',
    graphBaseUrl: normalizeBaseUrl(env.META_GRAPH_BASE_URL, DEFAULT_GRAPH_BASE_URL),
    graphVersion: String(env.META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION).trim(),
    catalogId: String(env.META_CATALOG_ID || env.META_PRODUCT_CATALOG_ID || DEFAULT_CATALOG_ID).trim(),
    accessToken: String(env.META_CATALOG_ACCESS_TOKEN || env.META_BUSINESS_ACCESS_TOKEN || env.META_SYSTEM_USER_ACCESS_TOKEN || '').trim(),
    productUrlBase: String(env.META_CATALOG_PRODUCT_URL_BASE || env.EASY_STORE_PUBLIC_URL || env.EASY_STORE_SHOP || DEFAULT_PRODUCT_URL_BASE).trim(),
    uploadTag: String(env.META_CATALOG_UPLOAD_TAG || DEFAULT_UPLOAD_TAG).trim(),
  }
}

function redactedConfig(config) {
  return {
    enabled: config.enabled,
    dryRun: config.dryRun,
    graphVersion: config.graphVersion,
    catalogId: config.catalogId,
    productUrlBase: normalizeBaseUrl(config.productUrlBase),
    uploadTag: config.uploadTag,
    credentialStatus: {
      accessToken: {
        ok: Boolean(config.accessToken),
        value_present: Boolean(config.accessToken),
        source: config.accessToken ? 'env' : null,
        reason: config.accessToken ? null : 'missing_meta_catalog_access_token',
      },
    },
  }
}

function normalizeTopic(topic) {
  return String(topic || '').trim()
}

function isProductTopic(topic) {
  return normalizeTopic(topic).startsWith('product/')
}

function unwrapProduct(payload = {}) {
  if (payload.product && typeof payload.product === 'object') return payload.product
  if (payload.id || payload.product_id || payload.title || payload.name || payload.handle) return payload
  return null
}

function actionForTopic(topic) {
  const value = normalizeTopic(topic)
  if (value === 'product/delete') return 'DELETE'
  if (value === 'product/create') return 'CREATE'
  if (value === 'product/update') return 'UPDATE'
  return null
}

function splitMetaPrice(value) {
  const match = String(value || '').trim().match(/^([0-9]+(?:\.[0-9]+)?)\s+([A-Z]{3})$/)
  if (!match) return { price: String(value || '').trim(), currency: 'THB' }
  return { price: match[1], currency: match[2] }
}

function rowToCatalogData(row = {}) {
  const price = splitMetaPrice(row.price)
  return {
    name: row.title,
    description: row.description,
    availability: row.availability,
    condition: row.condition,
    price: price.price,
    currency: price.currency,
    url: row.link,
    image_url: row.image_link,
    brand: row.brand,
  }
}

export function buildMetaCatalogBatchRequests({
  payload = {},
  topic = '',
  productUrlBase = DEFAULT_PRODUCT_URL_BASE,
  brand = 'Annalynna',
} = {}) {
  if (!isProductTopic(topic)) return { ok: true, skip: true, reason: 'not_product_topic', requests: [] }
  const action = actionForTopic(topic)
  if (!action) return { ok: true, skip: true, reason: 'unsupported_product_topic', requests: [] }
  const product = unwrapProduct(payload)
  const retailerId = String(product?.id || product?.product_id || payload?.id || payload?.product_id || '').trim()
  if (!retailerId) return { ok: false, reason: 'missing_retailer_id', requests: [] }
  if (action === 'DELETE') {
    return {
      ok: true,
      skip: false,
      requests: [{ method: 'DELETE', retailer_id: retailerId }],
    }
  }

  const [row] = buildMetaCatalogRows({
    products: [{ ...product, id: retailerId }],
    brand,
    productUrlBase,
  })
  if (!row) return { ok: false, reason: 'meta_catalog_product_unmappable', retailerId, requests: [] }
  return {
    ok: true,
    skip: false,
    requests: [{
      method: action,
      retailer_id: row.id,
      data: rowToCatalogData(row),
    }],
  }
}

export function createMetaCatalogRuntime({
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const config = resolveConfig(env)

  function status() {
    return {
      ok: true,
      service: 'meta_catalog_api',
      mode: config.enabled ? 'enabled' : 'disabled_until_env_enabled',
      ...redactedConfig(config),
      requiredEnv: [
        'META_CATALOG_SYNC_ENABLED=1',
        'META_CATALOG_ID',
        'META_CATALOG_ACCESS_TOKEN',
        'META_CATALOG_PRODUCT_URL_BASE',
      ],
      requiredPermissions: ['catalog_management', 'business_management'],
    }
  }

  async function syncEasyStoreWebhook({ payload = {}, topic = '', shopDomain = '' } = {}) {
    const productUrlBase = config.productUrlBase || shopDomain || DEFAULT_PRODUCT_URL_BASE
    const batch = buildMetaCatalogBatchRequests({
      payload,
      topic,
      productUrlBase,
    })
    if (!batch.ok || batch.skip) return { ok: batch.ok, skipped: true, reason: batch.reason, requestCount: 0 }
    if (!config.enabled) return { ok: true, skipped: true, reason: 'meta_catalog_sync_disabled', requestCount: batch.requests.length }
    if (!config.accessToken) return { ok: false, skipped: true, reason: 'missing_meta_catalog_access_token', requestCount: batch.requests.length }
    if (config.dryRun) return { ok: true, dryRun: true, requestCount: batch.requests.length, requests: batch.requests }
    if (typeof fetchImpl !== 'function') return { ok: false, reason: 'meta_catalog_fetch_unavailable', requestCount: batch.requests.length }

    const url = `${config.graphBaseUrl}/${config.graphVersion}/${encodeURIComponent(config.catalogId)}/batch`
    const body = new URLSearchParams()
    body.set('access_token', config.accessToken)
    body.set('requests', JSON.stringify(batch.requests))
    if (config.uploadTag) body.set('upload_tag', config.uploadTag)

    let response
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
    } catch (error) {
      return {
        ok: false,
        reason: 'meta_catalog_api_unreachable',
        detail: error.message,
        endpoint: `POST /${config.catalogId}/batch`,
        requestCount: batch.requests.length,
      }
    }
    const text = await response.text()
    let data
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { raw: text }
    }
    return {
      ok: response.ok,
      status: response.status,
      endpoint: `POST /${config.catalogId}/batch`,
      requestCount: batch.requests.length,
      response: data,
    }
  }

  return {
    status,
    syncEasyStoreWebhook,
  }
}
