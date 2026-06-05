import { spawn } from 'node:child_process'
const DEFAULT_PROVIDER = process.env.OMNI_AI_PROVIDER || 'local_rules'
const DEFAULT_MODEL = process.env.OMNI_AI_MODEL || 'guarded-draft-v1'
const DEFAULT_HELPER = process.env.OMNI_AI_REPLY_HELPER || '/Users/babycuca/.codex/bin/omni-ai-reply'
const AUTO_SEND_ALL = process.env.OMNI_AI_AUTO_SEND_ALL === '1'
const GEMINI_API_BASE = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta'
const OPENAI_API_BASE = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'
const MAX_DRAFT_CHARS = Number(process.env.OMNI_AI_MAX_DRAFT_CHARS || 480)

const PAGE_AGENT_FALLBACKS = {
  page_annalynn: 'แอดมิน Anna Lynn',
  page_annalynn_tiktok: 'แอดมิน Anna Lynn',
  page_mankynd: 'แอดมิน MAN KYND',
  page_des: 'แอดมินเพจเดส',
}

function latestInboundMessage(thread, snapshot) {
  return (snapshot.messages || [])
    .filter((message) => message.threadId === thread.id && message.direction === 'inbound')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null
}

function classifyIntent(text) {
  const value = String(text || '').toLowerCase()
  if (isCustomerCorrection(value)) return 'humanReview'
  if (/(สลิป|โอนแล้ว|จ่ายแล้ว|ชำระแล้ว|หลักฐาน|payment proof|paid)/i.test(value)) return 'paymentProof'
  if (/(^|\s)(cf|เอา|รับ|สั่ง|จอง)(\s|$)|สั่งค่ะ|สั่งครับ|เอาค่ะ|เอาครับ|รับค่ะ|รับครับ/i.test(value)) return 'orderPurchase'
  if (/(ไซซ์ไหนดี|ไซส์ไหนดี|ใส่ได้ไหม|ใส่ได้มั้ย|พอดีไหม|พอดีมั้ย|อก|เอว|สะโพก|size advice|แนะนำไซซ์|แนะนำไซส์)/i.test(value)) return 'sizeAdvice'
  if (/(ไม่ชอบ|มีแบบอื่น|แบบอื่น|แนะนำ.*แบบ|ตัวอื่น|รุ่นอื่น)/i.test(value)) return 'alternativeProduct'
  if (/(ลดได้ไหม|ลดไหม|ขอลด|ส่วนลด|โปร|ของแถม|discount)/i.test(value)) return 'discount'
  if (/(ค่าส่ง|ส่งฟรี|จัดส่ง|ส่งเมื่อไหร่|ส่งวันไหน|shipping|delivery)/i.test(value)) return 'shipping'
  if (/(รูป|ภาพ|ถ่าย|photo|image|pic|picture|ดูสี|ขอดู|ส่ง.*รูป|ส่ง.*ภาพ)/i.test(value)) return 'productImage'
  if (/(ของ|สินค้า|ไซซ์|ไซส์|ขนาด|รุ่น|size|สี|stock|พร้อมส่ง|มีไหม|\b(?:s|m|l|xl|xxl|2xl|3xl|4xl|5xl)\b)/i.test(value)) return 'stock'
  if (/(ราคา|เท่าไหร่|บาท|price)/i.test(value)) return 'price'
  if (/(พัสดุ|เลข|tracking|ส่งของ|order|คำสั่งซื้อ)/i.test(value)) return 'orderStatus'
  if (/(คืนเงิน|refund|ยกเลิก|cancel|เคลม)/i.test(value)) return 'refund'
  return 'faq'
}

function riskForIntent(intent, policy, autoSendAll = AUTO_SEND_ALL) {
  if (autoSendAll) return 'low'
  if (intent === 'humanReview') return 'medium'
  if (['productImage', 'orderPurchase', 'paymentProof', 'alternativeProduct'].includes(intent)) return 'medium'
  if (['refund', 'discount'].includes(intent)) return 'high'
  if (!policy?.autoSend?.[intent]) return 'medium'
  return 'low'
}

