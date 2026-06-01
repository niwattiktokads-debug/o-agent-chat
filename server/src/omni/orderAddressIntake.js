import { lookupThaiAddressByPostcode, normalizeStoredShippingAddress, normalizeThaiPostcode } from './thaiAddress.js'

const ADDRESS_KEYWORDS = /(ที่อยู่|จัดส่ง|บ้านเลขที่|เลขที่|หมู่บ้าน|หมู่\s*\d+|ซอย|ถนน|ต\.|ตำบล|แขวง|อ\.|อำเภอ|เขต|จ\.|จังหวัด|กทม|กรุงเทพ|address)/i
const NAME_LABEL = /(ชื่อผู้รับ|ผู้รับสินค้า|ผู้รับ|ชื่อ)\s*[:：]?\s*(.+)$/i
const NAME_LINE = /^(ชื่อผู้รับ|ผู้รับสินค้า|ผู้รับ|ชื่อ)\s*[:：]?/i
const PHONE_LINE = /^(เบอร์โทร|เบอร์|โทรศัพท์|โทร|มือถือ|phone|tel)\s*[:：]?/i
const PHONE_PATTERN = /(?:\+?66|0)[0-9 .()\-]{7,18}[0-9]/g

function cleanText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function compactThai(value) {
  return cleanText(value)
    .replace(/กรุงเทพฯ/g, 'กรุงเทพมหานคร')
    .replace(/กทม\.?/gi, 'กรุงเทพมหานคร')
    .replace(/[^\u0E00-\u0E7Fa-zA-Z0-9]/g, '')
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '')
  if (digits.startsWith('66') && digits.length >= 11) digits = `0${digits.slice(2)}`
  if (digits.length < 9 || digits.length > 10) return ''
  return digits
}

function extractPhones(text) {
  const matches = String(text || '').match(PHONE_PATTERN) || []
  const phones = unique(matches.map((raw) => normalizePhone(raw)))
  return {
    rawMatches: matches,
    primary: phones[0] || '',
    all: phones,
  }
}

function removeRawMatches(text, matches = []) {
  let output = String(text || '')
  for (const match of matches) output = output.replace(match, ' ')
  return output
}

function extractPostcode(text, phoneMatches = []) {
  const withoutPhones = removeRawMatches(text, phoneMatches)
  const matches = withoutPhones.match(/[1-9]\d{4}/g) || []
  return normalizeThaiPostcode(matches[0] || '')
}

function cleanNameCandidate(value) {
  const candidate = cleanText(value)
    .split(/(?:เบอร์โทร|เบอร์|โทรศัพท์|โทร|มือถือ|phone|tel|ที่อยู่|address|บ้านเลขที่|เลขที่|ถนน|ซอย|หมู่|ต\.|ตำบล|แขวง|อ\.|อำเภอ|เขต|จ\.|จังหวัด|\d{5})/i)[0]
    .replace(/[|,].*$/g, '')
    .trim()
  if (!candidate || candidate.length < 2 || candidate.length > 80 || /\d/.test(candidate)) return ''
  return candidate
}

function extractRecipientName(text, fallback = '') {
  for (const rawLine of String(text || '').split(/\n|,/)) {
    if (/ชื่อสินค้า|สินค้า|sku/i.test(rawLine)) continue
    const match = rawLine.match(NAME_LABEL)
    if (!match) continue
    const name = cleanNameCandidate(match[2])
    if (name) return name
  }
  return cleanNameCandidate(fallback)
}

function adminAliases(field, value) {
  const aliases = [value]
  if (field === 'province' && value === 'กรุงเทพมหานคร') aliases.push('กรุงเทพ', 'กรุงเทพฯ', 'กทม')
  return unique(aliases)
}

function hasPrefixedAdmin(rawText, field, value) {
  const prefixes = {
    subDistrict: ['แขวง', 'ตำบล', 'ต.'],
    district: ['เขต', 'อำเภอ', 'อ.'],
    province: ['จังหวัด', 'จ.'],
  }[field] || []
  const raw = cleanText(rawText)
  return prefixes.some((prefix) => adminAliases(field, value).some((alias) => (
    raw.includes(`${prefix}${alias}`) || raw.includes(`${prefix} ${alias}`)
  )))
}

