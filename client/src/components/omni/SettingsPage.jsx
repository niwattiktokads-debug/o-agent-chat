import React, { useEffect, useState } from 'react'
import {
  fetchOmniSettings,
  fetchOmniSnapshot,
  fetchOmniStorageStatus,
  savePolicyAutoSend,
  saveOmniSettings,
} from '../../lib/omniApi.js'
import ConnectorHealth from './ConnectorHealth.jsx'
import FacebookLivePreview from './FacebookLivePreview.jsx'
import PageManagement from './PageManagement.jsx'
import TikTokOrderSync from './TikTokOrderSync.jsx'
import WorkspacePanel from './WorkspacePanel.jsx'
import ConnectionsPage from '../connections/ConnectionsPage.jsx'

const DEFAULT_SETTINGS = {
  postSession: { enabled: true, autoCreateDrafts: true },
  postCf: { enabled: true, autoCreateDrafts: true },
  liveCf: { enabled: true, mode: 'fallback_post_comment_capture' },
  report: { timezone: 'Asia/Bangkok' },
  orderDraft: { enabled: true, approvalRequired: true, createZortOrderOnApprove: true },
  orderAddressIntake: { enabled: true, createConfirmationDraft: true },
  ai: { enabled: true, customerSendEnabled: false },
}

const LIVE_CF_MODES = [
  { value: 'fallback_post_comment_capture', label: 'fallback post comment capture' },
  { value: 'fallback_live_post_comment_capture', label: 'fallback live-post comment capture' },
]

const REPORT_TIMEZONES = [
  { value: 'Asia/Bangkok', label: 'Asia/Bangkok' },
  { value: 'UTC', label: 'UTC' },
]

const AUTO_SEND_INTENTS = [
  { id: 'faq', label: 'FAQ' },
  { id: 'stock', label: 'สต็อก' },
  { id: 'price', label: 'ราคา' },
  { id: 'product', label: 'สินค้า' },
  { id: 'orderStatus', label: 'สถานะออเดอร์' },
  { id: 'refund', label: 'คืนเงิน/เคลม' },
]

const SETTINGS_SECTIONS = [
  { id: 'settings', label: 'พื้นฐาน' },
  { id: 'ai-config', label: 'AI Config' },
  { id: 'connections', label: 'การเชื่อมต่อ' },
]

const PAGE_RUNTIME_FALLBACKS = {
  page_annalynn: { agentProfileId: 'agent_annalynn', policySetId: 'policy_annalynn' },
  page_annalynn_tiktok: { agentProfileId: 'agent_annalynn', policySetId: 'policy_annalynn' },
  page_mankynd: { agentProfileId: 'agent_mankynd', policySetId: 'policy_mankynd' },
  page_des: { agentProfileId: 'agent_page_des', policySetId: 'policy_page_des' },
  page_tangtob: { agentProfileId: 'agent_default', policySetId: 'policy_default' },
}

