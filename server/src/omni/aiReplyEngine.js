import { spawn } from 'node:child_process'
import { PLUS_SIZE_LABELS, PLUS_SIZE_MEASUREMENT_MIN } from './aiGuardRules.js'
const DEFAULT_PROVIDER = process.env.OMNI_AI_PROVIDER || 'local_rules'
const DEFAULT_MODEL = process.env.OMNI_AI_MODEL || 'guarded-draft-v1'
const DEFAULT_HELPER = process.env.OMNI_AI_REPLY_HELPER || '/Users/babycuca/.codex/bin/omni-ai-reply'
const GEMINI_API_BASE = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta'
const OPENAI_API_BASE = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'
const MAX_DRAFT_CHARS = Number(process.env.OMNI_AI_MAX_DRAFT_CHARS || 480)

const PAGE_AGENT_FALLBACKS = {
  page_annalynn: 'แอดมิน Anna Lynn',
  page_annalynn_tiktok: 'แอดมิน Anna Lynn',
  page_mankynd: 'แอดมิน MAN KYND',
  page_des: 'แอดมินเพจเดส',
}
const PRODUCT_LOOKUP_GENERIC_TERMS = new Set([
  'มี', 'ไหม', 'มั้ย', 'ของ', 'สินค้า', 'ราคา', 'เท่าไหร่', 'บาท', 'พร้อมส่ง', 'ส่ง', 'รูป', 'ภาพ', 'ขอดู',
  'สนใจ', 'ตัวนี้', 'รุ่น', 'สี', 'ไซซ์', 'ไซส์', 'size', 'stock', 'price', 'photo', 'image',
])
const DEFAULT_LOW_RISK_AUTOSEND_INTENTS = new Set(['faq', 'stock', 'price', 'orderStatus', 'sizeAdvice', 'shipping'])
const PLUS_SIZE_LABEL_SET = new Set(PLUS_SIZE_LABELS)

function autoSendAllEnabled() {
  return process.env.OMNI_AI_AUTO_SEND_ALL === '1' || process.env.OMNI_AI_AUTO_SEND_ON_WEBHOOK === '1'
}

function latestInboundMessage(thread, snapshot) {
  return (snapshot.messages || [])
    .filter((message) => message.threadId === thread.id && message.direction === 'inbound')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null
}

function inboundMessagesForThread(thread, snapshot) {
  return (snapshot.messages || [])
    .filter((message) => message.threadId === thread.id && message.direction === 'inbound')
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
}

function isContinuationText(text) {
  const value = String(text || '').trim().toLowerCase()
  if (!value) return false
  if (value.length <= 18 && /(อยู่ไหม|อยู่มั้ย|อยู่ป่าว|ตอบไหม|ตอบมั้ย|มีไหม|มีมั้ย|สนใจ|ใสใจ|ยังอยู่|เฮ้ย|ฮัลโหล)/i.test(value)) return true
  return /(ยังไม่ได้.*(?:ซื้อ|สั่ง)|มาถาม|ถามรายละเอียด|ถามก่อน|รอคำตอบ)/i.test(value)
}

function classificationTextForThread(thread, snapshot) {
  const inbound = inboundMessagesForThread(thread, snapshot)
  const latest = inbound.at(-1)
  if (!latest) return ''
  if (!isContinuationText(latest.text) || inbound.length === 1) return latest.text || ''
  return inbound.slice(-4).map((message) => message.text || '').join('\n')
}

function classifyIntent(text) {
  const value = String(text || '').toLowerCase()
  if (isCustomerCorrection(value)) return 'humanReview'
  if (/(สลิป|โอนแล้ว|จ่ายแล้ว|ชำระแล้ว|หลักฐาน|payment proof|paid)/i.test(value)) return 'paymentProof'
  if (/(^|\s)(cf|เอา|รับ|สั่ง|จอง)(\s|$)|สั่งค่ะ|สั่งครับ|เอาค่ะ|เอาครับ|รับค่ะ|รับครับ/i.test(value)) return 'orderPurchase'
  if (/(ไซซ์ไหนดี|ไซส์ไหนดี|ใส่(?:\s|[^\n]){0,24}ได้(?:ไหม|มั้ย)|พอดีไหม|พอดีมั้ย|รอบอก|รอบเอว|สะโพก|size advice|แนะนำไซซ์|แนะนำไซส์)/i.test(value)) return 'sizeAdvice'
  if (/(ไม่ชอบ|มีแบบอื่น|แบบอื่น|แนะนำ.*แบบ|ตัวอื่น|รุ่นอื่น)/i.test(value)) return 'alternativeProduct'
  if (/(ลดได้ไหม|ลดไหม|ขอลด|ส่วนลด|โปรโมชั่น|มีโปร(?:ไหม|มั้ย|อะไร)?|ของแถม|discount)/i.test(value)) return 'discount'
  if (/(ค่าส่ง|ส่งฟรี|จัดส่ง|ส่งเมื่อไหร่|ส่งวันไหน|shipping|delivery)/i.test(value)) return 'shipping'
  if (/(รูป|ภาพ|ถ่าย|photo|image|pic|picture|ดูสี|ขอดู|ส่ง.*รูป|ส่ง.*ภาพ)/i.test(value)) return 'productImage'
  if (/(ของ|สินค้า|ไซซ์|ไซส์|ขนาด|รุ่น|size|สี|stock|พร้อมส่ง|มีไหม|\b(?:s|m|l|xl|xxl|2xl|3xl|4xl|5xl)\b)/i.test(value)) return 'stock'
  if (/(ราคา|เท่าไหร่|บาท|price)/i.test(value)) return 'price'
  if (/(พัสดุ|เลข|tracking|ส่งของ|order|คำสั่งซื้อ)/i.test(value)) return 'orderStatus'
  if (/(คืนเงิน|refund|ยกเลิก|cancel|เคลม)/i.test(value)) return 'refund'
  return 'faq'
}

function riskForIntent(intent, policy, autoSendAll = autoSendAllEnabled()) {
  if (autoSendAll) return 'low'
  if (intent === 'humanReview') return 'medium'
  if (['productImage', 'orderPurchase', 'paymentProof', 'alternativeProduct'].includes(intent)) return 'medium'
  if (['refund', 'discount'].includes(intent)) return 'high'
  if (!autoSendEnabledForIntent(intent, policy, autoSendAll)) return 'medium'
  return 'low'
}

function autoSendEnabledForIntent(intent, policy, autoSendAll = autoSendAllEnabled()) {
  if (autoSendAll) return true
  const autoSend = policy?.autoSend || {}
  if (Object.prototype.hasOwnProperty.call(autoSend, intent)) return autoSend[intent] === true
  return DEFAULT_LOW_RISK_AUTOSEND_INTENTS.has(intent)
}

function isCustomerCorrection(text) {
  return /(มั่ว|ผิดแล้ว|ตอบผิด|ไม่ถูก|ไม่ใช่|ตอบวน|วนแล้ว|ถามซ้ำ|อ่าน.*ไหม|ไปไหนมา|ตอบก่อน|งง|มั้่ว|มั่วแล้ว|คนจริง|แอดมินจริง)/i.test(String(text || ''))
}

function shouldHoldForHumanReview({ intent, inboundText, productFacts }) {
  if (intent === 'humanReview') return 'customer_correction_or_complaint'
  return ''
}

function detectSize(text) {
  const match = String(text || '').match(/\b(5xl|4xl|3xl|2xl|xxl|xl|l|m|s)\b|(?:ไซซ์|ไซส์|size)\s*(5xl|4xl|3xl|2xl|xxl|xl|l|m|s)/i)
  return (match?.[1] || match?.[2] || '').toUpperCase()
}

function isPlusSizeLabel(size) {
  return PLUS_SIZE_LABEL_SET.has(String(size || '').trim().toUpperCase())
}

function detectMeasurement(text, pattern) {
  const match = String(text || '').match(pattern)
  if (!match) return null
  const value = Number.parseFloat(match[1])
  return Number.isFinite(value) ? value : null
}

function detectBodyMeasurements(text) {
  const value = String(text || '')
  return {
    bust: detectMeasurement(value, /(?:รอบอก|อก|"?bust"?|"?chest"?)\s*[:=]?\s*(\d+(?:\.\d+)?)/i),
    waist: detectMeasurement(value, /(?:รอบเอว|เอว|"?waist"?)\s*[:=]?\s*(\d+(?:\.\d+)?)/i),
    hips: detectMeasurement(value, /(?:สะโพก|"?hip"?|"?hips"?)\s*[:=]?\s*(\d+(?:\.\d+)?)/i),
  }
}

function hasPlusSizeMeasurements(measurements = {}) {
  return (
    Number(measurements.bust || 0) >= PLUS_SIZE_MEASUREMENT_MIN.bust ||
    Number(measurements.waist || 0) >= PLUS_SIZE_MEASUREMENT_MIN.waist ||
    Number(measurements.hips || 0) >= PLUS_SIZE_MEASUREMENT_MIN.hips
  )
}

function hasPlusSizeWording(text) {
  return /(สาวอวบ|คนอวบ|อวบ)/i.test(String(text || ''))
}

