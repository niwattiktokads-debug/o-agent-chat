import crypto from 'node:crypto'
import { DEFAULT_WORKSPACE_ID } from './workspace.js'

export const EASYSTORE_PAGE_ID = 'page_easystore_annalynna'
export const EASYSTORE_PLATFORM = 'easystore'

function stableId(...parts) {
  return crypto.createHash('sha1').update(parts.filter(Boolean).join(':')).digest('hex').slice(0, 16)
}

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== null && item !== '')
      .map(([key, item]) => [key, item && typeof item === 'object' && !Array.isArray(item) ? compactObject(item) : item])
      .filter(([, item]) => !(item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === 0)),
  )
}

function fieldFrom(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') || null
}

function toNumber(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? number : 0
}

function toIso(value, fallback = null) {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function normalizeTopic(topic) {
  return String(topic || '').trim() || 'unknown'
}

function topicKind(topic, payload = {}) {
  const value = normalizeTopic(topic)
  if (value.startsWith('order/')) return 'order'
  if (value.startsWith('product/')) return 'product'
  if (value.startsWith('customer/')) return 'customer'
  if (payload.order || payload.order_number || payload.financial_status || payload.fulfillment_status) return 'order'
  if (payload.product || payload.variants || payload.title) return 'product'
  if (payload.customer || payload.email || payload.phone) return 'customer'
  return 'unknown'
}

function unwrapPayload(payload = {}, key) {
  if (payload[key] && typeof payload[key] === 'object') return payload[key]
  return payload
}

function normalizeCustomer(raw = {}, fallback = {}) {
  const name = fieldFrom(
    raw.name,
    raw.display_name,
    [raw.first_name, raw.last_name].filter(Boolean).join(' '),
    raw.billing_name,
    raw.shipping_name,
    fallback.name,
    'EasyStore Customer',
  )
  const email = fieldFrom(raw.email, fallback.email)
  const phone = fieldFrom(raw.phone, raw.mobile, raw.phone_number, raw.default_address?.phone, fallback.phone)
  const providerId = String(fieldFrom(raw.id, raw.customer_id, email, phone, fallback.providerId) || '')
  const id = providerId ? `es_customer_${providerId}` : `es_customer_${stableId(name, email, phone)}`
  return compactObject({
    id,
    displayName: name,
    platform: EASYSTORE_PLATFORM,
    providerCustomerId: providerId || null,
    phone,
    contact: { email },
    address: fieldFrom(raw.default_address?.address1, fallback.address),
    note: raw.note || '',
    matchConfidence: raw.id || raw.customer_id ? 1 : (email || phone ? 0.8 : 0.4),
    sourceRef: fallback.sourceRef || (providerId ? `easystore_customer:${providerId}` : 'easystore_customer'),
  })
}

function shippingAddressFrom(order = {}) {
  const address = order.shipping_address || order.shippingAddress || order.billing_address || {}
  return compactObject({
    recipientName: fieldFrom(address.name, [address.first_name, address.last_name].filter(Boolean).join(' '), order.customer?.name),
    recipientPhone: fieldFrom(address.phone, order.customer?.phone, order.phone),
    addressLine: [address.address1, address.address2, address.street].filter(Boolean).join(' '),
    province: fieldFrom(address.province, address.state),
    district: fieldFrom(address.city, address.district),
    subDistrict: fieldFrom(address.sub_district, address.subDistrict),
    postalCode: fieldFrom(address.zip, address.postal_code, address.postalCode),
    country: fieldFrom(address.country, address.country_code),
  })
}

function normalizeLineItems(order = {}) {
  const rows = order.line_items || order.lineItems || order.items || []
  return rows.map((item) => compactObject({
    id: fieldFrom(item.id, item.line_item_id),
    productId: fieldFrom(item.product_id, item.productId),
    variantId: fieldFrom(item.variant_id, item.variantId),
    productName: fieldFrom(item.product_name, item.name, item.title),
    skuName: fieldFrom(item.variant_title, item.variantName),
    sellerSku: fieldFrom(item.sku, item.seller_sku, item.sellerSku),
    quantity: toNumber(fieldFrom(item.quantity, item.qty, 1)),
    salePrice: toNumber(fieldFrom(item.price, item.sale_price, item.unit_price)),
  }))
}

function orderStatus(order = {}, topic = '') {
  if (topic.includes('/cancel')) return 'cancelled'
  if (topic.includes('/paid')) return 'paid'
  if (topic.includes('/partially_paid')) return 'partially_paid'
  if (topic.includes('/partially_fulfilled')) return 'partially_fulfilled'
  return fieldFrom(order.status, order.financial_status, order.fulfillment_status, 'open')
}

function normalizeOrderWebhook(payload = {}, context = {}) {
  const topic = normalizeTopic(context.topic)
  const receivedAt = context.receivedAt || new Date().toISOString()
  const order = unwrapPayload(payload, 'order')
  const providerOrderId = String(fieldFrom(order.id, order.order_id, order.token, order.order_number, stableId(JSON.stringify(order))) || '')
  const orderId = `es_order_${providerOrderId}`
  const sourceRef = `easystore_webhook:${topic}:${providerOrderId}`
  const address = shippingAddressFrom(order)
  const customer = normalizeCustomer(order.customer || {}, {
    providerId: fieldFrom(order.customer_id, order.email, order.phone, providerOrderId),
    email: order.email,
    phone: fieldFrom(order.phone, address.recipientPhone),
    name: address.recipientName,
    address: address.addressLine,
    sourceRef,
  })
  const updatedAt = toIso(fieldFrom(order.updated_at, order.updatedAt), receivedAt)
  const createdAt = toIso(fieldFrom(order.created_at, order.createdAt), updatedAt)
  const orderNumber = String(fieldFrom(order.order_number, order.name, order.number, providerOrderId) || '')
  const total = toNumber(fieldFrom(order.total_price, order.totalAmount, order.total_amount, order.grand_total, order.total))
  const itemSummary = normalizeLineItems(order)
  const messageText = [
    `EasyStore ${topic} #${orderNumber || providerOrderId}`,
    order.financial_status ? `financial=${order.financial_status}` : '',
    order.fulfillment_status ? `fulfillment=${order.fulfillment_status}` : '',
    total ? `total=${total} ${order.currency || ''}`.trim() : '',
  ].filter(Boolean).join(' · ')

  return {
    customers: [customer],
    threads: [compactObject({
      id: orderId,
      providerThreadId: providerOrderId,
      pageId: EASYSTORE_PAGE_ID,
      platform: EASYSTORE_PLATFORM,
      customerId: customer.id,
      status: 'open',
      intent: 'orderStatus',
      risk: 'medium',
      unreadCount: 0,
      messageCount: 1,
      updatedAt,
      workspaceId: DEFAULT_WORKSPACE_ID,
      originContext: {
        channel: EASYSTORE_PLATFORM,
        sourceType: 'order_webhook',
        shopDomain: context.shopDomain || null,
        topic,
        order: { id: providerOrderId, number: orderNumber, status: orderStatus(order, topic) },
      },
    })],
    messages: [compactObject({
      id: `es_msg_${stableId(sourceRef)}`,
      threadId: orderId,
      direction: 'system',
      authorName: 'EasyStore',
      text: messageText,
      createdAt: updatedAt,
      providerMessageId: `${topic}:${providerOrderId}`,
      sourceRef,
    })],
    orders: [compactObject({
      id: orderId,
      customerId: customer.id,
      workspaceId: DEFAULT_WORKSPACE_ID,
      platform: EASYSTORE_PLATFORM,
      providerOrderId,
      orderNumber,
      status: orderStatus(order, topic),
      total,
      totalAmount: total,
      currency: fieldFrom(order.currency, order.currency_code, 'THB'),
      tracking: fieldFrom(order.tracking_number, order.trackingCode),
      trackingCode: fieldFrom(order.tracking_number, order.trackingCode),
      itemSummary,
      items: itemSummary,
      paymentMethod: fieldFrom(order.payment_method, order.payment_method_name, order.gateway),
      shippingAddress: address,
      sourceRef,
      createdAt,
      updatedAt,
    })],
    inventorySnapshots: [],
  }
}

function normalizeProductWebhook(payload = {}, context = {}) {
  const topic = normalizeTopic(context.topic)
  const receivedAt = context.receivedAt || new Date().toISOString()
  const product = unwrapPayload(payload, 'product')
  const providerProductId = String(fieldFrom(product.id, product.product_id, stableId(JSON.stringify(product))) || '')
  const productName = fieldFrom(product.title, product.name, `EasyStore product ${providerProductId}`)
  const updatedAt = toIso(fieldFrom(product.updated_at, product.updatedAt), receivedAt)
  const sourceRef = `easystore_webhook:${topic}:${providerProductId}`
  const variants = product.variants || product.product_variants || []
  const inventorySnapshots = (variants.length ? variants : [product]).map((variant) => {
    const variantId = String(fieldFrom(variant.id, variant.variant_id, providerProductId) || '')
    return compactObject({
      id: `es_stock_${providerProductId}_${variantId}`,
      sku: fieldFrom(variant.sku, product.sku, providerProductId),
      source: EASYSTORE_PLATFORM,
      available: toNumber(fieldFrom(variant.inventory_quantity, variant.stock, variant.quantity, product.inventory_quantity)),
      checkedAt: updatedAt,
      productId: providerProductId,
      variantId,
      productName,
      price: toNumber(fieldFrom(variant.price, product.price)),
      sourceRef,
    })
  })

  return {
    customers: [],
    threads: [compactObject({
      id: `es_product_${providerProductId}`,
      providerThreadId: providerProductId,
      pageId: EASYSTORE_PAGE_ID,
      platform: EASYSTORE_PLATFORM,
      customerId: null,
      status: 'open',
      intent: 'product',
      risk: 'low',
      unreadCount: 0,
      messageCount: 1,
      updatedAt,
      workspaceId: DEFAULT_WORKSPACE_ID,
      originContext: {
        channel: EASYSTORE_PLATFORM,
        sourceType: 'product_webhook',
        shopDomain: context.shopDomain || null,
        topic,
        product: { id: providerProductId, name: productName },
      },
    })],
    messages: [compactObject({
      id: `es_msg_${stableId(sourceRef)}`,
      threadId: `es_product_${providerProductId}`,
      direction: 'system',
      authorName: 'EasyStore',
      text: `EasyStore ${topic} ${productName}`,
      createdAt: updatedAt,
      providerMessageId: `${topic}:${providerProductId}`,
      sourceRef,
    })],
    orders: [],
    inventorySnapshots,
  }
}

function normalizeCustomerWebhook(payload = {}, context = {}) {
  const topic = normalizeTopic(context.topic)
  const receivedAt = context.receivedAt || new Date().toISOString()
  const raw = unwrapPayload(payload, 'customer')
  const providerCustomerId = String(fieldFrom(raw.id, raw.customer_id, raw.email, raw.phone, stableId(JSON.stringify(raw))) || '')
  const sourceRef = `easystore_webhook:${topic}:${providerCustomerId}`
  const customer = normalizeCustomer(raw, { providerId: providerCustomerId, sourceRef })
  const updatedAt = toIso(fieldFrom(raw.updated_at, raw.updatedAt), receivedAt)
  const threadId = `es_customer_${providerCustomerId}`

  return {
    customers: [customer],
    threads: [compactObject({
      id: threadId,
      providerThreadId: providerCustomerId,
      pageId: EASYSTORE_PAGE_ID,
      platform: EASYSTORE_PLATFORM,
      customerId: customer.id,
      status: 'open',
      intent: 'customer',
      risk: 'low',
      unreadCount: 0,
      messageCount: 1,
      updatedAt,
      workspaceId: DEFAULT_WORKSPACE_ID,
      originContext: {
        channel: EASYSTORE_PLATFORM,
        sourceType: 'customer_webhook',
        shopDomain: context.shopDomain || null,
        topic,
      },
    })],
    messages: [compactObject({
      id: `es_msg_${stableId(sourceRef)}`,
      threadId,
      direction: 'system',
      authorName: 'EasyStore',
      text: `EasyStore ${topic} ${customer.displayName}`,
      createdAt: updatedAt,
      providerMessageId: `${topic}:${providerCustomerId}`,
      sourceRef,
    })],
    orders: [],
    inventorySnapshots: [],
  }
}

export function normalizeEasyStoreWebhookPayload(payload = {}, options = {}) {
  const topic = normalizeTopic(options.topic || payload.topic || payload.webhook_topic)
  const context = {
    topic,
    shopDomain: options.shopDomain || payload.shop_domain || payload.shopDomain || '',
    receivedAt: options.receivedAt || new Date().toISOString(),
  }
  const kind = topicKind(topic, payload)
  const normalized = kind === 'order'
    ? normalizeOrderWebhook(payload, context)
    : kind === 'product'
      ? normalizeProductWebhook(payload, context)
      : kind === 'customer'
        ? normalizeCustomerWebhook(payload, context)
        : { customers: [], threads: [], messages: [], orders: [], inventorySnapshots: [] }

  return {
    ok: true,
    source: 'easystore_webhook',
    topic,
    shopDomain: context.shopDomain,
    receivedAt: context.receivedAt,
    ...normalized,
  }
}
