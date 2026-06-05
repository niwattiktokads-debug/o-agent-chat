import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchOmniSnapshot, loginOmniAccess, subscribeOmniSnapshots } from '../../lib/omniApi.js'
import { aiApprovalQueue, customerForThread, filterThreads, formatShortTime, pageForThread } from '../../lib/omniModel.js'
import PageRail from './PageRail.jsx'
import ThreadList from './ThreadList.jsx'
import ThreadDetail from './ThreadDetail.jsx'
import ContextPanel from './ContextPanel.jsx'
import SocialOpsBoard from './SocialOpsBoard.jsx'

export const OMNI_OPERATION_MODES = [
  { id: 'chat', label: 'แชท', shortLabel: 'Chat' },
  { id: 'post', label: 'โพสต์', shortLabel: 'Post' },
  { id: 'live', label: 'ไลฟ์', shortLabel: 'Live' },
  { id: 'report', label: 'รายงาน', shortLabel: 'Report' },
]

const NOTIFICATION_SOUND_KEY = 'omni.notificationSoundEnabled'

function initialNotificationSoundEnabled() {
  try {
    return window.localStorage?.getItem(NOTIFICATION_SOUND_KEY) === '1'
  } catch {
    return false
  }
}

export default function OmniWorkbench({
  operationMode: controlledOperationMode,
  onOperationModeChange,
  showOperationRail = true,
  workspaceId,
}) {
  const [snapshot, setSnapshot] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [pageId, setPageId] = useState('all')
  const [threadId, setThreadId] = useState(null)
  const [composerDraft, setComposerDraft] = useState(null)
  const [localOperationMode, setLocalOperationMode] = useState('chat')
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState(initialNotificationSoundEnabled)
  const audioContextRef = useRef(null)
  const knownInboundMessageIdsRef = useRef(new Set())
  const knownApprovalDecisionIdsRef = useRef(new Set())
  const hasSeenInitialSnapshotRef = useRef(false)
  const operationMode = controlledOperationMode || localOperationMode
  const gridClass = operationMode === 'chat'
    ? showOperationRail
      ? 'lg:grid lg:grid-cols-[64px_64px_minmax(300px,370px)_minmax(0,1fr)] xl:grid-cols-[64px_64px_minmax(310px,380px)_minmax(0,1fr)_360px]'
      : 'lg:grid lg:grid-cols-[64px_minmax(300px,370px)_minmax(0,1fr)] xl:grid-cols-[64px_minmax(310px,380px)_minmax(0,1fr)_360px]'
    : showOperationRail
      ? 'lg:grid lg:grid-cols-[64px_minmax(0,1fr)]'
      : 'lg:grid lg:grid-cols-[minmax(0,1fr)]'

  function selectOperationMode(nextMode) {
    if (onOperationModeChange) {
      onOperationModeChange(nextMode)
      return
    }
    setLocalOperationMode(nextMode)
  }

  const playNotificationSound = useCallback(() => {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext
    if (!AudioContextCtor) return
    const context = audioContextRef.current || new AudioContextCtor()
    audioContextRef.current = context
    context.resume?.()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(context.currentTime)
    oscillator.stop(context.currentTime + 0.24)
  }, [])

  function toggleNotificationSound() {
    setNotificationSoundEnabled((current) => {
      const next = !current
      try {
        window.localStorage?.setItem(NOTIFICATION_SOUND_KEY, next ? '1' : '0')
      } catch {
        // Local storage can be unavailable in private or embedded browsers.
      }
      return next
    })
  }

  useEffect(() => {
    if (!snapshot) return
    const inboundIds = new Set((snapshot.messages || [])
      .filter((message) => message.direction === 'inbound')
      .map((message) => message.id)
      .filter(Boolean))
    const approvalDecisionIds = new Set(aiApprovalQueue(snapshot)
      .map((item) => item.decision.id)
      .filter(Boolean))
    const hasNewInbound = [...inboundIds].some((id) => !knownInboundMessageIdsRef.current.has(id))
    const hasNewApproval = [...approvalDecisionIds].some((id) => !knownApprovalDecisionIdsRef.current.has(id))
    if (hasSeenInitialSnapshotRef.current && notificationSoundEnabled && (hasNewInbound || hasNewApproval)) {
      playNotificationSound()
    }
    knownInboundMessageIdsRef.current = inboundIds
    knownApprovalDecisionIdsRef.current = approvalDecisionIds
    hasSeenInitialSnapshotRef.current = true
  }, [notificationSoundEnabled, playNotificationSound, snapshot])

  const loadSnapshot = useCallback(async () => {
    setLoadError('')
    const data = await fetchOmniSnapshot(workspaceId || undefined)
    setSnapshot(data)
    setPageId('all')
    setThreadId(filterThreads(data.threads || [], { pageId: 'all' })[0]?.id || null)
  }, [workspaceId])

  useEffect(() => {
    loadSnapshot().catch((error) => setLoadError(error.message || 'snapshot_load_failed'))
  }, [loadSnapshot])  // re-loads when workspaceId changes via loadSnapshot dep

  useEffect(() => subscribeOmniSnapshots((data) => {
    setSnapshot(data)
    setThreadId((current) => current || filterThreads(data.threads || [], { pageId: 'all' })[0]?.id || null)
  }, { workspaceId: workspaceId || undefined }), [workspaceId])

  async function submitLogin(event) {
    event.preventDefault()
    if (!loginPassword.trim()) return
    setLoginBusy(true)
    setLoadError('')
    try {
      await loginOmniAccess(loginPassword)
      setLoginPassword('')
      await loadSnapshot()
    } catch (error) {
      setLoadError(error.message || 'login_failed')
    } finally {
      setLoginBusy(false)
    }
  }

  const threads = useMemo(() => filterThreads(snapshot?.threads || [], { pageId }), [snapshot, pageId])
  const selectedThread = threads.find((thread) => thread.id === threadId) || threads[0] || null
  const pendingAiApprovals = useMemo(() => aiApprovalQueue(snapshot || {}), [snapshot])

  function openApprovalThread(thread) {
    if (!thread?.id) return
    setPageId(thread.pageId || 'all')
    setThreadId(thread.id)
    selectOperationMode('chat')
  }

  const approvalAlert = pendingAiApprovals.length ? (
    <AiApprovalQueueAlert approvals={pendingAiApprovals} snapshot={snapshot} onOpen={openApprovalThread} />
  ) : null

  if (!snapshot && loadError === 'access_password_required') {
    return (
      <OmniAccessGate
        password={loginPassword}
        busy={loginBusy}
        error={loadError}
        onPasswordChange={setLoginPassword}
        onSubmit={submitLogin}
      />
    )
  }

  if (!snapshot && loadError) {
    return (
      <div className="bg-[var(--color-paper)] p-6 text-[var(--color-ink)]">
        <div className="max-w-md rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-4">
          <h1 className="text-base font-bold">โหลดข้อมูลไม่สำเร็จ</h1>
          <p className="mt-2 text-sm font-semibold">{loadError}</p>
          <button
            type="button"
            className="mt-4 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-bold text-[var(--color-accent-ink)]"
            onClick={() => loadSnapshot().catch((error) => setLoadError(error.message || 'snapshot_load_failed'))}
          >
            โหลดใหม่
          </button>
        </div>
      </div>
    )
  }

  if (!snapshot) return <div className="bg-[var(--color-paper)] p-6 text-[var(--color-muted)]">Loading omnichannel workbench...</div>

  return (
    <div className={`flex h-full min-h-0 flex-col bg-[var(--color-paper)] text-[var(--color-ink)] ${gridClass}`}>
      {showOperationRail ? <OperationRail activeMode={operationMode} modes={OMNI_OPERATION_MODES} onSelect={selectOperationMode} /> : null}
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
            <div className="flex items-center">
              <button
                type="button"
                role="switch"
                aria-checked={notificationSoundEnabled}
                aria-label={`เสียงแจ้งเตือน${notificationSoundEnabled ? 'เปิด' : 'ปิด'}`}
                onClick={toggleNotificationSound}
                className={`grid h-9 w-9 place-items-center rounded-[var(--radius-md)] border transition ${notificationSoundEnabled ? 'border-[var(--color-live)] bg-[var(--color-live-soft)] text-[var(--color-live)]' : 'border-[var(--color-rule)] bg-[var(--color-panel)] text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-ink)]'}`}
                title={notificationSoundEnabled ? 'ปิดเสียงแจ้งเตือนข้อความเข้าใหม่' : 'เปิดเสียงแจ้งเตือนข้อความเข้าใหม่'}
              >
                <NotificationSoundIcon enabled={notificationSoundEnabled} />
              </button>
            </div>
          </div>
        </header>
        {approvalAlert}
        <ThreadDetail snapshot={snapshot} thread={selectedThread} onSnapshot={setSnapshot} suggestedDraft={composerDraft} workspaceId={workspaceId} />
      </main>
      <div className="order-3 max-h-[50dvh] min-h-[320px] shrink-0 overflow-hidden lg:hidden xl:order-none xl:block xl:max-h-none xl:min-h-0">
        <ContextPanel
          snapshot={snapshot}
          thread={selectedThread}
          onSnapshot={setSnapshot}
          workspaceId={workspaceId}
          onUseDraft={(draft) => setComposerDraft(draft)}
        />
      </div>
        </>
      ) : (
        <SocialOpsBoard mode={operationMode} snapshot={snapshot} onSnapshot={setSnapshot} onOpenChat={() => selectOperationMode('chat')} topSlot={approvalAlert} />
      )}
    </div>
  )
}

