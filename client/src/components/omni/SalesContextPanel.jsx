import React, { useEffect, useRef, useState } from 'react'
import { fetchSalesContext, searchEasyStoreProducts } from '../../lib/omniApi.js'

function money(value) {
  const amount = Number(value || 0)
  if (!amount) return '-'
  return `฿${amount.toLocaleString('th-TH')}`
}

function memoryLine(memory = {}) {
  const parts = []
  if (memory.lastSize) parts.push(`ไซซ์ ${memory.lastSize}`)
  if (memory.lastColor) parts.push(`สี${memory.lastColor}`)
  if (memory.lastSku) parts.push(memory.lastSku)
  return parts.join(' · ') || '-'
}

function productName(product = {}) {
  return product.productName || product.title || product.name || product.sku || product.productId || product.id || 'สินค้า'
}

function productPrice(product = {}) {
  return product.price?.formatted || money(product.sellPrice ?? product.price ?? 0)
}

function productStock(product = {}) {
  return product.availableStock ?? product.stock?.totalQuantity ?? product.availableTotal ?? 0
}

function productSku(product = {}) {
  return product.sku || product.productId || product.id || '-'
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

function displayProductOption(value = '') {
  const label = compactProductToken(value)
  if (!label || /^set\b/i.test(label) || label.startsWith('สี')) return label
  return `สี${label}`
}

function productDraftName(product = {}) {
  const name = compactProductToken(productName(product))
  const family = name.split(' ')[0] || 'สินค้า'
  const color = compactProductToken(product.color || product.variantColor || '')
  const optionColor = compactProductToken(product.variantTitle || product.variant || '').split(',')[0]?.trim() || ''
  return [family, displayProductOption(color || optionColor)].filter(Boolean).join(' ')
}

function productDraftSize(product = {}) {
  const explicit = cleanVariantSize(product.size || product.variantSize)
  if (explicit) return explicit
  const variantSize = compactProductToken(product.variantTitle || '').split(',').slice(1).join(',').trim()
  return cleanVariantSize(variantSize)
}

function productDraftPrice(product = {}) {
  const formatted = productPrice(product)
  if (formatted === '-') return ''
  const plain = formatted.replace(/^฿/, '').trim()
  return `ราคา ${plain} บาท`
}

function productDraftStock(product = {}) {
  const quantity = Number(productStock(product) || 0)
  if (quantity > 0 && quantity < 5) return 'เหลือน้อยแล้ว'
  if (quantity > 0) return 'พร้อมส่ง'
  if (product.stock?.status === 'out_of_stock') return 'รอเติมสต็อก'
  return ''
}

function buildEasyStoreProductDraft({ product, thread }) {
  const id = product.productId || product.id || product.variantId || product.sku || ''
  const previewUrl = id
    ? `${window.location.origin}/p/easystore/${encodeURIComponent(id)}`
    : ''
  const size = productDraftSize(product)
  const detailLine = [
    size ? `ไซซ์ ${size}` : '',
    productDraftPrice(product),
    productDraftStock(product),
  ].filter(Boolean).join(' ')
  const lines = [
    `มี ${productDraftName(product)}ค่ะ`,
    detailLine,
  ].filter(Boolean)
  if (previewUrl) lines.push('', 'ดูสินค้า:', previewUrl)
  return {
    text: lines.join('\n'),
    attachments: product.imageUrl ? [{
      id: `easystore_product_${id || Date.now()}`,
      name: product.name || productName(product),
      type: 'image/jpeg',
      size: 0,
      url: product.imageUrl,
    }] : [],
  }
}

export default function SalesContextPanel({ thread, onUseDraft }) {
  const [context, setContext] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [productSection, setProductSection] = useState('list')
  const [productListView, setProductListView] = useState('grid')
  const [productQuery, setProductQuery] = useState('')
  const [products, setProducts] = useState([])
  const [productBusy, setProductBusy] = useState(false)
  const [productPreloadBusy, setProductPreloadBusy] = useState(false)
  const [productStatus, setProductStatus] = useState('')
  const productRequestId = useRef(0)

  useEffect(() => {
    let ignore = false
    setContext(null)
    setError('')
    if (!thread?.id) return () => { ignore = true }
    setBusy(true)
    fetchSalesContext(thread.id)
      .then((result) => {
        if (!ignore) setContext(result)
      })
      .catch((err) => {
        if (!ignore) setError(err.message || 'sales_context_failed')
      })
      .finally(() => {
        if (!ignore) setBusy(false)
      })
    return () => { ignore = true }
  }, [thread?.id])

  useEffect(() => {
    let ignore = false
    setProductQuery('')
    setProducts([])
    setProductStatus('')
    setProductSection('list')
    if (!thread?.id) return () => { ignore = true }
    setProductBusy(false)
    setProductPreloadBusy(true)
    const requestId = productRequestId.current + 1
    productRequestId.current = requestId
    searchEasyStoreProducts('', 8)
      .then((result) => {
        if (ignore || requestId !== productRequestId.current) return
        const rows = result.products || []
        setProducts(rows)
        setProductStatus(rows.length ? `โหลดสินค้า EasyStore ${rows.length} รายการ` : 'ยังไม่มีสินค้า EasyStore')
      })
      .catch((err) => {
        if (!ignore && requestId === productRequestId.current) setProductStatus(err.message || 'easystore_product_search_failed')
      })
      .finally(() => {
        if (!ignore && requestId === productRequestId.current) setProductPreloadBusy(false)
      })
    return () => { ignore = true }
  }, [thread?.id])

  async function searchProducts(event) {
    event?.preventDefault()
    if (productBusy) return
    const requestId = productRequestId.current + 1
    productRequestId.current = requestId
    setProductPreloadBusy(false)
    setProductBusy(true)
    setProductStatus('กำลังค้นสินค้า EasyStore')
    try {
      const result = await searchEasyStoreProducts(productQuery.trim(), 12)
      if (requestId !== productRequestId.current) return
      const rows = result.products || []
      setProducts(rows)
      setProductStatus(rows.length ? `พบสินค้า ${rows.length} รายการ` : 'ไม่พบสินค้า EasyStore')
    } catch (err) {
      if (requestId === productRequestId.current) setProductStatus(err.message || 'easystore_product_search_failed')
    } finally {
      if (requestId === productRequestId.current) setProductBusy(false)
    }
  }

  function useImage(image) {
    if (!image?.url) return
    const productName = context?.product?.product?.productName || image.alt || 'สินค้า'
    onUseDraft?.({
      id: `sales_image_${thread.id}_${image.id || Date.now()}`,
      threadId: thread.id,
      text: `ส่งภาพ ${productName} ให้ดูค่ะ`,
      attachments: [{
        id: image.id || `sales_image_${Date.now()}`,
        name: image.alt || productName,
        type: 'image/jpeg',
        url: image.url,
      }],
    })
  }

  function useProduct(product) {
    if (!thread?.id) return
    const draft = buildEasyStoreProductDraft({ product, thread })
    onUseDraft?.({
      id: `easystore_product_${thread.id}_${product.id || product.productId || product.sku || Date.now()}`,
      threadId: thread.id,
      text: draft.text,
      attachments: draft.attachments,
    })
    setProductStatus(`ใส่สินค้าในกล่องตอบแล้ว: ${productName(product)}`)
  }

  if (!thread) return <div className="p-4 text-xs text-[var(--color-muted)]">เลือกแชทก่อน</div>
  if (busy) return <div className="p-4 text-xs font-semibold text-[var(--color-muted)]">กำลังโหลดบริบทการขาย</div>
  if (error) return <div className="m-4 rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-xs font-semibold text-[var(--color-danger)]">{error}</div>
  if (!context) return <div className="p-4 text-xs text-[var(--color-muted)]">ยังไม่มีบริบทการขาย</div>

  const customer = context.customer || {}
  const memory = customer.memory || {}
  const match = customer.match || {}
  const product = context.product?.product
  const variants = context.product?.variants || []
  const images = context.imagePicker?.images || []
  const productViewButtonClass = (active) => [
    'grid h-12 w-12 shrink-0 place-items-center rounded-[var(--radius-md)] border transition',
    active
      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
      : 'border-[var(--color-rule)] bg-[var(--color-panel)] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]',
  ].join(' ')
  const productTabClass = (active) => [
    'h-9 flex-1 rounded-[var(--radius-sm)] text-xs font-bold transition',
    active
      ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
      : 'text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-ink)]',
  ].join(' ')

  return (
    <div className="space-y-3 p-4">
      <section className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-[var(--color-ink)]">{productSection === 'list' ? 'รายการสินค้า' : 'สินค้าในแชท'}</h2>
            <p className="mt-1 text-xs font-semibold text-[var(--color-muted)]">
              {productSection === 'list' ? 'ค้นสินค้า EasyStore เพื่อใช้ตอบในกล่องแชท' : 'ข้อมูลสินค้าที่จับได้จากบทสนทนานี้'}
            </p>
          </div>
          {productSection === 'list' ? (
            <div className="flex shrink-0 gap-2" aria-label="มุมมองสินค้า">
              <button
                type="button"
                aria-label="มุมมองกริดสินค้า"
                aria-pressed={productListView === 'grid'}
                onClick={() => setProductListView('grid')}
                className={productViewButtonClass(productListView === 'grid')}
              >
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-5 w-5" fill="none">
                  <rect x="2" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
                  <rect x="9" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
                  <rect x="2" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
                  <rect x="9" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="มุมมองรายการสินค้า"
                aria-pressed={productListView === 'line'}
                onClick={() => setProductListView('line')}
                className={productViewButtonClass(productListView === 'line')}
              >
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-5 w-5" fill="none">
                  <path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ) : null}
        </div>
        <div role="tablist" aria-label="แถบเลือกข้อมูลสินค้า" className="mt-3 flex rounded-[var(--radius-md)] bg-[var(--color-panel-2)] p-1">
          <button
            type="button"
            role="tab"
            aria-selected={productSection === 'list'}
            onClick={() => setProductSection('list')}
            className={productTabClass(productSection === 'list')}
          >
            รายการสินค้า
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={productSection === 'chat'}
            onClick={() => setProductSection('chat')}
            className={productTabClass(productSection === 'chat')}
          >
            สินค้าในแชท
          </button>
        </div>

        {productSection === 'list' ? (
          <>
            <form onSubmit={searchProducts} className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <label className="min-w-0 text-xs font-semibold text-[var(--color-muted)]" htmlFor="sales-easystore-search">
                ค้นสินค้า EasyStore
                <input
                  id="sales-easystore-search"
                  value={productQuery}
                  onChange={(event) => setProductQuery(event.target.value)}
                  placeholder="SKU หรือชื่อสินค้า"
                  className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-sm font-semibold text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                />
              </label>
              <button
                type="submit"
                disabled={productBusy}
                className="self-end rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm font-bold text-[var(--color-ink-2)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-45"
              >
                {productBusy ? 'กำลังค้น' : 'ค้น EasyStore'}
              </button>
            </form>
            {productStatus ? <div className="mt-2 text-xs font-semibold text-[var(--color-muted)]">{productStatus}</div> : null}
            <div
              role="grid"
              aria-label="รายการสินค้า EasyStore"
              data-view={productListView}
              className={productListView === 'grid' ? 'mt-3 grid grid-cols-2 gap-2' : 'mt-3 grid gap-2'}
            >
              {products.length ? products.map((product) => (
                <div
                  key={product.id || product.variantId || product.sku}
                  role="gridcell"
                  aria-label={`${productName(product)} ${productSku(product)} ${productStock(product)} ชิ้น`}
                  className="min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] transition hover:border-[var(--color-accent)]"
                >
                  <button
                    type="button"
                    onClick={() => useProduct(product)}
                    aria-label={`ใช้ตอบ ${productSku(product)}`}
                    className={productListView === 'grid' ? 'block w-full text-left' : 'grid w-full grid-cols-[72px_minmax(0,1fr)] items-center gap-3 text-left'}
                  >
                    <div className="overflow-hidden bg-[var(--color-panel)]">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name || productName(product)}
                          className={productListView === 'grid' ? 'aspect-square w-full object-cover' : 'aspect-square h-[72px] w-[72px] object-cover'}
                          loading="lazy"
                        />
                      ) : (
                        <div className="grid aspect-square w-full place-items-center text-xs font-bold text-[var(--color-muted)]">สินค้า</div>
                      )}
                    </div>
                    <div className="space-y-1 p-2">
                      <div className="truncate text-xs font-bold text-[var(--color-ink)]">{productName(product)}</div>
                      <div className="truncate text-[10px] font-semibold text-[var(--color-muted)]">SKU: {productSku(product)}</div>
                      <div className="text-[10px] font-semibold text-[var(--color-muted)]">{productStock(product)} ชิ้น</div>
                    </div>
                  </button>
                </div>
              )) : (
                <div className="col-span-2 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-rule)] px-3 py-6 text-center text-xs text-[var(--color-muted)]">{productPreloadBusy ? 'กำลังโหลดสินค้า EasyStore' : 'ค้นหาเพื่อดึงสินค้า EasyStore จริง'}</div>
              )}
            </div>
          </>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="rounded-[var(--radius-sm)] bg-[var(--color-panel-2)] p-3">
              {product ? (
                <>
                  <div className="text-sm font-semibold text-[var(--color-ink)]">{product.productName}</div>
                  <div className="mt-1 text-xs text-[var(--color-muted)]">พร้อมส่งรวม {product.availableTotal || 0} ชิ้น · {money(product.price)}</div>
                  <div className="mt-3 grid gap-2">
                    {variants.slice(0, 4).map((variant) => (
                      <div key={variant.id || variant.sku} className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-[var(--color-panel)] px-2 py-1.5 text-xs">
                        <span className="min-w-0 truncate font-semibold text-[var(--color-ink)]">{variant.sku || variant.variantId}</span>
                        <span className="shrink-0 text-[var(--color-muted)]">{variant.available} ชิ้น · {money(variant.price)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-rule)] px-3 py-6 text-center text-xs text-[var(--color-muted)]">ยังจับสินค้าไม่ได้</div>
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--color-ink)]">รูปแนะนำ</h3>
              {images.length ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {images.map((image) => (
                    <button
                      key={image.id || image.url}
                      type="button"
                      onClick={() => useImage(image)}
                      className="group overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] text-left transition hover:border-[var(--color-accent)]"
                    >
                      <img src={image.url} alt={image.alt || 'product'} className="aspect-square w-full object-cover" />
                      <div className="p-2">
                        <div className="truncate text-xs font-semibold text-[var(--color-ink)]">{image.alt || 'สินค้า'}</div>
                        <div className="mt-1 text-[10px] font-semibold text-[var(--color-muted)]">ใช้รูปนี้</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-2 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-rule)] px-3 py-6 text-center text-xs text-[var(--color-muted)]">ยังไม่มีรูปจาก EasyStore preview</div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[var(--color-ink)]">ลูกค้าเดิม</h2>
          <span className={`rounded-[var(--radius-pill)] px-2 py-1 text-[10px] font-bold ${match.safeToUsePrivateData ? 'bg-[var(--color-live-soft)] text-[var(--color-live)]' : 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]'}`}>
            {match.safeToUsePrivateData ? 'match ปลอดภัย' : 'ยังไม่ใช้ข้อมูลส่วนตัว'}
          </span>
        </div>
        <dl className="mt-3 grid gap-2 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--color-muted)]">เบอร์</dt>
            <dd className="font-semibold text-[var(--color-ink)]">{memory.phoneMasked || '-'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--color-muted)]">เคยซื้อ</dt>
            <dd className="max-w-[65%] truncate font-semibold text-[var(--color-ink)]">{memoryLine(memory)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--color-muted)]">ที่อยู่</dt>
            <dd className="max-w-[65%] truncate font-semibold text-[var(--color-ink)]">{memory.lastAddressMasked || '-'}</dd>
          </div>
        </dl>
      </section>

    </div>
  )
}
