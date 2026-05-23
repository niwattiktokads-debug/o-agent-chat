import React, { useState } from 'react'
import { createAiDraft } from '../../lib/omniApi.js'

export default function AiDecisionPanel({ snapshot, thread, onDrafted }) {
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState('')
  const decisions = thread ? snapshot.aiDecisions.filter((decision) => decision.threadId === thread.id) : []

  async function runDraft() {
    if (!thread) return
    setBusy(true)
    setError('')
    try {
      const result = await createAiDraft(thread.id)
      setDraft(result.decision)
      onDrafted?.(result.snapshot)
    } catch (err) {
      setError(err.message || 'ai_draft_failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border-b border-[#dfe8e4] p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[#24362f]">AI Decision</h2>
        <button
          type="button"
          className="rounded-lg bg-[#0f8f7b] px-3 py-1 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
          disabled={!thread || busy}
          onClick={runDraft}
        >
          {busy ? 'Drafting' : 'AI Draft'}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      {draft ? (
        <div className="mt-3 rounded-xl border border-[#dfe8e4] bg-white p-3 text-xs text-[#50635c] shadow-sm">
          <div>{draft.action} · {Math.round(draft.confidence * 100)}%</div>
          <div className="mt-1 text-[#7a8b84]">{draft.draftText}</div>
        </div>
      ) : null}
      {decisions.map((decision) => (
        <div key={decision.id} className="mt-3 rounded-xl border border-[#dfe8e4] bg-white p-3 text-xs text-[#50635c] shadow-sm">
          <div>Action: {decision.action}</div>
          <div>Confidence: {Math.round(decision.confidence * 100)}%</div>
        </div>
      ))}
    </section>
  )
}
