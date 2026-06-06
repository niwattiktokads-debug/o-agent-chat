import React from 'react'

function initials(name = '') {
  return String(name).trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'OA'
}

const FACEBOOK_PAGE_IDS = {
  page_mankynd: '189971841184132',
  page_annalynn: '122106446570001676',
  page_des: '1137894522741329',
  page_tangtob: '106740601303449',
  page_fb_112154661515664: '112154661515664',
}

function pageAvatarUrl(page = {}, account = {}) {
  const directUrl = page.avatarUrl
    || page.profilePictureUrl
    || page.profilePic
    || page.picture?.data?.url
    || account.avatarUrl
    || account.profilePictureUrl
    || account.picture?.data?.url
  if (directUrl) return directUrl
  const facebookPageId = account.platform === 'facebook' && account.providerAccountId
    ? account.providerAccountId
    : FACEBOOK_PAGE_IDS[page.id]
  if (facebookPageId) {
    return `https://graph.facebook.com/v23.0/${encodeURIComponent(facebookPageId)}/picture?type=large`
  }
  return ''
}

export default function PageRail({ pages, accounts = [], threads = [], activePageId, onSelect }) {
  const accountByPageId = new Map(accounts.map((account) => [account.pageId, account]))
  const unreadByPageId = new Map()
  for (const thread of threads || []) {
    unreadByPageId.set(thread.pageId, (unreadByPageId.get(thread.pageId) || 0) + (thread.unreadCount || 0))
  }
  const allUnread = [...unreadByPageId.values()].reduce((sum, count) => sum + count, 0)
  return (
    <aside className="order-1 flex shrink-0 gap-1.5 overflow-x-auto border-b border-[var(--color-rule)] bg-[var(--color-panel)] p-1.5 lg:order-none lg:h-full lg:flex-col lg:overflow-x-visible lg:border-b-0 lg:border-r">
      <button
        className={`relative flex h-12 min-w-[72px] flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] border px-2 py-1 text-[11px] font-semibold leading-tight transition lg:h-[54px] lg:w-[58px] lg:min-w-0 ${activePageId === 'all' ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]' : 'border-[var(--color-rule)] bg-[var(--color-panel)] text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]'}`}
        onClick={() => onSelect('all')}
      >
        <span>ทั้งหมด</span>
        {allUnread ? <span className="rounded-[var(--radius-pill)] bg-[var(--color-danger)] px-1.5 text-[10px] leading-4 text-white">{allUnread}</span> : null}
      </button>
      <div className="flex gap-1.5 lg:flex-col">
        {pages.map((page) => {
          const account = accountByPageId.get(page.id) || {}
          const avatarUrl = pageAvatarUrl(page, account)
          return (
            <button
              key={page.id}
              title={`${page.name} · ${account.platform || 'page'}`}
              className={`relative flex h-12 min-w-[78px] flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] border px-1.5 py-1 text-center transition lg:h-[76px] lg:w-[58px] lg:min-w-0 ${activePageId === page.id ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]' : 'border-[var(--color-rule)] bg-[var(--color-panel)] text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]'}`}
              onClick={() => onSelect(page.id)}
            >
              <span className="hidden h-7 w-7 overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-panel-2)] text-[11px] font-bold lg:grid lg:place-items-center">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : initials(page.name)}
              </span>
              <span className="max-w-[66px] truncate text-[11px] font-semibold leading-tight lg:max-w-[50px] lg:text-[10px]">{page.shortName || page.name}</span>
              <span className="hidden max-w-[50px] truncate text-[9px] leading-tight text-[var(--color-muted)] lg:block">{account.platform || 'page'}</span>
              {page.autoReplyEnabled === false ? <span className="rounded-[var(--radius-pill)] bg-[var(--color-warn-soft)] px-1.5 text-[9px] font-semibold leading-4 text-[var(--color-warn)]">AI off</span> : null}
              {unreadByPageId.get(page.id) ? <span className="absolute right-0.5 top-0.5 rounded-[var(--radius-pill)] bg-[var(--color-danger)] px-1.5 text-[10px] font-semibold leading-4 text-white">{unreadByPageId.get(page.id)}</span> : null}
            </button>
          )
        })}
      </div>
    </aside>
  )
}
