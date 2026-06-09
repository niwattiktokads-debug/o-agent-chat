import React, { useEffect, useMemo, useState } from 'react'
import { deleteKnowledgeSource, fetchKnowledgeSources, fetchOmniSnapshot, importKnowledgePack, saveKnowledgeSource } from '../../lib/omniApi.js'
import GovernanceActions from '../omni/GovernanceActions.jsx'

const trainMenu = ['Overview', 'Instructions', 'AI Reply Style', 'Knowledge Source', 'Testing', 'Deploy']
const AI_REPLY_STYLE_SOURCE_ID = 'ks_omni_ai_reply_style_rules_v1'
const AI_REPLY_STYLE_TITLE = 'Omni User Context - AI reply style rules'
const DEFAULT_AI_REPLY_STYLE_RULES = [
  'ตอบแบบแอดมินร้านจริง สุภาพ ตรง ไม่เหมือนบอท',
  'สั้น ครบ อ่านเร็ว ตัวอักษรไม่เยอะ',
  'ใช้ bullet point สั้น ๆ เมื่อมีหลายข้อ ไม่เกิน 3 ข้อ',
  'ห้ามเขียนย่อหน้ายาว',
  'ถามกลับได้ไม่เกิน 1 คำถาม และถามเฉพาะข้อมูลที่ขาดจริง',
  'ห้ามมั่วราคา สต็อก โปร เลขพัสดุ หรือคำมั่นสัญญา',
  'ถ้าลูกค้าถามไซซ์/ไซส์/ขนาด ให้แนบภาพตารางไซซ์จาก Sales Assets เมื่อมีลิงก์ HTTPS และตอบสั้น ๆ',
].join('\n')

