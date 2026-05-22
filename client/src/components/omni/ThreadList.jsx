import React from 'react'
import { statusLabel } from '../../lib/omniModel.js'

export default function ThreadList({ threads, activeThreadId, onSelect }) {
  return (
    <section className="overflow-y-auto border-r border-slate-800">
      {threads.map((thread) => (
        <button key={thread.id} className={`w-full border-b border-slate-800 px-4 py-3 text-left ${activeThreadId === thread.id ? 'bg-slate-800' : 'bg-slate-950'}`} onClick={() => onSelect(thread.id)}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{thread.platform}</span>
            <span className="text-xs text-slate-400">{statusLabel(thread.status)}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{thread.intent} · {thread.risk}</p>
        </button>
      ))}
    </section>
  )
}
