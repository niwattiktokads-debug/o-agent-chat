import React, { useEffect, useState } from 'react'
import StatusPanel from './components/StatusPanel.jsx'
import MessageList from './components/MessageList.jsx'
import Composer from './components/Composer.jsx'
import MobileDrawer from './components/MobileDrawer.jsx'
import OmniWorkbench from './components/omni/OmniWorkbench.jsx'
import AiKnowledgeSourcePage from './components/ai/AiKnowledgeSourcePage.jsx'
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
    if (requestedMode === 'inbox') return 'inbox'
    if (requestedMode === 'omni' || requestedMode === 'ai-train') return 'ai-train'
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
      />
    )
  }

  if (mode === 'inbox') {
    return (
      <div className="flex h-full flex-col bg-[#f4f7f6] text-[#16231f]">
        <header className="flex items-center gap-3 border-b border-[#dfe8e4] bg-white px-4 py-2 shadow-sm">
          <button type="button" className="rounded-lg border border-[#dfe8e4] bg-white px-3 py-1 text-sm text-[#4d5f58]" onClick={() => setMode('chat')}>Chat</button>
          <button type="button" className="rounded-lg border border-[#dfe8e4] bg-white px-3 py-1 text-sm text-[#4d5f58]" onClick={() => setMode('ai-train')}>AI Train</button>
          <button type="button" className="rounded-lg bg-[#0f8f7b] px-3 py-1 text-sm font-semibold text-white shadow-sm" onClick={() => setMode('inbox')}>Inbox</button>
        </header>
        <div className="min-h-0 flex-1">
          <OmniWorkbench />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full text-slate-100">
      {!isMobile && panel}

      {isMobile && (
        <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
          {panel}
        </MobileDrawer>
      )}

      <main className="flex flex-1 flex-col bg-slate-950">
        <header className="border-b border-slate-800 px-4 sm:px-6 py-3 flex items-center gap-3">
          {isMobile && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="rounded-md bg-slate-800 px-2 py-1 text-sm text-slate-200"
              aria-label="เปิดเมนู"
            >
              ☰
            </button>
          )}
          <div className="flex-1">
            <h1 className="text-lg font-semibold">O Agent Chat</h1>
            <p className="text-xs text-slate-500">ห้องแชต 5 ฝ่าย — บอส · Code · Codex · ChatGPT · Cowork</p>
          </div>
          <button type="button" className="rounded bg-cyan-950 px-3 py-1 text-sm text-cyan-100" onClick={() => setMode('ai-train')}>AI Train</button>
          <button type="button" className="rounded bg-slate-800 px-3 py-1 text-sm" onClick={() => setMode('inbox')}>Inbox</button>
          {!online && (
            <span className="text-[11px] text-amber-400 bg-amber-950/40 px-2 py-1 rounded">
              เชื่อมต่อใหม่...
            </span>
          )}
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
