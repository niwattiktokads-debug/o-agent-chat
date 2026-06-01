import { getProvinceAll, searchAddressByPostalCode } from 'thai-address-universal'

const THAI_POSTCODE_PATTERN = /^[1-9]\d{4}$/
const DEFAULT_COUNTRY = 'ไทย'

function cleanText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

export function normalizeThaiPostcode(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 5)
}

function normalizePhone(value) {
  return String(value || '').trim().replace(/[^\d+]/g, '')
}

function addressKey(row) {
  return [row.postalCode, row.province, row.district, row.subDistrict].join('|')
}

function normalizeSuggestion(row = {}) {
  const suggestion = {
    postalCode: cleanText(row.postal_code || row.postalCode || row.zipcode),
    province: cleanText(row.province),
    district: cleanText(row.district || row.amphoe),
    subDistrict: cleanText(row.sub_district || row.subDistrict || row.districtName),
  }
  return { ...suggestion, key: addressKey(suggestion) }
}

function uniqueSuggestions(rows = []) {
  const byKey = new Map()
  for (const row of rows) {
    const suggestion = normalizeSuggestion(row)
    if (!suggestion.postalCode || !suggestion.province || !suggestion.district || !suggestion.subDistrict) continue
    byKey.set(suggestion.key, suggestion)
  }
  return Array.from(byKey.values()).sort((a, b) => (
    a.province.localeCompare(b.province, 'th') ||
    a.district.localeCompare(b.district, 'th') ||
    a.subDistrict.localeCompare(b.subDistrict, 'th')
  ))
}

function uniqueValues(rows, key) {
  return Array.from(new Set(rows.map((row) => row[key]).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'))
}

export function formatThaiShippingAddress(input = {}) {
  const addressLine = cleanText(input.addressLine || input.line1 || input.detail)
  const postalCode = normalizeThaiPostcode(input.postalCode || input.postcode || input.zipcode)
  const province = cleanText(input.province)
  const district = cleanText(input.district)
  const subDistrict = cleanText(input.subDistrict || input.sub_district)
  const isBangkok = province === 'กรุงเทพมหานคร' || province === 'กรุงเทพฯ'
  const parts = [
    addressLine,
    subDistrict ? `${isBangkok ? 'แขวง' : 'ต.'}${subDistrict}` : '',
    district ? `${isBangkok ? 'เขต' : 'อ.'}${district}` : '',
    province ? `${isBangkok ? '' : 'จ.'}${province}` : '',
    postalCode,
  ].filter(Boolean)
  return parts.join(' ')
}

export function normalizeStoredShippingAddress(input = {}) {
  const address = {
    recipientName: cleanText(input.recipientName || input.shippingName || input.name),
    recipientPhone: normalizePhone(input.recipientPhone || input.shippingPhone || input.phone),
    addressLine: cleanText(input.addressLine || input.line1 || input.detail),
    postalCode: normalizeThaiPostcode(input.postalCode || input.postcode || input.zipcode),
    province: cleanText(input.province),
    district: cleanText(input.district),
    subDistrict: cleanText(input.subDistrict || input.sub_district),
    country: cleanText(input.country) || DEFAULT_COUNTRY,
  }
  return {
    ...address,
    formattedAddress: cleanText(input.formattedAddress) || formatThaiShippingAddress(address),
  }
}

export async function lookupThaiAddressByPostcode(value, { limit = 200 } = {}) {
  const postalCode = normalizeThaiPostcode(value)
  if (!THAI_POSTCODE_PATTERN.test(postalCode)) {
    return { ok: false, error: 'thai_postcode_invalid', postalCode }
  }

  const rows = await searchAddressByPostalCode(postalCode, limit)
  const suggestions = uniqueSuggestions(rows)
  const provinces = await getProvinceAll()

  if (suggestions.length === 0) {
    return {
      ok: false,
      error: 'thai_postcode_not_found',
      postalCode,
      suggestions: [],
      source: { package: 'thai-address-universal', provinceCount: provinces.length },
    }
  }

  return {
    ok: true,
    postalCode,
    count: suggestions.length,
    ambiguous: suggestions.length > 1,
    suggestions,
    provinceList: uniqueValues(suggestions, 'province'),
    districtList: uniqueValues(suggestions, 'district'),
    subDistrictList: uniqueValues(suggestions, 'subDistrict'),
    source: {
      package: 'thai-address-universal',
      provinceCount: provinces.length,
      country: DEFAULT_COUNTRY,
    },
  }
}

export async function validateThaiShippingAddress(input = {}) {
  const address = normalizeStoredShippingAddress(input)
  const missingFields = []
  if (!address.recipientName) missingFields.push('recipientName')
  if (!address.recipientPhone || address.recipientPhone.replace(/\D/g, '').length < 9) missingFields.push('recipientPhone')
  if (!address.addressLine) missingFields.push('addressLine')
  if (!THAI_POSTCODE_PATTERN.test(address.postalCode)) missingFields.push('postalCode')
  if (!address.province) missingFields.push('province')
  if (!address.district) missingFields.push('district')
  if (!address.subDistrict) missingFields.push('subDistrict')
  if (missingFields.length) return { ok: false, error: 'shipping_address_incomplete', missingFields, address }

  const lookup = await lookupThaiAddressByPostcode(address.postalCode)
  if (!lookup.ok) return { ...lookup, address }

  const match = lookup.suggestions.find((suggestion) => (
    suggestion.province === address.province &&
    suggestion.district === address.district &&
    suggestion.subDistrict === address.subDistrict
  ))
  if (!match) {
    return {
      ok: false,
      error: 'shipping_address_postcode_mismatch',
      missingFields: [],
      address,
      suggestions: lookup.suggestions,
    }
  }

  const normalized = normalizeStoredShippingAddress({ ...address, ...match })
  return { ok: true, address: normalized, match, suggestions: lookup.suggestions }
}
