import React, { useEffect, useMemo, useState } from 'react'
import {
  capturePostCf,
  fetchConnections,
  fetchLiveSources,
  fetchMessageVolumeReport,
  fetchOmniSettings,
  fetchSocialPosts,
  saveOmniSettings,
} from '../../lib/omniApi.js'

const FALLBACK_PAGE_PROFILES = [
  { id: 'man_kynd', label: 'MAN KYND' },
  { id: 'anna_lynn', label: 'AnnaLynn' },
  { id: 'page_des', label: 'เพจเดส' },
  { id: 'fb_112154661515664', label: 'Facebook 112154661515664' },
]

const DEFAULT_SETTINGS = {
  postCf: { enabled: true, autoCreateDrafts: true },
  liveCf: { enabled: true },
  orderDraft: { enabled: true, approvalRequired: true, createZortOrderOnApprove: true },
  ai: { enabled: true },
}

export default function SocialOpsBoard({ mode, snapshot, onSnapshot, onOpenChat }) {
  if (mode === 'post') {
    return (
      <OpsShell
        title="โพสต์"
        summary="เลือกเพจ, ดึงโพสต์จริงจาก Meta, จับคอมเมนต์ CF แล้วสร้าง order draft ใน DB"
        onOpenChat={onOpenChat}
      >
        <PostCaptureBoard onSnapshot={onSnapshot} />
      </OpsShell>
    )
  }

  if (mode === 'live') {
    return (
      <OpsShell
        title="ไลฟ์สตรีม"
        summary="ตรวจ live/comment stream ก่อน ถ้า Meta scope ยังไม่พร้อมจะใช้ live-post comment capture เป็น fallback"
        onOpenChat={onOpenChat}
      >
        <LiveCaptureBoard />
      </OpsShell>
    )
  }

  if (mode === 'report') {
    return <MessageReport snapshot={snapshot} onOpenChat={onOpenChat} />
  }

  if (mode === 'setting') {
    return <SettingsBoard onOpenChat={onOpenChat} />
  }

  return null
}

function OpsShell({ title, summary, onOpenChat, children }) {
  return (
    <main className="order-1 min-h-0 overflow-y-auto bg-[var(--color-paper)] p-4 lg:order-none lg:h-full lg:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-rule)] pb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-[var(--color-ink)]">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--color-ink-2)]">{summary}</p>
        </div>
        <button
          type="button"
          onClick={onOpenChat}
          className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]"
        >
          กลับแชท
        </button>
      </header>
      {children}
    </main>
  )
}

