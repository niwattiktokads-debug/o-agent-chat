import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const LOCAL_HELPER = '/Users/babycuca/.codex/bin/easystore-api'

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

export function createEasyStoreRuntime({
  runner,
  env = process.env,
  fetchImpl = globalThis.fetch,
  helper = env.EASYSTORE_HELPER || env.EASY_STORE_HELPER || LOCAL_HELPER,
} = {}) {
  const directCredentials = resolveDirectCredentials(env)
  const directReady = missingDirectCredentials(directCredentials).length === 0
  const effectiveRunner = runner || (!directReady && canUseHelper(helper, env) ? createHelperRunner({ helper, env }) : null)

  return {
    async verify({ limit = 1 } = {}) {
      if (directReady) {
        const payload = await easyStoreApiRequest({
          fetchImpl,
          credentials: directCredentials,
          method: 'GET',
          pathname: '/products.json',
          query: { page: 1, limit },
        })
        return {
          ok: true,
          mode: 'storefront_api_ready',
          status: payload.status,
          endpoint: 'GET /products.json',
          productCount: payload.response?.products?.length ?? payload.response?.data?.length ?? payload.response?.count ?? 0,
          rateLimit: payload.rateLimit,
        }
      }
      if (!effectiveRunner) throw missingCredentialsError({ credentials: directCredentials, helper })
      const payload = await runHelper(effectiveRunner, ['list-products', '--limit', String(limit)])
      return {
        ok: true,
        mode: 'local_helper_ready',
        endpoint: 'GET /products.json',
        productCount: payload.response?.products?.length ?? payload.response?.data?.length ?? payload.response?.count ?? 0,
      }
    },
  }
}
