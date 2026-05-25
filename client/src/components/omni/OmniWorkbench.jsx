import React, { useEffect, useMemo, useState } from 'react'
import { fetchOmniSnapshot, subscribeOmniSnapshots } from '../../lib/omniApi.js'
import { filterThreads } from '../../lib/omniModel.js'
import PageRail from './PageRail.jsx'
import ThreadList from './ThreadList.jsx'
import ThreadDetail from './ThreadDetail.jsx'
import ContextPanel from './ContextPanel.jsx'

export default function OmniWorkbench() {
  const [snapshot, setSnapshot] = useState(null)
  const [pageId, setPageId] = useState('all')
  const [threadId, setThreadId] = useState(null)

  useEffect(() => {
    fetchOmniSnapshot().then((data) => {
      setSnapshot(data)
      setThreadId(filterThreads(data.threads || [], { pageId: 'all' })[0]?.id || null)
    })
  }, [])

  useEffect(() => subscribeOmniSnapshots((data) => {
    setSnapshot(data)
    setThreadId((current) => current || filterThreads(data.threads || [], { pageId: 'all' })[0]?.id || null)
  }), [])

  const threads = useMemo(() => filterThreads(snapshot?.threads || [], { pageId }), [snapshot, pageId])
  const selectedThread = threads.find((thread) => thread.id === threadId) || threads[0] || null
  const activeAutoReplyPages = (snapshot?.pages || []).filter((page) => page.autoReplyEnabled !== false).length

  if (!snapshot) return <div className="bg-[var(--color-paper)] p-6 text-[var(--color-muted)]">Loading omnichannel workbench...</div>

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-paper)] text-[var(--color-ink)] lg:grid lg:grid-cols-[76px_minmax(300px,370px)_minmax(0,1fr)] xl:grid-cols-[76px_minmax(310px,380px)_minmax(0,1fr)_360px]">
      <PageRail
        pages={snapshot.pages}
        accounts={snapshot.platformAccounts}
        threads={snapshot.threads}
        activePageId={pageId}
        onSelect={(nextPageId) => {
          setPageId(nextPageId)
          setThreadId(null)
        }}
      />
      <ThreadList threads={threads} snapshot={snapshot} activeThreadId={selectedThread?.id} onSelect={setThreadId} />
      <main className="order-2 flex min-h-[calc(100dvh-112px)] min-w-0 flex-1 flex-col border-x border-[var(--color-rule)] bg-[var(--color-panel)] lg:order-none lg:min-h-0">
        <header className="border-b border-[var(--color-rule)] bg-[var(--color-panel)] px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-[var(--color-ink)]">กล่องรวม</h1>
              <p className="text-xs text-[var(--color-muted)]">AI operator hub สำหรับตอบลูกค้าแบบ realtime</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-[var(--radius-pill)] bg-[var(--color-live-soft)] px-2 py-1 font-semibold text-[var(--color-live)]">Webhook live</span>
              <span className="rounded-[var(--radius-pill)] bg-[var(--color-ai-soft)] px-2 py-1 font-semibold text-[var(--color-ai)]">AI auto-reply {activeAutoReplyPages}/{snapshot.pages.length}</span>
              <span className="rounded-[var(--radius-pill)] bg-[var(--color-warn-soft)] px-2 py-1 font-semibold text-[var(--color-warn)]">Auto-send off</span>
            </div>
          </div>
        </header>
        <ThreadDetail snapshot={snapshot} thread={selectedThread} onSnapshot={setSnapshot} />
      </main>
      <div className="order-3 max-h-[50dvh] min-h-[320px] shrink-0 overflow-hidden lg:hidden xl:order-none xl:block xl:max-h-none xl:min-h-0">
        <ContextPanel snapshot={snapshot} thread={selectedThread} onSnapshot={setSnapshot} />
      </div>
    </div>
  )
}