function hasPlusSizeEvidence(text) {
  const value = String(text || '')
  return isPlusSizeLabel(detectSize(value)) || hasPlusSizeMeasurements(detectBodyMeasurements(value))
}

function detectColor(text) {
  const match = String(text || '').match(/(ดำ|ขาว|เทา|กรม|น้ำเงิน|ฟ้า|เขียว|แดง|ชมพู|ครีม|เบจ|น้ำตาล|ม่วง|เหลือง|ส้ม|black|white|gray|grey|navy|blue|green|red|pink|cream|beige|brown|purple|yellow|orange)/i)
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

function latestSalesSlots(thread, snapshot, originContext = null) {
  const recentText = recentMessagesForThread(thread, snapshot)
    .map((message) => message.text)
    .join('\n')
  return {
    productLabel: originProductLabel(originContext || {}),
    color: originContext?.productHint?.color || originContext?.live?.color || detectColor(recentText),
    size: originContext?.productHint?.size || originContext?.live?.size || detectSize(recentText),
    measurements: detectBodyMeasurements(recentText),
  }
}

function originProductLabel(originContext = {}) {
  const hint = originContext.productHint || {}
  const live = originContext.live || {}
  const base = String(hint.text || live.productName || live.sku || originContext.post?.title || originContext.ad?.title || '').trim()
  const color = hint.color && !base.includes(hint.color) ? `สี${hint.color}` : ''
  const size = hint.size && !new RegExp(`(?:ไซซ์\\s*)?${hint.size}\\b`, 'i').test(base) ? `ไซซ์ ${hint.size}` : ''
  const sku = live.sku && !base.includes(live.sku) ? live.sku : ''
  return [base, color, size, sku].filter(Boolean).join(' ').trim()
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function searchTokens(value) {
  return normalizeSearchText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
}

function searchTerms(value) {
  return String(value || '')
    .split(/[^\p{L}\p{N}]+/u)
    .map((term) => normalizeSearchText(term))
    .filter((term) => term.length >= 2)
}

function productIdentityTerms(value) {
  const raw = String(value || '')
  const latinTerms = [...new Set((raw.match(/[a-z][a-z0-9_-]{2,}/gi) || [])
    .map(normalizeSearchText)
    .filter((term) => term && !PRODUCT_LOOKUP_GENERIC_TERMS.has(term))
    .filter((term) => !/^(s|m|l|xl|xxl|2xl|3xl|4xl|5xl)$/i.test(term))
    .filter((term) => !detectColor(term)))]
  if (latinTerms.length) return latinTerms
  return [...new Set(searchTerms(raw)
    .filter((term) => term && !PRODUCT_LOOKUP_GENERIC_TERMS.has(term))
    .filter((term) => !/^(s|m|l|xl|xxl|2xl|3xl|4xl|5xl)$/i.test(term))
    .filter((term) => !detectColor(term)))]
}

function moneyText(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return ''
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount)
}

function productFactsForThread(thread, snapshot, originContext = null) {
  const latestInbound = latestInboundMessage(thread, snapshot)
  const query = [
    latestInbound?.text,
    originProductLabel(originContext || {}),
    originContext?.productHint?.text,
    originContext?.live?.productName,
    originContext?.live?.sku,
  ].filter(Boolean).join(' ')
  const tokens = searchTokens(query)
  const terms = searchTerms(query)
  if (!tokens.length && !terms.length) return null

  const rows = (snapshot.inventorySnapshots || [])
    .filter((row) => row.source === 'easystore' || row.source === 'easy_store' || String(row.id || '').startsWith('es_stock_'))
    .map((row) => {
      const sku = normalizeSearchText(row.sku)
      const productName = normalizeSearchText(row.productName)
      const productId = normalizeSearchText(row.productId)
      const haystack = [productName, sku, productId].filter(Boolean).join(' ')
      let score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0)
      for (const term of terms) {
        if (sku && sku === term) score += 30
        else if (sku && (sku.includes(term) || term.includes(sku))) score += 20
        else if (productName && productName.includes(term)) score += 3
        else if (productId && productId === term) score += 10
      }
      return { row, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || String(b.row.checkedAt || '').localeCompare(String(a.row.checkedAt || '')))

  if (!rows.length) return null
  const bestProductId = rows[0].row.productId || rows[0].row.productName || rows[0].row.sku
  const variants = rows
    .filter((item) => (item.row.productId || item.row.productName || item.row.sku) === bestProductId)
    .map((item) => item.row)
    .sort((a, b) => Number(b.available || 0) - Number(a.available || 0))

  const productName = variants.find((row) => row.productName)?.productName || variants[0]?.sku || 'สินค้า'
  const availableTotal = variants.reduce((sum, row) => sum + Math.max(0, Number(row.available || 0)), 0)
  const prices = variants.map((row) => Number(row.price || 0)).filter((price) => Number.isFinite(price) && price > 0)
  const price = prices.length ? Math.min(...prices) : null
  const checkedAt = variants.map((row) => row.checkedAt).filter(Boolean).sort().at(-1) || null
  return {
    productId: variants[0]?.productId || null,
    productName,
    availableTotal,
    price,
    checkedAt,
    variants: variants.slice(0, 5).map((row) => ({
      id: row.id || null,
      sku: row.sku || '',
      available: Number(row.available || 0),
      price: Number(row.price || 0) || null,
      imageUrl: row.imageUrl || row.image_url || row.image?.url || '',
    })),
  }
}

function shouldLookupEasyStoreLive(intent) {
  return ['stock', 'price', 'productImage', 'orderPurchase', 'sizeAdvice', 'discount', 'alternativeProduct', 'shipping'].includes(intent)
}

function easyStoreSearchKeyword(thread, snapshot, originContext = null) {
  const latestInbound = latestInboundMessage(thread, snapshot)
  const recentProductText = recentMessagesForThread(thread, snapshot)
    .filter((message) => message.direction === 'inbound')
    .map((message) => message.text)
    .join(' ')
  const raw = [
    latestInbound?.text,
    recentProductText,
    originProductLabel(originContext || {}),
    originContext?.productHint?.text,
    originContext?.live?.productName,
    originContext?.live?.sku,
  ].filter(Boolean).join(' ')
  const terms = searchTerms(raw)
    .filter((term) => !PRODUCT_LOOKUP_GENERIC_TERMS.has(term))
    .filter((term) => !/^(s|m|l|xl|xxl|2xl|3xl|4xl|5xl)$/i.test(term))
  const keyword = terms.slice(0, 8).join(' ').trim()
  return keyword || ''
}

function normalizeEasyStoreLiveProduct(row = {}) {
  const available = Number(row.available ?? row.availableStock ?? row.stock ?? row.quantity ?? 0)
  const price = Number(row.price ?? row.sellPrice ?? row.unitPrice ?? row.regularPrice ?? 0)
  const productId = row.productId || row.product_id || row.id || null
  const variantId = row.variantId || row.variant_id || null
  const id = row.id || row.inventoryId || [productId, variantId].filter(Boolean).join(':') || row.sku || null
  const name = row.productName || row.title || row.name || row.sku || 'สินค้า'
  return {
    id,
    sku: row.sku || row.variantSku || '',
    source: row.source || 'easystore_live',
    available: Number.isFinite(available) ? Math.max(0, available) : 0,
    checkedAt: row.checkedAt || new Date().toISOString(),
    productId,
    variantId,
    productName: name,
    color: row.color || detectColor([row.sku, name].filter(Boolean).join(' ')),
    size: String(row.size || detectSize([row.sku, name].filter(Boolean).join(' '))).toUpperCase(),
    price: Number.isFinite(price) && price > 0 ? price : null,
    imageUrl: row.imageUrl || row.image_url || row.image?.url || row.images?.[0]?.url || '',
  }
}

function scoreEasyStoreLiveProduct(row, { terms = [], color = '', size = '' } = {}) {
  const sku = normalizeSearchText(row.sku)
  const productName = normalizeSearchText(row.productName)
  const productId = normalizeSearchText(row.productId)
  const haystack = [sku, productName, productId, normalizeSearchText(row.color), normalizeSearchText(row.size)].filter(Boolean).join(' ')
  let score = 0
  for (const term of terms) {
    if (!term) continue
    if (sku && sku === term) score += 30
    else if (sku && (sku.includes(term) || term.includes(sku))) score += 18
    else if (productId && productId === term) score += 12
    else if (productName && productName.includes(term)) score += 6
    else if (haystack.includes(term)) score += 2
  }
  if (color && normalizeSearchText(row.color) === normalizeSearchText(color)) score += 4
  if (size && normalizeSearchText(row.size) === normalizeSearchText(size)) score += 4
  return score
}

function productMatchesIdentity(row, terms = []) {
  if (!terms.length) return true
  const haystack = [
    row.sku,
    row.productName,
    row.productId,
  ].map(normalizeSearchText).filter(Boolean).join(' ')
  return terms.some((term) => haystack.includes(term))
}

async function productFactsFromEasyStoreLive({ easyStore, thread, snapshot, originContext, intent }) {
  if (!easyStore || typeof easyStore.searchProducts !== 'function' || !shouldLookupEasyStoreLive(intent)) return null
  const keyword = easyStoreSearchKeyword(thread, snapshot, originContext)
  if (!keyword) return null
  let result
  try {
    result = await easyStore.searchProducts({ keyword, limit: 10 })
  } catch (_error) {
    return null
  }
  const products = Array.isArray(result?.products) ? result.products : []
  const variants = products
    .map(normalizeEasyStoreLiveProduct)
    .filter((row) => row.productId || row.sku || row.productName)
    .slice(0, 10)
  if (!variants.length) return null

  const latestInbound = latestInboundMessage(thread, snapshot)
  const recentInboundText = recentMessagesForThread(thread, snapshot)
    .filter((message) => message.direction === 'inbound')
    .map((message) => message.text)
    .join(' ')
  const rawQuery = [
    latestInbound?.text,
    recentInboundText,
    originProductLabel(originContext || {}),
    originContext?.productHint?.text,
    originContext?.live?.productName,
    originContext?.live?.sku,
  ].filter(Boolean).join(' ')
  const requiredIdentityTerms = productIdentityTerms(rawQuery)
  if (requiredIdentityTerms.length && !variants.some((row) => productMatchesIdentity(row, requiredIdentityTerms))) {
    return { conflict: true, reason: 'easystore_live_product_conflict' }
  }
  const candidateVariants = requiredIdentityTerms.length
    ? variants.filter((row) => productMatchesIdentity(row, requiredIdentityTerms))
    : variants
  const scoreContext = {
    terms: searchTerms(rawQuery),
    color: detectColor(rawQuery),
    size: detectSize(rawQuery),
  }
  const scored = candidateVariants
    .map((row) => ({ row, score: scoreEasyStoreLiveProduct(row, scoreContext) }))
    .sort((a, b) => b.score - a.score || Number(b.row.available || 0) - Number(a.row.available || 0))
  if (!scored.length || scored[0].score <= 0) return null

  const bestProductId = scored[0].row.productId || scored[0].row.productName || scored[0].row.sku
  const matched = scored
    .map((item) => item.row)
    .filter((row) => (row.productId || row.productName || row.sku) === bestProductId)
    .sort((a, b) => Number(b.available || 0) - Number(a.available || 0))
  const productName = matched.find((row) => row.productName)?.productName || matched[0]?.sku || 'สินค้า'
  const prices = matched.map((row) => Number(row.price || 0)).filter((price) => Number.isFinite(price) && price > 0)
  return {
    source: 'easystore_live',
    productId: matched[0]?.productId || null,
    productName,
    availableTotal: matched.reduce((sum, row) => sum + Math.max(0, Number(row.available || 0)), 0),
    price: prices.length ? Math.min(...prices) : null,
    checkedAt: matched.map((row) => row.checkedAt).filter(Boolean).sort().at(-1) || null,
    variants: matched.slice(0, 5).map((row) => ({
      id: row.id || null,
      sku: row.sku || '',
      available: Number(row.available || 0),
      price: Number(row.price || 0) || null,
      imageUrl: row.imageUrl || '',
    })),
  }
}

function productFactsText(productFacts) {
  if (!productFacts) return ''
  const availableTotal = Number(productFacts.availableTotal || 0)
  const variantText = (productFacts.variants || [])
    .map((variant) => `${variant.sku || 'SKU'} คงเหลือ ${variant.available} ชิ้น${variant.price ? ` ราคา ${moneyText(variant.price)} บาท` : ''}`)
    .join(' · ')
  return [
    `สินค้า: ${productFacts.productName}`,
    availableTotal > 0 ? `พร้อมส่งรวม ${availableTotal} ชิ้น` : 'สต็อกคงเหลือรวม 0 ชิ้น',
    productFacts.price ? `ราคาเริ่มต้น ${moneyText(productFacts.price)} บาท` : '',
    variantText ? `ตัวเลือก: ${variantText}` : '',
    productFacts.checkedAt ? `เช็กล่าสุด ${productFacts.checkedAt}` : '',
  ].filter(Boolean).join('\n')
}

function draftFromProductFacts(intent, productFacts, slots = {}) {
  if (!productFacts || !['stock', 'price'].includes(intent)) return ''
  const price = productFacts.price ? ` ราคาเริ่มต้น ${moneyText(productFacts.price)} บาท` : ''
  const available = Number(productFacts.availableTotal || 0)
  const availableText = available > 0 ? `พร้อมส่งรวม ${available} ชิ้น` : 'ตอนนี้ยังไม่พบสต็อกคงเหลือ'
  const detail = [
    productFacts.productName,
    slots.color ? `สี${slots.color}` : '',
    slots.size ? `ไซซ์ ${slots.size}` : '',
  ].filter(Boolean).join(' ')
  const variantText = (productFacts.variants || [])
    .filter((variant) => variant.available > 0)
    .slice(0, 3)
    .map((variant) => `${variant.sku} ${variant.available} ชิ้น`)
    .join(', ')
  const optionText = variantText ? ` ตัวเลือกที่มี: ${variantText}` : ''
  return `เช็กให้แล้วค่ะ ${detail} ${availableText}${price}.${optionText} ถ้าต้องการตัวนี้ แจ้งสี/ไซซ์ที่ต้องการหรือให้แอดมินปิดออเดอร์ต่อในแชทได้เลยค่ะ`
}

function salesWorkflowDraft({ intent, originContext = null, productFacts = null, slots = {} }) {
  const productLabel = slots.productLabel || originProductLabel(originContext || '')
  const productText = productFacts?.productName || productLabel || 'สินค้าที่สนใจ'
  const color = slots.color || ''
  const size = slots.size || ''
  const hasColor = Boolean(color)
  const hasSize = Boolean(size)
  const hasPlusSizeSignal = isPlusSizeLabel(size) || hasPlusSizeMeasurements(slots.measurements)

  if (intent === 'stock') {
    if (hasSize && !hasColor) {
      return `${size} ได้ค่ะ สนใจสีไหนคะ จะได้เช็กสต็อก ${productText} ให้ตรงตัวค่ะ`
    }
    if (hasColor && !hasSize) {
      return `สี${color} ได้ค่ะ สนใจไซซ์ไหนคะ จะได้เช็กสต็อกให้ตรงตัวค่ะ`
    }
  }

  if (intent === 'price') {
    if (hasColor && hasSize) {
      const price = productFacts?.price ? ` ราคา ${moneyText(productFacts.price)} บาท` : ''
      const stock = productFacts && Number(productFacts.availableTotal || 0) > 0 ? ' พร้อมส่งค่ะ' : ' เดี๋ยวเช็กพร้อมส่งให้อีกครั้งค่ะ'
      return `${productText} สี${color} ไซซ์ ${size}${price}${stock}`
    }
    const price = productFacts?.price ? `ราคาเริ่มต้น ${moneyText(productFacts.price)} บาทค่ะ` : 'เดี๋ยวเช็กราคาให้ค่ะ'
    return `${productText} ${price} สนใจสีหรือไซซ์ไหนคะ เดี๋ยวเช็กสต็อกให้ตรงตัวค่ะ`
  }

  if (intent === 'sizeAdvice') {
    if (hasPlusSizeSignal) {
      const signalText = isPlusSizeLabel(size) ? `ไซซ์ ${size}` : 'จากสัดส่วนที่แจ้ง'
      return `${signalText} เข้าเกณฑ์สาวอวบของร้านค่ะ ${productText} มีไซซ์ใหญ่รองรับ เดี๋ยวช่วยเช็กสีและสต็อกให้ตรงตัวนะคะ`
    }
    return `รบกวนแจ้งอก เอว สะโพกหน่อยค่ะ เดี๋ยวเทียบไซซ์ ${productText} ให้ว่าใส่ไซซ์ไหนสวยสุดค่ะ`
  }

  if (intent === 'orderPurchase') {
    const detail = [productText, hasColor ? `สี${color}` : '', hasSize ? `ไซซ์ ${size}` : ''].filter(Boolean).join(' ')
    const price = productFacts?.price ? ` ราคา ${moneyText(productFacts.price)} บาท` : ''
    return `สรุปรายการนะคะ ${detail || 'สินค้าที่เลือก'}${price}${productFacts && Number(productFacts.availableTotal || 0) > 0 ? ' พร้อมส่งค่ะ' : ''} ชำระเงินได้ตามช่องทางที่แอดมินแจ้งไว้ หลังชำระแล้วส่งสลิปมาได้เลยนะคะ`
  }

  if (intent === 'paymentProof') {
    return 'ขอบคุณค่ะ รบกวนขอชื่อ เบอร์โทร และที่อยู่จัดส่งนะคะ เดี๋ยวสรุปออเดอร์ให้ตรวจอีกครั้งค่ะ'
  }

  if (intent === 'alternativeProduct') {
    return 'ได้ค่ะ เดี๋ยวแนะนำใกล้เคียงให้ 3 แบบนะคะ ไม่ชอบตรงสี ทรง หรือความยาวคะ จะได้เลือกให้ตรงขึ้นค่ะ'
  }

  if (intent === 'discount') {
    return 'ตอนนี้ราคานี้เป็นราคาพร้อมส่งค่ะ ถ้ามีโปรหรือของแถม เดี๋ยวให้แอดมินเช็กให้ก่อนนะคะ'
  }

  if (intent === 'shipping') {
    return 'เดี๋ยวเช็กค่าส่งและรอบจัดส่งตามรายการให้ค่ะ ถ้าสรุปรุ่น สี และไซซ์แล้ว แอดมินจะแจ้งยอดที่ถูกต้องให้ทันทีค่ะ'
  }

  return ''
}

function draftForIntent(intent, originContext = null, productFacts = null, slots = {}) {
  const productDraft = draftFromProductFacts(intent, productFacts, slots)
  const workflowDraft = salesWorkflowDraft({ intent, originContext, productFacts, slots })
  if (productDraft) return productDraft
  if (workflowDraft) return workflowDraft
  const productLabel = originProductLabel(originContext || {})
  const isLive = originContext?.sourceType === 'live'
  if (intent === 'productImage') {
    if (productLabel) return `ลูกค้าขอดูภาพ ${productLabel} ควรให้แอดมินแนบรูปสินค้าจริงหรือ product card ก่อนตอบกลับค่ะ`
    return 'ลูกค้าขอดูภาพสินค้า ควรให้แอดมินแนบรูปสินค้าจริงหรือ product card ก่อนตอบกลับค่ะ'
  }
  if (intent === 'stock') {
    if (productLabel) return `ได้ค่ะ เดี๋ยวช่วยเช็กสต็อก ${productLabel} ให้ตรงตัวค่ะ รบกวนแจ้งสีหรือไซซ์ที่ต้องการเพิ่มได้เลยนะคะ`
    if (isLive) return 'สนใจตัวไหนในไลฟ์คะ บอกชื่อ สี ไซซ์ หรือช่วงเวลาที่เห็นได้เลยค่ะ เดี๋ยวช่วยเช็กให้ตรงตัวค่ะ'
    return 'ได้ค่ะ เดี๋ยวช่วยเช็กสต็อก สี และไซซ์ให้ก่อนนะคะ รบกวนบอกสี/ไซซ์ที่ต้องการ หรือส่งรูปสินค้าที่สนใจมาได้เลยค่ะ'
  }
  if (intent === 'price') {
    if (productLabel) return `ได้ค่ะ เดี๋ยวช่วยเช็กราคา โปร และค่าส่งสำหรับ ${productLabel} ให้ถูกต้องค่ะ รบกวนแจ้งสีหรือไซซ์ที่สนใจได้เลยนะคะ`
    if (isLive) return 'สนใจตัวไหนในไลฟ์คะ บอกชื่อ สี ไซซ์ หรือช่วงเวลาที่เห็นได้เลยค่ะ เดี๋ยวช่วยเช็กราคาและโปรให้ตรงตัวค่ะ'
    return 'ได้ค่ะ เดี๋ยวสรุปราคา โปร และค่าส่งที่ใช้ได้ให้ชัดเจนนะคะ ถ้าสนใจรุ่นไหนเป็นพิเศษ ส่งชื่อรุ่นหรือรูปมาได้เลยค่ะ'
  }
  if (intent === 'orderStatus') return 'ได้ค่ะ เดี๋ยวช่วยเช็กสถานะคำสั่งซื้อให้ก่อนนะคะ เพื่อความถูกต้อง รบกวนส่งเลขออเดอร์ใน inbox แล้วแอดมินจะแจ้งสถานะกลับไปค่ะ'
  if (intent === 'refund') return 'รับทราบค่ะ เคสคืนเงิน ยกเลิก หรือเคลม ต้องให้แอดมินตรวจสอบรายละเอียดก่อนนะคะ เดี๋ยวส่งเรื่องให้ตรวจและจะแจ้งขั้นตอนที่ถูกต้องกลับไปค่ะ'
  if (intent === 'humanReview') return 'ขอหยุดให้แอดมินตรวจคำตอบก่อนนะคะ เพื่อไม่ให้ตอบข้อมูลผิดซ้ำค่ะ'
  return 'รับทราบค่ะ เดี๋ยวช่วยดูรายละเอียดให้ครบก่อนนะคะ ถ้ามีรุ่น สี ไซซ์ หรือเลขออเดอร์ที่เกี่ยวข้อง ส่งเพิ่มมาได้เลยค่ะ'
}

const KNOWLEDGE_STOP_WORDS = new Set([
  'ค่ะ',
  'ครับ',
  'ราคา',
  'เท่าไหร่',
  'มีของไหม',
  'มีไหม',
  'ขอรูป',
  'ไซซ์',
  'สี',
  'สินค้า',
  'พร้อมส่ง',
])

function queryTokensForKnowledge(queryText = '') {
  const tokens = [...new Set(String(queryText || '')
    .toLowerCase()
    .match(/[a-z0-9ก-๙]{2,}/g) || [])]
    .filter((token) => !KNOWLEDGE_STOP_WORDS.has(token))
  const thaiSubtokens = []
  for (const token of tokens) {
    if (!/^[ก-๙]+$/.test(token) || token.length < 6) continue
    for (let size = 4; size <= Math.min(10, token.length); size += 1) {
      for (let index = 0; index + size <= token.length; index += 1) {
        thaiSubtokens.push(token.slice(index, index + size))
      }
    }
  }
  return [...new Set([...tokens, ...thaiSubtokens])]
    .filter((token) => !KNOWLEDGE_STOP_WORDS.has(token))
    .slice(0, 48)
}

function relevantKnowledge(intent, snapshot, { workspaceId, queryText = '' } = {}) {
  const termsByIntent = {
    stock: ['สินค้า', 'stock', 'product', 'faq'],
    price: ['ราคา', 'โปร', 'price', 'product'],
    productImage: ['สินค้า', 'รูป', 'ภาพ', 'image', 'product'],
    sizeAdvice: ['สินค้า', 'ไซซ์', 'ไซส์', 'size', 'product', 'stock'],
    orderPurchase: ['สินค้า', 'order', 'payment', 'product', 'price', 'stock'],
    discount: ['สินค้า', 'โปร', 'price', 'product'],
    alternativeProduct: ['สินค้า', 'product', 'แบบอื่น', 'รุ่น'],
    shipping: ['สินค้า', 'shipping', 'delivery', 'product'],
    orderStatus: ['พัสดุ', 'shipping', 'order', 'payment'],
    refund: ['คืน', 'refund', 'exchange', 'policy'],
    faq: ['faq', 'policy'],
  }
  const terms = termsByIntent[intent] || termsByIntent.faq
  const queryTokens = queryTokensForKnowledge(queryText)
  return (snapshot.knowledgeSources || [])
    .filter((source) => source.status === 'ready')
    .filter((source) => {
      // Workspace boundary: sources without workspaceId default to ws_oagent
      // When workspaceId is given, strict match — no cross-workspace leakage
      if (!workspaceId) return true
      const sourceWs = source.workspaceId || 'ws_oagent'
      return sourceWs === workspaceId
    })
    .filter((source) => {
      const haystack = [source.title, source.content, ...(source.tags || [])].join(' ').toLowerCase()
      return terms.some((term) => haystack.includes(term.toLowerCase()))
    })
    .map((source) => {
      const title = String(source.title || '').toLowerCase()
      const content = String(source.content || '').toLowerCase()
      const tags = (source.tags || []).join(' ').toLowerCase()
      const haystack = [title, content, tags].join(' ')
      const intentScore = terms.reduce((total, term) => total + (haystack.includes(term.toLowerCase()) ? 1 : 0), 0)
      const queryScore = queryTokens.reduce((total, token) => {
        if (title.includes(token)) return total + 8
        if (tags.includes(token)) return total + 5
        if (content.includes(token)) return total + 3
        return total
      }, 0)
      const score = intentScore + queryScore
      return { source, score }
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return String(b.source.updatedAt || '').localeCompare(String(a.source.updatedAt || ''))
    })
    .map((item) => item.source)
    .slice(0, 3)
}

function isEasyStoreProductKnowledge(source = {}) {
  const id = String(source.id || '')
  const tags = (source.tags || []).map((tag) => String(tag).toLowerCase())
  return id === 'ks_annalynn_easystore_products_v1' ||
    id.startsWith('ks_annalynn_product_') ||
    (tags.includes('easystore') && tags.includes('product'))
}

function knowledgeTextForPrompt(source = {}, index = 0) {
  if (!isEasyStoreProductKnowledge(source)) {
    return `[${index + 1}] ${source.title}\n${String(source.content || '').slice(0, 900)}`
  }
  return [
    `[${index + 1}] ${source.title}`,
    'ใช้ source นี้เพื่อจับชื่อ/alias/SKU ของสินค้าเท่านั้น',
    'ห้ามใช้ source นี้เป็นราคา สต็อก หรือสถานะพร้อมส่ง ให้ใช้ EasyStore live lookup เท่านั้น',
  ].join('\n')
}

function agentForThread(thread, snapshot) {
  const page = (snapshot.pages || []).find((item) => item.id === thread.pageId)
  const agent = (snapshot.agentProfiles || []).find((item) => item.id === page?.agentProfileId) || null
  return agent || { name: PAGE_AGENT_FALLBACKS[thread.pageId] || 'น้องอันนา' }
}

function customerForThread(thread, snapshot) {
  return (snapshot.customers || []).find((item) => item.id === thread.customerId) || null
}

function recentMessagesForThread(thread, snapshot) {
  return (snapshot.messages || [])
    .filter((message) => message.threadId === thread.id)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    .slice(-8)
}

function normalizeRichMessage(input = {}) {
  const richMessage = input?.ai?.richMessage || input?.richMessage || {}
  const text = String(richMessage.text || '').replace(/\s+/g, ' ').trim()
  return {
    enabled: richMessage.enabled === true && Boolean(text),
    text: text.slice(0, 180),
  }
}

function shouldApplyRichMessage(thread, snapshot) {
  return !(snapshot.messages || []).some((message) => (
    message.threadId === thread.id &&
    message.direction === 'outbound' &&
    !String(message.sourceRef || '').startsWith('ai_follow_up_draft:')
  ))
}

function richMessageForThread(thread, snapshot) {
  const richMessage = normalizeRichMessage(snapshot.settings || {})
  if (!richMessage.enabled || !shouldApplyRichMessage(thread, snapshot)) return null
  return richMessage
}

function applyRichMessageToDraft(draftText, richMessage) {
  const draft = String(draftText || '').trim()
  if (!richMessage?.enabled) return draft
  if (draft.includes(richMessage.text)) return draft
  return `${richMessage.text} ${draft}`.trim().slice(0, MAX_DRAFT_CHARS)
}

function normalizeSalesAssets(input = {}) {
  const salesAssets = input?.ai?.salesAssets || input?.salesAssets || {}
  return {
    enabled: salesAssets.enabled !== false,
    sizeChartImageUrl: String(salesAssets.sizeChartImageUrl || salesAssets.size_chart_image_url || '').trim(),
  }
}

function latestPaymentLinkForThread(thread, snapshot) {
  const threadOrderIds = new Set((snapshot.orderLinks || [])
    .filter((link) => link.threadId === thread.id)
    .map((link) => link.orderId)
    .filter(Boolean))
  const payments = (snapshot.paymentRequests || [])
    .filter((payment) => (
      payment.threadId === thread.id ||
      (payment.orderId && threadOrderIds.has(payment.orderId))
    ))
    .filter((payment) => !['paid', 'failed', 'expired', 'cancelled'].includes(String(payment.status || '').toLowerCase()))
    .filter((payment) => String(payment.checkoutUrl || payment.messagePreview || '').includes('http'))
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
  const payment = payments[0] || null
  if (!payment) return null
  const preview = String(payment.messagePreview || '').trim()
  const checkoutUrl = String(payment.checkoutUrl || '').trim()
  const url = checkoutUrl || (preview.match(/https?:\/\/\S+/i)?.[0] || '')
  if (!url) return null
  return {
    id: payment.id,
    amount: Number(payment.amount || 0),
    currency: payment.currency || 'THB',
    url,
    text: preview && preview.includes(url) ? preview : `ลิงก์ชำระเงิน: ${url}`,
  }
}

function appendPaymentLinkToDraft(draftText, paymentLink, intent) {
  const draft = String(draftText || '').trim()
  if (!paymentLink?.url || !['orderPurchase', 'paymentProof', 'price', 'stock'].includes(intent)) return draft
  if (draft.includes(paymentLink.url)) return draft
  return `${draft}\n${paymentLink.text}`.trim().slice(0, MAX_DRAFT_CHARS)
}

function safeImageUrl(value) {
  const url = String(value || '').trim()
  return /^https:\/\//i.test(url) ? url : ''
}

function variantLabel(variant = {}, productName = 'สินค้า') {
  const sku = String(variant.sku || '').trim()
  const color = detectColor([variant.color, sku].filter(Boolean).join(' '))
  const size = String(variant.size || detectSize([variant.size, sku].filter(Boolean).join(' '))).toUpperCase()
  return [productName, color ? `สี${color}` : '', size ? `ไซซ์ ${size}` : '', sku].filter(Boolean).join(' · ')
}

function buildSalesAttachments({ productFacts, settings }) {
  const salesAssets = normalizeSalesAssets(settings)
  if (!salesAssets.enabled) return []
  const productName = productFacts?.productName || 'สินค้า'
  const rows = []
  for (const [index, variant] of (productFacts?.variants || []).entries()) {
    const url = safeImageUrl(variant.imageUrl)
    if (!url || rows.some((item) => item.url === url)) continue
    rows.push({
      id: `ai_product_asset_${index + 1}`,
      name: variantLabel(variant, productName).slice(0, 120),
      type: 'image/jpeg',
      size: 0,
      url,
      source: 'ai_product_carousel',
    })
  }
  const sizeChartUrl = safeImageUrl(salesAssets.sizeChartImageUrl)
  if (sizeChartUrl && !rows.some((item) => item.url === sizeChartUrl)) {
    rows.push({
      id: 'ai_size_chart_1',
      name: 'ตารางไซซ์',
      type: 'image/jpeg',
      size: 0,
      url: sizeChartUrl,
      source: 'ai_size_chart',
    })
  }
  return rows.slice(0, 5)
}

function buildSalesCarousel({ productFacts, attachments, paymentLink }) {
  const productName = productFacts?.productName || 'สินค้า'
  return (attachments || []).map((attachment) => {
    const isSizeChart = attachment.source === 'ai_size_chart'
    const title = isSizeChart ? 'ตารางไซซ์' : String(attachment.name || productName).slice(0, 80)
    const subtitle = isSizeChart
      ? 'เทียบไซซ์ก่อนปิดออเดอร์'
      : [
        productFacts?.price ? `ราคา ${moneyText(productFacts.price)} บาท` : '',
        Number(productFacts?.availableTotal || 0) > 0 ? `พร้อมส่งรวม ${productFacts.availableTotal} ชิ้น` : '',
      ].filter(Boolean).join(' · ').slice(0, 80)
    return {
      title,
      ...(subtitle ? { subtitle } : {}),
      imageUrl: attachment.url,
      ...(paymentLink?.url ? { buttons: [{ type: 'web_url', title: 'ชำระเงิน', url: paymentLink.url }] } : {}),
    }
  }).slice(0, 10)
}

function compactOriginContext(thread, messages = []) {
  const latestWithOrigin = messages
    .slice()
    .reverse()
    .find((message) => message.originContext && Object.keys(message.originContext).length)
  const origin = {
    ...(thread.originContext || {}),
    ...(latestWithOrigin?.originContext || {}),
  }
  if (!Object.keys(origin).length) return null
  return {
    channel: origin.channel || thread.platform || null,
    sourceType: origin.sourceType || null,
    ref: origin.ref || null,
    ad: origin.ad || null,
    post: origin.post || null,
    live: origin.live || null,
    productHint: origin.productHint || null,
    replyFrame: origin.replyFrame || null,
  }
}

function originContextText(origin) {
  if (!origin) return '(ไม่มี origin context จากแอด/โพสต์/ไลฟ์)'
  return [
    `channel: ${origin.channel || '-'}`,
    `source_type: ${origin.sourceType || '-'}`,
    origin.ref ? `ref: ${origin.ref}` : '',
    origin.ad?.id || origin.ad?.title ? `ad: ${[origin.ad?.id, origin.ad?.title].filter(Boolean).join(' · ')}` : '',
    origin.ad?.campaignName ? `campaign: ${origin.ad.campaignName}` : '',
    origin.post?.id || origin.post?.title ? `post: ${[origin.post?.id, origin.post?.title].filter(Boolean).join(' · ')}` : '',
    origin.post?.text ? `post_text: ${String(origin.post.text).slice(0, 240)}` : '',
    origin.live?.id || origin.live?.productName || origin.live?.sku
      ? `live: ${[
        origin.live?.id,
        origin.live?.videoId ? `video ${origin.live.videoId}` : '',
        origin.live?.productId ? `product ${origin.live.productId}` : '',
        origin.live?.sku ? `sku ${origin.live.sku}` : '',
        origin.live?.productName,
        origin.live?.color ? `สี ${origin.live.color}` : '',
        origin.live?.size ? `ไซซ์ ${origin.live.size}` : '',
      ].filter(Boolean).join(' · ')}`
      : '',
    origin.live?.clickedAt ? `live_clicked_at: ${origin.live.clickedAt}` : '',
    origin.productHint?.text || origin.productHint?.color || origin.productHint?.size
      ? `product_hint: ${[
        origin.productHint?.text,
        origin.productHint?.color ? `สี ${origin.productHint.color}` : '',
        origin.productHint?.size ? `ไซซ์ ${origin.productHint.size}` : '',
      ].filter(Boolean).join(' · ')}`
      : '',
    origin.replyFrame ? `reply_frame: ${origin.replyFrame}` : '',
  ].filter(Boolean).join('\n')
}

function buildCustomerReplyPrompt({ thread, snapshot, policy, baseDecision }) {
  const agent = agentForThread(thread, snapshot)
  const customer = customerForThread(thread, snapshot)
  const threadPage = (snapshot.pages || []).find((p) => p.id === thread.pageId)
  const workspaceId = threadPage?.workspaceId || undefined
  const recentMessages = recentMessagesForThread(thread, snapshot)
  const origin = compactOriginContext(thread, recentMessages)
  const knowledgeQueryText = [
    recentMessages.map((message) => message.text || '').join(' '),
    originContextText(origin),
    baseDecision.knowledgeQueryText || '',
  ].join(' ')
  const knowledge = relevantKnowledge(baseDecision.intent, snapshot, { workspaceId, queryText: knowledgeQueryText })
  const productFacts = baseDecision.productFacts || productFactsForThread(thread, snapshot, origin)
  const richMessage = richMessageForThread(thread, snapshot)
  const messages = recentMessages
    .map((message) => `${message.direction === 'inbound' ? 'ลูกค้า' : 'เพจ'}: ${message.text}`)
    .join('\n')
  const knowledgeText = knowledge
    .map((source, index) => knowledgeTextForPrompt(source, index))
    .join('\n\n')

  return {
    system: [
      'คุณคือ AI ตอบลูกค้าของ Omni Cloud สำหรับเพจขายสินค้า',
      `ชื่อผู้ช่วย: ${agent?.name || 'AI Page Assistant'}`,
      'ตอบเป็นภาษาไทย สุภาพ ช่วยลูกค้าให้ครบก่อน แล้วค่อยกระชับ ไม่ออกนอกเรื่อง',
      'น้ำเสียงต้องเหมือนแอดมินร้านจริง คุยตรง สุภาพ เป็นธรรมชาติ ไม่เหมือนบอทหรือข้อความแพทเทิร์น',
      'รูปแบบที่บอสชอบคือสั้น ครบ อ่านเร็ว และสุภาพ ตัวอักษรไม่เยอะแต่ลูกค้าต้องเข้าใจทันที',
      'ใช้ bullet point สั้น ๆ ได้เมื่อมีหลายข้อ เช่น ราคา สี ไซซ์ วิธีชำระเงิน หรือข้อมูลที่ต้องขอเพิ่ม แต่ถ้ามีข้อเดียวให้ตอบเป็นประโยคสั้น',
      'ห้ามเขียนย่อหน้ายาว ถ้าข้อความเริ่มยาวให้แยกเป็นบรรทัดสั้น ๆ หรือ bullet point ไม่เกิน 3 ข้อ',
      'ตอบนำด้วยคำตอบหรือ next action ที่ลูกค้าทำต่อได้ทันที ก่อนค่อยขอข้อมูลเพิ่มเท่าที่จำเป็น',
      'ห้ามขึ้นต้นทุกครั้งด้วย "สวัสดีค่ะ" หรือ "รับทราบค่ะ" ถ้าบริบทไม่จำเป็นให้เข้าคำตอบเลย',
      'ถามกลับได้ไม่เกิน 1 คำถามต่อข้อความ และต้องเป็นคำถามเฉพาะจุดที่ยังขาดจริงเท่านั้น',
      'หลีกเลี่ยงประโยคแชทบอทซ้ำ ๆ เช่น เดี๋ยวแอดมินตรวจสอบให้นะคะ, กรุณารอสักครู่, ขอบคุณที่ติดต่อมา ถ้าไม่ได้ช่วยให้ลูกค้าเดินหน้าต่อ',
      'คำตอบควรมี 2-4 ประโยคสั้น ๆ รวมประมาณ 60-120 คำไทย หรือน้อยกว่านั้นถ้าคำถามง่าย',
      'โครงคำตอบ: รับเรื่องจากลูกค้า -> ตอบหรือบอกสิ่งที่จะตรวจสอบ -> ขอข้อมูลที่จำเป็นเฉพาะเท่าที่ต้องใช้ -> ปิดท้ายสุภาพ',
      'ให้ทำงานแบบ Sales Workflow Engine: ก่อนตอบต้องดู context ที่มา ลูกค้า สินค้า สี ไซซ์ สต็อก ราคา และเลือก next best action ไม่ใช่ตอบคำถามกว้าง ๆ',
      'ข้อมูลที่รู้แล้วห้ามถามซ้ำ ถ้ารู้สินค้าแล้วให้ถามสีหรือไซซ์ ถ้ารู้สีแล้วให้ถามไซซ์ ถ้ารู้ไซซ์แล้วให้ถามสี ถ้ารู้ครบแล้วให้พาไปชำระเงินหรือ order draft',
      'ถ้าลูกค้าถามสี ให้ตอบพร้อมส่ง/แนบภาพสีนั้นตามเครื่องมือ และถามไซซ์ที่ต้องการ ห้ามเช็กทุกไซซ์แบบกว้างก่อน',
      'ถ้าลูกค้าถามไซซ์ ให้เช็กสต็อกไซซ์นั้นก่อน และถามสีที่ต้องการพร้อมเสนอภาพสี ห้ามถามสัดส่วนก่อน ยกเว้นลูกค้าถามว่าไซซ์ไหนดีหรือใส่ได้ไหม',
      'ถ้าลูกค้าถามไซซ์ไหนดีหรือใส่ได้ไหม ให้ถามอก เอว สะโพก เพื่อเทียบไซซ์ ไม่ถามน้ำหนัก/ส่วนสูงเป็นหลัก',
      'คำว่า "สาวอวบ" ใช้ได้เฉพาะเมื่อลูกค้าแจ้งไซซ์ XXL/2XL ขึ้นไป หรือแจ้งสัดส่วนเข้าเกณฑ์อก 44 เอว 40 สะโพก 49 นิ้วขึ้นไป ถ้ายังไม่มีเกณฑ์ให้ใช้คำกลาง เช่น มีไซซ์ใหญ่รองรับหรือทรงใส่สบาย',
      'ถ้าลูกค้าถามราคาครั้งแรก ให้ตอบราคา พร้อมภาพสินค้า และถามสี/ไซซ์ต่อ ถ้ารู้สีและไซซ์แล้ว ให้ตอบราคาและพร้อมส่งจากข้อมูลจริง',
      'ถ้าลูกค้าพูดว่าเอา สั่ง CF หรือรับ ให้ส่งสรุปรายการชำระเงินก่อน ที่อยู่จัดส่งเป็นข้อมูลสุดท้ายหลังลูกค้าชำระเงินหรือส่งสลิป',
      'ถ้าลูกค้าส่งสลิปหรือหลักฐานชำระเงิน ให้ขอบคุณและขอชื่อ เบอร์โทร ที่อยู่จัดส่ง จากนั้นสรุปออเดอร์ให้ตรวจ',
      'ถ้าลูกค้าไม่ชอบหรือขอแบบอื่น ให้ถามเหตุผลสั้น ๆ 1 ข้อ และเสนอสินค้าใกล้เคียง 3 แบบ',
      'ถ้าลูกค้าต่อราคา ให้แจ้งราคาตามจริงหรือโปร/ของแถมที่มี ห้ามลดราคาเอง ถ้าไม่ชัวร์ให้ส่งแอดมินตรวจ',
      'ถ้าลูกค้าถามนอกเรื่อง ให้ตอบสั้น ๆ ได้ 1 ครั้ง แล้วดึงกลับมาที่สินค้า/ออเดอร์',
      'ถ้าลูกค้าหายหลังเราถาม ให้ follow-up ได้ครั้งเดียวแล้วตั้งสถานะรอลูกค้า ห้ามตามซ้ำวน',
      'ถ้าเราเคยหาย ให้ย้อนอ่าน 2-3 ข้อความล่าสุดแล้วตอบต่อให้จบ ไม่ขอโทษยาว',
      'ถ้าลูกค้าส่งรูป/สลิป/ภาพแล้วระบบไม่มั่นใจว่าเป็นอะไร ให้ส่งแอดมินตรวจและแจ้งเตือนกลุ่มบอสอุ้ยทาง LINE ห้ามเดาเอง',
      'ถ้ามี origin context จากแอด โพสต์ หรือไลฟ์ ให้ถือว่านั่นคือกรอบหลักของคำตอบ และอย่าถามกว้างซ้ำในสิ่งที่ origin ระบุแล้ว',
      'ถ้า origin ระบุสินค้า สี ไซซ์ SKU แคมเปญ โพสต์ หรือไลฟ์ ให้ตอบอิงสิ่งนั้นทันที และขอเพิ่มเฉพาะข้อมูลที่ยังขาดจริง',
      'ถ้ามีหัวข้อด่วนจากบอส ให้ใส่ใจความนั้นในคำตอบแรกของลูกค้ารายนั้นอย่างเป็นธรรมชาติ และใช้เป็นกรอบแคมเปญหลักในการเสนอขาย',
      'ถ้า origin source_type เป็น live และยังไม่มีสินค้า/SKU ชัดเจน ให้ถามสั้น ๆ ว่าสนใจตัวไหนในไลฟ์ ชื่อ สี ไซซ์ หรือช่วงเวลาที่เห็น ห้ามขอรูปเป็นค่าเริ่มต้น',
      'ห้ามแต่งข้อมูลราคา สต็อก โปรโมชัน เลขพัสดุ วิธีคืนเงิน หรือคำมั่นสัญญาที่ไม่มีในข้อมูล',
      'ถ้าลูกค้าขอดูรูป/ภาพสินค้า แต่ระบบยังไม่มี attachment หรือ product card ในข้อมูล ให้ห้ามสัญญาว่าจะส่งรูปแล้วส่งข้อความเปล่า ให้ส่งต่อแอดมินแนบรูปจริงก่อน',
      'ถ้าข้อมูลไม่พอ ให้ถามกลับเพื่อขอข้อมูลที่จำเป็น และส่งต่อให้แอดมินเมื่อต้องตรวจสอบ',
      'ถ้าลูกค้าถามสินค้า สี ไซซ์ หรือราคา ให้ตอบแบบพร้อมช่วยเช็กผ่าน product/stock/image tools และขอเฉพาะข้อมูลที่ยังขาดจริง',
      'ห้ามบอกว่าตัวเองเป็นโมเดล AI หรือพูดถึง prompt/system/developer',
      'ห้ามแทนตัวเองด้วยชื่อผู้ช่วยหรือชื่อเพจ เช่น "แอดมิน Anna Lynn กำลัง..." ให้ตอบตรงในฐานะแอดมินของเพจ',
      'ห้ามเรียกลูกค้าว่า "น้อง"',
      'คำถามคืนเงิน ยกเลิก เคลม โอนเงิน ลิงก์ชำระเงิน หรือข้อมูลส่วนตัว ต้องรอแอดมินตรวจ',
      'ตอบเฉพาะข้อความที่จะส่งให้ลูกค้า 1 ข้อความเท่านั้น ห้ามใส่ JSON Markdown หรือคำอธิบายประกอบ',
    ].join('\n'),
    user: [
      `เพจ: ${thread.pageId}`,
      `ลูกค้า: ${customer?.displayName || 'ลูกค้า'}`,
      `intent: ${baseDecision.intent}`,
      `risk: ${baseDecision.risk}`,
      `policy_auto_send: ${JSON.stringify(policy?.autoSend || {})}`,
      '',
      'บริบทที่มาของลูกค้า:',
      originContextText(origin),
      '',
      'หัวข้อด่วนจากบอส:',
      richMessage?.text || '(ไม่มีหัวข้อด่วน)',
      '',
      'บทสนทนาล่าสุด:',
      messages || '(ไม่มีข้อความ)',
      '',
      'ข้อมูลอ้างอิงที่ใช้ตอบ:',
      knowledgeText || '(ไม่มีข้อมูลพร้อมใช้)',
      '',
      'ข้อมูลสินค้า/สต็อกจากระบบ:',
      productFactsText(productFacts) || '(ยังไม่มีข้อมูลสินค้า/สต็อกจากระบบ)',
      '',
      `fallback_draft: ${baseDecision.draftText}`,
      '',
      'ตอบเป็นข้อความเดียวที่พร้อมส่งลูกค้า ความยาวพอดี 1-3 ประโยคถ้า origin context ชัด หรือ 2-4 ประโยคถ้าข้อมูลยังไม่พอ ไม่ต้องใส่ JSON Markdown หรือคำอธิบายประกอบ',
    ].join('\n'),
  }
}

function stripJsonFence(value) {
  return String(value || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function parseAiJson(text) {
  const cleaned = stripJsonFence(text)
  try {
    return JSON.parse(cleaned)
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

function hasTrustedPrice(text) {
  return /(?:฿|บาท|THB)\s*\d|\d[\d,.]*\s*(?:บาท|฿|THB)/i.test(String(text || ''))
}

function hasStockAssertion(text) {
  return /(มีสินค้า|สินค้าพร้อม|พร้อมส่ง|ยังมี|มีของ|มีค่ะ|มีครับ)/i.test(String(text || ''))
}

function hasImagePromise(text) {
  return /(เดี๋ยว|จะ|ขอ)?\s*(ส่ง|แนบ).*(รูป|ภาพ|photo|image|product card)|(รูป|ภาพ).*(ให้ดู)/i.test(String(text || ''))
}

function guardedDraftText(text, fallback, { trustedContext = '', productFacts = null } = {}) {
  const draft = String(text || '').replace(/\s+/g, ' ').trim()
  if (draft.length < 4) return fallback
  if (/^here is\b/i.test(draft) || /^```/.test(draft) || /"draftText"\s*:/.test(draft)) return fallback
  if (/(AI Page Assistant|language model|โมเดล|prompt|system|developer)/i.test(draft)) return fallback
  if (/(และ|หรือ|กับ|ของ|ให้|ว่า|น้อง)$/i.test(draft)) return fallback
  if (hasPlusSizeWording(draft) && !hasPlusSizeEvidence([trustedContext, fallback].filter(Boolean).join('\n'))) return fallback
  if (hasTrustedPrice(draft) && !hasTrustedPrice(trustedContext)) return fallback
  if (hasStockAssertion(draft) && !/(พร้อมส่ง|มีสินค้า|stock|available|คงเหลือ|สต็อก)/i.test(trustedContext)) return fallback
  if (Number(productFacts?.availableTotal || 0) <= 0 && hasStockAssertion(draft)) return fallback
  if (hasImagePromise(draft) && !/(imageUrl|image_url|product card|attachment|แนบรูปจริง)/i.test(trustedContext)) return fallback
  return draft.slice(0, MAX_DRAFT_CHARS)
}

function openAiReplyResponseFormat() {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'omni_guarded_reply',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          draftText: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reason: { type: 'string' },
        },
        required: ['draftText', 'confidence', 'reason'],
        additionalProperties: false,
      },
    },
  }
}

export function canUseEasyStoreLiveLookup(env = process.env) {
  if (env.OMNI_AI_EASYSTORE_LIVE_LOOKUP === '0') return false
  if (env.OMNI_AI_EASYSTORE_LIVE_LOOKUP === '1') return true
  return Boolean(
    String(env.EASY_STORE_SHOP || '').trim()
    && String(env.EASY_STORE_ACCESS_TOKEN || '').trim()
    && String(env.EASY_STORE_CLIENT_ID || '').trim()
    && String(env.EASY_STORE_CLIENT_SECRET || '').trim(),
  )
}

export function createAiReplyEngine({ provider = DEFAULT_PROVIDER, model = DEFAULT_MODEL, fetchImpl = fetch, easyStore = null } = {}) {
  function runHelper(payload) {
    return new Promise((resolve, reject) => {
      const child = spawn(DEFAULT_HELPER, ['draft'], {
        env: {
          ...process.env,
          OMNI_AI_PROVIDER: provider,
          OMNI_AI_MODEL: model,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      const timeout = setTimeout(() => {
        child.kill('SIGTERM')
        reject(new Error('ai_helper_timeout'))
      }, Number(process.env.OMNI_AI_TIMEOUT_MS || 60000))
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk) => { stdout += chunk })
      child.stderr.on('data', (chunk) => { stderr += chunk })
      child.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timeout)
        if (code === 0) return resolve(stdout)
        const error = new Error(stderr || `ai_helper_exit_${code}`)
        error.stdout = stdout
        reject(error)
      })
      child.stdin.end(JSON.stringify(payload))
    })
  }

  async function draftWithHelper({ thread, snapshot, policy, baseDecision }) {
    let payload
    try {
      const stdout = await runHelper({ thread, snapshot, policy, decision: baseDecision })
      payload = JSON.parse(stdout)
    } catch (error) {
      if (error.stdout) {
        try {
          payload = JSON.parse(error.stdout)
        } catch {
          return { ...baseDecision, ok: false, error: error.message || 'ai_helper_failed' }
        }
      } else {
        return { ...baseDecision, ok: false, error: error.message || 'ai_helper_failed' }
      }
    }
    if (!payload.ok) return { ...baseDecision, ok: false, error: payload.error || 'ai_helper_failed' }
    return {
      ...baseDecision,
      provider: payload.provider || provider,
      model: payload.model || model,
      draftText: applyRichMessageToDraft(appendPaymentLinkToDraft(
        String(payload.draftText || baseDecision.draftText || '').trim(),
        baseDecision.paymentLink,
        baseDecision.intent,
      ), baseDecision.richMessage),
      confidence: Number(payload.confidence || baseDecision.confidence || 0.74),
      reason: payload.reason || baseDecision.reason,
    }
  }

  async function draftWithOpenAI({ thread, snapshot, policy, baseDecision }) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return { ...baseDecision, ok: false, error: 'openai_api_key_missing' }
    const _oaiPage = (snapshot.pages || []).find((p) => p.id === thread.pageId)
    const _oaiWsId = _oaiPage?.workspaceId || undefined
    const prompt = buildCustomerReplyPrompt({ thread, snapshot, policy, baseDecision })
    const url = `${OPENAI_API_BASE}/chat/completions`
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: Number(process.env.OMNI_AI_TEMPERATURE || 0.2),
        max_tokens: Number(process.env.OMNI_AI_MAX_OUTPUT_TOKENS || 1024),
        response_format: openAiReplyResponseFormat(),
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      return {
        ...baseDecision,
        ok: true,
        provider: 'openai',
        model,
        draftText: baseDecision.draftText,
        confidence: Math.min(baseDecision.confidence || 0.7, 0.68),
        reason: `openai_error_fallback:${payload?.error?.message || response.status}`,
        helperError: payload?.error?.message || `openai_http_${response.status}`,
      }
    }
    const text = payload?.choices?.[0]?.message?.content?.trim() || ''
    if (!text) {
      return {
        ...baseDecision,
        ok: true,
        provider: 'openai',
        model,
        draftText: baseDecision.draftText,
        confidence: Math.min(baseDecision.confidence || 0.7, 0.68),
        reason: 'openai_empty_fallback',
      }
    }
    const parsed = parseAiJson(text)
    const trustedContext = [
      JSON.stringify(baseDecision.originContext || {}),
      JSON.stringify(baseDecision.salesSlots || {}),
      productFactsText(baseDecision.productFacts),
      ...relevantKnowledge(baseDecision.intent, snapshot, { workspaceId: _oaiWsId, queryText: baseDecision.knowledgeQueryText }).map((source, index) => knowledgeTextForPrompt(source, index)),
    ].join('\n')
    const draftText = applyRichMessageToDraft(appendPaymentLinkToDraft(guardedDraftText(parsed?.draftText || text, baseDecision.draftText, {
      trustedContext,
      productFacts: baseDecision.productFacts,
    }), baseDecision.paymentLink, baseDecision.intent), baseDecision.richMessage)
    return {
      ...baseDecision,
      provider: 'openai',
      model,
      draftText,
      confidence: Math.max(0, Math.min(1, Number(parsed?.confidence || baseDecision.confidence || 0.74))),
      reason: parsed?.reason || 'openai_guarded_text_draft',
    }
  }

  async function draftWithGemini({ thread, snapshot, policy, baseDecision }) {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
    if (!apiKey) return { ...baseDecision, ok: false, error: 'gemini_api_key_missing' }
    const _gemPage = (snapshot.pages || []).find((p) => p.id === thread.pageId)
    const _gemWsId = _gemPage?.workspaceId || undefined

    const prompt = buildCustomerReplyPrompt({ thread, snapshot, policy, baseDecision })
    const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt.system }] },
        contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
        generationConfig: {
          temperature: Number(process.env.OMNI_AI_TEMPERATURE || 0.2),
          maxOutputTokens: Number(process.env.OMNI_AI_MAX_OUTPUT_TOKENS || 1024),
          thinkingConfig: {
            thinkingBudget: Number(process.env.OMNI_AI_THINKING_BUDGET || 0),
          },
        },
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      return {
        ...baseDecision,
        ok: true,
        provider: 'gemini',
        model,
        draftText: baseDecision.draftText,
        confidence: Math.min(baseDecision.confidence || 0.7, 0.68),
        reason: `gemini_error_fallback:${payload?.error?.message || payload?.error || response.status}`,
        helperError: payload?.error?.message || payload?.error || `gemini_http_${response.status}`,
      }
    }
    if (!payload?.candidates?.length) {
      return {
        ...baseDecision,
        ok: true,
        provider: 'gemini',
        model,
        draftText: baseDecision.draftText,
        confidence: Math.min(baseDecision.confidence || 0.7, 0.68),
        reason: 'gemini_empty_fallback',
        error: payload?.error?.message || payload?.error || `gemini_http_${response.status}`,
      }
    }
    const candidate = payload?.candidates?.[0] || {}
    const text = candidate?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim()
    const parsed = parseAiJson(text)
    const finishedCleanly = !candidate.finishReason || candidate.finishReason === 'STOP'
    const trustedContext = [
      JSON.stringify(baseDecision.originContext || {}),
      JSON.stringify(baseDecision.salesSlots || {}),
      productFactsText(baseDecision.productFacts),
      ...relevantKnowledge(baseDecision.intent, snapshot, { workspaceId: _gemWsId, queryText: baseDecision.knowledgeQueryText }).map((source, index) => knowledgeTextForPrompt(source, index)),
    ].join('\n')
    const draftText = applyRichMessageToDraft(appendPaymentLinkToDraft(finishedCleanly
      ? guardedDraftText(parsed?.draftText || text, baseDecision.draftText, {
        trustedContext,
        productFacts: baseDecision.productFacts,
      })
      : baseDecision.draftText, baseDecision.paymentLink, baseDecision.intent), baseDecision.richMessage)

    return {
      ...baseDecision,
      provider: 'gemini',
      model,
      draftText,
      confidence: Math.max(0, Math.min(1, Number(parsed?.confidence || baseDecision.confidence || 0.74))),
      reason: finishedCleanly ? (parsed?.reason || 'gemini_guarded_text_draft') : `gemini_fallback_${candidate.finishReason}`,
    }
  }

  return {
    provider,
    model,
    async draft({ thread, snapshot, policy }) {
      if (!thread) return { ok: false, error: 'thread_required' }
      const inbound = latestInboundMessage(thread, snapshot)
      const classificationText = classificationTextForThread(thread, snapshot)
      const intent = classifyIntent(classificationText || inbound?.text || '')
      const risk = riskForIntent(intent, policy)
      const allowed = autoSendEnabledForIntent(intent, policy) && risk === 'low'
      // Derive workspaceId from thread's page for tenant-scoped knowledge
      const threadPage = (snapshot.pages || []).find((p) => p.id === thread.pageId)
      const workspaceId = threadPage?.workspaceId || undefined
      const originContext = compactOriginContext(thread, recentMessagesForThread(thread, snapshot))
      const knowledgeQueryText = [
        classificationText,
        inbound?.text,
        originContextText(originContext),
      ].filter(Boolean).join(' ')
      const knowledge = relevantKnowledge(intent, snapshot, { workspaceId, queryText: knowledgeQueryText })
      const inventoryProductFacts = productFactsForThread(thread, snapshot, originContext)
      let productFacts = inventoryProductFacts
      let productFactsReason = productFacts ? 'product_inventory_fact_match' : ''
      let liveLookupHoldReason = ''
      if (shouldLookupEasyStoreLive(intent)) {
        const liveProductFacts = await productFactsFromEasyStoreLive({ easyStore, thread, snapshot, originContext, intent })
        if (liveProductFacts?.conflict) {
          liveLookupHoldReason = liveProductFacts.reason || 'easystore_live_product_conflict'
        } else if (liveProductFacts) {
          productFacts = liveProductFacts
          productFactsReason = 'easystore_live_product_fact_match'
        } else if (inventoryProductFacts) {
          productFacts = null
          productFactsReason = ''
          liveLookupHoldReason = 'easystore_live_lookup_required'
        }
      }
      const slots = latestSalesSlots(thread, snapshot, originContext)
      const holdReason = liveLookupHoldReason || shouldHoldForHumanReview({ intent, inboundText: classificationText || inbound?.text, productFacts })
      const decisionAllowed = allowed && !holdReason
      const productSourceIds = productFacts
        ? (productFacts.variants || []).map((variant) => variant.id).filter(Boolean)
        : []
      const richMessage = richMessageForThread(thread, snapshot)
      const draftText = holdReason === 'easystore_live_product_conflict'
        ? 'เดี๋ยวขอให้แอดมินตรวจรุ่นและสต็อกจาก EasyStore ให้ชัดก่อนนะคะ เพื่อไม่ให้แจ้งผิดรุ่นค่ะ'
        : holdReason === 'easystore_live_lookup_required'
          ? 'เดี๋ยวขอให้แอดมินเช็กราคาและสต็อกจาก EasyStore อีกครั้งก่อนนะคะ เพื่อไม่ให้แจ้งข้อมูลผิดค่ะ'
          : draftForIntent(intent, originContext, productFacts, slots)
      const paymentLink = latestPaymentLinkForThread(thread, snapshot)
      const salesAttachments = buildSalesAttachments({ productFacts, settings: snapshot.settings || {} })
      const salesCarousel = buildSalesCarousel({ productFacts, attachments: salesAttachments, paymentLink })

      const baseDecision = {
        ok: true,
        provider,
        model,
        threadId: thread.id,
        intent,
        risk: holdReason ? 'medium' : risk,
        action: decisionAllowed ? 'draft_ready' : 'needs_approval',
        confidence: holdReason ? 0.58 : (intent === 'faq' ? 0.72 : 0.82),
        allowed: decisionAllowed,
        draftText: applyRichMessageToDraft(appendPaymentLinkToDraft(draftText, paymentLink, intent), richMessage),
        reason: productFacts
          ? productFactsReason
          : (holdReason || (allowed ? 'policy_allows_low_risk_intent' : 'guard_requires_human_or_more_data')),
        sourceIds: [...knowledge.map((source) => source.id), ...productSourceIds],
        evidenceIds: inbound?.id ? [inbound.id] : [],
        originContext,
        knowledgeQueryText,
        productFacts,
        salesSlots: slots,
        richMessage: richMessage?.enabled ? richMessage : null,
        paymentLink,
        attachments: salesAttachments,
        carousel: salesCarousel,
      }

      if (provider === 'local_rules') return baseDecision
      if (provider === 'gemini') return draftWithGemini({ thread, snapshot, policy, baseDecision })
      if (provider === 'openai') return draftWithOpenAI({ thread, snapshot, policy, baseDecision })
      return draftWithHelper({ thread, snapshot, policy, baseDecision })
    },
  }
}
