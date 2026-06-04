import crypto from 'node:crypto'

const SIZE_RE = /\b(5xl|4xl|3xl|2xl|xxl|xl|l|m|s)\b|(?:ไซซ์|ไซส์|size)\s*(5xl|4xl|3xl|2xl|xxl|xl|l|m|s)/i
const COLOR_RE = /(ดำ|ขาว|เทา|กรม|น้ำเงิน|ฟ้า|เขียว|แดง|ชมพู|ครีม|เบจ|น้ำตาล|ม่วง|เหลือง|ส้ม|black|white|gray|grey|navy|blue|green|red|pink|cream|beige|brown|purple|yellow|orange)/i

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeText(value) {
  return cleanText(value).toLowerCase()
}

function digits(value) {
  return String(value || '').replace(/\D+/g, '')
}

function sha(value) {
  const text = String(value || '')
  if (!text) return ''
  return crypto.createHash('sha256').update(text).digest('hex')
}

function maskPhone(value) {
  const phone = digits(value)
  if (!phone) return ''
  if (phone.length <= 4) return '*'.repeat(phone.length)
  return `${phone.slice(0, 3)}${'*'.repeat(Math.max(2, phone.length - 7))}${phone.slice(-4)}`
}

function maskAddress(address = {}) {
  const formatted = cleanText(address.formattedAddress || [
    address.addressLine,
    address.subDistrict,
    address.district,
    address.province,
    address.postalCode,
  ].filter(Boolean).join(' '))
  if (!formatted) return ''
  const postal = String(address.postalCode || formatted.match(/\b\d{5}\b/)?.[0] || '').trim()
  const province = cleanText(address.province || '')
  const district = cleanText(address.district || '')
  const head = formatted.slice(0, 8).replace(/\d/g, 'x')
  return [head ? `${head}...` : '', district, province, postal].filter(Boolean).join(' ')
}

export function detectSalesSize(text) {
  const match = String(text || '').match(SIZE_RE)
  return (match?.[1] || match?.[2] || '').toUpperCase()
}

export function detectSalesColor(text) {
  const match = String(text || '').match(COLOR_RE)
  if (!match) return ''
  const value = match[1].toLowerCase()
  const map = {
    black: 'ดำ',
    white: 'ขาว',
    gray: 'เทา',
    grey: 'เทา',
    navy: 'กรม',
    blue: 'น้ำเงิน',
    green: 'เขียว',
    red: 'แดง',
    pink: 'ชมพู',
    cream: 'ครีม',
    beige: 'เบจ',
    brown: 'น้ำตาล',
    purple: 'ม่วง',
    yellow: 'เหลือง',
    orange: 'ส้ม',
  }
  return map[value] || match[1]
}

function recentMessages(threadId, snapshot, limit = 8) {
  return (snapshot.messages || [])
    .filter((message) => message.threadId === threadId)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    .slice(-limit)
}

function lastInboundText(threadId, snapshot) {
  return recentMessages(threadId, snapshot)
    .filter((message) => message.direction === 'inbound')
    .map((message) => message.text)
    .join('\n')
}

function phoneFromCustomer(customer = {}) {
  return customer.phone || customer.mobile || customer.contact?.phone || customer.defaultPhone || ''
}

function orderPhone(order = {}) {
  if (!order) return ''
  return order.customerPhone || order.phone || order.shippingAddress?.recipientPhone || ''
}

function orderAddress(order = {}) {
  if (!order) return null
  return order.shippingAddress || order.address || null
}

function orderUpdatedAt(order = {}) {
  if (!order) return ''
  return order.updatedAt || order.createdAt || ''
}

function latestOrder(orders = []) {
  return orders
    .slice()
    .sort((a, b) => String(orderUpdatedAt(b)).localeCompare(String(orderUpdatedAt(a))))[0] || null
}

function itemSize(item = {}) {
  if (!item) return ''
  return detectSalesSize([item.skuName, item.sellerSku, item.sku, item.productName, item.name].filter(Boolean).join(' '))
}

function itemColor(item = {}) {
  if (!item) return ''
  return detectSalesColor([item.skuName, item.sellerSku, item.sku, item.productName, item.name].filter(Boolean).join(' '))
}

function orderItems(order = {}) {
  if (!order) return []
  return Array.isArray(order.items) ? order.items
    : Array.isArray(order.itemSummary) ? order.itemSummary
      : []
}

