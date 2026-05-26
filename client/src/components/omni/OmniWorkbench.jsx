import React, { useEffect, useMemo, useState } from 'react'
import { fetchOmniSnapshot, subscribeOmniSnapshots } from '../../lib/omniApi.js'
import { filterThreads } from '../../lib/omniModel.js'
import PageRail from './PageRail.jsx'
import ThreadList from './ThreadList.jsx'
import ThreadDetail from './ThreadDetail.jsx'
import ContextPanel from './ContextPanel.jsx'
import SocialOpsBoard from './SocialOpsBoard.jsx'
import SettingsPage from './SettingsPage.jsx'

const OPERATION_MODES = [
  { id: 'chat', label: 'แชท', shortLabel: 'Chat' },
  { id: 'post', label: 'โพสต์', shortLabel: 'Post' },
  { id: 'live', label: 'ไลฟ์', shortLabel: 'Live' },
  { id: 'report', label: 'รายงาน', shortLabel: 'Report' },
  { id: 'settings', label: 'ตั้งค่า', shortLabel: 'Set' },
]

export default function OmniWorkbench() {
  const [snapshot, setSnapshot] = useState(null)
  const [pageId, setPageId] = useState('all')
  const [threadId, setThreadId] = useState(null)
  const [operationMode, setOperationMode] = useState('chat')

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
    <div className={`flex h-full min-h-0 flex-col bg-[var(--color-paper)] text-[var(--color-ink)] ${operationMode === 'chat' ? 'lg:grid lg:grid-cols-[64px_76px_minmax(300px,370px)_minmax(0,1fr)] xl:grid-cols-[64px_76px_minmax(310px,380px)_minmax(0,1fr)_360px]' : 'lg:grid lg:grid-cols-[64px_minmax(0,1fr)]'}`}>
      <OperationRail activeMode={operationMode} modes={OPERATION_MODES} onSelect={setOperationMode} />
      {operationMode === 'chat' ? (
        <>
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
        </>
      ) : operationMode === 'settings' ? (
        <SettingsPage snapshot={snapshot} onSnapshot={setSnapshot} onOpenChat={() => setOperationMode('chat')} />
      ) : (
        <SocialOpsBoard mode={operationMode} snapshot={snapshot} onSnapshot={setSnapshot} onOpenChat={() => setOperationMode('chat')} />
      )}
    </div>
  )
}

function OperationRail({ activeMode, modes, onSelect }) {
  return (
    <nav className="order-0 grid shrink-0 grid-cols-5 gap-2 overflow-hidden border-b border-[var(--color-rule)] bg-[var(--color-panel)] p-2 lg:flex lg:h-full lg:flex-col lg:overflow-x-visible lg:border-b-0 lg:border-r" aria-label="Omni operations">
      {modes.map((mode) => (
        <button
          key={mode.id}
          type="button"
          aria-label={mode.label}
          onClick={() => onSelect(mode.id)}
          className={`grid h-14 min-w-0 place-items-center rounded-[var(--radius-md)] border px-1 text-center text-xs font-bold transition sm:px-2 lg:w-full ${activeMode === mode.id ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]' : 'border-[var(--color-rule)] bg-[var(--color-panel)] text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-ink)]'}`}
        >
          <span className="text-[11px] uppercase tracking-normal text-current">{mode.shortLabel}</span>
          <span className="text-xs">{mode.label}</span>
        </button>
      ))}
    </nav>
  )
}
