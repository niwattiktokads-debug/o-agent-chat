import React, { useEffect, useMemo, useState } from 'react'
import { deleteKnowledgeSource, fetchKnowledgeSources, fetchOmniSnapshot, saveKnowledgeSource } from '../../lib/omniApi.js'

const trainMenu = ['Overview', 'Instructions', 'Knowledge Source', 'Testing', 'Deploy']

const EMPTY_FORM = {
  id: '',
  title: '',
  type: 'manual',
  scope: 'all_pages',
  content: '',
  tags: '',
}

const DEFAULT_INSTRUCTIONS = [
  'ตอบลูกค้าด้วยข้อมูลจาก Knowledge Source ก่อนเสมอ',
  'ถ้าเป็นเรื่องออเดอร์ ชำระเงิน คืนเงิน หรือเลขพัสดุ ให้เช็กข้อมูลก่อนตอบ',
  'ถ้าไม่มีข้อมูลพอ ให้ร่างคำตอบแบบขอข้อมูลเพิ่มและไม่ auto-send',
].join('\n')

function formatUpdated(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function labelStatus(status) {
  if (status === 'ready') return 'Ready'
  if (status === 'training') return 'Training'
  if (status === 'needs_review') return 'Needs review'
  return 'Archived'
}

function statusClass(status) {
  if (status === 'ready') return 'bg-[var(--color-live-soft)] text-[var(--color-live)]'
  if (status === 'needs_review') return 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
  return 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]'
}

