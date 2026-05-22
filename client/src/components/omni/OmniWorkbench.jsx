import React, { useEffect, useMemo, useState } from 'react'
import { fetchOmniSnapshot } from '../../lib/omniApi.js'
import { filterThreads } from '../../lib/omniModel.js'
import PageRail from './PageRail.jsx'
import ThreadList from './ThreadList.jsx'
import ThreadDetail from './ThreadDetail.jsx'
import AiDecisionPanel from './AiDecisionPanel.jsx'
import OrderDesk from './OrderDesk.jsx'
import PaymentDesk from './PaymentDesk.jsx'
import ConnectorHealth from './ConnectorHealth.jsx'
import PageManagement from './PageManagement.jsx'
import FacebookLivePreview from './FacebookLivePreview.jsx'

export default function OmniWorkbench() {
  const [snapshot, setSnapshot] = useState(null)
  const [pageId, setPageId] = useState('all')
  const [threadId, setThreadId] = useState(null)

  useEffect(() => {
    fetchOmniSnapshot().then((data) => {
      setSnapshot(data)
      setThreadId(data.threads?.[0]?.id || null)
    })
  }, [])

  const threads = useMemo(() => filterThreads(snapshot?.threads || [], { pageId }), [snapshot, pageId])
  const selectedThread = threads.find((thread) => thread.id === threadId) || threads[0] || null

  if (!snapshot) return <div className="p-6 text-slate-300">Loading omnichannel workbench...</div>

  return (
    <div className="grid h-full grid-cols-[220px_minmax(260px,360px)_1fr_320px] bg-slate-950 text-slate-100">
      <PageRail pages={snapshot.pages} activePageId={pageId} onSelect={setPageId} />
      <ThreadList threads={threads} activeThreadId={selectedThread?.id} onSelect={setThreadId} />
      <main className="min-w-0 border-x border-slate-800">
        <header className="border-b border-slate-800 px-5 py-4">
          <h1 className="text-lg font-semibold">Omnichannel Inbox</h1>
          <p className="text-xs text-slate-500">Local-first customer inbox with guarded AI replies</p>
        </header>
        <ThreadDetail snapshot={snapshot} thread={selectedThread} />
      </main>
      <aside className="overflow-y-auto">
        <AiDecisionPanel snapshot={snapshot} thread={selectedThread} />
        <OrderDesk snapshot={snapshot} thread={selectedThread} />
        <PaymentDesk snapshot={snapshot} thread={selectedThread} />
        <FacebookLivePreview onSynced={setSnapshot} />
        <ConnectorHealth health={snapshot.connectorHealth} />
        <PageManagement pages={snapshot.pages} />
      </aside>
    </div>
  )
}
