const TAGS = ['ASK', 'ANS', 'PROPOSE', 'AGREE', 'DISAGREE', 'DECIDE', 'DO', 'PASS', 'STATE']

export function parseTag(text) {
  const m = (text || '').match(/^\[(\w+)\]\s*/)
  if (m && TAGS.includes(m[1])) {
    return { tag: m[1], text: text.slice(m[0].length) }
  }
  return { tag: null, text }
}