export default function SettingsPage({
  snapshot,
  onSnapshot,
  onOpenChat,
  activeSection,
  onSectionChange,
  workspaceId,
}) {
  const [localSnapshot, setLocalSnapshot] = useState(snapshot || null)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [status, setStatus] = useState('')
  const [snapshotStatus, setSnapshotStatus] = useState('')
  const [storageStatus, setStorageStatus] = useState(null)
  const [localSection, setLocalSection] = useState(activeSection || 'settings')

  useEffect(() => {
    if (snapshot) setLocalSnapshot(snapshot)
  }, [snapshot])

  useEffect(() => {
    fetchOmniSettings(workspaceId || undefined)
      .then((data) => setSettings(mergeSettings(DEFAULT_SETTINGS, data || {})))
      .catch((error) => setStatus(error.message))
  }, [workspaceId])

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

  useEffect(() => {
    let ignore = false
    fetchOmniStorageStatus()
      .then((data) => {
        if (!ignore) setStorageStatus(data)
      })
      .catch((error) => {
        if (!ignore) setStatus(error.message)
      })
    return () => { ignore = true }
  }, [])

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
      const result = await saveOmniSettings(settings, { workspaceId: workspaceId || undefined })
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
  const showSaveSettings = section === 'settings'

  return (
    <main className="order-1 min-h-0 overflow-y-auto bg-[var(--color-paper)] p-4 lg:order-none lg:h-full lg:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-rule)] pb-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-ink)]">ตั้งค่าระบบ</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-2)]">
            Setting นี้บันทึกลง DB และ backend ใช้ gate Post/Live/AI/Order flow
            {workspaceId ? <span className="ml-2 inline-flex items-center rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-accent-subtle,var(--color-panel-2))] px-2 py-0.5 text-[11px] font-bold text-[var(--color-accent)]">{workspaceId}</span> : null}
          </p>
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
          {showSaveSettings ? (
            <button
              type="button"
              onClick={save}
              className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-ink)]"
            >
              บันทึก setting
            </button>
          ) : null}
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
      ) : section === 'ai-config' ? (
        <AiConfigPanel snapshot={localSnapshot} onSnapshot={handleSnapshot} onOpenChat={onOpenChat} workspaceId={workspaceId} />
      ) : (
        <>
          <section className="mt-4 grid gap-4 lg:grid-cols-2">
            <SettingsCard
              title="Post Selling / Live CF"
              rows={[
                { label: 'Post Selling Session enabled', checked: settings.postSession.enabled, onChange: () => updateSetting(['postSession', 'enabled'], (value) => !value) },
                { label: 'Post session auto-create draft', checked: settings.postSession.autoCreateDrafts, onChange: () => updateSetting(['postSession', 'autoCreateDrafts'], (value) => !value) },
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
          <section className="mt-4">
            <WorkspacePanel snapshot={localSnapshot} />
          </section>
          <section className="mt-4">
            <StorageStatusPanel storage={storageStatus} />
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

function StorageStatusPanel({ storage }) {
  const persistent = storage?.persistent === true
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-ink)]">Persistent storage</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-2)]">{storage?.note || 'กำลังตรวจสถานะ storage'}</p>
        </div>
        <StatusPill tone={persistent ? 'ready' : 'warn'} label={persistent ? 'persistent' : 'not persistent'} />
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <InfoItem label="Driver" value={storage?.driver || '-'} />
        <InfoItem label="DB path" value={storage?.dbPath || '-'} />
        <InfoItem label="Volume" value={storage?.volumeMountPath || '-'} />
      </dl>
    </section>
  )
}

