import React from 'react'

export default function PageRail({ pages, accounts = [], activePageId, onSelect }) {
  const accountByPageId = new Map(accounts.map((account) => [account.pageId, account]))
  return (
    <aside className="border-r border-[#dfe8e4] bg-[#f8fbfa] p-3">
      <button className="mb-3 w-full rounded-xl border border-[#dfe8e4] bg-white px-4 py-3 text-left text-base font-semibold text-[#24362f] shadow-sm" onClick={() => onSelect('all')}>All pages</button>
      <div className="space-y-2">
        {pages.map((page) => (
          <button
            key={page.id}
            className={`w-full rounded-xl border px-4 py-3 text-left text-base shadow-sm transition ${activePageId === page.id ? 'border-[#80d8c8] bg-[#e8faf6] text-[#0b5e51] ring-2 ring-[#13b89f]/20' : 'border-[#e4ece8] bg-white text-[#35463f] hover:border-[#b8d8cf]'}`}
            onClick={() => onSelect(page.id)}
          >
            <span className="block break-words text-lg font-semibold leading-snug">{page.name}</span>
            <span className="text-sm text-[#7a8b84]">{accountByPageId.get(page.id)?.platform || 'page'} · {page.status}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}
