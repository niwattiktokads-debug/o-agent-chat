import React, { useEffect, useMemo, useState } from 'react'
import { deleteKnowledgeSource, fetchKnowledgeSources, fetchOmniSnapshot, saveKnowledgeSource } from '../../lib/omniApi.js'

const navItems = [
  ['Inbox', '12'],
  ['AI Chatbot', ''],
  ['Customers', ''],
  ['Broadcast', ''],
  ['Analytics', ''],
  ['Settings', ''],
]

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
  if (status === 'ready') return 'bg-[#e8faf6] text-[#0f8f7b]'
  if (status === 'needs_review') return 'bg-rose-50 text-rose-600'
  return 'bg-[#fff3df] text-[#b7791f]'
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

export default function AiKnowledgeSourcePage({ onOpenInbox, onOpenChat, onOpenConnections }) {
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

  function handleNav(label) {
    if (label === 'Inbox') {
      onOpenInbox?.()
      return
    }
    if (label === 'AI Chatbot') {
      setActiveSection('Knowledge Source')
      return
    }
    setNotice(`${label} ยังเป็นเมนู placeholder ของหน้า Zaapi-style ตอนนี้ใช้งานหลักอยู่ที่ AI Chatbot`)
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
    <div className="flex h-full min-w-[1200px] bg-[#f6f8fb] text-[#17211e]">
      <aside className="flex w-[68px] flex-col items-center border-r border-[#e5e9ef] bg-white py-4">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#0f8f7b] text-sm font-bold text-white shadow-sm">OA</div>
        <div className="mt-8 flex flex-1 flex-col gap-5 text-[#9aa5b1]">
          {['⌂', '▦', '○', '✦', '↗', '⚙'].map((item, index) => (
            <button
              key={item}
              type="button"
              className="grid h-9 w-9 place-items-center rounded-xl text-lg hover:bg-[#f1f5f7]"
              onClick={() => handleNav(navItems[index]?.[0] || 'Settings')}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="grid h-9 w-9 place-items-center rounded-full bg-[#ffe9db] text-sm">B</div>
      </aside>

      <aside className="w-[248px] border-r border-[#e5e9ef] bg-white px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#9aa5b1]">Workspace</p>
            <h1 className="mt-1 text-lg font-bold text-[#17211e]">O Agent</h1>
          </div>
          <button type="button" className="grid h-9 w-9 place-items-center rounded-xl border border-[#e5e9ef] text-[#66737f]" onClick={() => document.getElementById('knowledge-search')?.focus()}>⌕</button>
        </div>

        <nav className="mt-7 space-y-1">
          {navItems.map(([label, badge]) => (
            <button
              key={label}
              type="button"
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${label === 'AI Chatbot' ? 'bg-[#e8faf6] text-[#0f8f7b]' : 'text-[#52606b] hover:bg-[#f6f8fb]'}`}
              onClick={() => handleNav(label)}
            >
              <span>{label}</span>
              {badge ? <span className="rounded-full bg-[#ecf1f4] px-2 py-0.5 text-xs text-[#66737f]">{badge}</span> : null}
            </button>
          ))}
        </nav>

        <div className="mt-8 rounded-2xl border border-[#dcefe9] bg-[#f1fbf8] p-4">
          <p className="text-sm font-bold text-[#153d35]">AI training status</p>
          <p className="mt-1 text-xs leading-5 text-[#5f746e]">{stats.total} sources connected. Auto-retrain is enabled for new customer answers.</p>
          <div className="mt-3 h-2 rounded-full bg-white">
            <div className="h-2 rounded-full bg-[#0f8f7b]" style={{ width: `${stats.total ? Math.round((stats.ready / stats.total) * 100) : 0}%` }} />
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="flex h-[72px] items-center justify-between border-b border-[#e5e9ef] bg-white px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#9aa5b1]">AI Chatbot</p>
            <h2 className="text-xl font-bold">Train knowledge source</h2>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-xl border border-[#dce3e8] bg-white px-4 py-2 text-sm font-semibold text-[#52606b]" onClick={onOpenInbox}>Inbox</button>
            <button type="button" className="rounded-xl border border-[#dce3e8] bg-white px-4 py-2 text-sm font-semibold text-[#52606b]" onClick={onOpenConnections}>Connections</button>
            <button type="button" className="rounded-xl border border-[#dce3e8] bg-white px-4 py-2 text-sm font-semibold text-[#52606b]" onClick={onOpenChat}>Chat</button>
            <button type="button" className="rounded-xl bg-[#0f8f7b] px-4 py-2 text-sm font-bold text-white shadow-sm" onClick={startNewSource}>Add source</button>
          </div>
        </header>

        <div className="grid h-[calc(100%-72px)] grid-cols-[260px_1fr]">
          <aside className="border-r border-[#e5e9ef] bg-[#fbfcfd] p-5">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[#9aa5b1]">Training</p>
            <div className="space-y-1">
              {trainMenu.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${item === activeSection ? 'bg-white text-[#0f8f7b] shadow-sm ring-1 ring-[#e5e9ef]' : 'text-[#66737f] hover:bg-white'}`}
                  onClick={() => setActiveSection(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </aside>

          <section className="overflow-y-auto p-7">
            <div className="mx-auto max-w-5xl">
              {notice ? <div className="mb-4 rounded-2xl border border-[#dcefe9] bg-[#f1fbf8] px-4 py-3 text-sm font-semibold text-[#153d35]">{notice}</div> : null}
              {error ? <div className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</div> : null}

              {activeSection === 'Overview' ? (
                <div className="grid gap-5">
                  <HeroCard stats={stats} onNew={startNewSource} />
                  <div className="rounded-3xl border border-[#e5e9ef] bg-white p-5 shadow-sm">
                    <h3 className="text-lg font-bold">ล่าสุดที่ AI ใช้ตอบได้</h3>
                    <div className="mt-4 divide-y divide-[#eef2f5]">
                      {latestSources.map((source) => (
                        <SourceMiniRow key={source.id} source={source} onTest={() => runSourceTest(source)} />
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {activeSection === 'Instructions' ? (
                <div className="rounded-3xl border border-[#e5e9ef] bg-white p-6 shadow-sm">
                  <h3 className="text-2xl font-bold tracking-tight">Instructions</h3>
                  <p className="mt-2 text-sm leading-6 text-[#66737f]">กติกาพื้นฐานที่ AI ต้องยึดก่อนหยิบ knowledge source ไปตอบลูกค้า</p>
                  <textarea
                    className="mt-5 min-h-[260px] w-full rounded-2xl border border-[#dce3e8] px-4 py-3 text-sm leading-6 outline-none focus:border-[#0f8f7b]"
                    value={instructions}
                    onChange={(event) => setInstructions(event.target.value)}
                  />
                  <button type="button" className="mt-4 rounded-xl bg-[#0f8f7b] px-4 py-2 text-sm font-bold text-white" onClick={() => setNotice('บันทึก instruction ในหน้า local แล้ว')}>
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
      </main>
    </div>
  )
}

function HeroCard({ stats, onNew }) {
  const quotaPercent = stats.quota ? Math.min(100, Math.round((stats.characters / stats.quota) * 100)) : 0
  return (
    <div className="rounded-3xl border border-[#e5e9ef] bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Knowledge Source</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66737f]">
            Add trusted information for the AI chatbot to answer customers across Facebook, TikTok, Shopee, and order chats.
          </p>
        </div>
        <button type="button" className="rounded-xl bg-[#0f8f7b] px-4 py-2.5 text-sm font-bold text-white shadow-sm" onClick={onNew}>+ New knowledge</button>
      </div>

      <div className="mt-6 grid grid-cols-4 gap-3">
        {[
          ['Knowledge items', String(stats.total)],
          ['Ready to answer', String(stats.ready)],
          ['Needs review', String(stats.needsReview)],
          ['Characters', `${stats.characters.toLocaleString('en-US')} / ${stats.quota.toLocaleString('en-US')}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-[#e5e9ef] bg-[#fbfcfd] p-4">
            <p className="text-xs font-semibold text-[#8a96a3]">{label}</p>
            <p className="mt-2 text-2xl font-bold">{value}</p>
            {label === 'Characters' ? (
              <div className="mt-3 h-2 rounded-full bg-white">
                <div className="h-2 rounded-full bg-[#0f8f7b]" style={{ width: `${quotaPercent}%` }} />
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
    <form className="mt-5 grid gap-3 rounded-3xl border border-[#e5e9ef] bg-white px-5 py-4 shadow-sm" onSubmit={submitSource}>
      <div className="grid grid-cols-[1fr_150px_180px] gap-3">
        <input
          id="knowledge-title"
          className="h-11 rounded-xl border border-[#dce3e8] px-3 text-sm outline-none focus:border-[#0f8f7b]"
          placeholder="Knowledge title"
          value={form.title}
          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
        />
        <select
          className="h-11 rounded-xl border border-[#dce3e8] px-3 text-sm outline-none focus:border-[#0f8f7b]"
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
          className="h-11 rounded-xl border border-[#dce3e8] px-3 text-sm outline-none focus:border-[#0f8f7b]"
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
        className="min-h-[92px] rounded-xl border border-[#dce3e8] px-3 py-2 text-sm leading-6 outline-none focus:border-[#0f8f7b]"
        placeholder="Paste trusted answer, policy, product FAQ, or instruction for the AI"
        value={form.content}
        onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
      />
      <div className="flex items-center gap-3">
        <input
          className="h-10 flex-1 rounded-xl border border-[#dce3e8] px-3 text-sm outline-none focus:border-[#0f8f7b]"
          placeholder="Tags, comma separated"
          value={form.tags}
          onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
        />
        {form.id ? (
          <button type="button" className="h-10 rounded-xl border border-[#dce3e8] px-4 text-sm font-bold text-[#52606b]" onClick={startNewSource}>
            Cancel
          </button>
        ) : null}
        <button type="submit" className="h-10 rounded-xl bg-[#0f8f7b] px-4 text-sm font-bold text-white disabled:opacity-50" disabled={busy}>
          {busy ? 'Saving' : form.id ? 'Update source' : 'Save source'}
        </button>
      </div>
    </form>
  )
}

function KnowledgeSourceList({ busy, query, setQuery, typeFilter, setTypeFilter, loadSources, sources, editSource, runSourceTest, removeSource }) {
  return (
    <div className="mt-5 rounded-3xl border border-[#e5e9ef] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#eef2f5] px-5 py-4">
        <div className="flex rounded-xl bg-[#f3f6f8] p-1 text-sm font-semibold text-[#66737f]">
          {[
            ['All', ''],
            ['Website', 'website'],
            ['Files', 'file'],
            ['Manual', 'manual'],
          ].map(([label, value]) => (
            <button
              key={label}
              type="button"
              className={`rounded-lg px-4 py-2 ${typeFilter === value ? 'bg-white text-[#17211e] shadow-sm' : ''}`}
              onClick={() => {
                setTypeFilter(value)
                loadSources(query, value)
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            id="knowledge-search"
            className="h-10 w-72 rounded-xl border border-[#dce3e8] px-3 text-sm outline-none focus:border-[#0f8f7b]"
            placeholder="Search knowledge"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') loadSources(event.currentTarget.value)
            }}
          />
          <button type="button" className="h-10 rounded-xl border border-[#dce3e8] px-3 text-sm font-semibold text-[#52606b]" onClick={() => loadSources(query)}>Search</button>
        </div>
      </div>

      <div className="divide-y divide-[#eef2f5]">
        {sources.map((row) => (
          <article key={row.id} className="grid grid-cols-[1fr_110px_160px_120px_170px] items-center gap-4 px-5 py-4">
            <div>
              <p className="font-bold text-[#17211e]">{row.title}</p>
              <p className="mt-1 line-clamp-1 text-sm text-[#8a96a3]">{row.type} · {row.scope}</p>
            </div>
            <span className="text-sm text-[#66737f]">{String(row.content || '').length.toLocaleString('en-US')} chars</span>
            <span className="text-sm text-[#66737f]">{formatUpdated(row.updatedAt)}</span>
            <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${statusClass(row.status)}`}>{labelStatus(row.status)}</span>
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-[#dce3e8] px-3 py-1.5 text-sm font-semibold text-[#52606b]" onClick={() => editSource(row)}>Edit</button>
              <button type="button" className="rounded-lg border border-[#dce3e8] px-3 py-1.5 text-sm font-semibold text-[#52606b]" onClick={() => runSourceTest(row)}>Test</button>
              <button type="button" className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-semibold text-rose-600 disabled:opacity-50" disabled={busy} onClick={() => removeSource(row.id)}>Delete</button>
            </div>
          </article>
        ))}
        {!sources.length ? <div className="px-5 py-8 text-sm text-[#66737f]">No knowledge sources found.</div> : null}
      </div>
    </div>
  )
}

function SourceMiniRow({ source, onTest }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="font-bold text-[#17211e]">{source.title}</p>
        <p className="mt-1 text-sm text-[#8a96a3]">{source.type} · {source.scope} · {formatUpdated(source.updatedAt)}</p>
      </div>
      <button type="button" className="rounded-lg border border-[#dce3e8] px-3 py-1.5 text-sm font-semibold text-[#52606b]" onClick={onTest}>Test</button>
    </div>
  )
}

function TestingPanel({ sources, testPrompt, setTestPrompt, testScope, setTestScope, testResult, onRun }) {
  return (
    <div className="rounded-3xl border border-[#e5e9ef] bg-white p-6 shadow-sm">
      <h3 className="text-2xl font-bold tracking-tight">Testing</h3>
      <p className="mt-2 text-sm leading-6 text-[#66737f]">ลองถามเหมือนลูกค้าจริง เพื่อดูว่า AI เจอ source ไหนและควรตอบอย่างไร</p>
      <div className="mt-5 grid grid-cols-[1fr_180px_auto] gap-3">
        <input
          className="h-11 rounded-xl border border-[#dce3e8] px-3 text-sm outline-none focus:border-[#0f8f7b]"
          value={testPrompt}
          onChange={(event) => setTestPrompt(event.target.value)}
          placeholder="เช่น มีของไหม / เปลี่ยนคืนได้ไหม / ขอเลขพัสดุ"
        />
        <input
          className="h-11 rounded-xl border border-[#dce3e8] px-3 text-sm outline-none focus:border-[#0f8f7b]"
          value={testScope}
          onChange={(event) => setTestScope(event.target.value)}
          placeholder="all_pages"
        />
        <button type="button" className="rounded-xl bg-[#0f8f7b] px-4 text-sm font-bold text-white" onClick={onRun}>Run test</button>
      </div>

      <div className="mt-6 rounded-2xl border border-[#e5e9ef] bg-[#fbfcfd] p-5">
        {testResult ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <p className="font-bold">{testResult.title}</p>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(testResult.status)}`}>{labelStatus(testResult.status)}</span>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#52606b]">{testResult.answer}</p>
          </>
        ) : (
          <p className="text-sm text-[#66737f]">{sources.length} sources พร้อมให้ทดสอบ กด Run test หรือกด Test จากรายการ knowledge source</p>
        )}
      </div>
    </div>
  )
}

function DeployPanel({ stats, onOpenInbox }) {
  const ready = stats.total > 0 && stats.ready > 0
  return (
    <div className="rounded-3xl border border-[#e5e9ef] bg-white p-6 shadow-sm">
      <h3 className="text-2xl font-bold tracking-tight">Deploy</h3>
      <p className="mt-2 text-sm leading-6 text-[#66737f]">สถานะสำหรับนำชุดความรู้ไปใช้กับ AI ใน Omni inbox</p>
      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-[#e5e9ef] bg-[#fbfcfd] p-4">
          <p className="text-xs font-semibold text-[#8a96a3]">Local AI training</p>
          <p className="mt-2 text-lg font-bold">{ready ? 'Ready' : 'Needs source'}</p>
        </div>
        <div className="rounded-2xl border border-[#e5e9ef] bg-[#fbfcfd] p-4">
          <p className="text-xs font-semibold text-[#8a96a3]">Ready sources</p>
          <p className="mt-2 text-lg font-bold">{stats.ready}</p>
        </div>
        <div className="rounded-2xl border border-[#e5e9ef] bg-[#fbfcfd] p-4">
          <p className="text-xs font-semibold text-[#8a96a3]">Cloud deploy</p>
          <p className="mt-2 text-lg font-bold">Pending</p>
        </div>
      </div>
      <button type="button" className="mt-5 rounded-xl bg-[#0f8f7b] px-4 py-2 text-sm font-bold text-white" onClick={onOpenInbox}>Open inbox</button>
    </div>
  )
}
