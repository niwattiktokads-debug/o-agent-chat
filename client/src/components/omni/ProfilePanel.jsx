import React, { useMemo } from 'react'
import { customerAvatarUrl, initialsForName } from '../../lib/omniModel.js'

function pageLabel(pageId, pages = []) {
  return pages.find((page) => page.id === pageId)?.name || pageId
}

function latestThreadForCustomer(customerId, threads = []) {
  return threads
    .filter((thread) => thread.customerId === customerId)
    .slice()
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || null
}

function customerMessageCount(customerId, threads = [], messages = []) {
  const threadIds = new Set(threads.filter((thread) => thread.customerId === customerId).map((thread) => thread.id))
  return messages.filter((message) => threadIds.has(message.threadId)).length
}

export default function ProfilePanel({ snapshot }) {
  const pages = snapshot?.pages || []
  const accounts = snapshot?.platformAccounts || []
  const threads = snapshot?.threads || []
  const messages = snapshot?.messages || []
  const customers = snapshot?.customers || []

  const pageProfiles = useMemo(() => pages.map((page) => {
    const pageThreads = threads.filter((thread) => thread.pageId === page.id)
    return {
      ...page,
      accounts: accounts.filter((account) => account.pageId === page.id),
      threadCount: pageThreads.length,
      unreadCount: pageThreads.reduce((sum, thread) => sum + (thread.unreadCount || 0), 0),
    }
  }), [accounts, pages, threads])

  const customerProfiles = useMemo(() => customers
    .map((customer) => {
      const customerThreads = threads.filter((thread) => thread.customerId === customer.id)
      const latest = latestThreadForCustomer(customer.id, threads)
      return {
        ...customer,
        threadCount: customerThreads.length,
        messageCount: customerMessageCount(customer.id, threads, messages),
        unreadCount: customerThreads.reduce((sum, thread) => sum + (thread.unreadCount || 0), 0),
        latestAt: latest?.updatedAt || null,
        latestThreadId: latest?.id || null,
        pageIds: [...new Set(customerThreads.map((thread) => thread.pageId))],
        platform: customer.platform || latest?.platform || null,
      }
    })
    .sort((a, b) => String(b.latestAt || '').localeCompare(String(a.latestAt || '')))
    .slice(0, 30), [customers, messages, threads])

  return (
    <section className="space-y-4 p-4">
      <div>
        <h2 className="text-sm font-bold text-[var(--color-ink)]">โปรไฟล์เพจ</h2>
        <div className="mt-3 space-y-2">
          {pageProfiles.map((page) => (
            <article key={page.id} className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-[var(--color-ink)]">{page.name}</div>
                  <div className="mt-1 text-[11px] text-[var(--color-muted)]">{page.shortName ? `${page.shortName} · ` : ''}{page.id}</div>
                </div>
                <span className={`rounded-[var(--radius-pill)] px-2 py-1 text-[10px] font-semibold ${page.autoReplyEnabled === false ? 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]' : 'bg-[var(--color-ai-soft)] text-[var(--color-ai)]'}`}>
                  {page.autoReplyEnabled === false ? 'AI off' : 'AI on'}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-[var(--color-ink-2)]">
                <span>{page.threadCount} threads</span>
                <span>{page.unreadCount} unread</span>
                <span>{page.policySetId}</span>
                <span>{page.agentProfileId}</span>
              </div>
              <div className="mt-2 space-y-1">
                {page.accounts.length ? page.accounts.map((account) => (
                  <div key={account.id} className="rounded-[var(--radius-sm)] bg-[var(--color-panel-2)] px-2 py-1 text-[11px] text-[var(--color-muted)]">
                    {account.platform} · {account.provider} · {account.status}{account.providerAccountId ? ` · ${account.providerAccountId}` : ''}
                  </div>
                )) : (
                  <div className="rounded-[var(--radius-sm)] bg-[var(--color-panel-2)] px-2 py-1 text-[11px] text-[var(--color-muted)]">ยังไม่มี account binding</div>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold text-[var(--color-ink)]">โปรไฟล์ลูกค้า</h2>
        <div className="mt-3 space-y-2">
          {customerProfiles.map((customer) => (
            <article key={customer.id} className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <CustomerAvatar customer={customer} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-[var(--color-ink)]">{customer.displayName || customer.id}</div>
                    <div className="mt-1 truncate text-[11px] text-[var(--color-muted)]">{customer.providerCustomerId || customer.id}</div>
                  </div>
                </div>
                <span className="rounded-[var(--radius-pill)] bg-[var(--color-live-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--color-live)]">
                  {customer.platform || 'unknown'}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-[var(--color-ink-2)]">
                <span>{customer.threadCount} threads</span>
                <span>{customer.messageCount} msgs</span>
                <span>{customer.unreadCount} unread</span>
              </div>
              <div className="mt-2 text-[11px] text-[var(--color-muted)]">
                {customer.pageIds.map((id) => pageLabel(id, pages)).join(', ') || 'no page'}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function CustomerAvatar({ customer }) {
  const name = customer.displayName || customer.id
  const avatarUrl = customerAvatarUrl(customer)
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className="h-10 w-10 shrink-0 rounded-full border border-[var(--color-rule)] object-cover" />
  }
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--color-rule)] bg-[var(--color-panel-2)] text-xs font-black text-[var(--color-ink-2)]">
      {initialsForName(name)}
    </span>
  )
}
