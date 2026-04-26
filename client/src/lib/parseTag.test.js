import { describe, it, expect } from 'vitest'
import { parseTag } from './parseTag.js'

describe('parseTag', () => {
  it('extracts known tag and trims body', () => {
    expect(parseTag('[PROPOSE] do X')).toEqual({ tag: 'PROPOSE', text: 'do X' })
  })

  it('returns null tag for unknown bracket', () => {
    expect(parseTag('[xyz] body')).toEqual({ tag: null, text: '[xyz] body' })
  })

  it('returns null tag for plain text', () => {
    expect(parseTag('plain message')).toEqual({ tag: null, text: 'plain message' })
  })

  it('handles empty input', () => {
    expect(parseTag('')).toEqual({ tag: null, text: '' })
  })
})
