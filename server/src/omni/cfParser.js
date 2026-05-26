const CF_KEYWORDS = ['cf', 'รับ', 'จอง', 'เอา', 'สั่ง']

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasCfKeyword(text, keywords) {
  const normalized = text.toLowerCase()
  return keywords.some((keyword) => {
    const value = String(keyword || '').trim()
    if (!value) return false
    if (/^[a-z0-9_-]+$/i.test(value)) return new RegExp(`\\b${escapeRegex(value)}\\b`, 'i').test(text)
    return normalized.includes(value.toLowerCase())
  })
}

export function parseCfComment(comment = {}, options = {}) {
  const text = String(comment.message || comment.text || '').trim()
  if (!text) return { ok: false, reason: 'empty_comment', text }
  const keywords = options.keywords || CF_KEYWORDS
  const hasKeyword = hasCfKeyword(text, keywords)
  if (!hasKeyword) return { ok: false, reason: 'not_cf_comment', text, commentId: comment.id || null }

  const skuMatch = text.match(/\b([A-Z0-9][A-Z0-9_-]{2,})\b/i)
  const qtyMatch = text.match(/(?:x|X|จำนวน\s*)\s*(\d+)|(\d+)\s*(?:ตัว|ชิ้น)/)
  const quantity = Math.max(1, Number(qtyMatch?.[1] || qtyMatch?.[2] || 1))
  const sku = skuMatch?.[1]?.toUpperCase() || ''
  if (!sku) return { ok: false, reason: 'missing_sku', text, commentId: comment.id || null }

  return {
    ok: true,
    commentId: comment.id || null,
    customer: {
      id: comment.from?.id ? `fb_customer_${comment.from.id}` : `cf_customer_${comment.id || Date.now()}`,
      providerCustomerId: comment.from?.id || null,
      displayName: comment.from?.name || 'Facebook CF Customer',
    },
    rawText: text,
    sku,
    keyword: sku || text,
    quantity,
    createdAt: comment.createdTime || comment.created_time || new Date().toISOString(),
  }
}

export function parseCfComments(comments = [], options = {}) {
  return comments.map((comment) => parseCfComment(comment, options)).filter((result) => result.ok)
}
