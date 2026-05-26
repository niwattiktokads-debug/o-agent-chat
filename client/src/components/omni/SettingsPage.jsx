import React, { useEffect, useState } from 'react'
import {
  fetchOmniSettings,
  fetchOmniSnapshot,
  saveOmniSettings,
} from '../../lib/omniApi.js'
import ConnectorHealth from './ConnectorHealth.jsx'
import FacebookLivePreview from './FacebookLivePreview.jsx'
import PageManagement from './PageManagement.jsx'
import TikTokOrderSync from './TikTokOrderSync.jsx'
import ConnectionsPage from '../connections/ConnectionsPage.jsx'

const DEFAULT_SETTINGS = {
  postCf: { enabled: true, autoCreateDrafts: true },
  liveCf: { enabled: true, mode: 'fallback_post_comment_capture' },
  report: { timezone: 'Asia/Bangkok' },
  orderDraft: { enabled: true, approvalRequired: true, createZortOrderOnApprove: true },
  orderAddressIntake: { enabled: true, createConfirmationDraft: true },
  ai: { enabled: true },
}

const LIVE_CF_MODES = [
  { value: 'fallback_post_comment_capture', label: 'fallback post comment capture' },
  { value: 'fallback_live_post_comment_capture', label: 'fallback live-post comment capture' },
]

const REPORT_TIMEZONES = [
  { value: 'Asia/Bangkok', label: 'Asia/Bangkok' },
  { value: 'UTC', label: 'UTC' },
]

const SETTINGS_SECTIONS = [
  { id: 'settings', label: 'พื้นฐาน' },
  { id: 'connections', label: 'การเชื่อมต่อ' },
]

