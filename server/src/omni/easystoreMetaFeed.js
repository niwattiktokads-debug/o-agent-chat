export const META_CATALOG_COLUMNS = [
  'id',
  'title',
  'description',
  'availability',
  'condition',
  'price',
  'link',
  'image_link',
  'brand',
]

const DEFAULT_BRAND = 'Annalynna'
const DEFAULT_PRODUCT_URL_BASE = 'https://annalynna.easy.co'
const DEFAULT_CURRENCY = 'THB'

function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function numberOrNull(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeBaseUrl(value, fallback = DEFAULT_PRODUCT_URL_BASE) {
  const raw = String(value || fallback || '').trim().replace(/\/+$/, '')
  if (!raw) return ''
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  return `https://${raw}`
}

function storefrontProductLink(product = {}, baseUrl = '') {
  const handle = String(product.handle || '').trim()
  if (handle && baseUrl) return `${baseUrl}/products/${encodeURIComponent(handle)}`
  const id = String(product.id || product.product_id || '').trim()
  return id && baseUrl ? `${baseUrl}/products/${encodeURIComponent(id)}` : ''
}

function firstImageUrl(product = {}) {
  const images = Array.isArray(product.images) ? product.images : []
  const image = images.find((item) => item?.url || item?.src || item?.image_url || item?.imageUrl)
  return String(image?.url || image?.src || image?.image_url || image?.imageUrl || product.image?.url || product.image?.src || '').trim()
}

function variantQuantity(variant = {}) {
  return numberOrNull(variant.inventory_quantity ?? variant.quantity ?? variant.stock ?? variant.available_quantity)
}

function variantPrice(variant = {}) {
  return numberOrNull(variant.price ?? variant.sell_price ?? variant.sellPrice ?? variant.unitPrice)
}

function productPrice(product = {}) {
  const prices = [
    numberOrNull(product.min_price),
    numberOrNull(product.price),
    ...(Array.isArray(product.variants) ? product.variants.map(variantPrice) : []),
  ].filter((value) => Number.isFinite(value) && value > 0)
  return prices.length ? Math.min(...prices) : null
}

function productAvailability(product = {}) {
  const totalQuantity = numberOrNull(product.total_quantity ?? product.inventory_quantity ?? product.quantity ?? product.stock)
  if (totalQuantity !== null) return totalQuantity > 0 ? 'in stock' : 'out of stock'
  const variants = Array.isArray(product.variants) ? product.variants : []
  if (!variants.length) return 'in stock'
  return variants.some((variant) => (variantQuantity(variant) ?? 0) > 0) ? 'in stock' : 'out of stock'
}

function formatMetaPrice(amount, currency = DEFAULT_CURRENCY) {
  if (!Number.isFinite(amount)) return ''
  const cleanCurrency = String(currency || DEFAULT_CURRENCY).trim().toUpperCase()
  const cleanAmount = amount % 1 === 0 ? String(Math.round(amount)) : amount.toFixed(2)
  return `${cleanAmount} ${cleanCurrency}`
}

function csvValue(value) {
  const text = String(value ?? '')
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function buildMetaCatalogRows({
  products = [],
  brand = DEFAULT_BRAND,
  productUrlBase = DEFAULT_PRODUCT_URL_BASE,
} = {}) {
  const baseUrl = normalizeBaseUrl(productUrlBase)
  return (Array.isArray(products) ? products : [])
    .map((product) => {
      const id = String(product.id || product.product_id || '').trim()
      const title = cleanText(product.title || product.name)
      const description = cleanText(product.description || product.body_html || product.note || title)
      const amount = productPrice(product)
      const imageLink = firstImageUrl(product)
      const currency = product.currency || DEFAULT_CURRENCY
      const link = storefrontProductLink(product, baseUrl)
      return {
        id,
        title,
        description: description || title,
        availability: productAvailability(product),
        condition: 'new',
        price: formatMetaPrice(amount, currency),
        link,
        image_link: imageLink,
        brand: String(brand || DEFAULT_BRAND).trim() || DEFAULT_BRAND,
      }
    })
    .filter((row) => row.id && row.title && row.description && row.price && row.link && row.image_link)
}

export function toMetaCatalogCsv(rows = []) {
  const lines = [META_CATALOG_COLUMNS.join(',')]
  for (const row of rows) {
    lines.push(META_CATALOG_COLUMNS.map((column) => csvValue(row[column])).join(','))
  }
  return `${lines.join('\n')}\n`
}

export function buildMetaCatalogFeed(options = {}) {
  const rows = buildMetaCatalogRows(options)
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    count: rows.length,
    columns: META_CATALOG_COLUMNS,
    rows,
    csv: toMetaCatalogCsv(rows),
  }
}
