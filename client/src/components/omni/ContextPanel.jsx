import React, { useEffect, useState } from 'react'
import { fetchOmniSettings, saveOmniSettings } from '../../lib/omniApi.js'
import AiDecisionPanel from './AiDecisionPanel.jsx'
import OrderDesk from './OrderDesk.jsx'
import PaymentDesk from './PaymentDesk.jsx'
import ProfilePanel from './ProfilePanel.jsx'
import SalesContextPanel from './SalesContextPanel.jsx'

const TABS = [
  { id: 'ai', label: 'AI' },
  { id: 'sales', label: 'สินค้า' },
  { id: 'profiles', label: 'โปรไฟล์' },
  { id: 'orders', label: 'ออเดอร์' },
  { id: 'payment', label: 'ชำระเงิน' },
]

export default function ContextPanel({ snapshot, thread, onSnapshot, workspaceId, onUseDraft }) {
  const [tab, setTab] = useState('ai')
  const [settings, setSettings] = useState(snapshot?.settings || null)
  const [guardError, setGuardError] = useState('')
  const [richMessageText, setRichMessageText] = useState('')
  const [richMessageBusy, setRichMessageBusy] = useState(false)
  const [richMessageStatus, setRichMessageStatus] = useState('')
  const [sizeChartImageUrl, setSizeChartImageUrl] = useState('')
  const [salesAssetsBusy, setSalesAssetsBusy] = useState(false)
  const [salesAssetsStatus, setSalesAssetsStatus] = useState('')

  useEffect(() => {
    if (snapshot?.settings) setSettings(snapshot.settings)
  }, [snapshot?.settings])

  useEffect(() => {
    setRichMessageText(settings?.ai?.richMessage?.text || '')
  }, [settings?.ai?.richMessage?.text])

  useEffect(() => {
    setSizeChartImageUrl(settings?.ai?.salesAssets?.sizeChartImageUrl || '')
  }, [settings?.ai?.salesAssets?.sizeChartImageUrl])

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

  async function saveRichMessage(enabled = true) {
    if (!settings || richMessageBusy) return
    const text = richMessageText.replace(/\s+/g, ' ').trim()
    setRichMessageBusy(true)
    setRichMessageStatus('')
    setGuardError('')
    const nextSettings = {
      ...settings,
      ai: {
        ...(settings.ai || {}),
        richMessage: {
          enabled: enabled && Boolean(text),
          text: enabled ? text : '',
        },
      },
    }
    try {
      const result = await saveOmniSettings(nextSettings, { workspaceId: workspaceId || undefined })
      setSettings(result.settings || nextSettings)
      setRichMessageText(result.settings?.ai?.richMessage?.text || nextSettings.ai.richMessage.text)
      const nextSnapshot = result.snapshot || (snapshot ? { ...snapshot, settings: result.settings || nextSettings } : null)
      if (nextSnapshot) onSnapshot?.(nextSnapshot)
      setRichMessageStatus(nextSettings.ai.richMessage.enabled ? 'บันทึกหัวข้อด่วนแล้ว' : 'ปิดหัวข้อด่วนแล้ว')
    } catch (error) {
      setGuardError(error.message || 'rich_message_update_failed')
    } finally {
      setRichMessageBusy(false)
    }
  }

  async function saveSalesAssets(enabled = true) {
    if (!settings || salesAssetsBusy) return
    const url = sizeChartImageUrl.trim()
    setSalesAssetsBusy(true)
    setSalesAssetsStatus('')
    setGuardError('')
    const nextSettings = {
      ...settings,
      ai: {
        ...(settings.ai || {}),
        salesAssets: {
          ...(settings.ai?.salesAssets || {}),
          enabled,
          sizeChartImageUrl: enabled ? url : '',
        },
      },
    }
    try {
      const result = await saveOmniSettings(nextSettings, { workspaceId: workspaceId || undefined })
      setSettings(result.settings || nextSettings)
      setSizeChartImageUrl(result.settings?.ai?.salesAssets?.sizeChartImageUrl || nextSettings.ai.salesAssets.sizeChartImageUrl)
      const nextSnapshot = result.snapshot || (snapshot ? { ...snapshot, settings: result.settings || nextSettings } : null)
      if (nextSnapshot) onSnapshot?.(nextSnapshot)
      setSalesAssetsStatus(nextSettings.ai.salesAssets.enabled && nextSettings.ai.salesAssets.sizeChartImageUrl ? 'บันทึกรูปตารางไซซ์แล้ว' : 'ปิดรูปตารางไซซ์แล้ว')
    } catch (error) {
      setGuardError(error.message || 'sales_assets_update_failed')
    } finally {
      setSalesAssetsBusy(false)
    }
  }

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
      {tab === 'ai' ? (
        <>
          <section className="border-b border-[var(--color-rule)] p-4">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-[var(--color-ink)]">Rich message</h2>
                  <p className="mt-1 text-xs font-semibold text-[var(--color-muted)]">หัวข้อด่วนที่ AI ต้องย้ำในคำตอบแรก</p>
                </div>
                <span className={`rounded-[var(--radius-pill)] px-2 py-1 text-[11px] font-bold ${settings?.ai?.richMessage?.enabled ? 'bg-[var(--color-live-soft)] text-[var(--color-live)]' : 'bg-[var(--color-panel)] text-[var(--color-muted)]'}`}>
                  {settings?.ai?.richMessage?.enabled ? 'เปิด' : 'ปิด'}
                </span>
              </div>
              <label htmlFor="ai-rich-message" className="mt-3 block text-xs font-bold text-[var(--color-ink-2)]">หัวข้อด่วนให้ AI ย้ำครั้งแรก</label>
              <textarea
                id="ai-rich-message"
                value={richMessageText}
                maxLength={180}
                rows={3}
                onChange={(event) => setRichMessageText(event.target.value)}
                placeholder="เช่น 6.6 ออกตัวแรงลดยกล้อ"
                className="mt-2 min-h-[86px] w-full resize-none rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-3 text-sm font-semibold text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!settings || richMessageBusy}
                  onClick={() => saveRichMessage(true)}
                  className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-1.5 text-xs font-bold text-[var(--color-accent-ink)] disabled:opacity-50"
                >
                  {richMessageBusy ? 'กำลังบันทึก' : 'บันทึกหัวข้อด่วน'}
                </button>
                <button
                  type="button"
                  disabled={!settings || richMessageBusy || !settings?.ai?.richMessage?.enabled}
                  onClick={() => saveRichMessage(false)}
                  className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-1.5 text-xs font-bold text-[var(--color-ink-2)] disabled:opacity-50"
                >
                  ปิดหัวข้อด่วน
                </button>
                {richMessageStatus ? <span className="text-xs font-bold text-[var(--color-live)]">{richMessageStatus}</span> : null}
              </div>
            </div>
            <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-[var(--color-ink)]">Carousel assets</h2>
                  <p className="mt-1 text-xs font-semibold text-[var(--color-muted)]">รูปที่ AI แนบทันทีเมื่อรู้สินค้า/ไซซ์</p>
                </div>
                <span className={`rounded-[var(--radius-pill)] px-2 py-1 text-[11px] font-bold ${settings?.ai?.salesAssets?.enabled && settings?.ai?.salesAssets?.sizeChartImageUrl ? 'bg-[var(--color-live-soft)] text-[var(--color-live)]' : 'bg-[var(--color-panel)] text-[var(--color-muted)]'}`}>
                  {settings?.ai?.salesAssets?.enabled && settings?.ai?.salesAssets?.sizeChartImageUrl ? 'เปิด' : 'ปิด'}
                </span>
              </div>
              <label htmlFor="ai-size-chart-url" className="mt-3 block text-xs font-bold text-[var(--color-ink-2)]">ลิงก์รูปตารางไซซ์</label>
              <input
                id="ai-size-chart-url"
                value={sizeChartImageUrl}
                onChange={(event) => setSizeChartImageUrl(event.target.value)}
                placeholder="https://..."
                className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-3 text-sm font-semibold text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!settings || salesAssetsBusy}
                  onClick={() => saveSalesAssets(true)}
                  className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-1.5 text-xs font-bold text-[var(--color-accent-ink)] disabled:opacity-50"
                >
                  {salesAssetsBusy ? 'กำลังบันทึก' : 'บันทึกรูปตารางไซซ์'}
                </button>
                <button
                  type="button"
                  disabled={!settings || salesAssetsBusy || !settings?.ai?.salesAssets?.sizeChartImageUrl}
                  onClick={() => saveSalesAssets(false)}
                  className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-1.5 text-xs font-bold text-[var(--color-ink-2)] disabled:opacity-50"
                >
                  ปิดรูปตารางไซซ์
                </button>
                {salesAssetsStatus ? <span className="text-xs font-bold text-[var(--color-live)]">{salesAssetsStatus}</span> : null}
              </div>
            </div>
          </section>
          <AiDecisionPanel snapshot={panelSnapshot} thread={thread} onDrafted={handlePanelSnapshot} onUseDraft={onUseDraft} />
        </>
      ) : null}
      {tab === 'sales' ? <SalesContextPanel thread={thread} onUseDraft={onUseDraft} /> : null}
      {tab === 'profiles' ? <ProfilePanel snapshot={panelSnapshot} thread={thread} /> : null}
      {tab === 'orders' ? <OrderDesk snapshot={panelSnapshot} thread={thread} onSnapshot={handlePanelSnapshot} workspaceId={workspaceId} onUseDraft={onUseDraft} /> : null}
      {tab === 'payment' ? <PaymentDesk snapshot={panelSnapshot} thread={thread} onSnapshot={handlePanelSnapshot} onUseDraft={onUseDraft} /> : null}
    </aside>
  )
}