function scoreSuggestion(text, suggestion) {
  const compact = compactThai(text)
  const scoreField = (field, prefixedWeight, bareWeight) => {
    if (hasPrefixedAdmin(text, field, suggestion[field])) return prefixedWeight
    return adminAliases(field, suggestion[field])
      .map(compactThai)
      .some((alias) => alias && compact.includes(alias)) ? bareWeight : 0
  }
  return scoreField('subDistrict', 8, 2) + scoreField('district', 6, 1.5) + scoreField('province', 4, 1)
}

function chooseAddressSuggestion(text, suggestions = []) {
  if (suggestions.length === 1) return { suggestion: suggestions[0], score: 1, ambiguous: false }
  const scored = suggestions
    .map((suggestion) => ({ suggestion, score: scoreSuggestion(text, suggestion) }))
    .sort((a, b) => b.score - a.score)
  const best = scored[0]
  const second = scored[1]
  if (best?.score > 0 && best.score > (second?.score || 0)) return { ...best, ambiguous: false }
  return { suggestion: null, score: best?.score || 0, ambiguous: suggestions.length > 1 }
}

function stripAdminParts(value, suggestion) {
  let output = String(value || '')
  if (suggestion) {
    const tokens = unique([
      suggestion.subDistrict,
      suggestion.district,
      suggestion.province,
      suggestion.province === 'กรุงเทพมหานคร' ? 'กรุงเทพฯ' : '',
      suggestion.province === 'กรุงเทพมหานคร' ? 'กรุงเทพ' : '',
      suggestion.province === 'กรุงเทพมหานคร' ? 'กทม' : '',
    ])
    for (const token of tokens) output = output.split(token).join(' ')
  }
  return output
    .replace(/(?:แขวง|ตำบล|ต\.|เขต|อำเภอ|อ\.|จังหวัด|จ\.)/g, ' ')
    .replace(/[|,]+/g, ' ')
}

function extractAddressLine(text, { phoneRawMatches = [], recipientName = '', postalCode = '', suggestion = null } = {}) {
  const lines = String(text || '').split(/\n+/)
  const candidates = []
  for (const rawLine of lines) {
    let line = cleanText(removeRawMatches(rawLine, phoneRawMatches))
    if (!line) continue
    const hasAddressSignal = ADDRESS_KEYWORDS.test(line)
    if (NAME_LINE.test(line) && !hasAddressSignal) continue
    if (PHONE_LINE.test(line) && !hasAddressSignal) continue
    line = line.replace(NAME_LINE, ' ')
    line = line.replace(PHONE_LINE, ' ')
    line = line.replace(/^(ที่อยู่จัดส่ง|ที่อยู่|address)\s*[:：]?/i, ' ')
    if (recipientName) line = line.replace(recipientName, ' ')
    if (postalCode) line = line.replace(postalCode, ' ')
    line = stripAdminParts(line, suggestion)
    line = cleanText(line)
    if (!line) continue
    if (hasAddressSignal || /\d/.test(line)) candidates.push(line)
  }

  const fallback = stripAdminParts(
    removeRawMatches(text, phoneRawMatches)
      .replace(recipientName, ' ')
      .replace(postalCode, ' '),
    suggestion,
  )
  return cleanText((candidates.join(' ') || fallback)
    .replace(/^(ส่งที่|ที่อยู่จัดส่ง|ที่อยู่|address)\s*[:：]?/i, ' ')
    .replace(/\s{2,}/g, ' '))
}

function buildMissingFields(extracted, lookup) {
  const missing = []
  if (!extracted.recipientName) missing.push('recipientName')
  if (!extracted.recipientPhone) missing.push('recipientPhone')
  if (!extracted.addressLine) missing.push('addressLine')
  if (!extracted.postalCode) missing.push('postalCode')
  if (!extracted.selectedAddress && lookup?.ambiguous) missing.push('addressSelection')
  if (lookup && !lookup.ok) missing.push('validThaiPostcode')
  return missing
}

