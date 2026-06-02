import React, { useEffect, useState } from 'react'
import StatusPanel from './components/StatusPanel.jsx'
import MessageList from './components/MessageList.jsx'
import Composer from './components/Composer.jsx'
import MobileDrawer from './components/MobileDrawer.jsx'
import OmniWorkbench, { OMNI_OPERATION_MODES } from './components/omni/OmniWorkbench.jsx'
import SettingsPage from './components/omni/SettingsPage.jsx'
import AiKnowledgeSourcePage from './components/ai/AiKnowledgeSourcePage.jsx'
import {
  subscribe, sendMessage, setLeader, setField, sendTyping, onConnectivity, setIdentity,
} from './lib/api.js'
import { useIsMobile } from './lib/useResponsive.js'
import { WorkspaceProvider, WorkspaceSelector, useWorkspace } from './lib/WorkspaceContext.jsx'

const EMPTY_STATE = {
  leader: '—', operator: '—', goal: '', scope: '', dod: '',
  messages: [],
  presence: { Boss: false, Code: false, Codex: false, ChatGPT: false, Cowork: false },
}

const TOP_MODE_NAV = [
  { id: 'chat', label: 'แชททีม', widthClass: 'w-[104px]' },
  { id: 'ai-train', label: 'สอน AI', widthClass: 'w-[104px]' },
  { id: 'settings', label: 'ตั้งค่า', widthClass: 'w-[84px]' },
  { id: 'inbox', label: 'กล่องรวม', widthClass: 'w-[104px]' },
]

const SETTINGS_SECTIONS = new Set(['settings', 'ai-config', 'connections'])
const OPERATION_MODE_IDS = new Set(OMNI_OPERATION_MODES.map((item) => item.id))

export default function App() {
  return (
    <WorkspaceProvider>
      <AppInner />
    </WorkspaceProvider>
  )
}

