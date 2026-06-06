import { PLUS_SIZE_LABELS, PLUS_SIZE_MEASUREMENT_MIN } from './aiGuardRules.js'

function cleanText(value = '') {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function safeAliasText(value = '') {
  return cleanText(value)
    .replace(/(?:ราคา|price)\s*[:=]?\s*[฿\d,.]+(?:\s*บาท)?/ig, '')
    .replace(/(?:stock|สต็อก|พร้อมส่ง)\s*[:=]?\s*\d+\s*(?:ชิ้น|ตัว)?/ig, 'พร้อมส่ง')
    .replace(/\s+/g, ' ')
    .trim()
}

function unique(values = []) {
  return [...new Set(values.map((value) => safeAliasText(value)).filter(Boolean))]
}

function numberInRange(value, fallback, min, max) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback
  return parsed
}

function productId(product = {}) {
  return String(product.id || product.product_id || product.productId || '').trim()
}

function productTitle(product = {}) {
  return safeAliasText(product.title || product.name || product.productName || '')
}

function productAliases(product = {}) {
  return unique([
    product.title,
    product.name,
    product.productName,
    product.handle,
    product.slug,
    product.sku,
  ])
}

function variantTitle(variant = {}) {
  const options = [
    variant.title,
    variant.name,
    variant.option1,
    variant.option2,
    variant.option3,
    ...(Array.isArray(variant.options) ? variant.options : []),
    ...(Array.isArray(variant.option_values) ? variant.option_values.map((item) => item?.value || item?.name || item) : []),
  ]
  return unique(options).join(', ')
}

function variantRows(product = {}) {
  const variants = Array.isArray(product.variants) ? product.variants : []
  return variants.map((variant) => ({
    sku: safeAliasText(variant.sku || ''),
    variantId: String(variant.id || variant.variant_id || variant.variantId || '').trim(),
    option: variantTitle(variant),
    enabled: variant.is_enabled === false || variant.enabled === false ? 'disabled' : 'active',
  })).filter((row) => row.sku || row.variantId || row.option)
}

function buildProductAliasBlock(product = {}) {
  const id = productId(product)
  const title = productTitle(product)
  const aliases = productAliases(product)
  const variants = variantRows(product)
  const lines = [
    `product_id ${id}`,
    `title ${title || id}`,
    `alias ${aliases.join(' | ')}`,
  ]
  if (variants.length) {
    lines.push('variants')
    for (const variant of variants.slice(0, 40)) {
      lines.push(`- SKU ${variant.sku || '-'} variant_id ${variant.variantId || '-'} option ${variant.option || '-'} status ${variant.enabled}`)
    }
  }
  return lines.filter(Boolean).join('\n')
}

export function buildSalesWorkflowSource({ workspaceId = 'ws_oagent' } = {}) {
  const content = [
    'Boss-approved Anna Lynn sales workflow v1',
    '',
    '1. ตอบลูกค้าสั้น อ่านง่าย และถามเฉพาะข้อมูลที่ยังขาด เช่น สี ไซซ์ หรือสัดส่วน',
    '2. ใช้ Knowledge Source เพื่อจับชื่อสินค้า alias SKU product_id เท่านั้นเมื่อเป็นข้อมูลสินค้า',
    '3. ราคา สต็อก ความพร้อมส่ง รูป และลิงก์ ต้องมาจาก EasyStore live lookup เท่านั้น',
    '4. ถ้า EasyStore live lookup ยังไม่เจอสินค้า ให้ขอชื่อรุ่น สี ไซซ์ หรือรูปจากลูกค้า และไม่เดาราคา/สต็อก',
    '5. ถ้าจะส่งลูกค้าจริง ต้องผ่าน approval guard ของ Omni ก่อนเสมอ',
    `6. คำว่า "สาวอวบ" ใช้ได้เมื่อมีไซซ์ ${PLUS_SIZE_LABELS.join('/')} หรือสัดส่วนถึงเกณฑ์ อก ${PLUS_SIZE_MEASUREMENT_MIN.bust} เอว ${PLUS_SIZE_MEASUREMENT_MIN.waist} สะโพก ${PLUS_SIZE_MEASUREMENT_MIN.hips} ขึ้นไป`,
    '7. ถ้ายังไม่มีเกณฑ์ ให้ใช้คำกลาง เช่น มีไซซ์ใหญ่รองรับ หรือถามอก เอว สะโพกก่อน',
  ].join('\n')

  return {
    id: 'ks_annalynn_sales_workflow_v1',
    title: 'Anna Lynn sales workflow Q&A - Boss approved v1',
    type: 'faq',
    scope: 'all_pages',
    status: 'ready',
    content,
    tags: ['sales', 'workflow', 'boss-approved', 'guard', 'easystore-live-truth'],
    workspaceId,
    sourceRef: 'knowledge_import:sales_workflow:v1',
  }
}

