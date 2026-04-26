import React, { useEffect, useState } from 'react'
import StatusPanel from './components/StatusPanel.jsx'
import MessageList from './components/MessageList.jsx'
import Composer from './components/Composer.jsx'
import MobileDrawer from './components/MobileDrawer.jsx'
import {
  subscribe, sendMessage, setLeader, setField, sendTyping, onConnectivity, setIdentity,
} from './lib/api.js'
import { useIsMobile } from './lib/useResponsive.js'

const EMPTY_STATE = {
  leader: '—', operator: '—', goal: '', scope: '', dod: '',
  messages: [],
  presence: { Boss: false, Code: false, Codex: false },
}

export default function App() {
  const [state, setState] = useState(EMPTY_STATE)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [online, setOnline] = useState(true)
  const isMobile = useIsMobile()

  useEffect(() => subscribe((s) => setState(s || EMPTY_STATE)), [])
  useEffect(() => onConnectivity(({ online }) => setOnline(online)), [])

  const panel = (
    <StatusPanel state={state} onSetLeader={setLeader} onSetField={setField} />
  )

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
            <p className="text-xs text-slate-500">ห้องแชต 3 ฝ่าย — บอส · Code · Codex</p>
          </div>
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
