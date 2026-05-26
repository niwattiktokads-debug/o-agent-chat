import React, { useEffect, useState } from 'react'
import StatusPanel from './components/StatusPanel.jsx'
import MessageList from './components/MessageList.jsx'
import Composer from './components/Composer.jsx'
import MobileDrawer from './components/MobileDrawer.jsx'
import OmniWorkbench from './components/omni/OmniWorkbench.jsx'
import SettingsPage from './components/omni/SettingsPage.jsx'
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

const TOP_MODE_NAV = [
  { id: 'chat', label: 'แชททีม', widthClass: 'w-[104px]' },
  { id: 'ai-train', label: 'สอน AI', widthClass: 'w-[104px]' },
  { id: 'connections', label: 'เชื่อมต่อ', widthClass: 'w-[104px]' },
  { id: 'settings', label: 'ตั้งค่า', widthClass: 'w-[84px]' },
  { id: 'inbox', label: 'กล่องรวม', widthClass: 'w-[104px]' },
]

export default function App() {
  const [state, setState] = useState(EMPTY_STATE)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [mode, setMode] = useState(() => {
    const requestedMode = new URLSearchParams(window.location.search).get('mode')
    if (requestedMode === 'inbox' || requestedMode === 'omni') return 'inbox'
    if (requestedMode === 'ai-train') return 'ai-train'
    if (requestedMode === 'connections') return 'connections'
    if (requestedMode === 'settings') return 'settings'
    return 'chat'
  })
  const [online, setOnline] = useState(true)
  const isMobile = useIsMobile()

  useEffect(() => subscribe((s) => setState(s || EMPTY_STATE)), [])
  useEffect(() => onConnectivity(({ online }) => setOnline(online)), [])
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('mode') === mode) return
    params.set('mode', mode)
    const nextUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`
    window.history.replaceState(null, '', nextUrl)
  }, [mode])

  const panel = (
    <StatusPanel state={state} onSetLeader={setLeader} onSetField={setField} />
  )

  if (mode === 'ai-train') {
    return (
      <ModeFrame activeMode={mode} onSelect={setMode}>
        <AiKnowledgeSourcePage
          onOpenInbox={() => setMode('inbox')}
          onOpenChat={() => setMode('chat')}
          onOpenConnections={() => setMode('connections')}
          showPageNav={false}
        />
      </ModeFrame>
    )
  }

  if (mode === 'connections') {
    return (
      <ModeFrame activeMode={mode} onSelect={setMode}>
        <ConnectionsPage
          onOpenInbox={() => setMode('inbox')}
          onOpenChat={() => setMode('chat')}
          onOpenAiTrain={() => setMode('ai-train')}
          showPageNav={false}
        />
      </ModeFrame>
    )
  }

  if (mode === 'inbox') {
    return (
      <div className="flex h-full flex-col bg-[var(--color-paper)] text-[var(--color-ink)]">
        <TopModeNav activeMode={mode} onSelect={setMode} />
        <div className="min-h-0 flex-1">
          <OmniWorkbench />
        </div>
      </div>
    )
  }

  if (mode === 'settings') {
    return (
      <div className="flex h-full flex-col bg-[var(--color-paper)] text-[var(--color-ink)]">
        <TopModeNav activeMode={mode} onSelect={setMode} />
        <div className="min-h-0 flex-1">
          <SettingsPage onOpenChat={() => setMode('inbox')} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-paper)] text-[var(--color-ink)]">
      <TopModeNav activeMode={mode} onSelect={setMode} />
      <div className="flex min-h-0 flex-1">
        {!isMobile && panel}

        {isMobile && (
          <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
            {panel}
          </MobileDrawer>
        )}

        <main className="flex min-w-0 flex-1 flex-col bg-[var(--color-paper)]">
          <header className="border-b border-[var(--color-rule)] bg-[var(--color-panel)] px-4 py-3 sm:px-6">
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
                <h1 className="truncate text-xl font-bold text-[var(--color-ink)]">แชททีม</h1>
                <p className="mt-1 text-sm text-[var(--color-ink-2)]">ห้องทำงานทีม O-Agent ในดีไซน์เดียวกับ Settings</p>
              </div>
              {!online && (
                <span className="rounded-[var(--radius-md)] bg-[var(--color-warn-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--color-warn)]">
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
    </div>
  )
}

function TopModeNav({ activeMode, onSelect, inline = false }) {
  const nav = (
    <nav className="grid w-max grid-cols-[104px_104px_104px_84px_104px] gap-3" aria-label="Omni pages">
      {TOP_MODE_NAV.map((item) => {
        const active = activeMode === item.id
        return (
          <button
            key={item.id}
            type="button"
            className={`${item.widthClass} h-10 rounded-[var(--radius-md)] border px-3 text-center text-sm font-semibold transition ${active ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-ink)]' : 'border-[var(--color-rule)] bg-[var(--color-panel)] text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]'}`}
            onClick={() => onSelect(item.id)}
          >
            {item.label}
          </button>
        )
      })}
    </nav>
  )

  if (inline) return <div className="max-w-full shrink-0 overflow-x-auto">{nav}</div>
  return (
    <header className="overflow-x-auto border-b border-[var(--color-rule)] bg-[var(--color-panel)] px-4 py-2">
      {nav}
    </header>
  )
}

function ModeFrame({ activeMode, onSelect, children }) {
  return (
    <div className="flex h-full min-w-0 flex-col bg-[var(--color-paper)] text-[var(--color-ink)]">
      <TopModeNav activeMode={activeMode} onSelect={onSelect} />
      <div className="min-h-0 flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
