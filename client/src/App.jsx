import React, { useEffect, useState } from 'react'
import StatusPanel from './components/StatusPanel.jsx'
import MessageList from './components/MessageList.jsx'
import Composer from './components/Composer.jsx'
import MobileDrawer from './components/MobileDrawer.jsx'
import OmniWorkbench from './components/omni/OmniWorkbench.jsx'
import AiKnowledgeSourcePage from './components/ai/AiKnowledgeSourcePage.jsx'
import ConnectionsPage from './components/connections/ConnectionsPage.jsx'
import {
  subscribe, sendMessage, setLeader, setField, sendTyping, onConnectivity, setIdentity,
} from './lib/api.js'
import { useIsMobile } from './lib/useResponsive.js'

const EMPTY_STATE = {
  leader: '—', operator: '—', goal: '', scope: '', dod: '',
  messages: [],
  presence: { Boss: false, Code: false, Codex: false, ChatGPT: false, Cowork: false },
}

export default function App() {
  const [state, setState] = useState(EMPTY_STATE)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [mode, setMode] = useState(() => {
    const requestedMode = new URLSearchParams(window.location.search).get('mode')
    if (requestedMode === 'inbox' || requestedMode === 'omni') return 'inbox'
    if (requestedMode === 'ai-train') return 'ai-train'
    if (requestedMode === 'connections') return 'connections'
    return 'chat'
  })
  const [online, setOnline] = useState(true)
  const isMobile = useIsMobile()

  useEffect(() => subscribe((s) => setState(s || EMPTY_STATE)), [])
  useEffect(() => onConnectivity(({ online }) => setOnline(online)), [])

  const panel = (
    <StatusPanel state={state} onSetLeader={setLeader} onSetField={setField} />
  )

  if (mode === 'ai-train') {
    return (
      <AiKnowledgeSourcePage
        onOpenInbox={() => setMode('inbox')}
        onOpenChat={() => setMode('chat')}
        onOpenConnections={() => setMode('connections')}
      />
    )
  }

  if (mode === 'connections') {
    return (
      <ConnectionsPage
        onOpenInbox={() => setMode('inbox')}
        onOpenChat={() => setMode('chat')}
        onOpenAiTrain={() => setMode('ai-train')}
      />
    )
  }

  if (mode === 'inbox') {
    return (
      <div className="flex h-full flex-col bg-[var(--color-paper)] text-[var(--color-ink)]">
        <header className="flex items-center gap-2 border-b border-[var(--color-rule)] bg-[var(--color-panel)] px-4 py-2 shadow-sm">
          <button type="button" className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-1 text-sm text-[var(--color-ink-2)]" onClick={() => setMode('chat')}>แชททีม</button>
          <button type="button" className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-1 text-sm text-[var(--color-ink-2)]" onClick={() => setMode('ai-train')}>สอน AI</button>
          <button type="button" className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-1 text-sm text-[var(--color-ink-2)]" onClick={() => setMode('connections')}>เชื่อมต่อ</button>
          <button type="button" className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-1 text-sm font-semibold text-[var(--color-accent-ink)] shadow-sm" onClick={() => setMode('inbox')}>กล่องรวม</button>
        </header>
        <div className="min-h-0 flex-1">
          <OmniWorkbench />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full bg-[var(--color-paper)] text-[var(--color-ink)]">
      {!isMobile && panel}

      {isMobile && (
        <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
          {panel}
        </MobileDrawer>
      )}

      <main className="flex min-w-0 flex-1 flex-col bg-[var(--color-paper)]">
        <header className="border-b border-[var(--color-rule)] bg-[var(--color-panel)] px-4 py-3 shadow-sm sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
          {isMobile && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-2 py-1 text-sm text-[var(--color-ink)]"
              aria-label="เปิดเมนู"
            >
              ☰
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[var(--color-muted)]">Omni Team Room</p>
            <h1 className="truncate text-lg font-semibold text-[var(--color-ink)]">แชททีม</h1>
          </div>
          <nav className="flex max-w-full shrink-0 items-center gap-2 overflow-x-auto" aria-label="Omni pages">
            <button type="button" className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-1.5 text-sm font-semibold text-[var(--color-ink)]" onClick={() => setMode('chat')}>แชททีม</button>
            <button type="button" className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-1.5 text-sm text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]" onClick={() => setMode('inbox')}>กล่องรวม</button>
            <button type="button" className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-1.5 text-sm text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]" onClick={() => setMode('ai-train')}>สอน AI</button>
            <button type="button" className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-1.5 text-sm text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]" onClick={() => setMode('connections')}>เชื่อมต่อ</button>
          </nav>
          {!online && (
            <span className="rounded-[var(--radius-md)] bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
              เชื่อมต่อใหม่...
            </span>
          )}
          </div>
        </header>
        <MessageList messages={state.messages} />
        <Composer
          onSend={sendMessage}
          onTyping={sendTyping}
          online={online}
          onSenderChange={setIdentity}
        />
      </main>
    </div>
  )
}