function termsFrom(value) {
  const raw = String(value || '').toLowerCase()
  const terms = raw
    .toLowerCase()
    .split(/[\s,.;:!?()[\]{}"'<>/\\|]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1)
  const thaiKeywords = ['สินค้า', 'ของ', 'ไซซ์', 'สี', 'พร้อมส่ง', 'ราคา', 'โปร', 'เปลี่ยน', 'คืน', 'คืนเงิน', 'พัสดุ', 'เลข', 'ชำระ', 'จ่าย', 'โอน', 'ออเดอร์']
  for (const keyword of thaiKeywords) {
    if (raw.includes(keyword)) terms.push(keyword)
  }
  return [...new Set(terms)]
}

function sourceMatchesPrompt(source, prompt, scope = '') {
  if (scope && scope !== 'all_pages' && source.scope !== 'all_pages' && source.scope !== scope) return false
  const haystack = [source.title, source.content, source.scope, ...(source.tags || [])].join(' ').toLowerCase()
  const terms = termsFrom(prompt)
  if (!terms.length) return true
  return terms.some((term) => haystack.includes(term))
}

function buildTestAnswer(source, prompt) {
  if (!source) {
    return {
      status: 'needs_review',
      title: 'No matching source',
      answer: 'ยังไม่พบ knowledge source ที่ตรงกับคำถามนี้ ควรเพิ่มข้อมูลก่อนให้ AI ตอบลูกค้า',
    }
  }

  return {
    status: source.status === 'ready' ? 'ready' : 'needs_review',
    title: source.title,
    answer: source.status === 'ready'
      ? `ใช้ข้อมูลจาก "${source.title}" ตอบได้: ${source.content}`
      : `เจอข้อมูล "${source.title}" แต่สถานะยังไม่พร้อม ต้องตรวจทานก่อนใช้ตอบจริง`,
    prompt,
  }
}

export default function AiKnowledgeSourcePage({ onOpenInbox, onOpenChat, onOpenConnections, showPageNav = true }) {
  const [sources, setSources] = useState([])
  const [pages, setPages] = useState([])
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [activeSection, setActiveSection] = useState('Knowledge Source')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS)
  const [testPrompt, setTestPrompt] = useState('ลูกค้าถามว่าสินค้ายังเปลี่ยนคืนได้ไหม')
  const [testScope, setTestScope] = useState('all_pages')
  const [testResult, setTestResult] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  useEffect(() => {
    let ignore = false
    setBusy(true)
    setError('')
    Promise.all([
      fetchKnowledgeSources(),
      fetchOmniSnapshot().catch(() => ({ pages: [] })),
    ])
      .then(([nextSources, snapshot]) => {
        if (!ignore) {
          setSources(nextSources)
          setPages(snapshot.pages || [])
        }
      })
      .catch((err) => {
        if (!ignore) setError(err.message || 'knowledge_load_failed')
      })
      .finally(() => {
        if (!ignore) setBusy(false)
      })
    return () => {
      ignore = true
    }
  }, [])

  async function loadSources(search = query, type = typeFilter) {
    setBusy(true)
    setError('')
    try {
      setSources(await fetchKnowledgeSources({ query: search, type }))
    } catch (err) {
      setError(err.message || 'knowledge_load_failed')
    } finally {
      setBusy(false)
    }
  }

  function focusForm() {
    window.setTimeout(() => document.getElementById('knowledge-title')?.focus(), 0)
  }

  function startNewSource() {
    setActiveSection('Knowledge Source')
    setForm(EMPTY_FORM)
    setError('')
    setNotice('พร้อมเพิ่ม knowledge source ใหม่')
    focusForm()
  }

  function editSource(row) {
    setActiveSection('Knowledge Source')
    setForm({
      id: row.id,
      title: row.title,
      type: row.type,
      scope: row.scope,
      content: row.content,
      tags: (row.tags || []).join(', '),
    })
    setError('')
    setNotice(`กำลังแก้ไข: ${row.title}`)
    focusForm()
  }

  async function submitSource(event) {
    event.preventDefault()
    if (!form.title.trim() || !form.content.trim()) {
      setError('ต้องใส่หัวข้อและเนื้อหา knowledge ก่อนบันทึก')
      return
    }

    setBusy(true)
    setError('')
    setNotice('')
    try {
      const saved = await saveKnowledgeSource(form)
      await loadSources(query, typeFilter)
      setForm(EMPTY_FORM)
      setNotice(`บันทึกแล้ว: ${saved.source?.title || form.title}`)
    } catch (err) {
      setError(err.message || 'knowledge_save_failed')
    } finally {
      setBusy(false)
    }
  }

  async function removeSource(sourceId) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await deleteKnowledgeSource(sourceId)
      await loadSources(query, typeFilter)
      if (form.id === sourceId) setForm(EMPTY_FORM)
      setNotice('ลบ knowledge source แล้ว')
    } catch (err) {
      setError(err.message || 'knowledge_delete_failed')
    } finally {
      setBusy(false)
    }
  }

  function runTest(prompt = testPrompt, scope = testScope, forcedSource = null) {
    const source = forcedSource || sources.find((item) => sourceMatchesPrompt(item, prompt, scope))
    setActiveSection('Testing')
    setTestPrompt(prompt)
    setTestScope(scope)
    setTestResult(buildTestAnswer(source, prompt))
  }

  function runSourceTest(row) {
    const prompt = row.tags?.length
      ? `ลูกค้าถามเรื่อง ${row.tags[0]}`
      : `ลูกค้าถามเรื่อง ${row.title}`
    runTest(prompt, row.scope || 'all_pages', row)
  }

  const stats = useMemo(() => {
    const ready = sources.filter((source) => source.status === 'ready').length
    const needsReview = sources.filter((source) => source.status === 'needs_review' || source.status === 'training').length
    const characters = sources.reduce((sum, source) => sum + String(source.content || '').length, 0)
    return { total: sources.length, ready, needsReview, characters, quota: 7500000 }
  }, [sources])

  const visibleSources = sources
  const latestSources = sources.slice(0, 3)

  return (
    <main className="h-full min-w-0 overflow-y-auto bg-[var(--color-paper)] p-4 text-[var(--color-ink)] lg:p-6">
      <section className="min-w-0">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-rule)] pb-4">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-ink)]">สอน AI</h1>
            <p className="mt-1 text-sm text-[var(--color-ink-2)]">จัดการ Knowledge Source, instruction, testing และ deploy readiness ในดีไซน์เดียวกับ Settings</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {showPageNav ? (
              <>
                <button type="button" className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]" onClick={onOpenInbox}>Inbox</button>
                <button type="button" className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]" onClick={onOpenConnections}>Connections</button>
                <button type="button" className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]" onClick={onOpenChat}>Chat</button>
              </>
            ) : null}
            <button type="button" className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-ink)]" onClick={startNewSource}>Add source</button>
          </div>
        </header>

        <div className="mt-4 grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="h-fit rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
            <p className="mb-3 text-xs font-bold text-[var(--color-muted)]">Training</p>
            <div className="space-y-1">
              {trainMenu.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`w-full rounded-[var(--radius-md)] px-3 py-2.5 text-left text-sm font-semibold ${item === activeSection ? 'bg-[var(--color-accent)] text-[var(--color-accent-ink)]' : 'text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]'}`}
                  onClick={() => setActiveSection(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-3">
              <div className="text-sm font-bold text-[var(--color-ink)]">AI training status</div>
              <div className="mt-1 text-xs leading-5 text-[var(--color-muted)]">{stats.total} sources · {stats.ready} ready · {stats.needsReview} review</div>
              <div className="mt-3 h-2 rounded-[var(--radius-pill)] bg-[var(--color-panel)]">
                <div className="h-2 rounded-[var(--radius-pill)] bg-[var(--color-accent)]" style={{ width: `${stats.total ? Math.round((stats.ready / stats.total) * 100) : 0}%` }} />
              </div>
            </div>
          </aside>

          <section className="min-w-0">
            <div>
              {notice ? <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-live)] bg-[var(--color-live-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-live)]">{notice}</div> : null}
              {error ? <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-danger)]">{error}</div> : null}

              {activeSection === 'Overview' ? (
                <div className="grid gap-5">
                  <HeroCard stats={stats} onNew={startNewSource} />
                  <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
                    <h3 className="text-sm font-bold text-[var(--color-ink)]">ล่าสุดที่ AI ใช้ตอบได้</h3>
                    <div className="mt-3 divide-y divide-[var(--color-rule)]">
                      {latestSources.map((source) => (
                        <SourceMiniRow key={source.id} source={source} onTest={() => runSourceTest(source)} />
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {activeSection === 'Instructions' ? (
                <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
                  <h3 className="text-sm font-bold text-[var(--color-ink)]">Instructions</h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-ink-2)]">กติกาพื้นฐานที่ AI ต้องยึดก่อนหยิบ knowledge source ไปตอบลูกค้า</p>
                  <textarea
                    className="mt-4 min-h-[260px] w-full rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm leading-6 text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
                    value={instructions}
                    onChange={(event) => setInstructions(event.target.value)}
                  />
                  <button type="button" className="mt-4 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-ink)]" onClick={() => setNotice('บันทึก instruction ในหน้า local แล้ว')}>
                    Save instructions
                  </button>
                </div>
              ) : null}

              {activeSection === 'Knowledge Source' ? (
                <>
                  <HeroCard stats={stats} onNew={startNewSource} />
                  <KnowledgeSourceEditor
                    busy={busy}
                    form={form}
                    setForm={setForm}
                    pages={pages}
                    submitSource={submitSource}
                    startNewSource={startNewSource}
                  />
                  <KnowledgeSourceList
                    busy={busy}
                    query={query}
                    setQuery={setQuery}
                    typeFilter={typeFilter}
                    setTypeFilter={setTypeFilter}
                    loadSources={loadSources}
                    sources={visibleSources}
                    editSource={editSource}
                    runSourceTest={runSourceTest}
                    removeSource={removeSource}
                  />
                </>
              ) : null}

              {activeSection === 'Testing' ? (
                <TestingPanel
                  sources={sources}
                  testPrompt={testPrompt}
                  setTestPrompt={setTestPrompt}
                  testScope={testScope}
                  setTestScope={setTestScope}
                  testResult={testResult}
                  onRun={() => runTest(testPrompt, testScope)}
                />
              ) : null}

              {activeSection === 'Deploy' ? (
                <DeployPanel stats={stats} onOpenInbox={onOpenInbox} />
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

function HeroCard({ stats, onNew }) {
  const quotaPercent = stats.quota ? Math.min(100, Math.round((stats.characters / stats.quota) * 100)) : 0
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-[var(--color-ink)]">Knowledge Source</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--color-ink-2)]">
            Add trusted information for the AI chatbot to answer customers across Facebook, TikTok, Shopee, and order chats.
          </p>
        </div>
        <button type="button" className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-ink)]" onClick={onNew}>+ New knowledge</button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Knowledge items', String(stats.total)],
          ['Ready to answer', String(stats.ready)],
          ['Needs review', String(stats.needsReview)],
          ['Characters', `${stats.characters.toLocaleString('en-US')} / ${stats.quota.toLocaleString('en-US')}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-3">
            <p className="text-xs font-semibold text-[var(--color-muted)]">{label}</p>
            <p className="mt-2 text-lg font-bold text-[var(--color-ink)]">{value}</p>
            {label === 'Characters' ? (
              <div className="mt-3 h-2 rounded-[var(--radius-pill)] bg-[var(--color-panel)]">
                <div className="h-2 rounded-[var(--radius-pill)] bg-[var(--color-accent)]" style={{ width: `${quotaPercent}%` }} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function KnowledgeSourceEditor({ busy, form, setForm, pages = [], submitSource, startNewSource }) {
  return (
    <form className="mt-4 grid gap-3 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-4" onSubmit={submitSource}>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px_180px]">
        <input
          id="knowledge-title"
          className="h-10 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 text-sm text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
          placeholder="Knowledge title"
          value={form.title}
          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
        />
        <select
          className="h-10 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 text-sm text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
          value={form.type}
          onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
        >
          <option value="manual">Manual</option>
          <option value="website">Website</option>
          <option value="file">File</option>
          <option value="faq">FAQ</option>
          <option value="order_policy">Order policy</option>
        </select>
        <select
          className="h-10 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 text-sm text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
          value={form.scope}
          onChange={(event) => setForm((current) => ({ ...current, scope: event.target.value }))}
        >
          <option value="all_pages">All pages</option>
          {pages.map((page) => (
            <option key={page.id} value={page.id}>{page.name}</option>
          ))}
        </select>
      </div>
      <textarea
        className="min-h-[92px] rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm leading-6 text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
        placeholder="Paste trusted answer, policy, product FAQ, or instruction for the AI"
        value={form.content}
        onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
      />
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="h-10 min-w-[220px] flex-1 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 text-sm text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
          placeholder="Tags, comma separated"
          value={form.tags}
          onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
        />
        {form.id ? (
          <button type="button" className="h-10 rounded-[var(--radius-md)] border border-[var(--color-rule)] px-3 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-panel-2)]" onClick={startNewSource}>
            Cancel
          </button>
        ) : null}
        <button type="submit" className="h-10 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 text-sm font-semibold text-[var(--color-accent-ink)] disabled:opacity-50" disabled={busy}>
          {busy ? 'Saving' : form.id ? 'Update source' : 'Save source'}
        </button>
      </div>
    </form>
  )
}

function KnowledgeSourceList({ busy, query, setQuery, typeFilter, setTypeFilter, loadSources, sources, editSource, runSourceTest, removeSource }) {
  return (
    <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-rule)] px-4 py-3">
        <div className="flex rounded-[var(--radius-md)] bg-[var(--color-panel-2)] p-1 text-sm font-semibold text-[var(--color-ink-2)]">
          {[
            ['All', ''],
            ['Website', 'website'],
            ['Files', 'file'],
            ['Manual', 'manual'],
          ].map(([label, value]) => (
            <button
              key={label}
              type="button"
              className={`rounded-[var(--radius-sm)] px-3 py-2 ${typeFilter === value ? 'bg-[var(--color-panel)] text-[var(--color-ink)]' : ''}`}
              onClick={() => {
                setTypeFilter(value)
                loadSources(query, value)
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <input
            id="knowledge-search"
            className="h-10 w-72 max-w-full rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 text-sm text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
            placeholder="Search knowledge"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') loadSources(event.currentTarget.value)
            }}
          />
          <button type="button" className="h-10 rounded-[var(--radius-md)] border border-[var(--color-rule)] px-3 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-panel-2)]" onClick={() => loadSources(query)}>Search</button>
        </div>
      </div>

      <div className="divide-y divide-[var(--color-rule)]">
        {sources.map((row) => (
          <article key={row.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_110px_160px_120px_170px] lg:items-center">
            <div>
              <p className="font-bold text-[var(--color-ink)]">{row.title}</p>
              <p className="mt-1 line-clamp-1 text-sm text-[var(--color-muted)]">{row.type} · {row.scope}</p>
            </div>
            <span className="text-sm text-[var(--color-ink-2)]">{String(row.content || '').length.toLocaleString('en-US')} chars</span>
            <span className="text-sm text-[var(--color-ink-2)]">{formatUpdated(row.updatedAt)}</span>
            <span className={`w-fit rounded-[var(--radius-pill)] px-2 py-1 text-xs font-semibold ${statusClass(row.status)}`}>{labelStatus(row.status)}</span>
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-[var(--radius-sm)] border border-[var(--color-rule)] px-3 py-1.5 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-panel-2)]" onClick={() => editSource(row)}>Edit</button>
              <button type="button" className="rounded-[var(--radius-sm)] border border-[var(--color-rule)] px-3 py-1.5 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-panel-2)]" onClick={() => runSourceTest(row)}>Test</button>
              <button type="button" className="rounded-[var(--radius-sm)] border border-[var(--color-danger)] px-3 py-1.5 text-sm font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] disabled:opacity-50" disabled={busy} onClick={() => removeSource(row.id)}>Delete</button>
            </div>
          </article>
        ))}
        {!sources.length ? <div className="px-4 py-8 text-sm text-[var(--color-muted)]">No knowledge sources found.</div> : null}
      </div>
    </div>
  )
}

function SourceMiniRow({ source, onTest }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="font-bold text-[var(--color-ink)]">{source.title}</p>
        <p className="mt-1 text-sm text-[var(--color-muted)]">{source.type} · {source.scope} · {formatUpdated(source.updatedAt)}</p>
      </div>
      <button type="button" className="rounded-[var(--radius-sm)] border border-[var(--color-rule)] px-3 py-1.5 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-panel-2)]" onClick={onTest}>Test</button>
    </div>
  )
}

function TestingPanel({ sources, testPrompt, setTestPrompt, testScope, setTestScope, testResult, onRun }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
      <h3 className="text-sm font-bold text-[var(--color-ink)]">Testing</h3>
      <p className="mt-1 text-sm leading-6 text-[var(--color-ink-2)]">ลองถามเหมือนลูกค้าจริง เพื่อดูว่า AI เจอ source ไหนและควรตอบอย่างไร</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto]">
        <input
          className="h-10 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 text-sm text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
          value={testPrompt}
          onChange={(event) => setTestPrompt(event.target.value)}
          placeholder="เช่น มีของไหม / เปลี่ยนคืนได้ไหม / ขอเลขพัสดุ"
        />
        <input
          className="h-10 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 text-sm text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
          value={testScope}
          onChange={(event) => setTestScope(event.target.value)}
          placeholder="all_pages"
        />
        <button type="button" className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 text-sm font-semibold text-[var(--color-accent-ink)]" onClick={onRun}>Run test</button>
      </div>

      <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-4">
        {testResult ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <p className="font-bold text-[var(--color-ink)]">{testResult.title}</p>
              <span className={`rounded-[var(--radius-pill)] px-2 py-1 text-xs font-semibold ${statusClass(testResult.status)}`}>{labelStatus(testResult.status)}</span>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[var(--color-ink-2)]">{testResult.answer}</p>
          </>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">{sources.length} sources พร้อมให้ทดสอบ กด Run test หรือกด Test จากรายการ knowledge source</p>
        )}
      </div>
    </div>
  )
}

function DeployPanel({ stats, onOpenInbox }) {
  const ready = stats.total > 0 && stats.ready > 0
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
      <h3 className="text-sm font-bold text-[var(--color-ink)]">Deploy</h3>
      <p className="mt-1 text-sm leading-6 text-[var(--color-ink-2)]">สถานะสำหรับนำชุดความรู้ไปใช้กับ AI ใน Omni inbox</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-3">
          <p className="text-xs font-semibold text-[var(--color-muted)]">Local AI training</p>
          <p className="mt-2 text-lg font-bold text-[var(--color-ink)]">{ready ? 'Ready' : 'Needs source'}</p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-3">
          <p className="text-xs font-semibold text-[var(--color-muted)]">Ready sources</p>
          <p className="mt-2 text-lg font-bold text-[var(--color-ink)]">{stats.ready}</p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-3">
          <p className="text-xs font-semibold text-[var(--color-muted)]">Cloud deploy</p>
          <p className="mt-2 text-lg font-bold text-[var(--color-ink)]">Pending</p>
        </div>
      </div>
      <button type="button" className="mt-4 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-ink)]" onClick={onOpenInbox}>Open inbox</button>
    </div>
  )
}
