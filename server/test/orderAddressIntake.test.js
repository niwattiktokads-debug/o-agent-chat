import test from 'node:test'
import assert from 'node:assert/strict'
import { extractThaiOrderAddress } from '../src/omni/orderAddressIntake.js'

test('extracts recipient name from the first line of an unlabeled address block', async () => {
  const result = await extractThaiOrderAddress([
    'LyNn Kondee',
    'อรอุมา โรจน์คุรีเสถียร',
    '460/312 นิชโมโน รามคำแหง (อาคาร A)',
    'ถ.รามคำแหง แขวงหัวหมาก เขตบางกะปิ กทม. 10240',
    '082-426-2626',
    'หัวหมาก',
    ', กทม 10240',
    '+66824262626',
  ].join('\n'), { fallbackName: 'Facebook Customer' })

  assert.equal(result.extracted.recipientName, 'LyNn Kondee')
  assert.equal(result.extracted.recipientPhone, '0824262626')
  assert.equal(result.extracted.postalCode, '10240')
})
