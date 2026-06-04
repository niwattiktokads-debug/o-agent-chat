import React from 'react'
import { customerAvatarUrl, customerForThread, formatShortTime, initialsForName, latestMessageForThread, pageForThread, statusLabel } from '../../lib/omniModel.js'

export default function ThreadList({ threads, snapshot, activeThreadId, onSelect }) {
  return (
    <section className="order-4 max-h-[48dvh] shrink-0 overflow-y-auto border-t border-[var(--color-rule)] bg-[var(--color-panel)] lg:order-none lg:max-h-none lg:min-h-0 lg:border-r lg:border-t-0">
      <div className="sticky top-0 z-10 border-b border-[var(--color-rule)] bg-[var(--color-panel)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-[var(--color-ink)]">ต้องตอบ</h2>
          <span className="rounded-[var(--radius-pill)] bg-[var(--color-live-soft)] px-2 py-1 text-xs font-semibold text-[var(--color-live)]">{threads.length}</span>
        </div>
      </div>
      {threads.map((thread) => (
        <ThreadRow
          key={thread.id}
          thread={thread}
          snapshot={snapshot}
          active={activeThreadId === thread.id}
          onSelect={() => onSelect(thread.id)}
        />
      ))}
    </section>
  )
}

function ThreadRow({ thread, snapshot, active, onSelect }) {
  const customer = customerForThread(snapshot.customers, thread)
  const page = pageForThread(snapshot.pages, thread)
  const latest = latestMessageForThread(snapshot.messages, thread.id)
  const customerName = customer?.displayName || 'Facebook Customer'
  const avatarUrl = customerAvatarUrl(customer)
  const preview = latest?.text || 'ยังไม่มีข้อความ'
  const time = formatShortTime(latest?.createdAt || thread.updatedAt)

  return (
    <button
      className={`w-full border-b border-[var(--color-rule)] px-4 py-3 text-left transition ${active ? 'bg-[var(--color-accent-soft)]' : 'bg-[var(--color-panel)] hover:bg-[var(--color-panel-2)]'}`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <CustomerAvatar name={customerName} avatarUrl={avatarUrl} />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-bold text-[var(--color-ink)]">{customerName}</span>
              {thread.unreadCount ? <span className="rounded-[var(--radius-pill)] bg-[var(--color-danger)] px-1.5 text-[10px] font-semibold text-white">{thread.unreadCount}</span> : null}
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-[var(--color-muted)]">
              <span className="truncate">{page?.name || thread.pageId}</span>
              <span>{thread.platform}</span>
            </div>
          </div>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-[var(--color-muted)]">{time}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-5 text-[var(--color-ink-2)]">{preview}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="rounded-[var(--radius-pill)] bg-[var(--color-panel-2)] px-2 py-1 text-[11px] font-semibold text-[var(--color-ink-2)]">{statusLabel(thread.status)}</span>
        <span className="text-[11px] text-[var(--color-muted)]">{thread.intent} · {thread.risk}</span>
      </div>
    </button>
  )
}

function CustomerAvatar({ name, avatarUrl }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="h-10 w-10 shrink-0 rounded-full border border-[var(--color-rule)] object-cover"
      />
    )
  }

  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--color-rule)] bg-[var(--color-panel-2)] text-xs font-black text-[var(--color-ink-2)]">
      {initialsForName(name)}
    </span>
  )
}
