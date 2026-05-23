import React, { useEffect, useMemo, useState } from 'react'
import { deleteKnowledgeSource, fetchKnowledgeSources, saveKnowledgeSource } from '../../lib/omniApi.js'

const navItems = [
  ['Inbox', '12'],
  ['AI Chatbot', ''],
  ['Customers', ''],
  ['Broadcast', ''],
  ['Analytics', ''],
  ['Settings', ''],
]

const trainMenu = ['Overview', 'Instructions', 'Knowledge Source', 'Testing', 'Deploy']

function formatUpdated(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function labelStatus(status) {
  if (status === 'ready') return 'Ready'
  if (status === 'training') return 'Training'
  if (status === 'needs_review') return 'Needs review'
  return 'Archived'
}

export default function AiKnowledgeSourcePage({ onOpenInbox, onOpenChat }) {
  const [sources, setSources] = useState([])
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    id: '',
    title: '',
    type: 'manual',
    scope: 'all_pages',
    content: '',
    tags: '',
  })

  async function loadSources(search = query, type = typeFilter) {
    if (!search) setBusy(true)
    setError('')
    try {
      setSources(await fetchKnowledgeSources({ query: search, type }))
    } catch (err) {
      setError(err.message || 'knowledge_load_failed')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    loadSources('')
  }, [])

  async function submitSource(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await saveKnowledgeSource(form)
      await loadSources(query, typeFilter)
      setForm({ id: '', title: '', type: 'manual', scope: 'all_pages', content: '', tags: '' })
    } catch (err) {
      setError(err.message || 'knowledge_save_failed')
    } finally {
      setBusy(false)
    }
  }

  async function removeSource(sourceId) {
    setBusy(true)
    setError('')
    try {
      await deleteKnowledgeSource(sourceId)
      await loadSources(query, typeFilter)
    } catch (err) {
      setError(err.message || 'knowledge_delete_failed')
    } finally {
      setBusy(false)
    }
  }

  const stats = useMemo(() => {
    const ready = sources.filter((source) => source.status === 'ready').length
    const needsReview = sources.filter((source) => source.status === 'needs_review' || source.status === 'training').length
    return { total: sources.length, ready, needsReview }
  }, [sources])

  return (
    <div className="flex h-full min-w-[1200px] bg-[#f6f8fb] text-[#17211e]">
      <aside className="flex w-[68px] flex-col items-center border-r border-[#e5e9ef] bg-white py-4">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#0f8f7b] text-sm font-bold text-white shadow-sm">OA</div>
        <div className="mt-8 flex flex-1 flex-col gap-5 text-[#9aa5b1]">
          {['⌂', '▦', '○', '✦', '↗', '⚙'].map((item) => (
            <button key={item} type="button" className="grid h-9 w-9 place-items-center rounded-xl text-lg hover:bg-[#f1f5f7]">{item}</button>
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
          <button type="button" className="grid h-9 w-9 place-items-center rounded-xl border border-[#e5e9ef] text-[#66737f]">⌕</button>
        </div>

        <nav className="mt-7 space-y-1">
          {navItems.map(([label, badge]) => (
            <button
              key={label}
              type="button"
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${label === 'AI Chatbot' ? 'bg-[#e8faf6] text-[#0f8f7b]' : 'text-[#52606b] hover:bg-[#f6f8fb]'}`}
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
            <button type="button" className="rounded-xl border border-[#dce3e8] bg-white px-4 py-2 text-sm font-semibold text-[#52606b]" onClick={onOpenChat}>Chat</button>
            <button type="button" className="rounded-xl bg-[#0f8f7b] px-4 py-2 text-sm font-bold text-white shadow-sm" onClick={() => document.getElementById('knowledge-title')?.focus()}>Add source</button>
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
                  className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${item === 'Knowledge Source' ? 'bg-white text-[#0f8f7b] shadow-sm ring-1 ring-[#e5e9ef]' : 'text-[#66737f] hover:bg-white'}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </aside>

          <section className="overflow-y-auto p-7">
            <div className="mx-auto max-w-5xl">
              <div className="rounded-3xl border border-[#e5e9ef] bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-bold tracking-tight">Knowledge Source</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66737f]">
                      Add trusted information for the AI chatbot to answer customers across Facebook, TikTok, Shopee, and order chats.
                    </p>
                  </div>
                  <button type="button" className="rounded-xl bg-[#0f8f7b] px-4 py-2.5 text-sm font-bold text-white shadow-sm" onClick={() => document.getElementById('knowledge-title')?.focus()}>+ New knowledge</button>
                </div>

                <div className="mt-6 grid grid-cols-3 gap-3">
                  {[
                    ['Knowledge items', String(stats.total)],
                    ['Ready to answer', String(stats.ready)],
                    ['Needs review', String(stats.needsReview)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-[#e5e9ef] bg-[#fbfcfd] p-4">
                      <p className="text-xs font-semibold text-[#8a96a3]">{label}</p>
                      <p className="mt-2 text-2xl font-bold">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-3xl border border-[#e5e9ef] bg-white shadow-sm">
                <form className="grid gap-3 border-b border-[#eef2f5] px-5 py-4" onSubmit={submitSource}>
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
                    <input
                      className="h-11 rounded-xl border border-[#dce3e8] px-3 text-sm outline-none focus:border-[#0f8f7b]"
                      placeholder="Scope เช่น all_pages"
                      value={form.scope}
                      onChange={(event) => setForm((current) => ({ ...current, scope: event.target.value }))}
                    />
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
                      <button type="button" className="h-10 rounded-xl border border-[#dce3e8] px-4 text-sm font-bold text-[#52606b]" onClick={() => setForm({ id: '', title: '', type: 'manual', scope: 'all_pages', content: '', tags: '' })}>
                        Cancel
                      </button>
                    ) : null}
                    <button type="submit" className="h-10 rounded-xl bg-[#0f8f7b] px-4 text-sm font-bold text-white disabled:opacity-50" disabled={busy}>
                      {busy ? 'Saving' : form.id ? 'Update source' : 'Save source'}
                    </button>
                  </div>
                  {error ? <p className="text-sm font-semibold text-rose-600">{error}</p> : null}
                </form>
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
                  <input
                    className="h-10 w-72 rounded-xl border border-[#dce3e8] px-3 text-sm outline-none focus:border-[#0f8f7b]"
                    placeholder="Search knowledge"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') loadSources(event.currentTarget.value)
                    }}
                  />
                  <button type="button" className="ml-2 h-10 rounded-xl border border-[#dce3e8] px-3 text-sm font-semibold text-[#52606b]" onClick={() => loadSources(query)}>Search</button>
                </div>

                <div className="divide-y divide-[#eef2f5]">
                  {sources.map((row) => (
                    <article key={row.id} className="grid grid-cols-[1fr_160px_120px_150px] items-center gap-4 px-5 py-4">
                      <div>
                        <p className="font-bold text-[#17211e]">{row.title}</p>
                        <p className="mt-1 line-clamp-1 text-sm text-[#8a96a3]">{row.type} · {row.scope}</p>
                      </div>
                      <span className="text-sm text-[#66737f]">{formatUpdated(row.updatedAt)}</span>
                      <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${row.status === 'ready' ? 'bg-[#e8faf6] text-[#0f8f7b]' : 'bg-[#fff3df] text-[#b7791f]'}`}>{labelStatus(row.status)}</span>
                      <div className="flex justify-end gap-2">
                        <button type="button" className="rounded-lg border border-[#dce3e8] px-3 py-1.5 text-sm font-semibold text-[#52606b]" onClick={() => setForm({ id: row.id, title: row.title, type: row.type, scope: row.scope, content: row.content, tags: (row.tags || []).join(', ') })}>Edit</button>
                        <button type="button" className="rounded-lg border border-[#dce3e8] px-3 py-1.5 text-sm font-semibold text-[#52606b]">Test</button>
                        <button type="button" className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-semibold text-rose-600" onClick={() => removeSource(row.id)}>Delete</button>
                      </div>
                    </article>
                  ))}
                  {!sources.length ? <div className="px-5 py-8 text-sm text-[#66737f]">No knowledge sources found.</div> : null}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
