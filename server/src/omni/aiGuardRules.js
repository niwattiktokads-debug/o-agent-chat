export const PLUS_SIZE_LABELS = ['XXL', '2XL', '3XL', '4XL', '5XL']
export const PLUS_SIZE_MEASUREMENT_MIN = { bust: 44, waist: 40, hips: 49 }

export function getAiGuardRules() {
  return [{
    id: 'plus_size_wording_threshold',
    title: 'คำว่า "สาวอวบ" ต้องมีเกณฑ์ก่อน',
    status: 'active',
    visibleToBoss: true,
    surface: 'Train AI / AI Config',
    criteria: {
      sizes: [...PLUS_SIZE_LABELS],
      measurements: { ...PLUS_SIZE_MEASUREMENT_MIN },
    },
    fallback: 'ถ้ายังไม่มีไซซ์หรือสัดส่วน ให้ถามอก เอว สะโพกก่อน และใช้คำกลาง เช่น มีไซซ์ใหญ่รองรับ',
    customerFacingSend: false,
  }]
}