function confidenceFor(extracted, lookup) {
  let score = 0
  if (extracted.recipientName) score += 0.15
  if (extracted.recipientPhone) score += 0.2
  if (extracted.addressLine) score += 0.2
  if (extracted.postalCode) score += 0.15
  if (extracted.selectedAddress) score += 0.25
  if (lookup?.ambiguous && !extracted.selectedAddress) score -= 0.15
  return Math.max(0, Math.min(0.98, Number(score.toFixed(2))))
}

function missingFieldLabel(field) {
  return {
    recipientName: 'ชื่อผู้รับ',
    recipientPhone: 'เบอร์โทร',
    addressLine: 'บ้านเลขที่/ถนน/หมู่บ้าน',
    postalCode: 'รหัสไปรษณีย์',
    addressSelection: 'ตำบล/อำเภอ/จังหวัดจากรหัสไปรษณีย์',
    validThaiPostcode: 'รหัสไปรษณีย์ไทยที่ถูกต้อง',
  }[field] || field
}

export function buildAddressConfirmationText(extracted = {}) {
  if (extracted.readyForDraft) {
    return [
      'รบกวนตรวจสอบที่อยู่จัดส่งนี้ให้หน่อยค่ะ',
      `ชื่อผู้รับ: ${extracted.recipientName}`,
      `โทร: ${extracted.recipientPhone}`,
      `ที่อยู่: ${extracted.formattedAddress}`,
      'ถ้าถูกต้อง พิมพ์ "ยืนยันที่อยู่" ได้เลยค่ะ ถ้าต้องแก้ไข ส่งข้อมูลใหม่กลับมาได้เลยค่ะ',
    ].join('\n')
  }

  const missing = (extracted.missingFields || []).map(missingFieldLabel).join(', ')
  return [
    'ขอข้อมูลจัดส่งเพิ่มหน่อยค่ะ',
    missing ? `ตอนนี้ยังขาด: ${missing}` : '',
    'รบกวนส่งชื่อผู้รับ เบอร์โทร ที่อยู่ และรหัสไปรษณีย์อีกครั้งนะคะ',
  ].filter(Boolean).join('\n')
}

export async function extractThaiOrderAddress(text, { fallbackName = '' } = {}) {
  const sourceText = String(text || '').trim()
  if (!sourceText) return { ok: false, error: 'address_text_required' }

  const phones = extractPhones(sourceText)
  const postalCode = extractPostcode(sourceText, phones.rawMatches)
  const recipientName = extractRecipientName(sourceText, fallbackName)
  const lookup = postalCode ? await lookupThaiAddressByPostcode(postalCode, { limit: 500 }) : null
  const suggestions = lookup?.ok ? lookup.suggestions : []
  const selected = chooseAddressSuggestion(sourceText, suggestions)
  const addressLine = extractAddressLine(sourceText, {
    phoneRawMatches: phones.rawMatches,
    recipientName,
    postalCode,
    suggestion: selected.suggestion,
  })
  const address = selected.suggestion ? normalizeStoredShippingAddress({
    recipientName,
    recipientPhone: phones.primary,
    addressLine,
    postalCode,
    province: selected.suggestion.province,
    district: selected.suggestion.district,
    subDistrict: selected.suggestion.subDistrict,
    country: 'ไทย',
  }) : null
  const extracted = {
    recipientName,
    recipientPhone: phones.primary,
    phones: phones.all,
    addressLine,
    postalCode,
    selectedAddress: selected.suggestion,
    selectedAddressKey: selected.suggestion?.key || '',
    addressAmbiguous: Boolean(lookup?.ambiguous && !selected.suggestion),
    addressMatchScore: selected.score || 0,
    formattedAddress: address?.formattedAddress || '',
    sourceText,
  }
  const missingFields = buildMissingFields(extracted, lookup)
  return {
    ok: true,
    extracted: {
      ...extracted,
      missingFields,
      readyForDraft: missingFields.length === 0,
      requiresCustomerConfirmation: true,
      confidence: confidenceFor(extracted, lookup),
    },
    addressLookup: lookup || { ok: false, error: 'thai_postcode_missing', suggestions: [] },
    confirmationText: buildAddressConfirmationText({ ...extracted, missingFields, readyForDraft: missingFields.length === 0 }),
  }
}
