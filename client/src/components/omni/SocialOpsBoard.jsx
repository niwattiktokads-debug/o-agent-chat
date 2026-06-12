import React, { useEffect, useMemo, useState } from 'react'
import {
  fetchConnections,
  fetchLiveSources,
  fetchMessageVolumeReport,
  fetchSocialPosts,
  searchEasyStoreProducts,
} from '../../lib/omniApi.js'

const FALLBACK_PAGE_PROFILES = [
  { id: 'man_kynd', label: 'MAN KYND' },
  { id: 'anna_lynn', label: 'AnnaLynn' },
  { id: 'page_des', label: 'เพจเดส' },
  { id: 'tangtob', label: 'ละครแนวตั้งตบ' },
  { id: 'fb_112154661515664', label: 'Facebook 112154661515664' },
]

// profileKey → omniPageId mapping for workspace resolution
const PROFILE_TO_OMNI_PAGE = {
  man_kynd: 'page_mankynd',
  anna_lynn: 'page_annalynn',
  page_des: 'page_des',
  tangtob: 'page_tangtob',
  fb_112154661515664: 'page_fb_112154661515664',
  ig_anna_lynn: 'page_ig_annalynn',
  ig_man_kynd: 'page_ig_mankynd',
  ig_page_des: 'page_ig_page_des',
  ig_fb_112154661515664: 'page_ig_fb_112154661515664',
  vz_viris_zamara: 'page_vz_viris_zamara',
  ig_vz_viris_zamara: 'page_ig_vz_viris_zamara',
}

const POST_SELLING_PINNED_POSTS_KEY = 'omni_post_selling_pinned_posts_v1'
const POST_SELLING_PINNED_PRODUCTS_KEY = 'omni_post_selling_pinned_products_v1'

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

function readPinnedPostSessions() {
  if (typeof window === 'undefined') return {}
  try {
    const rawValue = window.localStorage.getItem(POST_SELLING_PINNED_POSTS_KEY)
    const parsedValue = rawValue ? JSON.parse(rawValue) : {}
    if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) return {}
    return Object.fromEntries(
      Object.entries(parsedValue)
        .filter(([profileKey, postId]) => typeof profileKey === 'string' && typeof postId === 'string' && postId.trim())
    )
  } catch {
    return {}
  }
}

function writePinnedPostSessions(pinnedPosts) {
  if (typeof window === 'undefined') return
  const cleanPinnedPosts = Object.fromEntries(
    Object.entries(pinnedPosts || {})
      .filter(([profileKey, postId]) => typeof profileKey === 'string' && typeof postId === 'string' && postId.trim())
  )
  if (Object.keys(cleanPinnedPosts).length === 0) {
    window.localStorage.removeItem(POST_SELLING_PINNED_POSTS_KEY)
    return
  }
  window.localStorage.setItem(POST_SELLING_PINNED_POSTS_KEY, JSON.stringify(cleanPinnedPosts))
}

function readPinnedProductGroups() {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(POST_SELLING_PINNED_PRODUCTS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : []
  } catch {
    return []
  }
}

function writePinnedProductGroups(groupIds = []) {
  if (typeof window === 'undefined') return
  const cleanIds = Array.from(new Set((groupIds || []).filter(Boolean).map(String)))
  if (cleanIds.length === 0) {
    window.localStorage.removeItem(POST_SELLING_PINNED_PRODUCTS_KEY)
    return
  }
  window.localStorage.setItem(POST_SELLING_PINNED_PRODUCTS_KEY, JSON.stringify(cleanIds))
}