function buildCustomerMemory({ thread, snapshot }) {
  const customer = (snapshot.customers || []).find((item) => item.id === thread?.customerId) || null
  const customerPhone = phoneFromCustomer(customer)
  const phoneKey = digits(customerPhone)
  const customerName = normalizeText(customer?.displayName)
  const providerCustomerId = customer?.providerCustomerId || ''

  const matches = []
  for (const order of snapshot.orders || []) {
    let score = 0
    const basis = []
    const phone = digits(orderPhone(order))
    if (thread?.customerId && order.customerId === thread.customerId) {
      score += 90
      basis.push('same_customer_id')
    }
    if (phoneKey && phone && phoneKey === phone) {
      score += 95
      basis.push('phone')
    }
    if (providerCustomerId && String(order.customerId || '').includes(String(providerCustomerId))) {
      score += 80
      basis.push('provider_customer_id')
    }
    const orderCustomer = (snapshot.customers || []).find((item) => item.id === order.customerId)
    if (!score && customerName && normalizeText(orderCustomer?.displayName || order.customerName) === customerName) {
      score += 25
      basis.push('name_only')
    }
    if (score > 0) matches.push({ order, score, basis })
  }

  matches.sort((a, b) => b.score - a.score || String(orderUpdatedAt(b.order)).localeCompare(String(orderUpdatedAt(a.order))))
  const best = matches[0] || null
  const linkedOrders = matches.filter((match) => match.score >= 80).map((match) => match.order)
  const safeOrders = linkedOrders.length ? linkedOrders : []
  const last = latestOrder(safeOrders)
  const lastItems = orderItems(last)
  const lastItem = lastItems[0] || null
  const lastPhone = customerPhone || orderPhone(last)
  const lastAddress = orderAddress(last)
  const confidence = best ? Math.min(1, best.score / 100) : (customer?.matchConfidence || 0)
  const safeToUsePrivateData = Boolean(best && best.score >= 80)

  return {
    ok: true,
    customer: customer ? {
      id: customer.id,
      displayName: customer.displayName || '',
      providerCustomerId: customer.providerCustomerId || null,
      matchConfidence: customer.matchConfidence || confidence || 0,
    } : null,
    match: {
      confidence,
      basis: best?.basis || [],
      safeToUsePrivateData,
      linkedOrderCount: safeOrders.length,
    },
    memory: {
      easystoreCustomerId: safeToUsePrivateData && last?.customerId?.startsWith('es_customer_') ? last.customerId : null,
      phoneHash: safeToUsePrivateData ? sha(digits(lastPhone)) : '',
      phoneLast4: safeToUsePrivateData ? digits(lastPhone).slice(-4) : '',
      phoneMasked: safeToUsePrivateData ? maskPhone(lastPhone) : '',
      lastOrderId: last?.id || null,
      lastOrderNumber: last?.orderNumber || null,
      lastOrderStatus: last?.status || null,
      lastProductName: lastItem?.productName || lastItem?.name || null,
      lastSku: lastItem?.sellerSku || lastItem?.sku || null,
      lastSize: itemSize(lastItem),
      lastColor: itemColor(lastItem),
      lastAddressMasked: safeToUsePrivateData ? maskAddress(lastAddress || {}) : '',
      updatedAt: orderUpdatedAt(last) || null,
    },
  }
}

function scoreInventoryRow(row = {}, query = {}) {
  const text = normalizeText([row.productName, row.sku, row.productId].filter(Boolean).join(' '))
  const queryText = normalizeText(query.text)
  const color = normalizeText(query.color)
  const size = normalizeText(query.size)
  let score = 0
  for (const token of queryText.split(/\s+/).filter((item) => item.length >= 2)) {
    if (text.includes(token)) score += 2
  }
  if (color && text.includes(color)) score += 12
  if (size && text.includes(size)) score += 14
  if (query.productId && String(row.productId || '') === String(query.productId)) score += 30
  if (String(row.source || '').includes('easy')) score += 3
  if (Number(row.available || 0) > 0) score += 2
  return score
}

