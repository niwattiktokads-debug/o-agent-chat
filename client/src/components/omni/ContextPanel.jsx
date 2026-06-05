import React, { useEffect, useState } from 'react'
import { fetchOmniSettings, saveOmniSettings } from '../../lib/omniApi.js'
import AiDecisionPanel from './AiDecisionPanel.jsx'
import OrderDesk from './OrderDesk.jsx'
import PaymentDesk from './PaymentDesk.jsx'
import ProfilePanel from './ProfilePanel.jsx'
import SalesContextPanel from './SalesContextPanel.jsx'

const TABS = [
  { id: 'ai', label: 'AI' },
  { id: 'sales', label: 'ขาย' },
  { id: 'profiles', label: 'โปรไฟล์' },
  { id: 'orders', label: 'ออเดอร์' },
  { id: 'payment', label: 'ชำระเงิน' },
]

export default function ContextPanel({ snapshot, thread, onSnapshot, workspaceId, onUseDraft }) {
  const [tab, setTab] = useState('ai')
  const [settings, setSettings] = useState(snapshot?.settings || null)
  const [guardBusy, setGuardBusy] = useState(false)
  const [guardError, setGuardError] = useState('')

  useEffect(() => {
    if (snapshot?.settings) setSettings(snapshot.settings)
  }, [snapshot?.settings])

  useEffect(() => {
    let ignore = false
    fetchOmniSettings(workspaceId || undefined)
      .then((nextSettings) => {
        if (!ignore) setSettings(nextSettings)
      })
      .catch((error) => {
        if (!ignore) setGuardError(error.message || 'settings_load_failed')
      })
    return () => { ignore = true }
  }, [workspaceId])

  async function toggleCustomerSend() {
    if (!settings || guardBusy) return
    setGuardBusy(true)
    setGuardError('')
    const nextSettings = {
      ...settings,
      ai: {
        ...(settings.ai || {}),
        customerSendEnabled: settings.ai?.customerSendEnabled !== true,
      },
    }
    try {
      const result = await saveOmniSettings(nextSettings, { workspaceId: workspaceId || undefined })
      setSettings(result.settings || nextSettings)
      const nextSnapshot = result.snapshot || (snapshot ? { ...snapshot, settings: result.settings || nextSettings } : null)
      if (nextSnapshot) onSnapshot?.(nextSnapshot)
    } catch (error) {
      setGuardError(error.message || 'customer_send_guard_update_failed')
    } finally {
      setGuardBusy(false)
    }
  }

  const customerSendEnabled = settings?.ai?.customerSendEnabled === true
  const panelSnapshot = settings ? { ...snapshot, settings } : snapshot

  function handlePanelSnapshot(nextSnapshot) {
    if (nextSnapshot?.settings) setSettings(nextSnapshot.settings)
    onSnapshot?.(nextSnapshot)
  }

  return (
    <aside className="h-full min-h-0 overflow-y-auto border-t border-[var(--color-rule)] bg-[var(--color-panel)] xl:border-l xl:border-t-0">
      <div className="sticky top-0 z-10 border-b border-[var(--color-rule)] bg-[var(--color-panel)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold text-[var(--color-muted)]">Context</div>
          <button
            type="button"
            role="switch"
            aria-checked={customerSendEnabled}
            disabled={!settings || guardBusy}
            onClick={toggleCustomerSend}
            className={`flex min-w-[132px] items-center justify-between gap-2 rounded-[var(--radius-md)] border px-2 py-1 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-55 ${customerSendEnabled ? 'border-[var(--color-live)] bg-[var(--color-live-soft)] text-[var(--color-live)]' : 'border-[var(--color-warn)] bg-[var(--color-warn-soft)] text-[var(--color-warn)]'}`}
            title={customerSendEnabled ? 'ปิดส่งลูกค้าจริงอัตโนมัติ' : 'เปิดส่งลูกค้าจริงอัตโนมัติ'}
          >
            <span>{customerSendEnabled ? 'ส่งจริงเปิด' : 'Draft only'}</span>
            <span className={`relative h-5 w-9 rounded-full ${customerSendEnabled ? 'bg-[var(--color-live)]' : 'bg-[var(--color-warn)]'}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${customerSendEnabled ? 'left-4' : 'left-0.5'}`} />
            </span>
          </button>
        </div>
        {guardError ? <div className="mt-2 rounded-[var(--radius-sm)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--color-danger)]">{guardError}</div> : null}
        <div className="mt-2 grid grid-cols-5 rounded-[var(--radius-md)] bg-[var(--color-panel-2)] p-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              className={`rounded-[var(--radius-sm)] px-2 py-1.5 text-xs font-semibold transition ${tab === item.id ? 'bg-[var(--color-panel)] text-[var(--color-accent)] shadow-sm' : 'text-[var(--color-ink-2)] hover:text-[var(--color-ink)]'}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'ai' ? <AiDecisionPanel snapshot={panelSnapshot} thread={thread} onDrafted={handlePanelSnapshot} onUseDraft={onUseDraft} /> : null}
      {tab === 'sales' ? <SalesContextPanel thread={thread} onUseDraft={onUseDraft} /> : null}
      {tab === 'profiles' ? <ProfilePanel snapshot={panelSnapshot} thread={thread} /> : null}
      {tab === 'orders' ? <OrderDesk snapshot={panelSnapshot} thread={thread} onSnapshot={handlePanelSnapshot} workspaceId={workspaceId} onUseDraft={onUseDraft} /> : null}
      {tab === 'payment' ? <PaymentDesk snapshot={panelSnapshot} thread={thread} onSnapshot={handlePanelSnapshot} onUseDraft={onUseDraft} /> : null}
    </aside>
  )
}
