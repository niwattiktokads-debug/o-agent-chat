import React from 'react'

export default function PageRail({ pages, activePageId, onSelect }) {
  return (
    <aside className="border-r border-slate-800 p-3">
      <button className="mb-3 w-full rounded bg-slate-800 px-3 py-2 text-left text-sm" onClick={() => onSelect('all')}>All pages</button>
      <div className="space-y-2">
        {pages.map((page) => (
          <button key={page.id} className={`w-full rounded px-3 py-2 text-left text-sm ${activePageId === page.id ? 'bg-cyan-950 text-cyan-100' : 'bg-slate-900 text-slate-300'}`} onClick={() => onSelect(page.id)}>
            <span className="block font-medium">{page.name}</span>
            <span className="text-xs text-slate-500">{page.status}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}