function buildProductResolver({ thread, snapshot }) {
  const inbound = lastInboundText(thread?.id, snapshot)
  const origin = thread?.originContext || {}
  const hint = origin.productHint || origin.product || origin.live || {}
  const text = [inbound, hint.text, hint.productName, hint.name, hint.sku, origin.post?.title].filter(Boolean).join(' ')
  const query = {
    text,
    color: hint.color || detectSalesColor(text),
    size: hint.size || detectSalesSize(text),
    productId: hint.productId || hint.id || '',
  }
  const scored = (snapshot.inventorySnapshots || [])
    .map((row) => ({ row, score: scoreInventoryRow(row, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.row.available || 0) - Number(a.row.available || 0))

  const best = scored[0]?.row || null
  if (!best) {
    return {
      ok: true,
      query,
      product: null,
      variants: [],
      sourceIds: [],
      confidence: 0,
    }
  }

  const productKey = best.productId || best.productName || best.sku
  const variants = scored
    .map((item) => item.row)
    .filter((row) => (row.productId || row.productName || row.sku) === productKey)
    .slice(0, 8)
    .map((row) => ({
      id: row.id || null,
      productId: row.productId || null,
      variantId: row.variantId || null,
      sku: row.sku || '',
      productName: row.productName || '',
      available: Number(row.available || 0),
      price: Number(row.price || 0) || null,
      checkedAt: row.checkedAt || null,
      sourceRef: row.sourceRef || null,
    }))

  return {
    ok: true,
    query,
    product: {
      productId: best.productId || null,
      productName: best.productName || best.sku || '',
      source: best.source || '',
      price: Number(best.price || 0) || null,
      availableTotal: variants.reduce((sum, row) => sum + Math.max(0, Number(row.available || 0)), 0),
    },
    variants,
    sourceIds: variants.map((row) => row.id).filter(Boolean),
    confidence: Math.min(1, (scored[0]?.score || 0) / 40),
  }
}

export function pickProductImages({ product = {}, query = {}, history = [] } = {}) {
  const sentUrls = new Set((history || [])
    .flatMap((message) => message.attachments || [])
    .map((attachment) => attachment.url)
    .filter(Boolean))
  const color = normalizeText(query.color)
  const candidates = []
  for (const image of product.images || []) {
    let score = 10
    const text = normalizeText([image.alt, image.url].filter(Boolean).join(' '))
    if (color && text.includes(color)) score += 10
    if (sentUrls.has(image.url)) score -= 3
    candidates.push({
      id: image.id || `img_${candidates.length + 1}`,
      url: image.url,
      alt: image.alt || product.title || '',
      source: 'easystore_product_image',
      score,
      reason: color && text.includes(color) ? 'color_match' : 'product_image',
    })
  }
  for (const variant of product.variants || []) {
    if (!variant.imageUrl) continue
    let score = 14
    const text = normalizeText([variant.title, variant.sku, variant.imageUrl].filter(Boolean).join(' '))
    if (query.size && text.includes(normalizeText(query.size))) score += 8
    if (color && text.includes(color)) score += 10
    if (sentUrls.has(variant.imageUrl)) score -= 3
    candidates.push({
      id: `variant_${variant.id || variant.sku}`,
      url: variant.imageUrl,
      alt: variant.title || product.title || '',
      source: 'easystore_variant_image',
      score,
      reason: 'variant_image',
    })
  }
  return candidates
    .filter((item, index, rows) => item.url && rows.findIndex((other) => other.url === item.url) === index)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

export function resolveSalesContext({ threadId, snapshot, productPreview = null } = {}) {
  const thread = (snapshot.threads || []).find((item) => item.id === threadId)
  if (!thread) return { ok: false, error: 'thread_not_found' }
  const customer = buildCustomerMemory({ thread, snapshot })
  const product = buildProductResolver({ thread, snapshot })
  const history = recentMessages(threadId, snapshot, 20)
  const imagePicker = productPreview?.product ? {
    ok: true,
    images: pickProductImages({
      product: productPreview.product,
      query: product.query,
      history,
    }),
    productId: productPreview.product.id,
    source: 'easystore_preview',
  } : {
    ok: true,
    images: [],
    productId: product.product?.productId || null,
    source: 'not_loaded',
  }

  return {
    ok: true,
    thread: {
      id: thread.id,
      pageId: thread.pageId,
      platform: thread.platform,
      status: thread.status,
      originContext: thread.originContext || null,
    },
    customer,
    product,
    imagePicker,
  }
}
