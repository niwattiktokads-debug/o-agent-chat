import React from 'react'

export default function PageRail({ pages, activePageId, onSelect }) {
  return (
    <aside className="border-r border-slate-800 p-3">
      <button className="mb-3 w-full rounded bg-slate-800 px-4 py-3 text-left text-base font-semibold" onClick={() => onSelect('all')}>All pages</button>
      <div className="space-y-2">
        {pages.map((page) => (
          <button key={page.id} className={`w-full rounded px-4 py-3 text-left text-base ${activePageId === page.id ? 'bg-cyan-950 text-cyan-100' : 'bg-slate-900 text-slate-300'}`} onClick={() => onSelect(page.id)}>
            <span className="block break-words text-lg font-semibold leading-snug">{page.name}</span>
            <span className="text-sm text-slate-500">{page.status}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}