function NotificationSoundIcon({ enabled }) {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none">
      <path d="M5 9.5h3.3L13 5.8v12.4l-4.7-3.7H5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      {enabled ? (
        <>
          <path d="M16 8.5a5 5 0 0 1 0 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M18.8 6a9 9 0 0 1 0 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : (
        <path d="M17 9l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  )
}

function AiApprovalQueueAlert({ approvals = [], snapshot = {}, onOpen }) {
  const first = approvals[0]
  if (!first) return null
  const customer = customerForThread(snapshot.customers || [], first.thread)
  const page = pageForThread(snapshot.pages || [], first.thread)
  const customerName = customer?.displayName || 'ลูกค้า'
  const time = formatShortTime(first.decision.createdAt || first.thread.updatedAt)
  const label = `AI รออนุมัติ ${approvals.length}`
  const detail = [customerName, page?.name || first.thread.pageId, first.decision.intent || 'unknown', time].filter(Boolean).join(' · ')
  return (
    <div role="status" className="flex justify-end border-b border-[var(--color-rule)] bg-[var(--color-panel)] px-5 py-2">
      <button
        type="button"
        aria-label={`ตรวจเคสที่รออนุมัติ ${customerName}`}
        title={detail}
        className="inline-flex max-w-full items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--color-warn)] bg-[var(--color-warn-soft)] px-3 py-1 text-xs font-black text-[var(--color-warn)] shadow-sm hover:bg-[var(--color-panel)]"
        onClick={() => onOpen?.(first.thread)}
      >
        <span>{label}</span>
        <span className="max-w-[220px] truncate font-semibold opacity-85">{detail}</span>
        <span className="rounded-[var(--radius-pill)] bg-[var(--color-panel)] px-2 py-0.5">ตรวจเคส</span>
      </button>
    </div>
  )
}

