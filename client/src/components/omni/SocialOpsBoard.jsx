import React, { useEffect, useMemo, useState } from 'react'
import {
  fetchConnections,
  fetchLiveSources,
  fetchMessageVolumeReport,
  fetchSocialPosts,
  searchZortProducts,
} from '../../lib/omniApi.js'

const FALLBACK_PAGE_PROFILES = [
  { id: 'man_kynd', label: 'MAN KYND' },
  { id: 'anna_lynn', label: 'AnnaLynn' },
  { id: 'page_des', label: 'เพจเดส' },
  { id: 'fb_112154661515664', label: 'Facebook 112154661515664' },
]

// profileKey → omniPageId mapping for workspace resolution
const PROFILE_TO_OMNI_PAGE = {
  man_kynd: 'page_mankynd',
  anna_lynn: 'page_annalynn',
  page_des: 'page_des',
  fb_112154661515664: 'page_fb_112154661515664',
  ig_anna_lynn: 'page_ig_annalynn',
  ig_man_kynd: 'page_ig_mankynd',
  ig_page_des: 'page_ig_page_des',
  ig_fb_112154661515664: 'page_ig_fb_112154661515664',
  vz_viris_zamara: 'page_vz_viris_zamara',
  ig_vz_viris_zamara: 'page_ig_vz_viris_zamara',
}

/**
 * Resolve workspaceId from a profileKey using snapshot pages.
 * Returns undefined (not 'ws_oagent') when mapping is not confident,
 * so the backend can derive correctly from its live page registry.
 */
function resolveWorkspaceFromProfile(profileKey, snapshotPages) {
  const pages = snapshotPages || []
  // Try direct match on omniPageId via mapping
  const omniPageId = PROFILE_TO_OMNI_PAGE[profileKey]
  if (omniPageId) {
    const page = pages.find((p) => p.id === omniPageId)
    if (page?.workspaceId) return page.workspaceId
  }
  // Try direct match on page id (for custom profiles that use omniPageId as profileKey)
  const directPage = pages.find((p) => p.id === profileKey)
  if (directPage?.workspaceId) return directPage.workspaceId
  // Cannot confidently resolve — return undefined so backend derives
  return undefined
}

function normalizePostRef(value) {
  return String(value || '').trim()
}

function orderPostRefs(order = {}) {
  return [
    order.sourcePostId,
    order.postId,
    order.socialPostId,
    order.originPostId,
    order.providerPostId,
    order.metaPostId,
    order.origin?.postId,
    order.origin?.sourcePostId,
    order.source?.postId,
    order.source?.sourcePostId,
    order.metadata?.postId,
    order.metadata?.sourcePostId,
  ].map(normalizePostRef).filter(Boolean)
}

function orderBelongsToPostSession(order, selectedPost) {
  const postId = normalizePostRef(selectedPost?.id)
  if (!postId) return false
  return orderPostRefs(order).some((ref) => ref === postId)
}