export default function SettingsPage({
  snapshot,
  onSnapshot,
  onOpenChat,
  activeSection,
  onSectionChange,
}) {
  const [localSnapshot, setLocalSnapshot] = useState(snapshot || null)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [status, setStatus] = useState('')
  const [snapshotStatus, setSnapshotStatus] = useState('')
  const [localSection, setLocalSection] = useState(activeSection || 'settings')

  useEffect(() => {
    if (snapshot) setLocalSnapshot(snapshot)
  }, [snapshot])

  useEffect(() => {
    fetchOmniSettings()
      .then((data) => setSettings(mergeSettings(DEFAULT_SETTINGS, data || {})))
      .catch((error) => setStatus(error.message))
  }, [])

  useEffect(() => {
    if (snapshot) return
    let ignore = false
    setSnapshotStatus('กำลังโหลดข้อมูลระบบ')
    fetchOmniSnapshot()
      .then((data) => {
        if (!ignore) {
          setLocalSnapshot(data)
          setSnapshotStatus('')
        }
      })
      .catch((error) => {
        if (!ignore) setSnapshotStatus(error.message)
      })
    return () => { ignore = true }
  }, [snapshot])

  function updateSetting(path, valueOrUpdater) {
    setSettings((current) => {
      const next = mergeSettings(DEFAULT_SETTINGS, current)
      let target = next
      for (const key of path.slice(0, -1)) target = target[key]
      const lastKey = path[path.length - 1]
      target[lastKey] = typeof valueOrUpdater === 'function' ? valueOrUpdater(target[lastKey]) : valueOrUpdater
      return next
    })
  }

  async function save() {
    setStatus('กำลังบันทึก setting')
    try {
      const result = await saveOmniSettings(settings)
      setSettings(mergeSettings(DEFAULT_SETTINGS, result.settings || settings))
      setStatus('บันทึก setting แล้ว')
    } catch (error) {
      setStatus(error.message)
    }
  }

  function handleSnapshot(nextSnapshot) {
    setLocalSnapshot(nextSnapshot)
    onSnapshot?.(nextSnapshot)
  }

  function selectSection(sectionId) {
    setLocalSection(sectionId)
    onSectionChange?.(sectionId)
  }

  const section = activeSection || localSection
  const pages = localSnapshot?.pages || []
  const connectorHealth = localSnapshot?.connectorHealth || []

  return (
    <main className="order-1 min-h-0 overflow-y-auto bg-[var(--color-paper)] p-4 lg:order-none lg:h-full lg:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-rule)] pb-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-ink)]">ตั้งค่าระบบ</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-2)]">Setting นี้บันทึกลง DB และ backend ใช้ gate Post/Live/AI/Order flow</p>
        </div>
        <div className="flex items-center gap-2">
          {onOpenChat ? (
            <button
              type="button"
              onClick={onOpenChat}
              className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]"
            >
              กลับกล่องรวม
            </button>
          ) : null}
          <button
            type="button"
            onClick={save}
            className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-ink)]"
          >
            บันทึก setting
          </button>
        </div>
      </header>
      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Settings sections">
        {SETTINGS_SECTIONS.map((item) => {
          const active = section === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectSection(item.id)}
              className={`rounded-[var(--radius-md)] border px-3 py-2 text-sm font-semibold transition ${active ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-ink)]' : 'border-[var(--color-rule)] bg-[var(--color-panel)] text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]'}`}
            >
              {item.label}
            </button>
          )
        })}
      </nav>
      <StatusLine value={status || snapshotStatus} />
      {section === 'connections' ? (
        <div className="mt-4">
          <ConnectionsPage embedded showPageNav={false} />
        </div>
      ) : (
        <>
          <section className="mt-4 grid gap-4 lg:grid-cols-2">
            <SettingsCard
              title="Post / Live CF"
              rows={[
                { label: 'Post CF enabled', checked: settings.postCf.enabled, onChange: () => updateSetting(['postCf', 'enabled'], (value) => !value) },
                { label: 'Post auto-create draft', checked: settings.postCf.autoCreateDrafts, onChange: () => updateSetting(['postCf', 'autoCreateDrafts'], (value) => !value) },
                { label: 'Live CF enabled', checked: settings.liveCf.enabled, onChange: () => updateSetting(['liveCf', 'enabled'], (value) => !value) },
              ]}
            >
              <SelectRow
                label="Live comment mode"
                value={settings.liveCf.mode}
                options={LIVE_CF_MODES}
                onChange={(value) => updateSetting(['liveCf', 'mode'], value)}
              />
            </SettingsCard>
            <SettingsCard
              title="AI / Order"
              rows={[
                { label: 'AI enabled', checked: settings.ai.enabled, onChange: () => updateSetting(['ai', 'enabled'], (value) => !value) },
                { label: 'Order draft enabled', checked: settings.orderDraft.enabled, onChange: () => updateSetting(['orderDraft', 'enabled'], (value) => !value) },
                { label: 'Order approval required', checked: settings.orderDraft.approvalRequired, onChange: () => updateSetting(['orderDraft', 'approvalRequired'], (value) => !value) },
                { label: 'Create ZORT on approve', checked: settings.orderDraft.createZortOrderOnApprove, onChange: () => updateSetting(['orderDraft', 'createZortOrderOnApprove'], (value) => !value) },
                { label: 'Address intake enabled', checked: settings.orderAddressIntake.enabled, onChange: () => updateSetting(['orderAddressIntake', 'enabled'], (value) => !value) },
                { label: 'Create address confirmation draft', checked: settings.orderAddressIntake.createConfirmationDraft, onChange: () => updateSetting(['orderAddressIntake', 'createConfirmationDraft'], (value) => !value) },
              ]}
            >
              <SelectRow
                label="Report timezone"
                value={settings.report.timezone}
                options={REPORT_TIMEZONES}
                onChange={(value) => updateSetting(['report', 'timezone'], value)}
              />
            </SettingsCard>
          </section>
          <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)]">
              <PageManagement pages={pages} onSnapshot={handleSnapshot} />
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)]">
              <ConnectorHealth health={connectorHealth} />
            </div>
          </section>
          <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)]">
              <FacebookLivePreview onSynced={handleSnapshot} />
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)]">
              <TikTokOrderSync onSynced={handleSnapshot} />
            </div>
          </section>
        </>
      )}
    </main>
  )
}

function SettingsCard({ title, rows, children }) {
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
      <h2 className="text-sm font-bold text-[var(--color-ink)]">{title}</h2>
      <div className="mt-3 divide-y divide-[var(--color-rule)]">
        {rows.map((row) => (
          <label key={row.label} className="flex items-center justify-between gap-3 py-3 text-sm font-semibold text-[var(--color-ink-2)]">
            <span>{row.label}</span>
            <input type="checkbox" checked={row.checked} onChange={row.onChange} className="h-4 w-4 accent-[var(--color-accent)]" />
          </label>
        ))}
        {children}
      </div>
    </section>
  )
}

function SelectRow({ label, value, options, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 py-3 text-sm font-semibold text-[var(--color-ink-2)]">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-sm text-[var(--color-ink)]"
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

function StatusLine({ value }) {
  if (!value) return null
  return <div className="px-4 py-3 text-xs font-semibold text-[var(--color-muted)]">{value}</div>
}

function mergeSettings(base, input) {
  return {
    ...base,
    ...input,
    postCf: { ...base.postCf, ...(input.postCf || {}) },
    liveCf: { ...base.liveCf, ...(input.liveCf || {}) },
    report: { ...base.report, ...(input.report || {}) },
    orderDraft: { ...base.orderDraft, ...(input.orderDraft || {}) },
    orderAddressIntake: { ...base.orderAddressIntake, ...(input.orderAddressIntake || {}) },
    ai: { ...base.ai, ...(input.ai || {}) },
  }
}