function isCustomerCorrection(text) {
  return /(มั่ว|ผิดแล้ว|ตอบผิด|ไม่ถูก|ไม่ใช่|ตอบวน|วนแล้ว|ถามซ้ำ|อ่าน.*ไหม|ไปไหนมา|ตอบก่อน|งง|มั้่ว|มั่วแล้ว|คนจริง|แอดมินจริง)/i.test(String(text || ''))
}

function shouldHoldForHumanReview({ intent, inboundText, productFacts }) {
  if (intent === 'humanReview') return 'customer_correction_or_complaint'
  const value = String(inboundText || '')
  const asksSpecificProductFact = /(ขนาด|ไซซ์.*(?:อะไร|ไหน|บ้าง)|ไซส์.*(?:อะไร|ไหน|บ้าง)|รุ่น|ราคา|มีสี|สี.*(?:อะไร|ไหน|บ้าง))/i.test(value)
  if (['stock', 'price'].includes(intent) && !productFacts && asksSpecificProductFact) {
    return 'product_question_without_inventory_fact'
  }
  if (intent === 'faq' && asksSpecificProductFact && !productFacts) {
    return 'ambiguous_product_faq_without_inventory_fact'
  }
  return ''
}

function detectSize(text) {
  const match = String(text || '').match(/\b(5xl|4xl|3xl|2xl|xxl|xl|l|m|s)\b|(?:ไซซ์|ไซส์|size)\s*(5xl|4xl|3xl|2xl|xxl|xl|l|m|s)/i)
  return (match?.[1] || match?.[2] || '').toUpperCase()
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

function productFactsText(productFacts) {
  if (!productFacts) return ''
  const variantText = (productFacts.variants || [])
    .map((variant) => `${variant.sku || 'SKU'} คงเหลือ ${variant.available} ชิ้น${variant.price ? ` ราคา ${moneyText(variant.price)} บาท` : ''}`)
    .join(' · ')
  return [
    `สินค้า: ${productFacts.productName}`,
    `พร้อมส่งรวม ${productFacts.availableTotal} ชิ้น`,
    productFacts.price ? `ราคาเริ่มต้น ${moneyText(productFacts.price)} บาท` : '',
    variantText ? `ตัวเลือก: ${variantText}` : '',
    productFacts.checkedAt ? `เช็กล่าสุด ${productFacts.checkedAt}` : '',
  ].filter(Boolean).join('\n')
}

function draftFromProductFacts(intent, productFacts) {
  if (!productFacts || !['stock', 'price'].includes(intent)) return ''
  const price = productFacts.price ? ` ราคาเริ่มต้น ${moneyText(productFacts.price)} บาท` : ''
  const available = Number(productFacts.availableTotal || 0)
  const availableText = available > 0 ? `พร้อมส่งรวม ${available} ชิ้น` : 'ตอนนี้ยังไม่พบสต็อกพร้อมส่ง'
  const variantText = (productFacts.variants || [])
    .filter((variant) => variant.available > 0)
    .slice(0, 3)
    .map((variant) => `${variant.sku} ${variant.available} ชิ้น`)
    .join(', ')
  const optionText = variantText ? ` ตัวเลือกที่มี: ${variantText}` : ''
  return `เช็กให้แล้วค่ะ ${productFacts.productName} ${availableText}${price}.${optionText} ถ้าต้องการตัวนี้ แจ้งสี/ไซซ์ที่ต้องการหรือให้แอดมินปิดออเดอร์ต่อในแชทได้เลยค่ะ`
}

function salesWorkflowDraft({ intent, originContext = null, productFacts = null, slots = {} }) {
  const productLabel = slots.productLabel || originProductLabel(originContext || '')
  const productText = productFacts?.productName || productLabel || 'สินค้าที่สนใจ'
  const color = slots.color || ''
  const size = slots.size || ''
  const hasColor = Boolean(color)
  const hasSize = Boolean(size)

  if (intent === 'stock') {
    if (hasSize && !hasColor) {
      return `${size} ได้ค่ะ สนใจสีไหนคะ เดี๋ยวส่งภาพสีให้ดูพร้อมเช็กสต็อก ${productText} ให้เลยค่ะ`
    }
    if (hasColor && !hasSize) {
      return `สี${color} ได้ค่ะ เดี๋ยวส่งภาพสีนี้ให้ดูนะคะ สนใจไซซ์ไหนคะ จะได้เช็กสต็อกให้ตรงตัวค่ะ`
    }
  }

  if (intent === 'price') {
    if (hasColor && hasSize) {
      const price = productFacts?.price ? ` ราคา ${moneyText(productFacts.price)} บาท` : ''
      const stock = productFacts && Number(productFacts.availableTotal || 0) > 0 ? ' พร้อมส่งค่ะ' : ' เดี๋ยวเช็กพร้อมส่งให้อีกครั้งค่ะ'
      return `${productText} สี${color} ไซซ์ ${size}${price}${stock}`
    }
    const price = productFacts?.price ? `ราคาเริ่มต้น ${moneyText(productFacts.price)} บาทค่ะ` : 'เดี๋ยวเช็กราคาให้ค่ะ'
    return `${productText} ${price} เดี๋ยวส่งภาพสินค้าให้ดูนะคะ สนใจสีหรือไซซ์ไหน เดี๋ยวเช็กพร้อมส่งให้ค่ะ`
  }

  if (intent === 'sizeAdvice') {
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
  const productDraft = draftFromProductFacts(intent, productFacts)
  const workflowDraft = salesWorkflowDraft({ intent, originContext, productFacts, slots })
  if (workflowDraft) return workflowDraft
  if (productDraft) return productDraft
  const productLabel = originProductLabel(originContext || {})
  const isLive = originContext?.sourceType === 'live'
  if (intent === 'productImage') {
    if (productLabel) return `ลูกค้าขอดูภาพ ${productLabel} ควรให้แอดมินแนบรูปสินค้าจริงหรือ product card ก่อนตอบกลับค่ะ`
    return 'ลูกค้าขอดูภาพสินค้า ควรให้แอดมินแนบรูปสินค้าจริงหรือ product card ก่อนตอบกลับค่ะ'
  }
  if (intent === 'stock') {
    if (productLabel) return `ได้ค่ะ เดี๋ยวช่วยเช็กสต็อก ${productLabel} ให้ก่อนนะคะ ถ้าต้องการตัวนี้ แอดมินจะตรวจสี ไซซ์ และจำนวนคงเหลือให้ชัดเจนก่อนตอบกลับค่ะ`
    if (isLive) return 'สนใจตัวไหนในไลฟ์คะ บอกชื่อ สี ไซซ์ หรือช่วงเวลาที่เห็นได้เลยค่ะ เดี๋ยวแอดมินช่วยเช็กให้ตรงตัวก่อนตอบกลับค่ะ'
    return 'ได้ค่ะ เดี๋ยวช่วยเช็กสต็อก สี และไซซ์ให้ก่อนนะคะ รบกวนบอกสี/ไซซ์ที่ต้องการ หรือส่งรูปสินค้าที่สนใจมาได้เลยค่ะ'
  }
  if (intent === 'price') {
    if (productLabel) return `ได้ค่ะ เดี๋ยวช่วยเช็กราคา โปร และค่าส่งสำหรับ ${productLabel} ให้ถูกต้องก่อนนะคะ แอดมินจะสรุปให้ชัดเจนก่อนตอบกลับค่ะ`
    if (isLive) return 'สนใจตัวไหนในไลฟ์คะ บอกชื่อ สี ไซซ์ หรือช่วงเวลาที่เห็นได้เลยค่ะ เดี๋ยวแอดมินช่วยเช็กราคาและโปรให้ตรงตัวก่อนตอบกลับค่ะ'
    return 'ได้ค่ะ เดี๋ยวสรุปราคา โปร และค่าส่งที่ใช้ได้ให้ชัดเจนนะคะ ถ้าสนใจรุ่นไหนเป็นพิเศษ ส่งชื่อรุ่นหรือรูปมาได้เลยค่ะ'
  }
  if (intent === 'orderStatus') return 'ได้ค่ะ เดี๋ยวช่วยเช็กสถานะคำสั่งซื้อให้ก่อนนะคะ เพื่อความถูกต้อง รบกวนส่งเลขออเดอร์ใน inbox แล้วแอดมินจะแจ้งสถานะกลับไปค่ะ'
  if (intent === 'refund') return 'รับทราบค่ะ เคสคืนเงิน ยกเลิก หรือเคลม ต้องให้แอดมินตรวจสอบรายละเอียดก่อนนะคะ เดี๋ยวส่งเรื่องให้ตรวจและจะแจ้งขั้นตอนที่ถูกต้องกลับไปค่ะ'
  if (intent === 'humanReview') return 'ขอหยุดให้แอดมินตรวจคำตอบก่อนนะคะ เพื่อไม่ให้ตอบข้อมูลผิดซ้ำค่ะ'
  return 'รับทราบค่ะ เดี๋ยวช่วยดูรายละเอียดให้ครบก่อนนะคะ ถ้ามีรุ่น สี ไซซ์ หรือเลขออเดอร์ที่เกี่ยวข้อง ส่งเพิ่มมาได้เลยค่ะ'
}

function relevantKnowledge(intent, snapshot, { workspaceId } = {}) {
  const termsByIntent = {
    stock: ['สินค้า', 'stock', 'product', 'faq'],
    price: ['ราคา', 'โปร', 'price', 'product'],
    productImage: ['สินค้า', 'รูป', 'ภาพ', 'image', 'product'],
    orderStatus: ['พัสดุ', 'shipping', 'order', 'payment'],
    refund: ['คืน', 'refund', 'exchange', 'policy'],
    faq: ['faq', 'policy'],
  }
  const terms = termsByIntent[intent] || termsByIntent.faq
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
    .slice(0, 3)
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
  const knowledge = relevantKnowledge(baseDecision.intent, snapshot, { workspaceId })
  const recentMessages = recentMessagesForThread(thread, snapshot)
  const origin = compactOriginContext(thread, recentMessages)
  const productFacts = baseDecision.productFacts || productFactsForThread(thread, snapshot, origin)
  const messages = recentMessages
    .map((message) => `${message.direction === 'inbound' ? 'ลูกค้า' : 'เพจ'}: ${message.text}`)
    .join('\n')
  const knowledgeText = knowledge
    .map((source, index) => `[${index + 1}] ${source.title}\n${String(source.content || '').slice(0, 900)}`)
    .join('\n\n')

  return {
    system: [
      'คุณคือ AI ตอบลูกค้าของ Omni Cloud สำหรับเพจขายสินค้า',
      `ชื่อผู้ช่วย: ${agent?.name || 'AI Page Assistant'}`,
      'ตอบเป็นภาษาไทย สุภาพ ช่วยลูกค้าให้ครบก่อน แล้วค่อยกระชับ ไม่ออกนอกเรื่อง',
      'คำตอบควรมี 2-4 ประโยคสั้น ๆ รวมประมาณ 60-120 คำไทย หรือน้อยกว่านั้นถ้าคำถามง่าย',
      'โครงคำตอบ: รับเรื่องจากลูกค้า -> ตอบหรือบอกสิ่งที่จะตรวจสอบ -> ขอข้อมูลที่จำเป็นเฉพาะเท่าที่ต้องใช้ -> ปิดท้ายสุภาพ',
      'ให้ทำงานแบบ Sales Workflow Engine: ก่อนตอบต้องดู context ที่มา ลูกค้า สินค้า สี ไซซ์ สต็อก ราคา และเลือก next best action ไม่ใช่ตอบคำถามกว้าง ๆ',
      'ข้อมูลที่รู้แล้วห้ามถามซ้ำ ถ้ารู้สินค้าแล้วให้ถามสีหรือไซซ์ ถ้ารู้สีแล้วให้ถามไซซ์ ถ้ารู้ไซซ์แล้วให้ถามสี ถ้ารู้ครบแล้วให้พาไปชำระเงินหรือ order draft',
      'ถ้าลูกค้าถามสี ให้ตอบพร้อมส่ง/แนบภาพสีนั้นตามเครื่องมือ และถามไซซ์ที่ต้องการ ห้ามเช็กทุกไซซ์แบบกว้างก่อน',
      'ถ้าลูกค้าถามไซซ์ ให้เช็กสต็อกไซซ์นั้นก่อน และถามสีที่ต้องการพร้อมเสนอภาพสี ห้ามถามสัดส่วนก่อน ยกเว้นลูกค้าถามว่าไซซ์ไหนดีหรือใส่ได้ไหม',
      'ถ้าลูกค้าถามไซซ์ไหนดีหรือใส่ได้ไหม ให้ถามอก เอว สะโพก เพื่อเทียบไซซ์ ไม่ถามน้ำหนัก/ส่วนสูงเป็นหลัก',
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

function guardedDraftText(text, fallback, { trustedContext = '' } = {}) {
  const draft = String(text || '').replace(/\s+/g, ' ').trim()
  if (draft.length < 4) return fallback
  if (/^here is\b/i.test(draft) || /^```/.test(draft) || /"draftText"\s*:/.test(draft)) return fallback
  if (/(AI Page Assistant|language model|โมเดล|prompt|system|developer)/i.test(draft)) return fallback
  if (/(และ|หรือ|กับ|ของ|ให้|ว่า|น้อง)$/i.test(draft)) return fallback
  if (hasTrustedPrice(draft) && !hasTrustedPrice(trustedContext)) return fallback
  if (hasStockAssertion(draft) && !/(พร้อมส่ง|มีสินค้า|stock|available|คงเหลือ|สต็อก)/i.test(trustedContext)) return fallback
  return draft.slice(0, MAX_DRAFT_CHARS)
}

export function createAiReplyEngine({ provider = DEFAULT_PROVIDER, model = DEFAULT_MODEL, fetchImpl = fetch } = {}) {
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
      draftText: String(payload.draftText || baseDecision.draftText || '').trim(),
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
      productFactsText(baseDecision.productFacts),
      ...relevantKnowledge(baseDecision.intent, snapshot, { workspaceId: _oaiWsId }).map((source) => source.content || ''),
    ].join('\n')
    const draftText = guardedDraftText(parsed?.draftText || text, baseDecision.draftText, { trustedContext })
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
      productFactsText(baseDecision.productFacts),
      ...relevantKnowledge(baseDecision.intent, snapshot, { workspaceId: _gemWsId }).map((source) => source.content || ''),
    ].join('\n')
    const draftText = finishedCleanly
      ? guardedDraftText(parsed?.draftText || text, baseDecision.draftText, { trustedContext })
      : baseDecision.draftText

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
      const intent = classifyIntent(inbound?.text || '')
      const risk = riskForIntent(intent, policy)
      const allowed = AUTO_SEND_ALL || (Boolean(policy?.autoSend?.[intent]) && risk === 'low')
      // Derive workspaceId from thread's page for tenant-scoped knowledge
      const threadPage = (snapshot.pages || []).find((p) => p.id === thread.pageId)
      const workspaceId = threadPage?.workspaceId || undefined
      const knowledge = relevantKnowledge(intent, snapshot, { workspaceId })
      const originContext = compactOriginContext(thread, recentMessagesForThread(thread, snapshot))
      const productFacts = productFactsForThread(thread, snapshot, originContext)
      const slots = latestSalesSlots(thread, snapshot, originContext)
      const holdReason = shouldHoldForHumanReview({ intent, inboundText: inbound?.text, productFacts })
      const decisionAllowed = allowed && !holdReason
      const productSourceIds = productFacts
        ? (productFacts.variants || []).map((variant) => variant.id).filter(Boolean)
        : []

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
        draftText: draftForIntent(intent, originContext, productFacts, slots),
        reason: productFacts
          ? 'product_inventory_fact_match'
          : (holdReason || (allowed ? 'policy_allows_low_risk_intent' : 'guard_requires_human_or_more_data')),
        sourceIds: [...knowledge.map((source) => source.id), ...productSourceIds],
        evidenceIds: inbound?.id ? [inbound.id] : [],
        originContext,
        productFacts,
        salesSlots: slots,
      }

      if (provider === 'local_rules') return baseDecision
      if (provider === 'gemini') return draftWithGemini({ thread, snapshot, policy, baseDecision })
      if (provider === 'openai') return draftWithOpenAI({ thread, snapshot, policy, baseDecision })
      return draftWithHelper({ thread, snapshot, policy, baseDecision })
    },
  }
}