function AppInner() {
  const [state, setState] = useState(EMPTY_STATE)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [mode, setMode] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const requestedMode = params.get('mode')
    if ((requestedMode === 'inbox' || requestedMode === 'omni') && params.get('op') === 'settings') return 'settings'
    if (requestedMode === 'inbox' || requestedMode === 'omni') return 'inbox'
    if (requestedMode === 'ai-train') return 'ai-train'
    if (requestedMode === 'connections') return 'settings'
    if (requestedMode === 'settings') return 'settings'
    return 'chat'
  })
  const [omniOperationMode, setOmniOperationMode] = useState(() => {
    const requestedOperation = new URLSearchParams(window.location.search).get('op')
    return OPERATION_MODE_IDS.has(requestedOperation) ? requestedOperation : 'chat'
  })
  const [settingsSection, setSettingsSection] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('mode') === 'connections') return 'connections'
    const requestedSection = params.get('section')
    return SETTINGS_SECTIONS.has(requestedSection) ? requestedSection : 'settings'
  })
  const [online, setOnline] = useState(true)
  const isMobile = useIsMobile()

  useEffect(() => subscribe((s) => setState(s || EMPTY_STATE)), [])
  useEffect(() => onConnectivity(({ online }) => setOnline(online)), [])
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set('mode', mode)
    if (mode === 'inbox') {
      params.set('op', omniOperationMode)
      params.delete('section')
    } else if (mode === 'settings') {
      params.set('section', settingsSection)
      params.delete('op')
    } else {
      params.delete('op')
      params.delete('section')
    }
    const nextUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` === nextUrl) return
    window.history.replaceState(null, '', nextUrl)
  }, [mode, omniOperationMode, settingsSection])

  function selectTopMode(nextMode) {
    if (nextMode === 'settings') setSettingsSection('settings')
    if (nextMode === 'inbox') setOmniOperationMode('chat')
    setMode(nextMode)
  }

  function selectOmniOperation(nextOperationMode) {
    setOmniOperationMode(nextOperationMode)
    setMode('inbox')
  }

  function openConnectionsSettings() {
    setSettingsSection('connections')
    setMode('settings')
  }

  const panel = (
    <StatusPanel state={state} onSetLeader={setLeader} onSetField={setField} />
  )

  const { activeWorkspaceId } = useWorkspace()

  if (mode === 'ai-train') {
    return (
      <ModeFrame
        activeMode={mode}
        activeOperationMode={omniOperationMode}
        onSelect={selectTopMode}
        onOperationSelect={selectOmniOperation}
      >
        <AiKnowledgeSourcePage
          onOpenInbox={() => setMode('inbox')}
          onOpenChat={() => setMode('chat')}
          onOpenConnections={openConnectionsSettings}
          showPageNav={false}
          workspaceId={activeWorkspaceId}
        />
      </ModeFrame>
    )
  }

  if (mode === 'inbox') {
    return (
      <div className="flex h-full flex-col bg-[var(--color-paper)] text-[var(--color-ink)]">
        <TopModeNav
          activeMode={mode}
          activeOperationMode={omniOperationMode}
          onSelect={selectTopMode}
          onOperationSelect={selectOmniOperation}
        />
        <div className="min-h-0 flex-1">
          <OmniWorkbench
            operationMode={omniOperationMode}
            onOperationModeChange={setOmniOperationMode}
            showOperationRail={false}
            workspaceId={activeWorkspaceId}
          />
        </div>
      </div>
    )
  }

  if (mode === 'settings') {
    return (
      <div className="flex h-full flex-col bg-[var(--color-paper)] text-[var(--color-ink)]">
        <TopModeNav
          activeMode={mode}
          activeOperationMode={omniOperationMode}
          onSelect={selectTopMode}
          onOperationSelect={selectOmniOperation}
        />
        <div className="min-h-0 flex-1">
          <SettingsPage
            onOpenChat={() => setMode('inbox')}
            activeSection={settingsSection}
            onSectionChange={setSettingsSection}
            workspaceId={activeWorkspaceId}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-paper)] text-[var(--color-ink)]">
      <TopModeNav
        activeMode={mode}
        activeOperationMode={omniOperationMode}
        onSelect={selectTopMode}
        onOperationSelect={selectOmniOperation}
      />
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

function TopModeNav({ activeMode, activeOperationMode, onSelect, onOperationSelect, inline = false }) {
  const nav = (
    <nav className="flex min-w-max w-full items-center gap-3" aria-label="Omni pages">
      <TopModeButton item={TOP_MODE_NAV[0]} active={activeMode === 'chat'} onSelect={onSelect} />
      <TopModeButton item={TOP_MODE_NAV[1]} active={activeMode === 'ai-train'} onSelect={onSelect} />
      <TopOperationNav activeMode={activeMode} activeOperationMode={activeOperationMode} onSelect={onOperationSelect} />
      <TopModeButton item={TOP_MODE_NAV[3]} active={activeMode === 'inbox'} onSelect={onSelect} />
      <div className="ml-auto flex items-center gap-3">
        <WorkspaceSelector />
        <TopModeButton item={TOP_MODE_NAV[2]} active={activeMode === 'settings'} onSelect={onSelect} />
      </div>
    </nav>
  )

  if (inline) return <div className="max-w-full shrink-0 overflow-x-auto">{nav}</div>
  return (
    <header className="overflow-x-auto border-b border-[var(--color-rule)] bg-[var(--color-panel)] px-4 py-2">
      {nav}
    </header>
  )
}

function TopModeButton({ item, active, onSelect }) {
  return (
    <button
      type="button"
      className={`${item.widthClass} h-14 rounded-[var(--radius-md)] border px-3 text-center text-sm font-semibold transition ${active ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-ink)]' : 'border-[var(--color-rule)] bg-[var(--color-panel)] text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]'}`}
      onClick={() => onSelect(item.id)}
    >
      {item.label}
    </button>
  )
}

function TopOperationNav({ activeMode, activeOperationMode, onSelect }) {
  return (
    <div className="grid grid-cols-4 gap-2" aria-label="Omni operations">
      {OMNI_OPERATION_MODES.map((item) => {
        const active = activeMode === 'inbox' && activeOperationMode === item.id
        return (
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            onClick={() => onSelect(item.id)}
            className={`grid h-14 w-[76px] place-items-center rounded-[var(--radius-md)] border px-1 text-center text-xs font-bold transition ${active ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]' : 'border-[var(--color-rule)] bg-[var(--color-panel)] text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-ink)]'}`}
          >
            <span className="text-[11px] uppercase tracking-normal text-current">{item.shortLabel}</span>
            <span className="text-xs">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function ModeFrame({ activeMode, activeOperationMode, onSelect, onOperationSelect, children }) {
  return (
    <div className="flex h-full min-w-0 flex-col bg-[var(--color-paper)] text-[var(--color-ink)]">
      <TopModeNav
        activeMode={activeMode}
        activeOperationMode={activeOperationMode}
        onSelect={onSelect}
        onOperationSelect={onOperationSelect}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