function compactProductToken(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function cleanVariantSize(value = '') {
  const raw = compactProductToken(value)
  if (!raw) return ''
  const readable = raw.includes('=') ? raw.split('=').pop() : raw
  return readable.replace(/,/g, '/').replace(/\s*\/\s*/g, '/').trim()
}

function postProductName(product = {}) {
  return product.productName || product.title || product.name || product.sku || product.productId || product.id || 'สินค้า EasyStore'
}

function postProductSku(product = {}) {
  return product.sku || product.productId || product.id || '-'
}

function postProductStock(product = {}) {
  const stockValue = product.availableStock
    ?? (product.stock && typeof product.stock === 'object' ? product.stock.totalQuantity : product.stock)
    ?? product.availableTotal
    ?? product.quantity
    ?? 0
  const numeric = Number(stockValue || 0)
  return Number.isFinite(numeric) ? numeric : 0
}

function postProductSize(product = {}) {
  const explicit = cleanVariantSize(product.size || product.variantSize)
  if (explicit) return explicit
  const variantSize = compactProductToken(product.variantTitle || '').split(',').slice(1).join(',').trim()
  return cleanVariantSize(variantSize)
}

function derivePostParentSku(product = {}) {
  const explicit = compactProductToken(product.parentSku || product.parentSKU || product.parent_sku || product.masterSku || product.productSku)
  if (explicit) return explicit
  const sku = compactProductToken(product.sku)
  const size = postProductSize(product).replace(/\s+/g, '')
  if (sku && size && sku.toLowerCase().endsWith(size.toLowerCase())) {
    return sku.slice(0, Math.max(0, sku.length - size.length)) || sku
  }
  return compactProductToken(product.productId || product.id || sku)
}

function postProductGroupKey(product = {}) {
  return compactProductToken(derivePostParentSku(product) || product.parentProductId || product.productId || product.id || product.sku)
}

function buildPostProductGroups(products = []) {
  const groups = new Map()
  for (const product of products || []) {
    const id = postProductGroupKey(product)
    if (!id) continue
    const variant = { ...product }
    const existing = groups.get(id)
    if (!existing) {
      groups.set(id, {
        id,
        name: postProductName(product),
        parentSku: derivePostParentSku(product),
        imageUrl: product.imageUrl,
        variants: [variant],
        totalStock: postProductStock(product),
      })
      continue
    }
    existing.variants.push(variant)
    existing.totalStock += postProductStock(product)
    if (!existing.imageUrl && product.imageUrl) existing.imageUrl = product.imageUrl
  }
  return Array.from(groups.values()).map((group) => ({
    ...group,
    variantCount: group.variants.length,
    primary: group.variants[0],
  }))
}

function sortPostProductGroups(groups = [], pinnedIds = []) {
  const pinRank = new Map(pinnedIds.map((id, index) => [id, index]))
  return [...groups].sort((a, b) => {
    const aPinned = pinRank.has(a.id)
    const bPinned = pinRank.has(b.id)
    if (aPinned && bPinned) return pinRank.get(a.id) - pinRank.get(b.id)
    if (aPinned) return -1
    if (bPinned) return 1
    return 0
  })
}

export default function SocialOpsBoard({ mode, snapshot, onSnapshot, onOpenChat, topSlot = null }) {
  if (mode === 'post') {
    return (
      <OpsShell
        title="โพสต์"
        summary="ตั้งค่า Post Selling Session แบบ EasyStore: เลือกร้าน, เลือกโพสต์ Facebook, ผูกสินค้า, ตั้งรหัสสินค้า จำนวน และติดตามข้อความกับคำสั่งซื้อ"
        onOpenChat={onOpenChat}
        topSlot={topSlot}
      >
        <PostSellingSessionBoard snapshot={snapshot} />
      </OpsShell>
    )
  }

  if (mode === 'live') {
    return (
      <OpsShell
        title="ไลฟ์สตรีม"
        summary="ตรวจ live/comment stream ก่อน ถ้า Meta scope ยังไม่พร้อมจะใช้ live-post comment capture เป็น fallback"
        onOpenChat={onOpenChat}
        topSlot={topSlot}
      >
        <LiveCaptureBoard snapshot={snapshot} />
      </OpsShell>
    )
  }

  if (mode === 'report') {
    return <MessageReport snapshot={snapshot} onOpenChat={onOpenChat} topSlot={topSlot} />
  }

  return null
}

function OpsShell({ title, summary, onOpenChat, topSlot = null, children }) {
  return (
    <main className="order-1 min-h-0 overflow-y-auto bg-[var(--color-paper)] p-4 lg:order-none lg:h-full lg:p-6">
      {topSlot}
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

function PostSellingSessionBoard({ snapshot, onSnapshot }) {
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
  const [expandedProductGroups, setExpandedProductGroups] = useState(() => new Set())
  const [configuredProducts, setConfiguredProducts] = useState([])
  const [orderQuery, setOrderQuery] = useState('')
  const [pinnedPosts, setPinnedPosts] = useState(() => readPinnedPostSessions())
  const [pinnedProductGroups, setPinnedProductGroups] = useState(() => readPinnedProductGroups())

  const pinnedPostId = pinnedPosts[pageProfile] || ''
  const selectedPost = posts.find((post) => post.id === selectedPostId) || null
  const displayPosts = useMemo(() => {
    if (!pinnedPostId) return posts
    return [...posts].sort((a, b) => {
      if (a.id === pinnedPostId) return -1
      if (b.id === pinnedPostId) return 1
      return 0
    })
  }, [posts, pinnedPostId])
  const filteredProductResults = useMemo(() => {
    return productResults.filter((product) => productFilter !== 'in_stock' || postProductStock(product) > 0)
  }, [productResults, productFilter])
  const productGroups = useMemo(() => {
    return sortPostProductGroups(buildPostProductGroups(filteredProductResults), pinnedProductGroups)
  }, [filteredProductResults, pinnedProductGroups])
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
        title: `Session rule · ${item.sellingCode || item.sku}`,
        text: `${item.name} · ${formatMoney(item.salePrice)} x ${item.quantity}`,
        meta: item.gift ? `ของแถม: ${item.gift}` : 'พร้อมติดตามข้อความหลังเปิดการขาย',
      })),
    ].filter(Boolean)
  }, [selectedPost, configuredProducts])

  async function loadPosts(nextPageProfile = pageProfile) {
    setLoading(true)
    setStatus('กำลังดึงโพสต์จาก Meta')
    try {
      const result = await fetchSocialPosts(nextPageProfile, 10)
      const nextPosts = result.posts || []
      const nextPinnedPostId = readPinnedPostSessions()[nextPageProfile] || ''
      setPosts(nextPosts)
      setSelectedPostId((current) => {
        if (nextPosts.some((post) => post.id === current)) return current
        if (nextPinnedPostId && nextPosts.some((post) => post.id === nextPinnedPostId)) return nextPinnedPostId
        return ''
      })
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
    setSearchStatus('กำลังค้นสินค้า EasyStore')
    try {
      const result = await searchEasyStoreProducts(productQuery.trim(), 8)
      const products = result.products || []
      setProductResults(products)
      setExpandedProductGroups(new Set())
      setSearchStatus(`พบสินค้า ${products.length} รายการ · ${buildPostProductGroups(products).length} กลุ่ม`)
    } catch (error) {
      setSearchStatus(error.message)
    }
  }

  function configuredProductFromEasyStore(product, index = 0) {
    const sku = product.sku || product.id
    const unitPrice = Number(product.sellPrice ?? product.unitPrice ?? 0)
    return {
      localId: `${sku}:${Date.now()}:${index}`,
      id: product.id,
      sku,
      name: product.name || postProductName(product) || sku,
      sellingCode: sku,
      salePrice: unitPrice,
      quantity: 1,
      remaining: postProductStock(product),
      gift: '',
      easyStoreProduct: product,
    }
  }

  function addProducts(products = [], label = 'สินค้า') {
    const incomingProducts = products.filter(Boolean)
    if (incomingProducts.length === 0) {
      setSearchStatus('ไม่มีสินค้าให้เพิ่ม')
      return
    }
    let addedCount = 0
    let skippedCount = 0
    setConfiguredProducts((current) => {
      const seenSkus = new Set(current.map((item) => item.sku))
      const nextItems = incomingProducts
        .map((product, index) => configuredProductFromEasyStore(product, index))
        .filter((item) => {
          if (seenSkus.has(item.sku)) {
            skippedCount += 1
            return false
          }
          seenSkus.add(item.sku)
          addedCount += 1
          return true
        })
      return [...current, ...nextItems]
    })
    if (addedCount === 0) {
      setSearchStatus(skippedCount ? `${label} อยู่ในโพสต์แล้ว` : 'ไม่มีสินค้าให้เพิ่ม')
      return
    }
    const suffix = skippedCount ? ` · ข้ามซ้ำ ${skippedCount} รายการ` : ''
    setSearchStatus(`เพิ่ม ${label} เข้าโพสต์ขายแล้ว ${addedCount} รายการ${suffix}`)
  }

  function addProduct(product) {
    const sku = postProductSku(product)
    addProducts([product], sku)
  }

  function toggleProductGroup(groupId) {
    setExpandedProductGroups((current) => {
      const next = new Set(current)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  function pinProductGroup(groupId) {
    if (!groupId) return
    setPinnedProductGroups((current) => {
      if (current.includes(groupId)) return current
      const next = [groupId, ...current]
      writePinnedProductGroups(next)
      return next
    })
  }

  function togglePinnedProductGroup(groupId) {
    if (!groupId) return
    setPinnedProductGroups((current) => {
      const isRemoving = current.includes(groupId)
      const next = isRemoving ? current.filter((id) => id !== groupId) : [groupId, ...current]
      writePinnedProductGroups(next)
      setSearchStatus(isRemoving ? `ยกเลิกปักสินค้า ${groupId} แล้ว` : `ปักสินค้า ${groupId} ใช้บ่อยแล้ว`)
      return next
    })
  }

  function addProductGroup(group, { pin = false } = {}) {
    if (!group) return
    if (pin) pinProductGroup(group.id)
    addProducts(group.variants, group.name)
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
      draft: 'ยังไม่เปิด session',
      open: 'เปิดการขาย',
      paused: 'หยุดรับคำสั่งซื้อ',
      ended: 'จบโพสต์',
    }
    setStatus(`${labels[nextStatus]} · บันทึกเป็น session state ในหน้านี้ ยังไม่เปิด live automation`)
  }

  function togglePinnedPost(post) {
    const postId = post?.id
    if (!postId) return
    const isRemoving = pinnedPostId === postId
    setPinnedPosts((current) => {
      const next = { ...current }
      if (isRemoving) {
        delete next[pageProfile]
      } else {
        next[pageProfile] = postId
      }
      writePinnedPostSessions(next)
      return next
    })
    setSelectedPostId(postId)
    setStatus(isRemoving ? `ยกเลิกปักโพสต์ ${postId} แล้ว` : `ปักโพสต์ ${postId} สำหรับเพจนี้แล้ว`)
  }

  const canOpenSale = Boolean(selectedPost && configuredProducts.length)
  const displayStatus = selectedPost && sessionStatus === 'draft' ? 'linked' : sessionStatus
  const statusLabel = {
    linked: 'เชื่อมโพสต์แล้ว',
    draft: 'ยังไม่เปิด session',
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
      <div className="grid min-h-[calc(100dvh-220px)] lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.62fr)_minmax(260px,0.52fr)]">
        <div className="min-h-0 min-w-0 overflow-y-auto border-b border-[var(--color-rule)] lg:border-b-0 lg:border-r">
          <div className="sticky top-0 z-10 border-b border-[var(--color-rule)] bg-[var(--color-panel)] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[var(--color-ink)]">
                ตั้งค่า Post Selling Session
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
                ) : displayPosts.map((post) => {
                  const active = post.id === selectedPostId
                  const pinned = post.id === pinnedPostId
                  const title = post.message || post.story || post.id
                  return (
                    <div
                      key={post.id}
                      className={`grid grid-cols-[minmax(0,1fr)_72px] overflow-hidden rounded-[var(--radius-md)] border text-xs transition ${active ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-ink)]' : 'border-[var(--color-rule)] bg-[var(--color-panel)] text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]'}`}
                    >
                      <button
                        type="button"
                        aria-label={`เลือกโพสต์ ${title}`}
                        onClick={() => setSelectedPostId(post.id)}
                        className="min-w-0 px-3 py-2 text-left"
                      >
                        <span className="line-clamp-2 break-words font-bold leading-5">{title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--color-muted)]">
                          {pinned ? <span className="font-bold text-[var(--color-accent)]">ปักหมุดใช้งาน</span> : null}
                          <span className="max-w-full truncate">{post.id}</span>
                          <span>{(post.commentCount ?? post.comments?.summary?.total_count ?? 0).toLocaleString('th-TH')} comments</span>
                          <span>{formatDateTime(post.createdTime || post.created_time)}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-pressed={pinned}
                        aria-label={`${pinned ? 'เลิกปักหมุดโพสต์' : 'ปักหมุดโพสต์'} ${title}`}
                        onClick={() => togglePinnedPost(post)}
                        className={`border-l border-[var(--color-rule)] px-2 text-center text-[11px] font-bold ${pinned ? 'bg-[var(--color-accent)] text-[var(--color-accent-ink)]' : 'text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]'}`}
                      >
                        {pinned ? 'ปักแล้ว' : 'ปัก'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-paper)] p-3">
              <div className="grid min-w-0 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(132px,160px)_120px]">
                <label className="grid min-w-0 gap-1 text-xs font-semibold text-[var(--color-muted)]">
                  ค้นหาสินค้า
                  <input
                    value={productQuery}
                    onChange={(event) => setProductQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') searchProducts()
                    }}
                    className="h-10 min-w-0 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 text-sm text-[var(--color-ink)]"
                    placeholder="SKU หรือชื่อสินค้า"
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-xs font-semibold text-[var(--color-muted)]">
                  ตัวกรอง
                  <select
                    value={productFilter}
                    onChange={(event) => setProductFilter(event.target.value)}
                    className="h-10 min-w-0 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 text-sm text-[var(--color-ink)]"
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
                  {searchStatus === 'กำลังค้นสินค้า EasyStore' ? 'กำลังค้น' : 'ค้นหา'}
                </button>
              </div>
              <StatusLine value={searchStatus} />
              {productResults.length ? (
                <div className="min-w-0">
                  {pinnedProductGroups.length ? (
                    <div className="mb-2 rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3 py-2 text-xs font-bold text-[var(--color-accent)]">
                      ปักหมุดใช้บ่อย
                    </div>
                  ) : null}
                  <div
                    role="grid"
                    aria-label="รายการสินค้า EasyStore สำหรับโพสต์"
                    className="grid max-h-64 min-w-0 gap-2 overflow-y-auto"
                  >
                    {productGroups.length ? productGroups.map((group) => {
                      const isPinned = pinnedProductGroups.includes(group.id)
                      const isExpanded = expandedProductGroups.has(group.id)
                      const hasVariants = group.variantCount > 1
                      const primarySku = postProductSku(group.primary)
                      const primaryLabel = hasVariants ? group.name : (group.primary?.name || group.name)
                      return (
                        <div
                          key={group.id}
                          role="gridcell"
                          aria-label={`${group.name} ${group.parentSku} ${group.totalStock} ชิ้น ${group.variantCount} ตัวเลือก`}
                          className="min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] text-xs text-[var(--color-ink-2)]"
                        >
                          <div className="grid min-w-0 gap-2 p-3">
                            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_38px] gap-2">
                              <button
                                type="button"
                                onClick={() => (hasVariants ? toggleProductGroup(group.id) : addProduct(group.primary))}
                                aria-label={hasVariants ? `ดูตัวเลือก ${group.name}` : `เพิ่ม ${primarySku} · ${primaryLabel}`}
                                aria-expanded={hasVariants ? isExpanded : undefined}
                                className="min-w-0 text-left"
                              >
                                <span className="line-clamp-2 break-words font-bold leading-5 text-[var(--color-ink)]">{primarySku} · {primaryLabel}</span>
                                <span className="mt-1 block truncate text-[11px] font-semibold text-[var(--color-muted)]">SKU แม่: {group.parentSku}</span>
                                <span className="mt-1 flex flex-wrap gap-1 text-[11px] font-semibold text-[var(--color-muted)]">
                                  <span>{group.variantCount} ตัวเลือก</span>
                                  <span>รวม {group.totalStock.toLocaleString('th-TH')} ชิ้น</span>
                                  <span>{formatMoney(group.primary?.sellPrice ?? group.primary?.unitPrice)}</span>
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => togglePinnedProductGroup(group.id)}
                                aria-label={`${isPinned ? 'เลิกปักหมุดสินค้า' : 'ปักหมุดสินค้า'} ${group.name}`}
                                aria-pressed={isPinned}
                                className={`grid h-9 w-9 place-items-center rounded-[var(--radius-md)] border text-sm font-bold ${isPinned ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-ink)]' : 'border-[var(--color-rule)] bg-[var(--color-panel-2)] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]'}`}
                              >
                                {isPinned ? '★' : '☆'}
                              </button>
                            </div>
                            <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                              <button
                                type="button"
                                onClick={() => addProductGroup(group)}
                                aria-label={`เพิ่มทั้งหมด ${group.name}`}
                                className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-2.5 py-2 text-xs font-bold text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
                              >
                                เพิ่มทั้งหมด
                              </button>
                              <button
                                type="button"
                                onClick={() => addProductGroup(group, { pin: true })}
                                aria-label={`ปัก+เพิ่มทั้งหมด ${group.name}`}
                                className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-2.5 py-2 text-xs font-bold text-[var(--color-accent-ink)]"
                              >
                                ปัก+เพิ่มทั้งหมด
                              </button>
                            </div>
                          </div>
                          {hasVariants && isExpanded ? (
                            <div className="grid gap-1 border-t border-[var(--color-rule)] bg-[var(--color-panel-2)] p-2">
                              {group.variants.map((variant) => (
                                <button
                                  key={variant.id || variant.variantId || variant.sku}
                                  type="button"
                                  onClick={() => addProduct(variant)}
                                  aria-label={`เพิ่ม ${postProductSku(variant)}`}
                                  className="flex min-w-0 items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-[var(--color-panel)] px-2 py-1.5 text-left text-[11px] font-bold text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
                                >
                                  <span className="min-w-0 truncate">{postProductSku(variant)}</span>
                                  <span className="shrink-0 text-[var(--color-muted)]">{postProductStock(variant).toLocaleString('th-TH')} ชิ้น</span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )
                    }) : (
                      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-rule)] px-3 py-6 text-center text-xs text-[var(--color-muted)]">
                        ไม่มีสินค้าตามตัวกรองนี้
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-paper)] p-3">
              <h3 className="text-xs font-bold text-[var(--color-ink)]">สินค้าที่ต้องการขาย</h3>
              {configuredProducts.length === 0 ? (
                <div className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[var(--color-rule)] px-3 py-8 text-center text-xs text-[var(--color-muted)]">เลือกสินค้าเพื่อกำหนดรหัสสินค้า ราคา จำนวน และของแถม</div>
              ) : (
                <div className="mt-3 grid min-w-0 gap-3">
                  {configuredProducts.map((item) => (
                    <div key={item.localId} className="min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="break-words text-sm font-bold leading-5 text-[var(--color-ink)]">{item.sku} · {item.name}</div>
                          <div className="mt-1 text-[11px] text-[var(--color-muted)]">EasyStore product {item.id || '-'}</div>
                        </div>
                        <button type="button" onClick={() => removeProduct(item.localId)} className="shrink-0 rounded-[var(--radius-md)] border border-[var(--color-rule)] px-2 py-1 text-xs font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]">ลบ</button>
                      </div>
                      <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
                        <PostProductInput label="รหัสสินค้าใน session" value={item.sellingCode} onChange={(value) => updateProduct(item.localId, { sellingCode: value })} />
                        <PostProductInput label="ราคา" type="number" value={item.salePrice} onChange={(value) => updateProduct(item.localId, { salePrice: Number(value || 0) })} />
                        <PostProductInput label="จำนวนขาย" type="number" value={item.quantity} onChange={(value) => updateProduct(item.localId, { quantity: Math.max(1, Number(value || 1)) })} />
                        <PostProductInput label="คงเหลือ" type="number" value={item.remaining} onChange={(value) => updateProduct(item.localId, { remaining: Math.max(0, Number(value || 0)) })} />
                        <label className="grid min-w-0 gap-1 text-[11px] font-semibold text-[var(--color-muted)] sm:col-span-2">
                          ของแถม
                          <input
                            value={item.gift}
                            onChange={(event) => updateProduct(item.localId, { gift: event.target.value })}
                            className="h-9 min-w-0 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-2 text-xs text-[var(--color-ink)]"
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

        <div className="flex min-h-[420px] min-w-0 flex-col border-b border-[var(--color-rule)] bg-[var(--color-paper)] lg:border-b-0 lg:border-r">
          <div className="border-b border-[var(--color-rule)] bg-[var(--color-panel)] px-4 py-3">
            <h3 className="text-sm font-bold text-[var(--color-ink)]">ข้อความ</h3>
            <div className="mt-1 text-xs text-[var(--color-muted)]">{selectedPost ? 'รอดึงคอมเมนต์/ข้อความจากโพสต์ที่เชื่อมต่อ' : 'เลือกโพสต์ก่อนเริ่ม session'}</div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {messageRows.length === 0 ? (
              <div className="grid h-full min-h-[260px] place-items-center text-center">
                <div>
                  <div className="text-sm font-bold text-[var(--color-ink)]">ยังไม่มีข้อความใน session</div>
                  <div className="mt-2 max-w-xs text-xs leading-5 text-[var(--color-muted)]">หลังเลือกโพสต์และตั้งสินค้า ข้อความ/คอมเมนต์ที่เข้ากับรหัสสินค้าใน session จะมาอยู่ฝั่งนี้</div>
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

        <div className="flex min-h-[420px] min-w-0 flex-col bg-[var(--color-panel)]">
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
    <label className="grid min-w-0 gap-1 text-[11px] font-semibold text-[var(--color-muted)]">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 min-w-0 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-2 text-xs text-[var(--color-ink)]"
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

function MessageReport({ snapshot, onOpenChat, topSlot = null }) {
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
      {topSlot}
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