function AiConfigPanel({ snapshot, onSnapshot, onOpenChat, workspaceId }) {
  const allPages = snapshot?.pages || []
  const pages = workspaceId ? allPages.filter((p) => p.workspaceId === workspaceId) : allPages
  const agentProfiles = snapshot?.agentProfiles || []
  const [policySets, setPolicySets] = useState(snapshot?.policySets || [])
  const [policyStatus, setPolicyStatus] = useState('')
  const [busyPolicyId, setBusyPolicyId] = useState('')
  const knowledgeSources = snapshot?.knowledgeSources || []
  const platformAccounts = snapshot?.platformAccounts || []
  const pageRuntimeSettings = snapshot?.pageRuntimeSettings || []

  useEffect(() => {
    setPolicySets(snapshot?.policySets || [])
  }, [snapshot?.policySets])

  async function updatePolicyIntent(policySetId, intent, enabled) {
    const policy = policySets.find((item) => item.id === policySetId)
    if (!policy || busyPolicyId) return
    const nextAutoSend = {
      ...(policy.autoSend || {}),
      [intent]: enabled,
    }
    setBusyPolicyId(policySetId)
    setPolicyStatus(`กำลังบันทึก ${policySetId}`)
    try {
      const result = await savePolicyAutoSend(policySetId, nextAutoSend)
      const nextPolicySets = (result.snapshot?.policySets || policySets).map((item) => (
        item.id === policySetId ? (result.policySet || { ...item, autoSend: nextAutoSend }) : item
      ))
      setPolicySets(nextPolicySets)
      if (result.snapshot) onSnapshot?.(result.snapshot)
      setPolicyStatus('บันทึก AI auto-send แล้ว')
    } catch (error) {
      setPolicyStatus(error.message || 'policy_auto_send_update_failed')
    } finally {
      setBusyPolicyId('')
    }
  }

  const rows = pages.map((page) => {
    const runtime = pageRuntimeSettings.find((item) => item.pageId === page.id) || {}
    const fallback = PAGE_RUNTIME_FALLBACKS[page.id] || {}
    const agentProfileId = page.agentProfileId || runtime.agentProfileId || fallback.agentProfileId
    const policySetId = page.policySetId || runtime.policySetId || fallback.policySetId
    const agent = agentProfiles.find((item) => item.id === agentProfileId)
    const policy = policySets.find((item) => item.id === policySetId)
    const accounts = platformAccounts.filter((item) => item.pageId === page.id)
    const knowledge = knowledgeSources
      .filter((item) => {
        // Workspace boundary: sources without workspaceId default to ws_oagent
        const pageWs = page.workspaceId || 'ws_oagent'
        const itemWs = item.workspaceId || 'ws_oagent'
        if (pageWs !== itemWs) return false
        return item.scope === page.id || item.scope === 'all_pages'
      })
      .sort((a, b) => Number(b.scope === page.id) - Number(a.scope === page.id))
    const warnings = []
    if (!agent) warnings.push('ยังไม่พบ AI profile')
    if (!policy) warnings.push('ยังไม่พบ policy')
    if (!knowledge.length) warnings.push('ยังไม่พบ knowledge')
    if (!accounts.length) warnings.push('ยังไม่ผูก account')
    return { page, agent, policy, accounts, knowledge, warnings }
  })
  const readyCount = rows.filter((row) => !row.warnings.length).length
  // Count only sources visible to the workspace (deduplicated)
  const wsSourceIds = new Set(rows.flatMap((row) => row.knowledge.map((k) => k.id)))
  const sourceCount = wsSourceIds.size

  return (
    <section className="mt-4 space-y-4">
      <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[var(--color-ink)]">AI Config</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-2)]">ดูว่าแต่ละเพจใช้ AI ตัวไหน กรอบตอบอะไร และ knowledge ไหนคุมการตอบ</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="?mode=ai-train"
              className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-paper)]"
            >
              แก้ Knowledge
            </a>
            {onOpenChat ? (
              <button
                type="button"
                onClick={onOpenChat}
                className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-ink)]"
              >
                ทดสอบในกล่องรวม
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric label="เพจทั้งหมด" value={String(pages.length)} />
          <Metric label="พร้อมตาม config" value={`${readyCount}/${pages.length || 0}`} />
          <Metric label="Knowledge sources" value={String(sourceCount)} />
        </div>
        {policyStatus ? <p className="mt-3 text-xs font-semibold text-[var(--color-muted)]">{policyStatus}</p> : null}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {rows.map((row) => (
          <AiConfigCard
            key={row.page.id}
            row={row}
            busy={busyPolicyId === row.policy?.id}
            onIntentChange={updatePolicyIntent}
          />
        ))}
      </div>
    </section>
  )
}

