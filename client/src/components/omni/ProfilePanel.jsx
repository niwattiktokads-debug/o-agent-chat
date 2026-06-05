import React, { useMemo } from 'react'
import { customerAvatarUrl, customerForThread, initialsForName, pageForThread, statusLabel } from '../../lib/omniModel.js'

function pageLabel(pageId, pages = []) {
  return pages.find((page) => page.id === pageId)?.name || pageId
}

function messageCountForThreads(threadIds, messages = []) {
  return messages.filter((message) => threadIds.has(message.threadId)).length
}

function latestInboundMessage(threadIds, messages = []) {
  return messages
    .filter((message) => threadIds.has(message.threadId) && message.direction === 'inbound')
    .slice()
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null
}

export default function ProfilePanel({ snapshot, thread }) {
  const pages = snapshot?.pages || []
  const threads = snapshot?.threads || []
  const messages = snapshot?.messages || []
  const customers = snapshot?.customers || []

  const profile = useMemo(() => {
    if (!thread) return null
    const customer = customerForThread(customers, thread) || thread.customer || null
    const customerThreads = customer?.id
      ? threads.filter((item) => item.customerId === customer.id)
      : [thread]
    const threadIds = new Set(customerThreads.map((item) => item.id))
    const inbound = latestInboundMessage(threadIds, messages)
    const page = pageForThread(pages, thread)
    const fallbackName = thread.customerName || inbound?.authorName || 'Facebook Customer'

    return {
      ...(customer || {}),
      id: customer?.id || thread.customerId || thread.providerThreadId || thread.id,
      displayName: customer?.displayName || fallbackName,
      providerCustomerId: customer?.providerCustomerId || customer?.providerId || thread.providerCustomerId || thread.providerThreadId || thread.id,
      platform: customer?.platform || thread.platform || 'unknown',
      pageName: page?.name || thread.pageId || 'no page',
      status: thread.status,
      threadCount: customerThreads.length,
      messageCount: messageCountForThreads(threadIds, messages),
      unreadCount: customerThreads.reduce((sum, item) => sum + (item.unreadCount || 0), 0),
      pageIds: [...new Set(customerThreads.map((item) => item.pageId).filter(Boolean))],
    }
  }, [customers, messages, pages, thread, threads])

  return (
    <section className="space-y-4 p-4">
      <h2 className="text-sm font-bold text-[var(--color-ink)]">โปรไฟล์ลูกค้าปัจจุบัน</h2>

      {!thread ? (
        <EmptyProfile title="เลือกแชทลูกค้าก่อน" detail="โปรไฟล์จะแสดงตามแชทที่กำลังเปิดเท่านั้น" />
      ) : profile ? (
        <article className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <CustomerAvatar customer={profile} />
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-[var(--color-ink)]">{profile.displayName || profile.id}</div>
                <div className="mt-1 truncate text-[11px] text-[var(--color-muted)]">{profile.providerCustomerId || profile.id}</div>
              </div>
            </div>
            <span className="shrink-0 rounded-[var(--radius-pill)] bg-[var(--color-live-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--color-live)]">
              {profile.platform || 'unknown'}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-[var(--color-ink-2)]">
            <span>{profile.threadCount} threads</span>
            <span>{profile.messageCount} msgs</span>
            <span>{profile.unreadCount} unread</span>
          </div>
          <div className="mt-3 space-y-1 text-[11px] text-[var(--color-muted)]">
            <div className="truncate">เพจ: {profile.pageIds.map((id) => pageLabel(id, pages)).join(', ') || profile.pageName}</div>
            <div className="truncate">สถานะ: {statusLabel(profile.status)}</div>
          </div>
        </article>
      ) : (
        <EmptyProfile title="ยังไม่มีโปรไฟล์ลูกค้าสำหรับแชทนี้" detail="ระบบจะเติมเมื่อ snapshot มี customer binding ของแชทนี้" />
      )}
    </section>
  )
}

function EmptyProfile({ title, detail }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-4 text-center shadow-sm">
      <div className="text-sm font-bold text-[var(--color-ink)]">{title}</div>
      <div className="mt-1 text-[11px] text-[var(--color-muted)]">{detail}</div>
    </div>
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