const EMPTY_FORM = {
  id: '',
  title: '',
  type: 'manual',
  scope: 'all_pages',
  content: '',
  tags: '',
  workspaceId: '',
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

function sourceMatchesPrompt(source, prompt, scope = '', workspaceId = '') {
  // Workspace boundary: skip sources from a different workspace
  if (workspaceId && source.workspaceId && source.workspaceId !== workspaceId) return false
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

function findAiReplyStyleSource(sources = []) {
  return sources.find((source) => source.id === AI_REPLY_STYLE_SOURCE_ID) || sources.find((source) => {
    const tags = (source.tags || []).map((tag) => String(tag || '').toLowerCase())
    return tags.includes('reply-style') || tags.includes('ai-reply-style')
  })
}

export default function AiKnowledgeSourcePage({ onOpenInbox, onOpenChat, onOpenConnections, showPageNav = true, workspaceId: propWorkspaceId = '' }) {
  const [sources, setSources] = useState([])
  const [snapshot, setSnapshot] = useState(null)
  const [pages, setPages] = useState([])
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [activeSection, setActiveSection] = useState('Knowledge Source')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS)
  const [aiReplyStyleText, setAiReplyStyleText] = useState(DEFAULT_AI_REPLY_STYLE_RULES)
  const [testPrompt, setTestPrompt] = useState('ลูกค้าถามว่าสินค้ายังเปลี่ยนคืนได้ไหม')
  const [testScope, setTestScope] = useState('all_pages')
  const [testResult, setTestResult] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  // Derive workspaceId from the selected page scope for workspace boundary
  const activeWorkspaceId = useMemo(() => {
    if (!testScope || testScope === 'all_pages') return ''
    const page = pages.find((p) => p.id === testScope)
    return page?.workspaceId || ''
  }, [testScope, pages])

  useEffect(() => {
    let ignore = false
    setBusy(true)
    setError('')
    setNotice('')
    setTestResult(null)
    setForm(EMPTY_FORM)
    setSnapshot(null)
    Promise.all([
      fetchKnowledgeSources({ workspaceId: propWorkspaceId }),
      fetchOmniSnapshot(propWorkspaceId || undefined).catch(() => ({ pages: [] })),
    ])
      .then(([nextSources, snapshot]) => {
        if (!ignore) {
          setSources(nextSources)
          const styleSource = findAiReplyStyleSource(nextSources)
          setAiReplyStyleText(styleSource?.content || DEFAULT_AI_REPLY_STYLE_RULES)
          setSnapshot(snapshot)
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
  }, [propWorkspaceId])

  async function loadSources(search = query, type = typeFilter) {
    setBusy(true)
    setError('')
    try {
      const nextSources = await fetchKnowledgeSources({ query: search, type, workspaceId: propWorkspaceId })
      setSources(nextSources)
      const styleSource = findAiReplyStyleSource(nextSources)
      if (styleSource?.content) setAiReplyStyleText(styleSource.content)
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
      workspaceId: row.workspaceId || '',
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
      // Derive workspaceId from selected page scope if form.scope is a page id
      let derivedWsId = form.workspaceId || propWorkspaceId
      if (form.scope && form.scope !== 'all_pages' && !derivedWsId) {
        const scopePage = pages.find((p) => p.id === form.scope)
        if (scopePage?.workspaceId) derivedWsId = scopePage.workspaceId
      }
      // Even for all_pages scope, derive from propWorkspaceId or page context
      if (!derivedWsId && form.scope && form.scope !== 'all_pages') {
        const scopePage = pages.find((p) => p.id === form.scope)
        derivedWsId = scopePage?.workspaceId || ''
      }
      const payload = { ...form, workspaceId: derivedWsId || 'ws_oagent' }
      const saved = await saveKnowledgeSource(payload)
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
    if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm('ยืนยันลบ knowledge source นี้แบบ soft-delete ?')) return
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

  async function saveInstructions() {
    const content = String(instructions || '').trim()
    if (!content) {
      setError('ต้องใส่ instruction ก่อนบันทึก')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const saved = await saveKnowledgeSource({
        id: 'ks_omni_ai_global_instructions_v1',
        title: 'Omni AI global instructions',
        type: 'manual',
        scope: 'all_pages',
        status: 'ready',
        content,
        tags: ['omni', 'ai', 'instructions', 'guard'],
        workspaceId: propWorkspaceId || 'ws_oagent',
      })
      await loadSources(query, typeFilter)
      setNotice(`บันทึกแล้ว: ${saved.source?.title || 'Omni AI global instructions'}`)
    } catch (err) {
      setError(err.message || 'instruction_save_failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveAiReplyStyle() {
    const content = String(aiReplyStyleText || '').trim()
    if (!content) {
      setError('ต้องใส่กติกาการตอบลูกค้าก่อนบันทึก')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const saved = await saveKnowledgeSource({
        id: AI_REPLY_STYLE_SOURCE_ID,
        title: AI_REPLY_STYLE_TITLE,
        type: 'manual',
        scope: 'all_pages',
        status: 'ready',
        content,
        tags: ['omni', 'ai', 'reply-style', 'train-ai', 'visible-rule'],
        sourceRef: 'omni-user-context:ai-reply-style:v1',
        workspaceId: propWorkspaceId || 'ws_oagent',
      })
      await loadSources(query, typeFilter)
      setAiReplyStyleText(saved.source?.content || content)
      setNotice(`บันทึกแล้ว: ${saved.source?.title || AI_REPLY_STYLE_TITLE}`)
    } catch (err) {
      setError(err.message || 'ai_reply_style_save_failed')
    } finally {
      setBusy(false)
    }
  }

  async function importPack(packId) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await importKnowledgePack(packId, {
        workspaceId: propWorkspaceId || 'ws_oagent',
        limit: 20,
        pages: 1,
      })
      await loadSources(query, typeFilter)
      const importedTitle = result.imported?.title || packId
      const productCount = result.productSourcesImported ? ` · ${result.productSourcesImported} product sources` : ''
      setNotice(`นำเข้าแล้ว: ${importedTitle}${productCount}`)
    } catch (err) {
      setError(err.message || 'knowledge_import_failed')
    } finally {
      setBusy(false)
    }
  }

  function runTest(prompt = testPrompt, scope = testScope, forcedSource = null) {
    const wsId = scope && scope !== 'all_pages'
      ? (pages.find((p) => p.id === scope)?.workspaceId || '')
      : activeWorkspaceId
    const source = forcedSource || sources.find((item) => sourceMatchesPrompt(item, prompt, scope, wsId))
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
  const aiGuardRules = snapshot?.aiGuardRules || []

  return (
    <main className="h-full min-w-0 overflow-y-auto bg-[var(--color-paper)] p-4 text-[var(--color-ink)] lg:p-6">
      <section className="min-w-0">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-rule)] pb-4">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-ink)]">สอน AI</h1>
            <p className="mt-1 text-sm text-[var(--color-ink-2)]">
              จัดการ Knowledge Source, instruction, testing และ deploy readiness ในดีไซน์เดียวกับ Settings
              {propWorkspaceId ? <span className="ml-2 inline-flex items-center rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-accent-subtle,var(--color-panel-2))] px-2 py-0.5 text-[11px] font-bold text-[var(--color-accent)]">{propWorkspaceId}</span> : null}
            </p>
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
                  <button type="button" className="mt-4 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-ink)] disabled:opacity-50" disabled={busy} onClick={saveInstructions}>
                    Save instructions
                  </button>
                </div>
              ) : null}

              {activeSection === 'AI Reply Style' ? (
                <AiReplyStylePanel
                  busy={busy}
                  value={aiReplyStyleText}
                  onChange={setAiReplyStyleText}
                  onSave={saveAiReplyStyle}
                  sourceId={AI_REPLY_STYLE_SOURCE_ID}
                />
              ) : null}

              {activeSection === 'Knowledge Source' ? (
                <>
                  <OperationalTrainingPanel
                    sources={sources}
                    aiGuardRules={aiGuardRules}
                    busy={busy}
                    onImportPack={importPack}
                  />
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

function AiReplyStylePanel({ busy, value, onChange, onSave, sourceId }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[var(--color-ink)]">AI Reply Style Rules</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--color-ink-2)]">
            กติกานี้ถูกส่งเข้า prompt ของ AI reply ทุกครั้ง และแก้ผ่าน Train AI หรือ CLI ได้
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-[var(--radius-pill)] bg-[var(--color-panel-2)] px-2 py-1 text-xs font-bold text-[var(--color-muted)]">Train AI source</span>
          <span className="rounded-[var(--radius-pill)] bg-[var(--color-live-soft)] px-2 py-1 text-xs font-bold text-[var(--color-live)]">CLI editable</span>
        </div>
      </div>

      <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-3">
        <div className="text-xs font-bold text-[var(--color-muted)]">Source ID</div>
        <code className="mt-1 block break-all text-xs font-semibold text-[var(--color-ink)]">{sourceId}</code>
      </div>

      <label htmlFor="ai-reply-style-rules" className="mt-4 block text-sm font-bold text-[var(--color-ink)]">
        กติกาการตอบลูกค้า
      </label>
      <textarea
        id="ai-reply-style-rules"
        aria-label="กติกาการตอบลูกค้า"
        className="mt-2 min-h-[300px] w-full rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm leading-6 text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm leading-6 text-[var(--color-muted)]">
          ปุ่มนี้บันทึกเป็น knowledge source สถานะ ready แต่ยังไม่ส่งข้อความหาลูกค้า
        </p>
        <button
          type="button"
          className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-ink)] disabled:opacity-50"
          disabled={busy}
          onClick={onSave}
        >
          Save AI reply style
        </button>
      </div>
    </div>
  )
}

function OperationalTrainingPanel({ sources = [], aiGuardRules = [], busy, onImportPack }) {
  const hasSalesWorkflow = sources.some((source) => source.id === 'ks_annalynn_sales_workflow_v1')
  const hasEasyStoreAliasPack = sources.some((source) => source.id === 'ks_annalynn_easystore_products_v1')
  const visibleRules = aiGuardRules.filter((rule) => rule.visibleToBoss !== false)

  return (
    <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[var(--color-ink)]">ชุดมาตรฐานพร้อมนำเข้า</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--color-ink-2)]">นำเข้า workflow ที่บอสอนุมัติ และ alias-only จาก EasyStore โดยไม่ใช้ราคา/สต็อกค้างใน knowledge</p>
        </div>
        <span className="rounded-[var(--radius-pill)] bg-[var(--color-panel-2)] px-2 py-1 text-xs font-bold text-[var(--color-muted)]">approval guard on</span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-bold text-[var(--color-ink)]">Sales workflow</p>
              <p className="mt-1 text-sm leading-5 text-[var(--color-ink-2)]">กติกาตอบขายสินค้า, live truth, approval guard, และคำถามที่ต้องถามเพิ่ม</p>
            </div>
            <span className={`rounded-[var(--radius-pill)] px-2 py-1 text-xs font-bold ${hasSalesWorkflow ? 'bg-[var(--color-live-soft)] text-[var(--color-live)]' : 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]'}`}>
              {hasSalesWorkflow ? 'Imported' : 'Ready'}
            </span>
          </div>
          <button type="button" className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-ink)] disabled:opacity-50" disabled={busy} onClick={() => onImportPack('sales-workflow')}>
            Import sales workflow
          </button>
        </div>

        <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-bold text-[var(--color-ink)]">EasyStore alias pack</p>
              <p className="mt-1 text-sm leading-5 text-[var(--color-ink-2)]">ใช้จับชื่อสินค้า, alias, SKU, product_id และ variant_id เท่านั้น</p>
            </div>
            <span className={`rounded-[var(--radius-pill)] px-2 py-1 text-xs font-bold ${hasEasyStoreAliasPack ? 'bg-[var(--color-live-soft)] text-[var(--color-live)]' : 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]'}`}>
              {hasEasyStoreAliasPack ? 'Imported' : 'Ready'}
            </span>
          </div>
          <button type="button" className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-ink)] disabled:opacity-50" disabled={busy} onClick={() => onImportPack('easystore-product-pack')}>
            Import EasyStore alias pack
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-3">
        <h4 className="text-sm font-bold text-[var(--color-ink)]">กฎหลังบ้านที่เปิดอยู่</h4>
        <div className="mt-2 grid gap-2">
          {visibleRules.map((rule) => {
            const measurements = rule.criteria?.measurements || {}
            const sizes = rule.criteria?.sizes || []
            return (
              <div key={rule.id} className="rounded-[var(--radius-sm)] bg-[var(--color-panel)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-[var(--color-ink)]">{rule.title}</p>
                  <span className="rounded-[var(--radius-pill)] bg-[var(--color-live-soft)] px-2 py-1 text-xs font-bold text-[var(--color-live)]">{rule.status || 'active'}</span>
                </div>
                <p className="mt-2 text-sm leading-5 text-[var(--color-ink-2)]">
                  เกณฑ์: {sizes.join('/')} · อก {measurements.bust} / เอว {measurements.waist} / สะโพก {measurements.hips}
                </p>
                <p className="mt-1 text-sm leading-5 text-[var(--color-muted)]">{rule.fallback}</p>
              </div>
            )
          })}
          {!visibleRules.length ? <p className="text-sm text-[var(--color-muted)]">ยังไม่มี guard rule จาก runtime snapshot</p> : null}
        </div>
      </div>
    </div>
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
              <p className="mt-1 line-clamp-1 text-sm text-[var(--color-muted)]">{row.type} · {row.scope} · <span className="text-[var(--color-accent)]">{row.workspaceId || 'ws_oagent'}</span></p>
            </div>
            <span className="text-sm text-[var(--color-ink-2)]">{String(row.content || '').length.toLocaleString('en-US')} chars</span>
            <span className="text-sm text-[var(--color-ink-2)]">{formatUpdated(row.updatedAt)}</span>
            <span className={`w-fit rounded-[var(--radius-pill)] px-2 py-1 text-xs font-semibold ${statusClass(row.status)}`}>{labelStatus(row.status)}</span>
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-[var(--radius-sm)] border border-[var(--color-rule)] px-3 py-1.5 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-panel-2)]" onClick={() => editSource(row)}>Edit</button>
              <button type="button" className="rounded-[var(--radius-sm)] border border-[var(--color-rule)] px-3 py-1.5 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-panel-2)]" onClick={() => runSourceTest(row)}>Test</button>
              <button type="button" className="rounded-[var(--radius-sm)] border border-[var(--color-danger)] px-3 py-1.5 text-sm font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] disabled:opacity-50" disabled={busy} onClick={() => removeSource(row.id)}>Delete</button>
            </div>
            <div className="lg:col-span-5">
              <GovernanceActions
                className="mt-1"
                objectType="knowledge_source"
                objectId={row.id}
                objectLabel={row.title}
                onChanged={() => loadSources(query, typeFilter)}
              />
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