export function buildEasyStoreProductPackSources(products = [], { workspaceId = 'ws_oagent' } = {}) {
  const safeProducts = (Array.isArray(products) ? products : []).filter((product) => productId(product)).slice(0, 250)
  const productSources = safeProducts.map((product) => ({
    id: `ks_easystore_alias_${productId(product)}`,
    title: `EasyStore alias ${productTitle(product) || productId(product)}`,
    type: 'manual',
    scope: 'all_pages',
    status: 'ready',
    content: [
      'EasyStore alias-only product source',
      'ใช้ source นี้เพื่อจับชื่อสินค้า alias SKU product_id และ variant_id เท่านั้น',
      'ห้ามใช้ source นี้ตอบราคา สต็อก พร้อมส่ง รูป หรือลิงก์ลูกค้า',
      'ราคา/สต็อก/รูป/ลิงก์ต้องมาจาก EasyStore live lookup เท่านั้น',
      '',
      buildProductAliasBlock(product),
    ].join('\n'),
    tags: ['easystore', 'alias-only', 'product', productTitle(product), productId(product)].filter(Boolean),
    workspaceId,
    sourceRef: `knowledge_import:easystore_alias:${productId(product)}`,
  }))

  const content = [
    'EasyStore product alias-only pack v1',
    'ใช้ source นี้เพื่อจับชื่อสินค้า alias SKU product_id และ variant_id เท่านั้น',
    'ห้ามใช้ source นี้ตอบราคา สต็อก พร้อมส่ง รูป หรือลิงก์ลูกค้า',
    'ราคา/สต็อก/รูป/ลิงก์ลูกค้าต้องมาจาก EasyStore live lookup เท่านั้น',
    '',
    ...safeProducts.map((product) => buildProductAliasBlock(product)),
  ].join('\n\n')

  const indexSource = {
    id: 'ks_annalynn_easystore_products_v1',
    title: 'Anna Lynn EasyStore product aliases - alias-only v1',
    type: 'manual',
    scope: 'all_pages',
    status: 'ready',
    content,
    tags: ['easystore', 'alias-only', 'sku', 'product_id', 'live-truth'],
    workspaceId,
    sourceRef: 'knowledge_import:easystore_product_pack:v1',
  }

  return { indexSource, productSources }
}

async function listEasyStoreProducts(easyStore, { limit, pages }) {
  if (!easyStore || typeof easyStore.listProducts !== 'function') throw new Error('easystore_runtime_required')
  const products = []
  for (let page = 1; page <= pages; page += 1) {
    const result = await easyStore.listProducts({ limit, page })
    if (!result?.ok) throw new Error(result?.error || 'easystore_list_failed')
    const batch = Array.isArray(result.products) ? result.products : []
    products.push(...batch)
    if (batch.length < limit) break
  }
  return products
}

export async function importKnowledgePack({ packId, omni, easyStore, input = {} } = {}) {
  if (!omni || typeof omni.upsertKnowledgeSource !== 'function') throw new Error('omni_service_required')
  const workspaceId = String(input.workspaceId || '').trim() || 'ws_oagent'
  const normalizedPackId = String(packId || '').trim()

  if (normalizedPackId === 'sales-workflow') {
    const source = buildSalesWorkflowSource({ workspaceId })
    const result = omni.upsertKnowledgeSource(source)
    if (!result.ok) return result
    return {
      ok: true,
      imported: result.source,
      productSourcesImported: 0,
      productSources: [],
      snapshotKnowledgeCount: result.snapshot?.knowledgeSources?.length || 0,
      snapshot: result.snapshot,
    }
  }

  if (normalizedPackId === 'easystore-product-pack') {
    const limit = numberInRange(input.limit, 20, 1, 250)
    const pages = numberInRange(input.pages, 1, 1, 20)
    const products = await listEasyStoreProducts(easyStore, { limit, pages })
    const { indexSource, productSources } = buildEasyStoreProductPackSources(products, { workspaceId })
    let indexResult = omni.upsertKnowledgeSource(indexSource)
    if (!indexResult.ok) return indexResult
    const importedProducts = []
    for (const source of productSources) {
      const result = omni.upsertKnowledgeSource(source)
      if (!result.ok) return result
      importedProducts.push(result.source)
      indexResult = result
    }
    return {
      ok: true,
      imported: indexResult.snapshot?.knowledgeSources?.find((source) => source.id === indexSource.id) || indexSource,
      productSourcesImported: importedProducts.length,
      productSources: importedProducts,
      snapshotKnowledgeCount: indexResult.snapshot?.knowledgeSources?.length || 0,
      snapshot: indexResult.snapshot,
    }
  }

  return { ok: false, error: 'knowledge_pack_not_found' }
}
