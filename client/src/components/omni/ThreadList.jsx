import React from 'react'
import { statusLabel } from '../../lib/omniModel.js'

export default function ThreadList({ threads, activeThreadId, onSelect }) {
  return (
    <section className="overflow-y-auto border-r border-[#dfe8e4] bg-white">
      {threads.map((thread) => (
        <button
          key={thread.id}
          className={`w-full border-b border-[#edf2ef] px-4 py-3 text-left transition ${activeThreadId === thread.id ? 'bg-[#edf9f6]' : 'bg-white hover:bg-[#f8fbfa]'}`}
          onClick={() => onSelect(thread.id)}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-[#eef4f2] px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[#50635c]">{thread.platform}</span>
            <span className="text-xs font-medium text-[#0f8f7b]">{statusLabel(thread.status)}</span>
          </div>
          <p className="mt-2 text-xs text-[#7a8b84]">{thread.intent} · {thread.risk}</p>
        </button>
      ))}
    </section>
  )
}