function AiConfigCard({ row, busy = false, onIntentChange }) {
  const { page, agent, policy, accounts, knowledge, warnings } = row
  const autoSend = policy?.autoSend || {}
  const autoSendEntries = Object.entries(autoSend).filter(([, enabled]) => enabled)
  const approvalEntries = Object.entries(autoSend).filter(([, enabled]) => !enabled)
  return (
    <article className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[var(--color-ink)]">{page.name}</h3>
          <p className="mt-1 text-xs font-semibold text-[var(--color-muted)]">{page.id}{page.workspaceId ? ` · ${page.workspaceId}` : ''}</p>
        </div>
        <StatusPill tone={warnings.length ? 'warn' : 'ready'} label={warnings.length ? 'ต้องเช็ก' : 'พร้อม'} />
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <InfoItem label="AI ที่ตอบลูกค้า" value={agent?.name || 'ยังไม่ตั้ง'} />
        <InfoItem label="Provider / Model" value={agent ? `${agent.provider} / ${agent.model}` : 'ยังไม่ตั้ง'} />
        <InfoItem label="Policy" value={policy?.id || 'ยังไม่ตั้ง'} />
        <InfoItem label="Accounts" value={accounts.length ? accounts.map((item) => `${item.platform}:${item.status}`).join(', ') : 'ยังไม่ผูก'} />
      </dl>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <TagBlock title="ตอบอัตโนมัติได้" empty="ยังไม่มี intent ที่เปิด auto-send" items={autoSendEntries.map(([key]) => key)} />
        <TagBlock title="ต้องให้บอสอนุมัติ" empty="ไม่มี intent ที่ถูกล็อก approval" items={approvalEntries.map(([key]) => key)} />
      </div>
      <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">Auto-send intent</h4>
          <span className="text-[11px] font-semibold text-[var(--color-muted)]">{policy?.id || 'ยังไม่ตั้ง policy'}</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {AUTO_SEND_INTENTS.map((intent) => {
            const checked = autoSend[intent.id] === true
            return (
              <label key={intent.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-2)]">
                <span>{intent.label}</span>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!policy || busy}
                  onChange={(event) => onIntentChange?.(policy.id, intent.id, event.target.checked)}
                  className="h-4 w-4 accent-[var(--color-accent)] disabled:opacity-45"
                />
              </label>
            )
          })}
        </div>
      </div>
      <div className="mt-4">
        <h4 className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">Knowledge ที่ AI ใช้</h4>
        <div className="mt-2 space-y-2">
          {knowledge.length ? knowledge.slice(0, 4).map((source) => (
            <div key={source.id} className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-[var(--color-ink)]">{source.title}</p>
                <span className="text-xs font-semibold text-[var(--color-muted)]">{source.scope}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--color-ink-2)]">{previewText(source.content)}</p>
            </div>
          )) : (
            <p className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-3 text-sm font-semibold text-[var(--color-ink-2)]">ยังไม่มี knowledge สำหรับเพจนี้</p>
          )}
        </div>
      </div>
      {warnings.length ? (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-paper)] p-3">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">ต้องทำต่อ</p>
          <ul className="mt-2 space-y-1 text-sm font-semibold text-[var(--color-ink-2)]">
            {warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      ) : null}
    </article>
  )
}

function Metric({ label, value }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-3">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">{label}</p>
      <p className="mt-1 text-xl font-bold text-[var(--color-ink)]">{value}</p>
    </div>
  )
}

function InfoItem({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-[var(--color-ink)]">{value}</dd>
    </div>
  )
}

function TagBlock({ title, empty, items }) {
  return (
    <div>
      <h4 className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">{title}</h4>
      {items.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {items.map((item) => (
            <span key={item} className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-2 py-1 text-xs font-bold text-[var(--color-ink-2)]">{item}</span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm font-semibold text-[var(--color-ink-2)]">{empty}</p>
      )}
    </div>
  )
}

function StatusPill({ tone, label }) {
  const ready = tone === 'ready'
  return (
    <span className={`rounded-[var(--radius-md)] border px-2 py-1 text-xs font-bold ${ready ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-ink)]' : 'border-[var(--color-rule)] bg-[var(--color-paper)] text-[var(--color-ink-2)]'}`}>
      {label}
    </span>
  )
}

function previewText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim() || 'ไม่มีรายละเอียด'
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
  const postSession = {
    ...base.postSession,
    ...base.postCf,
    ...(input.postCf || {}),
    ...(input.postSession || {}),
  }
  return {
    ...base,
    ...input,
    postSession,
    postCf: postSession,
    liveCf: { ...base.liveCf, ...(input.liveCf || {}) },
    report: { ...base.report, ...(input.report || {}) },
    orderDraft: { ...base.orderDraft, ...(input.orderDraft || {}) },
    orderAddressIntake: { ...base.orderAddressIntake, ...(input.orderAddressIntake || {}) },
    ai: { ...base.ai, ...(input.ai || {}) },
  }
}