function OmniAccessGate({ password, busy, error, onPasswordChange, onSubmit }) {
  return (
    <div className="grid min-h-full place-items-start bg-[var(--color-paper)] p-6 text-[var(--color-ink)]">
      <form
        className="w-full max-w-sm rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-5 shadow-sm"
        onSubmit={onSubmit}
      >
        <h1 className="text-lg font-bold">เข้าสู่ระบบ Omni</h1>
        <label className="mt-4 block text-sm font-semibold" htmlFor="omni-access-password">รหัสเข้าใช้งาน</label>
        <input
          id="omni-access-password"
          type="password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          className="mt-2 h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-paper)] px-3 text-base outline-none focus:border-[var(--color-accent)]"
          autoComplete="current-password"
          autoFocus
        />
        {error && error !== 'access_password_required' ? (
          <p className="mt-3 text-sm font-semibold text-[var(--color-danger)]">{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={busy || !password.trim()}
          className="mt-4 h-11 w-full rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 text-sm font-bold text-[var(--color-accent-ink)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </div>
  )
}

function OperationRail({ activeMode, modes, onSelect }) {
  return (
    <nav className="order-0 grid shrink-0 grid-cols-4 gap-2 overflow-hidden border-b border-[var(--color-rule)] bg-[var(--color-panel)] p-2 lg:flex lg:h-full lg:flex-col lg:overflow-x-visible lg:border-b-0 lg:border-r" aria-label="Omni operations">
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
