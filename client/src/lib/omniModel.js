export function filterThreads(threads, filters = {}) {
  return threads
    .filter((thread) => !filters.pageId || filters.pageId === 'all' || thread.pageId === filters.pageId)
    .filter((thread) => !filters.status || filters.status === 'all' || thread.status === filters.status)
}

export function statusLabel(status) {
  const labels = {
    open: 'Open',
    draft_ready: 'Draft ready',
    needs_approval: 'Needs approval',
    needs_data: 'Needs data',
    auto_sent: 'Auto sent',
    escalated: 'Escalated',
  }
  return labels[status] || status
}

export function riskClass(risk) {
  if (risk === 'high') return 'text-rose-300 bg-rose-950/40'
  if (risk === 'medium') return 'text-amber-300 bg-amber-950/40'
  return 'text-emerald-300 bg-emerald-950/40'
}
