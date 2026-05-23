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
import TikTokOrderSync from './TikTokOrderSync.jsx'

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

  if (!snapshot) return <div className="bg-[#f4f7f6] p-6 text-[#60726b]">Loading omnichannel workbench...</div>

  return (
    <div className="grid h-full grid-cols-[240px_minmax(300px,380px)_1fr_340px] bg-[#f4f7f6] text-[#16231f]">
      <PageRail pages={snapshot.pages} accounts={snapshot.platformAccounts} activePageId={pageId} onSelect={setPageId} />
      <ThreadList threads={threads} activeThreadId={selectedThread?.id} onSelect={setThreadId} />
      <main className="min-w-0 border-x border-[#dfe8e4] bg-white">
        <header className="border-b border-[#dfe8e4] bg-white px-5 py-4">
          <h1 className="text-lg font-semibold text-[#16231f]">Omnichannel Inbox</h1>
          <p className="text-xs text-[#7a8b84]">Local-first customer inbox with guarded AI replies</p>
        </header>
        <ThreadDetail snapshot={snapshot} thread={selectedThread} />
      </main>
      <aside className="overflow-y-auto bg-[#f8fbfa]">
        <AiDecisionPanel snapshot={snapshot} thread={selectedThread} onDrafted={setSnapshot} />
        <OrderDesk snapshot={snapshot} thread={selectedThread} />
        <PaymentDesk snapshot={snapshot} thread={selectedThread} />
        <TikTokOrderSync onSynced={setSnapshot} />
        <FacebookLivePreview onSynced={setSnapshot} />
        <ConnectorHealth health={snapshot.connectorHealth} />
        <PageManagement pages={snapshot.pages} />
      </aside>
    </div>
  )
}
