import { createHmac, timingSafeEqual } from 'node:crypto'

const PROVIDER = 'meta_pay_kgp'
const DEFAULT_WEBHOOK_PATH = '/webhook/kgp/meta-pay'
const SUCCESS_STATUSES = new Set(['paid', 'success', 'succeeded', 'completed', 'captured', 'settled'])
const PENDING_STATUSES = new Set(['pending', 'processing', 'authorized', 'created'])
const FAILED_STATUSES = new Set(['failed', 'failure', 'declined', 'rejected', 'error'])
const EXPIRED_STATUSES = new Set(['expired', 'timeout'])
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'voided'])

function envValue(env, key) {
  return String(env?.[key] || '').trim()
}

function truthy(value) {
  return ['1', 'true', 'yes', 'on', 'live'].includes(String(value || '').trim().toLowerCase())
}

function publicBaseUrl(env) {
  return envValue(env, 'OMNI_PUBLIC_BASE_URL') || envValue(env, 'OMNI_FRONTEND_URL') || 'https://omni.oagent.biz'
}

function serverBaseUrl(env) {
  return envValue(env, 'OMNI_SERVER_PUBLIC_URL') || envValue(env, 'OMNI_API_BASE_URL') || ''
}

function hmacHex(secret, raw) {
  return createHmac('sha256', String(secret)).update(raw).digest('hex')
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function normalizeSignature(value = '') {
  return String(value || '').trim().replace(/^sha256=/i, '').toLowerCase()
}

function rawBody(req) {
  if (Buffer.isBuffer(req?.rawBody)) return req.rawBody
  if (typeof req?.rawBody === 'string') return Buffer.from(req.rawBody)
  return Buffer.from(JSON.stringify(req?.body || {}))
}

function firstPresent(input, keys) {
  for (const key of keys) {
    const value = input?.[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') return value
  }
  return null
}

function normalizeStatus(value) {
  const status = String(value || '').trim().toLowerCase()
  if (SUCCESS_STATUSES.has(status)) return 'paid'
  if (PENDING_STATUSES.has(status)) return 'pending'
  if (FAILED_STATUSES.has(status)) return 'failed'
  if (EXPIRED_STATUSES.has(status)) return 'expired'
  if (CANCELLED_STATUSES.has(status)) return 'cancelled'
  return 'manual_verify'
}

export function buildKgpPaymentMessage(payment = {}) {
  const amount = Number(payment.amount || 0).toLocaleString('th-TH', {
    minimumFractionDigits: Number.isInteger(Number(payment.amount || 0)) ? 0 : 2,
    maximumFractionDigits: 2,
  })
  const lines = [
    'สรุปยอดชำระค่ะ',
    payment.orderId ? `ออเดอร์: ${payment.orderId}` : '',
    `ยอดชำระ: ${payment.currency || 'THB'} ${amount}`,
    payment.checkoutUrl
      ? `ชำระผ่าน Meta Pay / KGP: ${payment.checkoutUrl}`
      : 'ลิงก์ Meta Pay / KGP จะถูกสร้างหลังระบบชำระเงินพร้อมใช้งาน',
    'หลังชำระแล้วระบบจะอัปเดตสถานะให้อัตโนมัติค่ะ',
  ].filter(Boolean)
  return lines.join('\n')
}

export function createKgpPaymentRuntime({ env = process.env, fetchImpl = fetch } = {}) {
  function config() {
    const checkoutEndpoint = envValue(env, 'META_PAY_KGP_CHECKOUT_ENDPOINT')
    const webhookPath = envValue(env, 'META_PAY_KGP_WEBHOOK_PATH') || DEFAULT_WEBHOOK_PATH
    const base = serverBaseUrl(env)
    return {
      enabled: truthy(envValue(env, 'META_PAY_KGP_ENABLED')),
      merchantId: envValue(env, 'META_PAY_KGP_MERCHANT_ID'),
      apiKey: envValue(env, 'META_PAY_KGP_API_KEY'),
      apiSecret: envValue(env, 'META_PAY_KGP_API_SECRET'),
      webhookSecret: envValue(env, 'META_PAY_KGP_WEBHOOK_SECRET'),
      checkoutEndpoint,
      webhookPath,
      webhookUrl: base ? `${base.replace(/\/+$/, '')}${webhookPath}` : webhookPath,
      returnUrl: envValue(env, 'META_PAY_KGP_RETURN_URL') || `${publicBaseUrl(env).replace(/\/+$/, '')}/`,
    }
  }

  function health() {
    const cfg = config()
    const missing = []
    if (!cfg.merchantId) missing.push('META_PAY_KGP_MERCHANT_ID')
    if (!cfg.apiKey) missing.push('META_PAY_KGP_API_KEY')
    if (!cfg.apiSecret) missing.push('META_PAY_KGP_API_SECRET')
    if (!cfg.webhookSecret) missing.push('META_PAY_KGP_WEBHOOK_SECRET')
    if (!cfg.checkoutEndpoint) missing.push('META_PAY_KGP_CHECKOUT_ENDPOINT')

    const credentialsReady = Boolean(cfg.merchantId && cfg.apiKey && cfg.apiSecret && cfg.webhookSecret)
    const checkoutEndpointReady = Boolean(cfg.checkoutEndpoint)
    const liveReady = Boolean(cfg.enabled && credentialsReady && checkoutEndpointReady)
    const mode = liveReady ? 'live'
      : credentialsReady && checkoutEndpointReady ? 'credentials_ready_disabled'
        : credentialsReady ? 'checkout_endpoint_pending'
          : 'credentials_pending'

    return {
      ok: true,
      provider: PROVIDER,
      status: liveReady ? 'healthy' : 'disabled',
      mode,
      enabled: cfg.enabled,
      credentialsReady,
      checkoutEndpointReady,
      liveReady,
      missing,
      requiredEnv: [
        'META_PAY_KGP_ENABLED',
        'META_PAY_KGP_MERCHANT_ID',
        'META_PAY_KGP_API_KEY',
        'META_PAY_KGP_API_SECRET',
        'META_PAY_KGP_WEBHOOK_SECRET',
        'META_PAY_KGP_CHECKOUT_ENDPOINT',
      ],
      webhookPath: cfg.webhookPath,
      webhookUrl: cfg.webhookUrl,
    }
  }

  async function createCheckout(payment = {}) {
    const state = health()
    if (!state.liveReady) return { ok: false, error: 'kgp_provider_not_enabled', health: state }
    const cfg = config()
    const payload = {
      merchantId: cfg.merchantId,
      referenceId: payment.id,
      orderId: payment.orderId || payment.id,
      amount: Number(payment.amount),
      currency: payment.currency || 'THB',
      description: payment.description || `Omni payment ${payment.id}`,
      returnUrl: cfg.returnUrl,
      webhookUrl: cfg.webhookUrl,
      metadata: {
        omniPaymentRequestId: payment.id,
        omniThreadId: payment.threadId || null,
        omniOrderId: payment.orderId || null,
      },
    }
    const body = JSON.stringify(payload)
    const signature = hmacHex(cfg.apiSecret, body)
    const response = await fetchImpl(cfg.checkoutEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
        'x-kgp-merchant-id': cfg.merchantId,
        'x-kgp-signature': signature,
      },
      body,
    })
    const text = await response.text()
    let data
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { raw: text }
    }
    if (!response.ok) return { ok: false, error: 'kgp_checkout_http_error', status: response.status, response: data }

    const checkoutUrl = firstPresent(data, ['checkoutUrl', 'checkout_url', 'paymentUrl', 'payment_url', 'url'])
    if (!checkoutUrl) return { ok: false, error: 'kgp_checkout_url_missing', response: data }
    return {
      ok: true,
      checkoutUrl: String(checkoutUrl),
      providerRef: String(firstPresent(data, ['providerRef', 'paymentRequestId', 'payment_request_id', 'transactionId', 'transaction_id', 'id']) || payment.providerRef || payment.id),
      expiresAt: firstPresent(data, ['expiresAt', 'expires_at', 'expiryAt', 'expiry_at']) || payment.expiresAt || null,
      response: data,
      payload,
    }
  }

  function verifyWebhookSignature(req) {
    const cfg = config()
    if (!cfg.webhookSecret) return { ok: false, error: 'kgp_webhook_secret_missing' }
    const signature = normalizeSignature(
      req?.headers?.['x-kgp-signature']
      || req?.headers?.['kgp-signature']
      || req?.headers?.['x-signature']
      || req?.headers?.['x-hub-signature-256']
      || ''
    )
    if (!signature) return { ok: false, error: 'kgp_signature_missing' }
    const calculated = normalizeSignature(hmacHex(cfg.webhookSecret, rawBody(req)))
    if (!safeEqual(signature, calculated)) return { ok: false, error: 'invalid_kgp_signature' }
    return { ok: true }
  }

  function normalizeWebhookEvent(body = {}) {
    const eventId = firstPresent(body, ['eventId', 'event_id', 'id', 'transactionId', 'transaction_id'])
    const paymentRequestId = firstPresent(body, [
      'paymentRequestId',
      'payment_request_id',
      'omniPaymentRequestId',
      'referenceId',
      'reference_id',
      'merchantReference',
      'merchant_reference',
    ])
    const providerRef = firstPresent(body, ['providerRef', 'paymentId', 'payment_id', 'transactionId', 'transaction_id', 'kgpReference', 'kgp_reference'])
    if (!paymentRequestId && !providerRef) return { ok: false, error: 'kgp_payment_reference_missing' }
    const status = normalizeStatus(firstPresent(body, ['status', 'paymentStatus', 'payment_status', 'event', 'type']))
    return {
      ok: true,
      provider: PROVIDER,
      paymentRequestId: paymentRequestId ? String(paymentRequestId) : null,
      providerRef: providerRef ? String(providerRef) : null,
      status,
      eventType: status,
      externalEventId: eventId ? String(eventId) : null,
      sourceRef: `kgp_webhook:${eventId || providerRef || paymentRequestId}`,
      raw: body,
    }
  }

  return { provider: PROVIDER, health, createCheckout, verifyWebhookSignature, normalizeWebhookEvent }
}
