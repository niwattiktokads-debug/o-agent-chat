export const OMNI_STATUSES = {
  page: ['active', 'paused', 'archived'],
  thread: ['open', 'draft_ready', 'needs_approval', 'needs_data', 'auto_sent', 'escalated'],
  connector: ['healthy', 'degraded', 'disabled'],
  risk: ['low', 'medium', 'high'],
}

export function validatePage(page) {
  const errors = []
  if (!page || typeof page !== 'object') errors.push('page_required')
  if (!page?.id || typeof page.id !== 'string') errors.push('id_required')
  if (!page?.name || typeof page.name !== 'string') errors.push('name_required')
  if (!OMNI_STATUSES.page.includes(page?.status)) errors.push('invalid_status')
  return { ok: errors.length === 0, errors }
}

export function normalizeMessage(message) {
  return {
    id: message.id,
    threadId: message.threadId,
    direction: message.direction,
    authorName: message.authorName || 'Unknown',
    text: String(message.text || '').trim(),
    createdAt: message.createdAt,
    providerMessageId: message.providerMessageId,
  }
}