export default function SocialOpsBoard({ mode, snapshot, onSnapshot, onOpenChat }) {
  if (mode === 'post') {
    return (
      <OpsShell
        title="โพสต์"
        summary="ตั้งค่าโพสต์ขายแบบ ZORT: เลือกร้าน, เลือกโพสต์ Facebook, ผูกสินค้า, ตั้งรหัส CF, จำนวน และติดตามข้อความกับคำสั่งซื้อ"
        onOpenChat={onOpenChat}
      >
        <PostCaptureBoard snapshot={snapshot} />
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
        <LiveCaptureBoard snapshot={snapshot} />
      </OpsShell>
    )
  }

  if (mode === 'report') {
    return <MessageReport snapshot={snapshot} onOpenChat={onOpenChat} />
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

function PostCaptureBoard({ snapshot, onSnapshot }) {
  const [pageProfile, setPageProfile] = useState('man_kynd')
  const pageProfiles = useMetaPageProfiles()

  // Derive workspaceId from snapshot pages using profileKey → omniPageId mapping
  // Returns undefined when mapping is not confident, letting backend derive correctly
  const derivedWorkspaceId = useMemo(() => {
    return resolveWorkspaceFromProfile(pageProfile, snapshot?.pages)
  }, [snapshot, pageProfile])
  const [posts, setPosts] = useState([])
  const [selectedPostId, setSelectedPostId] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionStatus, setSessionStatus] = useState('draft')
  const [sessionName, setSessionName] = useState(() => `Post ${new Date().toISOString().slice(0, 10)}-${String(new Date().getHours()).padStart(2, '0')}${String(new Date().getMinutes()).padStart(2, '0')}`)
  const [productQuery, setProductQuery] = useState('')
  const [productFilter, setProductFilter] = useState('all')
  const [productResults, setProductResults] = useState([])
  const [searchStatus, setSearchStatus] = useState('')
  const [configuredProducts, setConfiguredProducts] = useState([])
  const [orderQuery, setOrderQuery] = useState('')

  const selectedPost = posts.find((post) => post.id === selectedPostId) || null
  const sessionOrders = useMemo(() => {
    const query = orderQuery.trim().toLowerCase()
    return (snapshot?.orders || [])
      .filter((order) => orderBelongsToPostSession(order, selectedPost))
      .filter((order) => {
        const text = [
          order.id,
          order.status,
          order.platform,
          order.customerName,
          order.customerId,
          ...(order.items || []).map((item) => `${item.sku || ''} ${item.name || ''}`),
        ].join(' ').toLowerCase()
        return !query || text.includes(query)
      })
  }, [snapshot?.orders, selectedPost, orderQuery])
  const messageRows = useMemo(() => {
    if (!selectedPost && configuredProducts.length === 0) return []
    return [
      selectedPost ? {
        id: 'selected-post',
        type: 'system',
        title: 'เชื่อมโพสต์แล้ว',
        text: selectedPost.message || selectedPost.story || selectedPost.id,
        meta: formatDateTime(selectedPost.createdTime || selectedPost.created_time),
      } : null,
      ...configuredProducts.slice(0, 4).map((item) => ({
        id: item.localId,
        type: 'rule',
        title: `CF rule · ${item.cfCode || item.sku}`,
        text: `${item.name} · ${formatMoney(item.salePrice)} x ${item.quantity}`,
        meta: item.gift ? `ของแถม: ${item.gift}` : 'พร้อมรับคอมเมนต์หลังเปิดการขาย',
      })),
    ].filter(Boolean)
  }, [selectedPost, configuredProducts])

  async function loadPosts(nextPageProfile = pageProfile) {
    setLoading(true)
    setStatus('กำลังดึงโพสต์จาก Meta')
    try {
      const result = await fetchSocialPosts(nextPageProfile, 10)
      const nextPosts = result.posts || []
      setPosts(nextPosts)
      setSelectedPostId((current) => (nextPosts.some((post) => post.id === current) ? current : ''))
      setStatus(`ดึงโพสต์แล้ว ${nextPosts.length} รายการ · เลือกโพสต์ก่อนเปิดการขาย`)
    } catch (error) {
      setStatus(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPosts(pageProfile)
  }, [pageProfile])

  async function searchProducts() {
    if (!productQuery.trim()) {
      setSearchStatus('ใส่ SKU หรือชื่อสินค้าก่อน')
      return
    }
    setSearchStatus('กำลังค้นสินค้า ZORT')
    try {
      const result = await searchZortProducts(productQuery.trim(), 8)
      setProductResults(result.products || [])
      setSearchStatus(`พบสินค้า ${(result.products || []).length} รายการ`)
    } catch (error) {
      setSearchStatus(error.message)
    }
  }

  function addProduct(product) {
    const sku = product.sku || product.id
    if (configuredProducts.some((item) => item.sku === sku)) {
      setSearchStatus('สินค้านี้อยู่ในโพสต์แล้ว')
      return
    }
    const unitPrice = Number(product.sellPrice ?? product.unitPrice ?? 0)
    setConfiguredProducts((current) => [
      ...current,
      {
        localId: `${sku}:${Date.now()}`,
        id: product.id,
        sku,
        name: product.name || sku,
        cfCode: sku,
        salePrice: unitPrice,
        quantity: 1,
        remaining: Number(product.availableStock ?? product.stock ?? 0),
        gift: '',
        zortProduct: product,
      },
    ])
    setSearchStatus(`เพิ่ม ${sku} เข้าโพสต์ขายแล้ว`)
  }

  function updateProduct(localId, patch) {
    setConfiguredProducts((current) => current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)))
  }

  function removeProduct(localId) {
    setConfiguredProducts((current) => current.filter((item) => item.localId !== localId))
  }

  function changeSessionStatus(nextStatus) {
    setSessionStatus(nextStatus)
    const labels = {
      draft: 'ยังไม่เชื่อมต่อ',
      open: 'เปิดการขาย',
      paused: 'หยุดรับคำสั่งซื้อ',
      ended: 'จบโพสต์',
    }
    setStatus(`${labels[nextStatus]} · บันทึกเป็น session state ในหน้านี้ ยังไม่เปิด live automation`)
  }

  const canOpenSale = Boolean(selectedPost && configuredProducts.length)
  const displayStatus = selectedPost && sessionStatus === 'draft' ? 'linked' : sessionStatus
  const statusLabel = {
    linked: 'เชื่อมโพสต์แล้ว',
    draft: 'ยังไม่เชื่อมต่อ',
    open: 'เปิดการขาย',
    paused: 'หยุดรับคำสั่งซื้อ',
    ended: 'จบโพสต์',
  }[displayStatus]
  const statusTone = {
    linked: 'border-[var(--color-accent)] bg-[var(--color-accent-subtle,var(--color-panel-2))] text-[var(--color-accent)]',
    draft: 'border-[var(--color-rule)] bg-[var(--color-panel-2)] text-[var(--color-muted)]',
    open: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    paused: 'border-amber-200 bg-amber-50 text-amber-700',
    ended: 'border-slate-200 bg-slate-100 text-slate-700',
  }[displayStatus]

  return (
    <section className="mt-4 min-h-[calc(100dvh-220px)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)]">
      <div className="grid min-h-[calc(100dvh-220px)] lg:grid-cols-[minmax(360px,1.15fr)_minmax(280px,0.62fr)_minmax(260px,0.52fr)]">
        <div className="min-h-0 overflow-y-auto border-b border-[var(--color-rule)] lg:border-b-0 lg:border-r">
          <div className="sticky top-0 z-10 border-b border-[var(--color-rule)] bg-[var(--color-panel)] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[var(--color-ink)]">
                ตั้งค่าโพสต์ขาย
                {derivedWorkspaceId ? <span className="ml-2 inline-flex items-center rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-accent-subtle,var(--color-panel-2))] px-2 py-0.5 text-[11px] font-bold text-[var(--color-accent)]">{derivedWorkspaceId}</span> : null}
              </h2>
              <span className={`rounded-[var(--radius-md)] border px-2 py-1 text-xs font-bold ${statusTone}`}>{statusLabel}</span>
            </div>
            <StatusLine value={status} />
          </div>

          <div className="grid gap-4 p-4">
            <div className="grid gap-3">
              <label className="grid gap-1 text-xs font-semibold text-[var(--color-muted)]">
                ร้าน / เพจ
                <select
                  value={pageProfile}
                  onChange={(event) => {
                    setPageProfile(event.target.value)
                    setSessionStatus('draft')
                  }}
                  className="h-10 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 text-sm text-[var(--color-ink)]"
                >
                  {pageProfiles.map((page) => <option key={page.id} value={page.id}>{page.label}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-[var(--color-muted)]">
                ชื่อ
                <input
                  value={sessionName}
                  onChange={(event) => setSessionName(event.target.value)}
                  className="h-10 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 text-sm text-[var(--color-ink)]"
                />
              </label>
            </div>

            <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-paper)] p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-[var(--color-ink)]">เลือกโพสต์ที่ต้องการ</h3>
                <button
                  type="button"
                  onClick={() => loadPosts()}
                  disabled={loading}
                  className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)] disabled:opacity-50"
                >
                  {loading ? 'กำลังโหลด' : 'รีเฟรช'}
                </button>
              </div>
              <div className="mt-3 grid max-h-44 gap-2 overflow-y-auto">
                {posts.length === 0 ? (
                  <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-rule)] px-3 py-5 text-center text-xs text-[var(--color-muted)]">ยังไม่มีโพสต์จากเพจนี้</div>
                ) : posts.map((post) => {
                  const active = post.id === selectedPostId
                  const title = post.message || post.story || post.id
                  return (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => setSelectedPostId(post.id)}
                      className={`rounded-[var(--radius-md)] border px-3 py-2 text-left text-xs transition ${active ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-ink)]' : 'border-[var(--color-rule)] bg-[var(--color-panel)] text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]'}`}
                    >
                      <span className="line-clamp-2 break-words font-bold leading-5">{title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--color-muted)]">
                        <span className="max-w-full truncate">{post.id}</span>
                        <span>{(post.commentCount ?? post.comments?.summary?.total_count ?? 0).toLocaleString('th-TH')} comments</span>
                        <span>{formatDateTime(post.createdTime || post.created_time)}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-paper)] p-3">
              <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(132px,160px)_120px]">
                <label className="grid gap-1 text-xs font-semibold text-[var(--color-muted)]">
                  ค้นหาสินค้า
                  <input
                    value={productQuery}
                    onChange={(event) => setProductQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') searchProducts()
                    }}
                    className="h-10 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 text-sm text-[var(--color-ink)]"
                    placeholder="SKU หรือชื่อสินค้า"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-[var(--color-muted)]">
                  ตัวกรอง
                  <select
                    value={productFilter}
                    onChange={(event) => setProductFilter(event.target.value)}
                    className="h-10 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 text-sm text-[var(--color-ink)]"
                  >
                    <option value="all">สินค้าทั้งหมด</option>
                    <option value="in_stock">มีสต็อก</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={searchProducts}
                  disabled={loading || !productQuery.trim()}
                  className="h-10 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 text-sm font-semibold text-[var(--color-accent-ink)] disabled:border disabled:border-[var(--color-rule)] disabled:bg-[var(--color-panel-2)] disabled:text-[var(--color-muted)] disabled:opacity-100"
                >
                  {searchStatus === 'กำลังค้นสินค้า ZORT' ? 'กำลังค้น' : 'ค้นหา'}
                </button>
              </div>
              <StatusLine value={searchStatus} />
              {productResults.length ? (
                <div className="grid max-h-40 gap-2 overflow-y-auto">
                  {productResults
                    .filter((product) => productFilter !== 'in_stock' || Number(product.availableStock ?? product.stock ?? 0) > 0)
                    .map((product) => (
                      <button
                        key={product.id || product.sku}
                        type="button"
                        onClick={() => addProduct(product)}
                        className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-left text-xs text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]"
                      >
                        <span className="block font-bold text-[var(--color-ink)]">{product.sku || product.id} · {product.name}</span>
                        <span className="mt-1 block text-[11px] text-[var(--color-muted)]">ราคา {formatMoney(product.sellPrice ?? product.unitPrice)} · คงเหลือ {Number(product.availableStock ?? product.stock ?? 0).toLocaleString('th-TH')}</span>
                      </button>
                    ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-paper)] p-3">
              <h3 className="text-xs font-bold text-[var(--color-ink)]">สินค้าที่ต้องการขาย</h3>
              {configuredProducts.length === 0 ? (
                <div className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[var(--color-rule)] px-3 py-8 text-center text-xs text-[var(--color-muted)]">เลือกสินค้าเพื่อกำหนดรหัส CF ราคา จำนวน และของแถม</div>
              ) : (
                <div className="mt-3 grid gap-3">
                  {configuredProducts.map((item) => (
                    <div key={item.localId} className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-[var(--color-ink)]">{item.sku} · {item.name}</div>
                          <div className="mt-1 text-[11px] text-[var(--color-muted)]">ZORT product {item.id || '-'}</div>
                        </div>
                        <button type="button" onClick={() => removeProduct(item.localId)} className="rounded-[var(--radius-md)] border border-[var(--color-rule)] px-2 py-1 text-xs font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]">ลบ</button>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <PostProductInput label="รหัส CF" value={item.cfCode} onChange={(value) => updateProduct(item.localId, { cfCode: value })} />
                        <PostProductInput label="ราคา" type="number" value={item.salePrice} onChange={(value) => updateProduct(item.localId, { salePrice: Number(value || 0) })} />
                        <PostProductInput label="จำนวนขาย" type="number" value={item.quantity} onChange={(value) => updateProduct(item.localId, { quantity: Math.max(1, Number(value || 1)) })} />
                        <PostProductInput label="คงเหลือ" type="number" value={item.remaining} onChange={(value) => updateProduct(item.localId, { remaining: Math.max(0, Number(value || 0)) })} />
                        <label className="grid gap-1 text-[11px] font-semibold text-[var(--color-muted)] sm:col-span-2">
                          ของแถม
                          <input
                            value={item.gift}
                            onChange={(event) => updateProduct(item.localId, { gift: event.target.value })}
                            className="h-9 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-2 text-xs text-[var(--color-ink)]"
                            placeholder="ไม่มี"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => changeSessionStatus('open')}
                disabled={!canOpenSale}
                className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-ink)] disabled:opacity-45"
              >
                เปิดการขาย
              </button>
              <button type="button" onClick={() => changeSessionStatus('paused')} className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]">หยุดรับคำสั่งซื้อ</button>
              <button type="button" onClick={() => changeSessionStatus('ended')} className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]">จบโพสต์</button>
            </div>
          </div>
        </div>

        <div className="flex min-h-[420px] flex-col border-b border-[var(--color-rule)] bg-[var(--color-paper)] lg:border-b-0 lg:border-r">
          <div className="border-b border-[var(--color-rule)] bg-[var(--color-panel)] px-4 py-3">
            <h3 className="text-sm font-bold text-[var(--color-ink)]">ข้อความ</h3>
            <div className="mt-1 text-xs text-[var(--color-muted)]">{selectedPost ? 'รอดึงคอมเมนต์/ข้อความจากโพสต์ที่เชื่อมต่อ' : 'เลือกโพสต์ก่อนเริ่ม session'}</div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {messageRows.length === 0 ? (
              <div className="grid h-full min-h-[260px] place-items-center text-center">
                <div>
                  <div className="text-sm font-bold text-[var(--color-ink)]">ยังไม่มีข้อความใน session</div>
                  <div className="mt-2 max-w-xs text-xs leading-5 text-[var(--color-muted)]">หลังเลือกโพสต์และตั้งสินค้า ข้อความ/คอมเมนต์ที่เข้ากับรหัส CF จะมาอยู่ฝั่งนี้</div>
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                {messageRows.map((row) => (
                  <div key={row.id} className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm">
                    <div className="font-bold text-[var(--color-ink)]">{row.title}</div>
                    <div className="mt-1 text-xs leading-5 text-[var(--color-ink-2)]">{row.text}</div>
                    <div className="mt-2 text-[11px] text-[var(--color-muted)]">{row.meta}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-[var(--color-rule)] bg-[var(--color-panel)] p-3">
            <input
              disabled
              className="h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 text-sm text-[var(--color-muted)]"
              placeholder="พิมพ์ข้อความ..."
            />
          </div>
        </div>

        <div className="flex min-h-[420px] flex-col bg-[var(--color-panel)]">
          <div className="border-b border-[var(--color-rule)] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-[var(--color-ink)]">คำสั่งซื้อ ({sessionOrders.length})</h3>
              <input
                value={orderQuery}
                onChange={(event) => setOrderQuery(event.target.value)}
                className="h-9 w-28 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-2 text-xs text-[var(--color-ink)]"
                placeholder="ค้นหา"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {sessionOrders.length === 0 ? (
              <div className="grid h-full min-h-[260px] place-items-center text-center text-xs text-[var(--color-muted)]">ยังไม่มีคำสั่งซื้อจากโพสต์นี้</div>
            ) : (
              <div className="grid gap-3">
                {sessionOrders.map((order) => (
                  <div key={order.id} className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-paper)] p-3 text-xs text-[var(--color-ink-2)]">
                    <div className="font-bold text-[var(--color-ink)]">{order.id}</div>
                    <div className="mt-1">{order.platform || 'omni'} · {order.status}</div>
                    <div className="mt-1">Total: {formatMoney(order.total ?? order.totalAmount)}</div>
                    {(order.items || []).length ? <div className="mt-2 text-[11px] text-[var(--color-muted)]">{order.items.map((item) => item.sku || item.name).join(', ')}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-[var(--color-rule)] px-4 py-3 text-[11px] font-semibold text-[var(--color-muted)]">Order creation stays draft/approval gated</div>
        </div>
      </div>
    </section>
  )
}

function PostProductInput({ label, value, onChange, type = 'text' }) {
  return (
    <label className="grid gap-1 text-[11px] font-semibold text-[var(--color-muted)]">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-2 text-xs text-[var(--color-ink)]"
      />
    </label>
  )
}

function LiveCaptureBoard({ snapshot }) {
  const [pageProfile, setPageProfile] = useState('man_kynd')
  const pageProfiles = useMetaPageProfiles()

  // Derive workspaceId from snapshot pages using profileKey → omniPageId mapping
  // Returns undefined when mapping is not confident, letting backend derive correctly
  const derivedWorkspaceId = useMemo(() => {
    return resolveWorkspaceFromProfile(pageProfile, snapshot?.pages)
  }, [snapshot, pageProfile])
  const [source, setSource] = useState(null)
  const [status, setStatus] = useState('')

  async function loadLiveSources(nextPageProfile = pageProfile) {
    setStatus('กำลังตรวจ live stream จาก Meta')
    try {
      const result = await fetchLiveSources(nextPageProfile, 10, derivedWorkspaceId)
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
          <h2 className="text-sm font-bold text-[var(--color-ink)]">
            Live CF source
            {derivedWorkspaceId ? <span className="ml-2 inline-flex items-center rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-accent-subtle,var(--color-panel-2))] px-2 py-0.5 text-[11px] font-bold text-[var(--color-accent)]">{derivedWorkspaceId}</span> : null}
          </h2>
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

function formatMoney(value) {
  return Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