function PostCaptureBoard({ onSnapshot }) {
  const [pageProfile, setPageProfile] = useState('man_kynd')
  const pageProfiles = useMetaPageProfiles()
  const [posts, setPosts] = useState([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [capturingId, setCapturingId] = useState('')

  async function loadPosts(nextPageProfile = pageProfile) {
    setLoading(true)
    setStatus('กำลังดึงโพสต์จาก Meta')
    try {
      const result = await fetchSocialPosts(nextPageProfile, 10)
      setPosts(result.posts || [])
      setStatus(`ดึงโพสต์แล้ว ${(result.posts || []).length} รายการ`)
    } catch (error) {
      setStatus(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPosts(pageProfile)
  }, [pageProfile])

  async function capture(postId) {
    setCapturingId(postId)
    setStatus('กำลังดึงคอมเมนต์และ parse CF')
    try {
      const result = await capturePostCf(postId, { pageProfile, limit: 50 })
      if (result.snapshot) onSnapshot?.(result.snapshot)
      const reviewCount = result.summary?.reviewCount || 0
      setStatus(`สร้าง draft แล้ว ${result.summary?.draftCount || 0} รายการ${reviewCount ? ` · รอ review ${reviewCount} รายการ` : ''}`)
    } catch (error) {
      setStatus(error.message)
    } finally {
      setCapturingId('')
    }
  }

  return (
    <section className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)]">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-rule)] px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-ink)]">Post CF capture</h2>
          <p className="mt-1 text-xs text-[var(--color-muted)]">Read-only ZORT lookup, draft-only order lane</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs font-semibold text-[var(--color-muted)]">
            เพจ
            <select
              value={pageProfile}
              onChange={(event) => setPageProfile(event.target.value)}
              className="min-w-44 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-sm text-[var(--color-ink)]"
            >
              {pageProfiles.map((page) => <option key={page.id} value={page.id}>{page.label}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={() => loadPosts()}
            disabled={loading}
            className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)] disabled:opacity-50"
          >
            ดึงโพสต์
          </button>
        </div>
      </div>
      <StatusLine value={status} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-[var(--color-rule)] bg-[var(--color-panel-2)] text-xs text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-3 font-semibold">โพสต์</th>
              <th className="px-4 py-3 font-semibold">คอมเมนต์</th>
              <th className="px-4 py-3 font-semibold">เวลา</th>
              <th className="px-4 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {posts.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-xs text-[var(--color-muted)]">ยังไม่มีโพสต์จากเพจนี้</td>
              </tr>
            ) : posts.map((post) => (
              <tr key={post.id} className="border-b border-[var(--color-rule)] last:border-b-0">
                <td className="max-w-xl px-4 py-3">
                  <div className="font-semibold text-[var(--color-ink)]">{post.message || post.story || post.id}</div>
                  <div className="mt-1 text-[11px] text-[var(--color-muted)]">{post.id}</div>
                </td>
                <td className="px-4 py-3 tabular-nums text-[var(--color-ink-2)]">{post.commentCount ?? post.comments?.summary?.total_count ?? 0}</td>
                <td className="px-4 py-3 text-[var(--color-ink-2)]">{formatDateTime(post.createdTime || post.created_time)}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    aria-label={`สร้าง draft จาก CF ${post.id}`}
                    onClick={() => capture(post.id)}
                    disabled={capturingId === post.id}
                    className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[var(--color-accent-ink)] disabled:opacity-50"
                  >
                    จับ CF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function LiveCaptureBoard() {
  const [pageProfile, setPageProfile] = useState('man_kynd')
  const pageProfiles = useMetaPageProfiles()
  const [source, setSource] = useState(null)
  const [status, setStatus] = useState('')

  async function loadLiveSources(nextPageProfile = pageProfile) {
    setStatus('กำลังตรวจ live stream จาก Meta')
    try {
      const result = await fetchLiveSources(nextPageProfile, 10)
      setSource(result)
      setStatus(result.mode ? 'ตรวจ source live แล้ว' : 'live_source_checked')
    } catch (error) {
      setStatus(error.message)
    }
  }

  useEffect(() => {
    loadLiveSources(pageProfile)
  }, [pageProfile])

  return (
    <section className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-ink)]">Live CF source</h2>
          <p className="mt-1 text-xs text-[var(--color-muted)]">ถ้า Meta API ยังไม่ให้ realtime stream จะใช้โพสต์ของไลฟ์เป็น capture source</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs font-semibold text-[var(--color-muted)]">
            เพจ
            <select
              value={pageProfile}
              onChange={(event) => setPageProfile(event.target.value)}
              className="min-w-44 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-sm text-[var(--color-ink)]"
            >
              {pageProfiles.map((page) => <option key={page.id} value={page.id}>{page.label}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={() => loadLiveSources()}
            className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]"
          >
            ตรวจ live
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Metric label="mode" value={source?.mode || status || '-'} />
        <Metric label="blocker" value={source?.blocker || 'none'} small />
      </div>
      <StatusLine value={status} />
      <div className="mt-4 divide-y divide-[var(--color-rule)] rounded-[var(--radius-md)] border border-[var(--color-rule)]">
        {(source?.posts || []).length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-[var(--color-muted)]">ยังไม่พบ fallback post</div>
        ) : source.posts.map((post) => (
          <div key={post.id} className="px-4 py-3">
            <div className="text-sm font-semibold text-[var(--color-ink)]">{post.message || post.id}</div>
            <div className="mt-1 text-xs text-[var(--color-muted)]">{post.id} · comments {post.commentCount ?? 0}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function MessageReport({ snapshot, onOpenChat }) {
  const today = new Date().toISOString().slice(0, 10)
  const [filters, setFilters] = useState({ from: '', to: '', pageId: '' })
  const [report, setReport] = useState(null)
  const [status, setStatus] = useState('')
  const pages = snapshot?.pages || []
  const csvHref = useMemo(() => {
    const params = new URLSearchParams({ format: 'csv' })
    if (filters.from) params.set('from', filters.from)
    if (filters.to) params.set('to', filters.to)
    if (filters.pageId) params.set('pageId', filters.pageId)
    return `/api/omni/reports/message-volume?${params.toString()}`
  }, [filters])

  async function loadReport(nextFilters = filters) {
    setStatus('กำลังโหลดรายงาน')
    try {
      const result = await fetchMessageVolumeReport(nextFilters)
      setReport(result)
      setStatus('โหลดรายงานแล้ว')
    } catch (error) {
      setStatus(error.message)
    }
  }

  useEffect(() => {
    loadReport(filters)
  }, [])

  const totals = report?.totals || { inbound: 0, outbound: 0, total: 0 }

  return (
    <main className="order-1 min-h-0 overflow-y-auto bg-[var(--color-paper)] p-4 lg:order-none lg:h-full lg:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-rule)] pb-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-ink)]">รายงานปริมาณการส่งข้อความ</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-2)]">Backend endpoint: /api/omni/reports/message-volume</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenChat}
            className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]"
          >
            กลับแชท
          </button>
          <a
            href={csvHref}
            className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]"
          >
            Export CSV
          </a>
        </div>
      </header>
      <section className="mt-4 flex flex-wrap items-end gap-2 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
        <label className="grid gap-1 text-xs font-semibold text-[var(--color-muted)]">
          From
          <input
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            placeholder={today}
            onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
            className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-sm text-[var(--color-ink)]"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-[var(--color-muted)]">
          To
          <input
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
            className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-sm text-[var(--color-ink)]"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-[var(--color-muted)]">
          Page
          <select
            value={filters.pageId}
            onChange={(event) => setFilters((current) => ({ ...current, pageId: event.target.value }))}
            className="min-w-40 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-sm text-[var(--color-ink)]"
          >
            <option value="">ทุกเพจ</option>
            {pages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}
          </select>
        </label>
        <button
          type="button"
          onClick={() => loadReport()}
          className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-ink)]"
        >
          Apply
        </button>
      </section>
      <StatusLine value={status} />
      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric label="รวมทั้งหมด" value={totals.total} />
        <Metric label="ข้อความเข้า" value={totals.inbound} />
        <Metric label="ข้อความออก" value={totals.outbound} />
      </section>
      <section className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
        <h2 className="text-sm font-bold text-[var(--color-ink)]">รายชั่วโมง</h2>
        <div className="mt-4 grid grid-cols-6 gap-2 text-center text-[11px] sm:grid-cols-8 lg:grid-cols-12">
          {(report?.byHour || []).map((row) => (
            <div key={row.hour} className="rounded-[var(--radius-sm)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-1 py-2">
              <div className="tabular-nums text-[var(--color-muted)]">{row.hour}:00</div>
              <div className="mt-1 text-xs font-bold tabular-nums text-[var(--color-ink)]">{row.total} msgs</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

function SettingsBoard({ onOpenChat }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [status, setStatus] = useState('')

  useEffect(() => {
    fetchOmniSettings()
      .then((data) => setSettings(mergeSettings(DEFAULT_SETTINGS, data || {})))
      .catch((error) => setStatus(error.message))
  }, [])

  function toggle(path) {
    setSettings((current) => {
      const next = mergeSettings(DEFAULT_SETTINGS, current)
      let target = next
      for (const key of path.slice(0, -1)) target = target[key]
      target[path[path.length - 1]] = !target[path[path.length - 1]]
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

  return (
    <main className="order-1 min-h-0 overflow-y-auto bg-[var(--color-paper)] p-4 lg:order-none lg:h-full lg:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-rule)] pb-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-ink)]">ตั้งค่าระบบ</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-2)]">Setting นี้บันทึกลง DB และ backend ใช้ gate Post/Live/AI/Order flow</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenChat}
            className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]"
          >
            กลับแชท
          </button>
          <button
            type="button"
            onClick={save}
            className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-ink)]"
          >
            บันทึก setting
          </button>
        </div>
      </header>
      <StatusLine value={status} />
      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <SettingsCard
          title="Post / Live CF"
          rows={[
            { label: 'Post CF enabled', checked: settings.postCf.enabled, onChange: () => toggle(['postCf', 'enabled']) },
            { label: 'Post auto-create draft', checked: settings.postCf.autoCreateDrafts, onChange: () => toggle(['postCf', 'autoCreateDrafts']) },
            { label: 'Live CF enabled', checked: settings.liveCf.enabled, onChange: () => toggle(['liveCf', 'enabled']) },
          ]}
        />
        <SettingsCard
          title="AI / Order"
          rows={[
            { label: 'AI enabled', checked: settings.ai.enabled, onChange: () => toggle(['ai', 'enabled']) },
            { label: 'Order draft enabled', checked: settings.orderDraft.enabled, onChange: () => toggle(['orderDraft', 'enabled']) },
            { label: 'Order approval required', checked: settings.orderDraft.approvalRequired, onChange: () => toggle(['orderDraft', 'approvalRequired']) },
            { label: 'Create ZORT on approve', checked: settings.orderDraft.createZortOrderOnApprove, onChange: () => toggle(['orderDraft', 'createZortOrderOnApprove']) },
          ]}
        />
      </section>
    </main>
  )
}

function SettingsCard({ title, rows }) {
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
      </div>
    </section>
  )
}

function Metric({ label, value, small = false }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
      <div className="text-xs font-semibold text-[var(--color-muted)]">{label}</div>
      <div className={`${small ? 'text-sm leading-6' : 'text-2xl'} mt-2 break-words font-bold tabular-nums text-[var(--color-ink)]`}>{value}</div>
    </div>
  )
}

function StatusLine({ value }) {
  if (!value) return null
  return <div className="px-4 py-3 text-xs font-semibold text-[var(--color-muted)]">{value}</div>
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
}

function useMetaPageProfiles() {
  const [profiles, setProfiles] = useState(FALLBACK_PAGE_PROFILES)
  useEffect(() => {
    let ignore = false
    fetchConnections()
      .then((payload) => {
        const seen = new Set()
        const next = (payload.connections || [])
          .filter((connection) => connection.provider === 'meta' && connection.pageProfile)
          .map((connection) => ({
            id: connection.pageProfile,
            label: connection.title?.replace(/^Meta\s*·\s*/, '') || connection.pageProfile,
          }))
          .filter((profile) => {
            if (seen.has(profile.id)) return false
            seen.add(profile.id)
            return true
          })
        if (!ignore && next.length) setProfiles(next)
      })
      .catch(() => {})
    return () => { ignore = true }
  }, [])
  return profiles
}

function mergeSettings(base, input) {
  return {
    ...base,
    ...input,
    postCf: { ...base.postCf, ...(input.postCf || {}) },
    liveCf: { ...base.liveCf, ...(input.liveCf || {}) },
    orderDraft: { ...base.orderDraft, ...(input.orderDraft || {}) },
    ai: { ...base.ai, ...(input.ai || {}) },
  }
}
