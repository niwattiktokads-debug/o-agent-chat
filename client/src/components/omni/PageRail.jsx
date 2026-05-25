import React from 'react'

function initials(name = '') {
  return String(name).trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'OA'
}

export default function PageRail({ pages, accounts = [], threads = [], activePageId, onSelect }) {
  const accountByPageId = new Map(accounts.map((account) => [account.pageId, account]))
  const unreadByPageId = new Map()
  for (const thread of threads || []) {
    unreadByPageId.set(thread.pageId, (unreadByPageId.get(thread.pageId) || 0) + (thread.unreadCount || 0))
  }
  const allUnread = [...unreadByPageId.values()].reduce((sum, count) => sum + count, 0)
  return (
    <aside className="order-1 flex shrink-0 gap-2 overflow-x-auto border-b border-[var(--color-rule)] bg-[var(--color-panel)] p-2 lg:order-none lg:h-full lg:flex-col lg:overflow-x-visible lg:border-b-0 lg:border-r">
      <button
        className={`relative flex h-14 min-w-[84px] flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border px-3 py-2 text-xs font-semibold transition lg:h-auto lg:min-w-0 ${activePageId === 'all' ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]' : 'border-[var(--color-rule)] bg-[var(--color-panel)] text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]'}`}
        onClick={() => onSelect('all')}
      >
        <span>ทั้งหมด</span>
        {allUnread ? <span className="rounded-[var(--radius-pill)] bg-[var(--color-danger)] px-1.5 text-[10px] text-white">{allUnread}</span> : null}
      </button>
      <div className="flex gap-2 lg:flex-col">
        {pages.map((page) => (
          <button
            key={page.id}
            title={page.name}
            className={`relative flex h-14 min-w-[96px] flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border px-2 py-2 text-center transition lg:h-auto lg:min-w-0 ${activePageId === page.id ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]' : 'border-[var(--color-rule)] bg-[var(--color-panel)] text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]'}`}
            onClick={() => onSelect(page.id)}
          >
            <span className="hidden h-9 w-9 place-items-center rounded-[var(--radius-md)] bg-[var(--color-panel-2)] text-sm font-bold lg:grid">{initials(page.name)}</span>
            <span className="max-w-[78px] truncate text-xs font-semibold leading-tight lg:max-w-16 lg:text-[11px]">{page.name}</span>
            <span className="hidden text-[10px] text-[var(--color-muted)] lg:block">{accountByPageId.get(page.id)?.platform || 'page'}</span>
            {page.autoReplyEnabled === false ? <span className="rounded-[var(--radius-pill)] bg-[var(--color-warn-soft)] px-1.5 text-[10px] font-semibold text-[var(--color-warn)]">AI off</span> : null}
            {unreadByPageId.get(page.id) ? <span className="absolute right-1 top-1 rounded-[var(--radius-pill)] bg-[var(--color-danger)] px-1.5 text-[10px] font-semibold text-white">{unreadByPageId.get(page.id)}</span> : null}
          </button>
        ))}
      </div>
    </aside>
  )
}
