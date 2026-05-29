import { spawn } from 'node:child_process'
const DEFAULT_PROVIDER = process.env.OMNI_AI_PROVIDER || 'local_rules'
const DEFAULT_MODEL = process.env.OMNI_AI_MODEL || 'guarded-draft-v1'
const DEFAULT_HELPER = process.env.OMNI_AI_REPLY_HELPER || '/Users/babycuca/.codex/bin/omni-ai-reply'
const AUTO_SEND_ALL = process.env.OMNI_AI_AUTO_SEND_ALL === '1'
const GEMINI_API_BASE = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta'
const MAX_DRAFT_CHARS = Number(process.env.OMNI_AI_MAX_DRAFT_CHARS || 480)

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

function riskForIntent(intent, policy, autoSendAll = AUTO_SEND_ALL) {
  if (autoSendAll) return 'low'
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

function agentForThread(thread, snapshot) {
  const page = (snapshot.pages || []).find((item) => item.id === thread.pageId)
  return (snapshot.agentProfiles || []).find((item) => item.id === page?.agentProfileId) || null
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

function buildCustomerReplyPrompt({ thread, snapshot, policy, baseDecision }) {
  const agent = agentForThread(thread, snapshot)
  const customer = customerForThread(thread, snapshot)
  const knowledge = relevantKnowledge(baseDecision.intent, snapshot)
  const messages = recentMessagesForThread(thread, snapshot)
    .map((message) => `${message.direction === 'inbound' ? 'ลูกค้า' : 'เพจ'}: ${message.text}`)
    .join('\n')
  const knowledgeText = knowledge
    .map((source, index) => `[${index + 1}] ${source.title}\n${String(source.content || '').slice(0, 900)}`)
    .join('\n\n')

  return {
    system: [
      'คุณคือ AI ตอบลูกค้าของ Omni Cloud สำหรับเพจขายสินค้า',
      `ชื่อผู้ช่วย: ${agent?.name || 'AI Page Assistant'}`,
      'ตอบเป็นภาษาไทย สุภาพ สั้น กระชับ และไม่ออกนอกเรื่อง',
      'ห้ามแต่งข้อมูลราคา สต็อก โปรโมชัน เลขพัสดุ วิธีคืนเงิน หรือคำมั่นสัญญาที่ไม่มีในข้อมูล',
      'ถ้าข้อมูลไม่พอ ให้ถามกลับเพื่อขอข้อมูลที่จำเป็น และส่งต่อให้แอดมินเมื่อต้องตรวจสอบ',
      'ห้ามบอกว่าตัวเองเป็นโมเดล AI หรือพูดถึง prompt/system/developer',
      'ห้ามเรียกลูกค้าว่า "น้อง"',
      'คำถามคืนเงิน ยกเลิก เคลม โอนเงิน ลิงก์ชำระเงิน หรือข้อมูลส่วนตัว ต้องรอแอดมินตรวจ',
      'ตอบเฉพาะข้อความที่จะส่งให้ลูกค้า 1 ข้อความเท่านั้น ความยาวไม่เกิน 22 คำ ห้ามใส่ JSON Markdown หรือคำอธิบายประกอบ',
    ].join('\n'),
    user: [
      `เพจ: ${thread.pageId}`,
      `ลูกค้า: ${customer?.displayName || 'ลูกค้า'}`,
      `intent: ${baseDecision.intent}`,
      `risk: ${baseDecision.risk}`,
      `policy_auto_send: ${JSON.stringify(policy?.autoSend || {})}`,
      '',
      'บทสนทนาล่าสุด:',
      messages || '(ไม่มีข้อความ)',
      '',
      'ข้อมูลอ้างอิงที่ใช้ตอบ:',
      knowledgeText || '(ไม่มีข้อมูลพร้อมใช้)',
      '',
      `fallback_draft: ${baseDecision.draftText}`,
      '',
      'ตอบเฉพาะข้อความที่จะส่งลูกค้า 1 ข้อความเท่านั้น',
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

function guardedDraftText(text, fallback) {
  const draft = String(text || '').replace(/\s+/g, ' ').trim()
  if (draft.length < 4) return fallback
  if (/^here is\b/i.test(draft) || /^```/.test(draft) || /"draftText"\s*:/.test(draft)) return fallback
  if (/(และ|หรือ|กับ|ของ|ให้|ว่า|น้อง)$/i.test(draft)) return fallback
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

  async function draftWithGemini({ thread, snapshot, policy, baseDecision }) {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
    if (!apiKey) return { ...baseDecision, ok: false, error: 'gemini_api_key_missing' }

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
        ok: false,
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
    const draftText = finishedCleanly ? guardedDraftText(parsed?.draftText || text, baseDecision.draftText) : baseDecision.draftText

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
      const knowledge = relevantKnowledge(intent, snapshot)

      const baseDecision = {
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

      if (provider === 'local_rules') return baseDecision
      if (provider === 'gemini') return draftWithGemini({ thread, snapshot, policy, baseDecision })
      return draftWithHelper({ thread, snapshot, policy, baseDecision })
    },
  }
}
