import React from 'react'

export default function AiDecisionPanel({ snapshot, thread }) {
  const decisions = thread ? snapshot.aiDecisions.filter((decision) => decision.threadId === thread.id) : []
  return (
    <section className="border-b border-slate-800 p-4">
      <h2 className="text-sm font-semibold">AI Decision</h2>
      {decisions.map((decision) => (
        <div key={decision.id} className="mt-3 rounded bg-slate-900 p-3 text-xs text-slate-300">
          <div>Action: {decision.action}</div>
          <div>Confidence: {Math.round(decision.confidence * 100)}%</div>
        </div>
      ))}
    </section>
  )
}
