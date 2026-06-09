import React, { useEffect, useState } from 'react'
import { fetchEasyStoreProductPreview, fetchOmniSettings, saveOmniSettings, searchEasyStoreProducts } from '../../lib/omniApi.js'
import AiDecisionPanel from './AiDecisionPanel.jsx'
import OrderDesk from './OrderDesk.jsx'
import PaymentDesk from './PaymentDesk.jsx'
import ProfilePanel from './ProfilePanel.jsx'
import SalesContextPanel from './SalesContextPanel.jsx'

const TABS = [
  { id: 'ai', label: 'AI' },
  { id: 'sales', label: 'สินค้า' },
  { id: 'profiles', label: 'โปรไฟล์' },
  { id: 'orders', label: 'ออเดอร์' },
  { id: 'payment', label: 'ชำระเงิน' },
]

function easyStoreProductId(product = {}) {
  return product.productId || product.id || product.variantId || product.sku || ''
}

function easyStoreProductTitle(product = {}) {
  return product.productName || product.title || product.name || product.sku || product.productId || product.id || 'สินค้า EasyStore'
}

function uniqueEasyStoreProducts(products = []) {
  const rows = new Map()
  for (const product of products || []) {
    const id = easyStoreProductId(product)
    if (!id || rows.has(String(id))) continue
    rows.set(String(id), product)
  }
  return Array.from(rows.values())
}

function easyStoreImageLabel(image = {}, index = 0) {
  return image.alt || image.title || `รูปสินค้า ${index + 1}`
}

function resolveContextWorkspaceId({ workspaceId, snapshot, thread }) {
  if (workspaceId) return workspaceId
  const page = (snapshot?.pages || []).find((item) => item.id === thread?.pageId)
  if (page?.workspaceId) return page.workspaceId
  return snapshot?.workspaces?.[0]?.id || 'ws_oagent'
}

