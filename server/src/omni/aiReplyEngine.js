const DEFAULT_PROVIDER = process.env.OMNI_AI_PROVIDER || 'local_rules'
const DEFAULT_MODEL = process.env.OMNI_AI_MODEL || 'guarded-draft-v1'

function latestInboundMessage(thread, snapshot) {
  return (snapshot.messages || [])
    .filter((message) => message.threadId === thread.id && message.direction === 'inbound')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null
}

function classifyIntent(text) {
  const value = String(text || '').toLowerCase()
  if (/(ของ|สินค้า|ไซซ์|size|สี|stock|พร้อมส่ง|มีไหม)/i.test(value)) return 'stock'
  if (/(ราคา|เท่าไหร่|บาท|price)/i.test(value)) return 'price'
  if (/(พัสดุ|เลข|tracking|ส่งของ|order|คำสั่งซื้อ)/i.test(value)) return 'orderStatus'
  if (/(คืนเงิน|refund|ยกเลิก|cancel|เคลม)/i.test(value)) return 'refund'
  return 'faq'
}

function riskForIntent(intent, policy) {
  if (intent === 'refund') return 'high'
  if (!policy?.autoSend?.[intent]) return 'medium'
  return 'low'
}

function draftForIntent(intent) {
  if (intent === 'stock') return 'เดี๋ยวเช็กสต็อกให้ค่ะ ขอทราบสีและไซซ์ที่ต้องการอีกครั้งนะคะ'
  if (intent === 'price') return 'เดี๋ยวสรุปราคาและโปรที่ใช้ได้ให้ค่ะ'
  if (intent === 'orderStatus') return 'ขอเช็กสถานะคำสั่งซื้อและเลขพัสดุให้ก่อนนะคะ'
  if (intent === 'refund') return 'เรื่องคืนเงินหรือยกเลิกออเดอร์จะส่งให้แอดมินตรวจสอบก่อนนะคะ'
  return 'รับทราบค่ะ เดี๋ยวช่วยดูรายละเอียดให้นะคะ'
}

function relevantKnowledge(intent, snapshot) {
  const termsByIntent = {
    stock: ['สินค้า', 'stock', 'product', 'faq'],
    price: ['ราคา', 'โปร', 'price', 'product'],
    orderStatus: ['พัสดุ', 'shipping', 'order', 'payment'],
    refund: ['คืน', 'refund', 'exchange', 'policy'],
    faq: ['faq', 'policy'],
  }
  const terms = termsByIntent[intent] || termsByIntent.faq
  return (snapshot.knowledgeSources || [])
    .filter((source) => source.status === 'ready')
    .filter((source) => {
      const haystack = [source.title, source.content, ...(source.tags || [])].join(' ').toLowerCase()
      return terms.some((term) => haystack.includes(term.toLowerCase()))
    })
    .slice(0, 3)
}

export function createAiReplyEngine({ provider = DEFAULT_PROVIDER, model = DEFAULT_MODEL } = {}) {
  return {
    provider,
    model,
    draft({ thread, snapshot, policy }) {
      if (!thread) return { ok: false, error: 'thread_required' }
      const inbound = latestInboundMessage(thread, snapshot)
      const intent = classifyIntent(inbound?.text || '')
      const risk = riskForIntent(intent, policy)
      const allowed = Boolean(policy?.autoSend?.[intent]) && risk === 'low'
      const knowledge = relevantKnowledge(intent, snapshot)

      return {
        ok: true,
        provider,
        model,
        threadId: thread.id,
        intent,
        risk,
        action: allowed ? 'draft_ready' : 'needs_approval',
        confidence: intent === 'faq' ? 0.72 : 0.82,
        allowed,
        draftText: draftForIntent(intent),
        reason: allowed ? 'policy_allows_low_risk_intent' : 'guard_requires_human_or_more_data',
        sourceIds: knowledge.map((source) => source.id),
        evidenceIds: inbound?.id ? [inbound.id] : [],
      }
    },
  }
}