export default function ContextPanel({ snapshot, thread, onSnapshot, workspaceId, onUseDraft }) {
  const [tab, setTab] = useState('ai')
  const [settings, setSettings] = useState(snapshot?.settings || null)
  const [guardError, setGuardError] = useState('')
  const [richMessageText, setRichMessageText] = useState('')
  const [richMessageBusy, setRichMessageBusy] = useState(false)
  const [richMessageStatus, setRichMessageStatus] = useState('')
  const [sizeChartImageUrl, setSizeChartImageUrl] = useState('')
  const [salesAssetsBusy, setSalesAssetsBusy] = useState(false)
  const [salesAssetsStatus, setSalesAssetsStatus] = useState('')
  const [sizeChartPickerOpen, setSizeChartPickerOpen] = useState(false)
  const [sizeChartQuery, setSizeChartQuery] = useState('')
  const [sizeChartProducts, setSizeChartProducts] = useState([])
  const [sizeChartProduct, setSizeChartProduct] = useState(null)
  const [sizeChartImages, setSizeChartImages] = useState([])
  const [sizeChartPickerBusy, setSizeChartPickerBusy] = useState(false)
  const [sizeChartPickerStatus, setSizeChartPickerStatus] = useState('')
  const contextWorkspaceId = resolveContextWorkspaceId({ workspaceId, snapshot, thread })

  useEffect(() => {
    if (snapshot?.settings) setSettings(snapshot.settings)
  }, [snapshot?.settings])

  useEffect(() => {
    setRichMessageText(settings?.ai?.richMessage?.text || '')
  }, [settings?.ai?.richMessage?.text])

  useEffect(() => {
    setSizeChartImageUrl(settings?.ai?.salesAssets?.sizeChartImageUrl || '')
  }, [settings?.ai?.salesAssets?.sizeChartImageUrl])

  useEffect(() => {
    let ignore = false
    fetchOmniSettings(contextWorkspaceId)
      .then((nextSettings) => {
        if (!ignore) setSettings(nextSettings)
      })
      .catch((error) => {
        if (!ignore) setGuardError(error.message || 'settings_load_failed')
      })
    return () => { ignore = true }
  }, [contextWorkspaceId])

  async function saveRichMessage(enabled = true) {
    if (!settings || richMessageBusy) return
    const text = richMessageText.replace(/\s+/g, ' ').trim()
    setRichMessageBusy(true)
    setRichMessageStatus('')
    setGuardError('')
    const nextSettings = {
      ...settings,
      ai: {
        ...(settings.ai || {}),
        richMessage: {
          enabled: enabled && Boolean(text),
          text: enabled ? text : '',
        },
      },
    }
    try {
      const result = await saveOmniSettings(nextSettings, { workspaceId: contextWorkspaceId })
      setSettings(result.settings || nextSettings)
      setRichMessageText(result.settings?.ai?.richMessage?.text || nextSettings.ai.richMessage.text)
      const nextSnapshot = result.snapshot || (snapshot ? { ...snapshot, settings: result.settings || nextSettings } : null)
      if (nextSnapshot) onSnapshot?.(nextSnapshot)
      setRichMessageStatus(nextSettings.ai.richMessage.enabled ? 'บันทึกหัวข้อด่วนแล้ว' : 'ปิดหัวข้อด่วนแล้ว')
    } catch (error) {
      setGuardError(error.message || 'rich_message_update_failed')
    } finally {
      setRichMessageBusy(false)
    }
  }

  async function saveSalesAssets(enabled = true, overrideUrl = null, successMessage = '', overrideLinkUrl = null) {
    if (!settings || salesAssetsBusy) return
    const url = String(overrideUrl ?? sizeChartImageUrl).trim()
    const linkUrl = String(overrideLinkUrl ?? settings.ai?.salesAssets?.sizeChartLinkUrl ?? '').trim()
    setSalesAssetsBusy(true)
    setSalesAssetsStatus('')
    setGuardError('')
    const nextSettings = {
      ...settings,
      ai: {
        ...(settings.ai || {}),
        salesAssets: {
          ...(settings.ai?.salesAssets || {}),
          enabled,
          sizeChartImageUrl: enabled ? url : '',
          sizeChartLinkUrl: enabled ? linkUrl : '',
        },
      },
    }
    try {
      const result = await saveOmniSettings(nextSettings, { workspaceId: contextWorkspaceId })
      setSettings(result.settings || nextSettings)
      setSizeChartImageUrl(result.settings?.ai?.salesAssets?.sizeChartImageUrl || nextSettings.ai.salesAssets.sizeChartImageUrl)
      const nextSnapshot = result.snapshot || (snapshot ? { ...snapshot, settings: result.settings || nextSettings } : null)
      if (nextSnapshot) onSnapshot?.(nextSnapshot)
      setSalesAssetsStatus(successMessage || (nextSettings.ai.salesAssets.enabled && nextSettings.ai.salesAssets.sizeChartImageUrl ? 'บันทึกรูปตารางไซซ์แล้ว' : 'ปิดรูปตารางไซซ์แล้ว'))
      return true
    } catch (error) {
      setGuardError(error.message || 'sales_assets_update_failed')
      return false
    } finally {
      setSalesAssetsBusy(false)
    }
  }

  async function loadSizeChartImages(product) {
    const productId = easyStoreProductId(product)
    if (!productId) return
    setSizeChartPickerBusy(true)
    setSizeChartPickerStatus('กำลังโหลดรูปจาก EasyStore')
    try {
      const result = await fetchEasyStoreProductPreview(productId)
      const previewProduct = result.product || {}
      const images = previewProduct.images || []
      setSizeChartProduct({ ...product, ...previewProduct })
      setSizeChartImages(images)
      setSizeChartPickerStatus(images.length ? `เลือกรูปจาก ${easyStoreProductTitle(previewProduct)}` : 'สินค้านี้ยังไม่มีรูป')
    } catch (error) {
      setSizeChartPickerStatus(error.message || 'easystore_product_preview_failed')
      setSizeChartImages([])
    } finally {
      setSizeChartPickerBusy(false)
    }
  }

  async function loadSizeChartProducts(event) {
    event?.preventDefault()
    if (sizeChartPickerBusy) return
    setSizeChartPickerBusy(true)
    setSizeChartPickerStatus('กำลังค้นสินค้า EasyStore')
    setSizeChartImages([])
    try {
      const result = await searchEasyStoreProducts(sizeChartQuery.trim(), 12)
      const rows = uniqueEasyStoreProducts(result.products || [])
      setSizeChartProducts(rows)
      setSizeChartPickerStatus(rows.length ? `พบสินค้า ${rows.length} รายการ` : 'ไม่พบสินค้า EasyStore')
      if (rows[0]) await loadSizeChartImages(rows[0])
    } catch (error) {
      setSizeChartPickerStatus(error.message || 'easystore_products_failed')
    } finally {
      setSizeChartPickerBusy(false)
    }
  }

  function openSizeChartPicker() {
    setSizeChartPickerOpen(true)
    setSizeChartPickerStatus('')
    if (!sizeChartProducts.length) {
      window.setTimeout(() => {
        loadSizeChartProducts()
      }, 0)
    }
  }

  async function useEasyStoreSizeChart(image, index = 0) {
    if (!image?.url) return
    setSizeChartImageUrl(image.url)
    const saved = await saveSalesAssets(true, image.url, 'ใช้รูปจาก EasyStore แล้ว', image.url)
    if (saved) {
      setSizeChartPickerOpen(false)
      setSizeChartPickerStatus(`ใช้ ${easyStoreImageLabel(image, index)} เป็นตารางไซซ์แล้ว`)
    }
  }

  const panelSnapshot = settings ? { ...snapshot, settings } : snapshot

  function handlePanelSnapshot(nextSnapshot) {
    if (nextSnapshot?.settings) setSettings(nextSnapshot.settings)
    onSnapshot?.(nextSnapshot)
  }

  return (
    <aside className="h-full min-h-0 overflow-y-auto border-t border-[var(--color-rule)] bg-[var(--color-panel)] xl:border-l xl:border-t-0">
      <div className="sticky top-0 z-10 border-b border-[var(--color-rule)] bg-[var(--color-panel)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold text-[var(--color-muted)]">Context</div>
        </div>
        {guardError ? <div className="mt-2 rounded-[var(--radius-sm)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--color-danger)]">{guardError}</div> : null}
        <div className="mt-2 grid grid-cols-5 rounded-[var(--radius-md)] bg-[var(--color-panel-2)] p-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              className={`rounded-[var(--radius-sm)] px-2 py-1.5 text-xs font-semibold transition ${tab === item.id ? 'bg-[var(--color-panel)] text-[var(--color-accent)] shadow-sm' : 'text-[var(--color-ink-2)] hover:text-[var(--color-ink)]'}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'ai' ? (
        <>
          <section className="border-b border-[var(--color-rule)] p-4">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-[var(--color-ink)]">Rich message</h2>
                  <p className="mt-1 text-xs font-semibold text-[var(--color-muted)]">หัวข้อด่วนที่ AI ต้องย้ำในคำตอบแรก</p>
                </div>
                <span className={`rounded-[var(--radius-pill)] px-2 py-1 text-[11px] font-bold ${settings?.ai?.richMessage?.enabled ? 'bg-[var(--color-live-soft)] text-[var(--color-live)]' : 'bg-[var(--color-panel)] text-[var(--color-muted)]'}`}>
                  {settings?.ai?.richMessage?.enabled ? 'เปิด' : 'ปิด'}
                </span>
              </div>
              <label htmlFor="ai-rich-message" className="mt-3 block text-xs font-bold text-[var(--color-ink-2)]">หัวข้อด่วนให้ AI ย้ำครั้งแรก</label>
              <textarea
                id="ai-rich-message"
                value={richMessageText}
                maxLength={180}
                rows={3}
                onChange={(event) => setRichMessageText(event.target.value)}
                placeholder="เช่น 6.6 ออกตัวแรงลดยกล้อ"
                className="mt-2 min-h-[86px] w-full resize-none rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-3 text-sm font-semibold text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!settings || richMessageBusy}
                  onClick={() => saveRichMessage(true)}
                  className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-1.5 text-xs font-bold text-[var(--color-accent-ink)] disabled:opacity-50"
                >
                  {richMessageBusy ? 'กำลังบันทึก' : 'บันทึกหัวข้อด่วน'}
                </button>
                <button
                  type="button"
                  disabled={!settings || richMessageBusy || !settings?.ai?.richMessage?.enabled}
                  onClick={() => saveRichMessage(false)}
                  className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-1.5 text-xs font-bold text-[var(--color-ink-2)] disabled:opacity-50"
                >
                  ปิดหัวข้อด่วน
                </button>
                {richMessageStatus ? <span className="text-xs font-bold text-[var(--color-live)]">{richMessageStatus}</span> : null}
              </div>
            </div>
            <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-[var(--color-ink)]">Carousel assets</h2>
                  <p className="mt-1 text-xs font-semibold text-[var(--color-muted)]">รูปที่ AI แนบทันทีเมื่อรู้สินค้า/ไซซ์</p>
                </div>
                <span className={`rounded-[var(--radius-pill)] px-2 py-1 text-[11px] font-bold ${settings?.ai?.salesAssets?.enabled && settings?.ai?.salesAssets?.sizeChartImageUrl ? 'bg-[var(--color-live-soft)] text-[var(--color-live)]' : 'bg-[var(--color-panel)] text-[var(--color-muted)]'}`}>
                  {settings?.ai?.salesAssets?.enabled && settings?.ai?.salesAssets?.sizeChartImageUrl ? 'เปิด' : 'ปิด'}
                </span>
              </div>
              <label htmlFor="ai-size-chart-url" className="mt-3 block text-xs font-bold text-[var(--color-ink-2)]">ลิงก์รูปตารางไซซ์</label>
              <input
                id="ai-size-chart-url"
                value={sizeChartImageUrl}
                onChange={(event) => setSizeChartImageUrl(event.target.value)}
                placeholder="https://..."
                className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-3 text-sm font-semibold text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!settings || salesAssetsBusy}
                  onClick={() => saveSalesAssets(true)}
                  className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-1.5 text-xs font-bold text-[var(--color-accent-ink)] disabled:opacity-50"
                >
                  {salesAssetsBusy ? 'กำลังบันทึก' : 'บันทึกรูปตารางไซซ์'}
                </button>
                <button
                  type="button"
                  disabled={salesAssetsBusy}
                  onClick={openSizeChartPicker}
                  className="rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-panel)] px-3 py-1.5 text-xs font-bold text-[var(--color-accent)] disabled:opacity-50"
                >
                  เลือกจาก EasyStore
                </button>
                <button
                  type="button"
                  disabled={!settings || salesAssetsBusy || !settings?.ai?.salesAssets?.sizeChartImageUrl}
                  onClick={() => saveSalesAssets(false)}
                  className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-1.5 text-xs font-bold text-[var(--color-ink-2)] disabled:opacity-50"
                >
                  ปิดรูปตารางไซซ์
                </button>
                {salesAssetsStatus ? <span className="text-xs font-bold text-[var(--color-live)]">{salesAssetsStatus}</span> : null}
              </div>
              {sizeChartImageUrl ? (
                <div className="mt-3 grid grid-cols-[64px_minmax(0,1fr)] gap-3 rounded-[var(--radius-sm)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-2">
                  <img src={sizeChartImageUrl} alt="รูปตารางไซซ์ปัจจุบัน" className="aspect-square w-16 rounded-[var(--radius-sm)] object-cover" loading="lazy" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[var(--color-ink)]">รูปตารางไซซ์ปัจจุบัน</div>
                    <div className="mt-1 truncate text-[11px] font-semibold text-[var(--color-muted)]">{sizeChartImageUrl}</div>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
          {sizeChartPickerOpen ? (
            <div className="fixed inset-0 z-50 grid place-items-center bg-[#101820]/60 p-3" role="presentation">
              <div
                role="dialog"
                aria-modal="true"
                aria-label="เลือกภาพตารางไซซ์จาก EasyStore"
                data-size="wide"
                className="flex h-[min(90vh,860px)] w-[min(96vw,1180px)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-rule)] bg-[var(--color-panel)] shadow-[0_24px_80px_rgba(16,24,32,0.28)]"
              >
                <header className="flex items-start justify-between gap-3 border-b border-[var(--color-rule)] px-4 py-3">
                  <div>
                    <h2 className="text-base font-black text-[var(--color-ink)]">เลือกภาพตารางไซซ์จาก EasyStore</h2>
                    <p className="mt-1 text-xs font-semibold text-[var(--color-muted)]">กดรูปที่ถูกต้องเพื่อจำไว้ใน Sales Assets และใช้แนบคำตอบเรื่องไซซ์</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSizeChartPickerOpen(false)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] text-sm font-black text-[var(--color-ink-2)]"
                    aria-label="ปิด popup เลือกรูปตารางไซซ์"
                  >
                    ×
                  </button>
                </header>
                <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
                  <section className="min-h-0 border-b border-[var(--color-rule)] p-4 md:border-b-0 md:border-r">
                    <form onSubmit={loadSizeChartProducts} className="flex gap-2">
                      <label htmlFor="size-chart-easystore-search" className="sr-only">ค้นสินค้า EasyStore สำหรับรูปตารางไซซ์</label>
                      <input
                        id="size-chart-easystore-search"
                        value={sizeChartQuery}
                        onChange={(event) => setSizeChartQuery(event.target.value)}
                        placeholder="ค้นสินค้า / SKU"
                        className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-sm font-semibold text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                      />
                      <button
                        type="submit"
                        disabled={sizeChartPickerBusy}
                        className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-xs font-bold text-[var(--color-accent-ink)] disabled:opacity-50"
                      >
                        ค้น
                      </button>
                    </form>
                    <div className="mt-3 text-xs font-bold text-[var(--color-muted)]">{sizeChartPickerStatus || 'เลือกรายการสินค้าเพื่อดูรูปทั้งหมด'}</div>
                    <div className="mt-3 max-h-[68vh] space-y-2 overflow-y-auto pr-1" aria-label="รายการสินค้า EasyStore สำหรับตารางไซซ์">
                      {sizeChartProducts.length ? sizeChartProducts.map((product) => {
                        const id = easyStoreProductId(product)
                        const active = id && id === easyStoreProductId(sizeChartProduct || {})
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => loadSizeChartImages(product)}
                            className={`grid w-full grid-cols-[48px_minmax(0,1fr)] items-center gap-2 rounded-[var(--radius-md)] border p-2 text-left transition ${active ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]' : 'border-[var(--color-rule)] bg-[var(--color-panel-2)] hover:border-[var(--color-accent)]'}`}
                            aria-label={`เปิดรูปสินค้า ${easyStoreProductTitle(product)}`}
                          >
                            {product.imageUrl ? (
                              <img src={product.imageUrl} alt={easyStoreProductTitle(product)} className="aspect-square w-12 rounded-[var(--radius-sm)] object-cover" loading="lazy" />
                            ) : (
                              <div className="grid aspect-square w-12 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-panel)] text-[10px] font-bold text-[var(--color-muted)]">สินค้า</div>
                            )}
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-bold text-[var(--color-ink)]">{easyStoreProductTitle(product)}</span>
                              <span className="mt-1 block truncate text-[10px] font-semibold text-[var(--color-muted)]">SKU: {product.sku || product.productId || '-'}</span>
                            </span>
                          </button>
                        )
                      }) : (
                        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-rule)] px-3 py-6 text-center text-xs font-semibold text-[var(--color-muted)]">
                          {sizeChartPickerBusy ? 'กำลังโหลดสินค้า EasyStore' : 'ค้นสินค้าเพื่อเลือกรูป'}
                        </div>
                      )}
                    </div>
                  </section>
                  <section className="min-h-0 overflow-y-auto p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-black text-[var(--color-ink)]">{easyStoreProductTitle(sizeChartProduct || {})}</h3>
                        <p className="mt-1 text-xs font-semibold text-[var(--color-muted)]">เลือกภาพที่เป็นตารางไซซ์จริงจาก EasyStore</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {sizeChartProduct?.links?.storefrontUrl ? (
                          <a
                            href={sizeChartProduct.links.storefrontUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-2 py-1 text-[11px] font-bold text-[var(--color-ink-2)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                          >
                            เปิดเว็บสินค้า
                          </a>
                        ) : null}
                        <span className="rounded-[var(--radius-pill)] bg-[var(--color-panel-2)] px-2 py-1 text-[11px] font-bold text-[var(--color-muted)]">{sizeChartImages.length} รูป</span>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                      {sizeChartImages.length ? sizeChartImages.map((image, index) => (
                        <div key={image.id || image.url || index} className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)]">
                          <a href={image.url} target="_blank" rel="noreferrer" aria-label={`เปิดรูปเต็ม ${easyStoreImageLabel(image, index)}`}>
                            <img src={image.url} alt={easyStoreImageLabel(image, index)} className="aspect-square w-full object-cover" loading="lazy" />
                          </a>
                          <div className="p-2">
                            <div className="truncate text-xs font-bold text-[var(--color-ink)]">{easyStoreImageLabel(image, index)}</div>
                            <div className="mt-1 text-[10px] font-semibold text-[var(--color-muted)]">{[image.width, image.height].filter(Boolean).join('×') || `รูปที่ ${index + 1}`}</div>
                            <a
                              href={image.url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 block w-full rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-2 py-1.5 text-center text-xs font-bold text-[var(--color-ink-2)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                            >
                              เปิดรูปเต็ม
                            </a>
                            <button
                              type="button"
                              disabled={salesAssetsBusy}
                              onClick={() => useEasyStoreSizeChart(image, index)}
                              aria-label={`ใช้เป็นตารางไซซ์ ${easyStoreImageLabel(image, index)}`}
                              className="mt-2 w-full rounded-[var(--radius-md)] bg-[var(--color-accent)] px-2 py-1.5 text-xs font-bold text-[var(--color-accent-ink)] disabled:opacity-50"
                            >
                              ใช้เป็นตารางไซซ์
                            </button>
                          </div>
                        </div>
                      )) : (
                        <div className="col-span-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-rule)] px-3 py-10 text-center text-xs font-semibold text-[var(--color-muted)] sm:col-span-3">
                          {sizeChartPickerBusy ? 'กำลังโหลดรูปจาก EasyStore' : 'เลือกรายการสินค้าด้านซ้ายเพื่อดูรูป'}
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            </div>
          ) : null}
          <AiDecisionPanel snapshot={panelSnapshot} thread={thread} onDrafted={handlePanelSnapshot} />
        </>
      ) : null}
      {tab === 'sales' ? <SalesContextPanel thread={thread} onUseDraft={onUseDraft} /> : null}
      {tab === 'profiles' ? <ProfilePanel snapshot={panelSnapshot} thread={thread} /> : null}
      {tab === 'orders' ? <OrderDesk snapshot={panelSnapshot} thread={thread} onSnapshot={handlePanelSnapshot} workspaceId={workspaceId} onUseDraft={onUseDraft} /> : null}
      {tab === 'payment' ? <PaymentDesk snapshot={panelSnapshot} thread={thread} onSnapshot={handlePanelSnapshot} onUseDraft={onUseDraft} /> : null}
    </aside>
  )
}
