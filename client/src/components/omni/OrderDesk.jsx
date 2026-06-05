import React, { useEffect, useMemo, useState } from 'react'
import {
  approveOrderDraft,
  createOrderDraft,
  extractOrderAddressFromThread,
  lookupThaiAddressByPostcode,
  saveOmniSettings,
  searchEasyStoreProducts,
  searchZortProducts,
} from '../../lib/omniApi.js'

const SHIPPING_METHODS = [
  { value: 'ไปรษณีย์ไทย', label: 'ไปรษณีย์ไทย' },
  { value: 'J&T Express', label: 'J&T Express' },
  { value: 'Flash Express', label: 'Flash Express' },
]

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'โอนเงิน/บัตรเครดิต' },
  { value: 'cash_on_delivery', label: 'เก็บเงินปลายทาง' },
]

const ORDER_SOURCE_OPTIONS = [
  { id: 'zort', label: 'ZORT', badge: 'ZORT read-only lookup', searchLabel: 'ค้นสินค้า ZORT', buttonLabel: 'ค้น ZORT', approveLabel: 'Approve ไป ZORT', confirmLabel: 'ยืนยันสร้าง ZORT order' },
  { id: 'easystore', label: 'EasyStore', badge: 'EasyStore order draft', searchLabel: 'ค้นสินค้า EasyStore', buttonLabel: 'ค้น EasyStore', approveLabel: 'Approve ไป EasyStore', confirmLabel: 'ยืนยันสร้าง EasyStore order' },
]

function customerForThread(snapshot, thread) {
  return (snapshot.customers || []).find((customer) => customer.id === thread?.customerId) || thread?.customer || null
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })
}

function addressOptionLabel(option) {
  if (!option) return 'เลือกตำบล/แขวงจากรหัสไปรษณีย์'
  return `${option.subDistrict} · ${option.district} · ${option.province}`
}

function normalizePostcodeInput(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 5)
}

function orderSourceConfig(source) {
  return ORDER_SOURCE_OPTIONS.find((item) => item.id === source) || ORDER_SOURCE_OPTIONS[0]
}

function mergeOrderDraftSettings(snapshotSettings = {}, orderDraftPatch = {}) {
  return {
    ...snapshotSettings,
    orderDraft: {
      enabled: true,
      approvalRequired: true,
      createZortOrderOnApprove: true,
      ...(snapshotSettings.orderDraft || {}),
      ...orderDraftPatch,
    },
  }
}

function mergeSnapshotSettings(currentSnapshot, nextSnapshot) {
  if (!nextSnapshot) return null
  if (nextSnapshot.settings || !currentSnapshot?.settings) return nextSnapshot
  return { ...nextSnapshot, settings: currentSnapshot.settings }
}

export default function OrderDesk({ snapshot, thread, onSnapshot, workspaceId }) {
  const allOrders = snapshot.orders || []
  const orders = thread ? allOrders.filter((order) => order.customerId && order.customerId === thread.customerId) : []
  const recentTikTokOrders = allOrders.filter((order) => order.platform === 'tiktok').slice(-5).reverse()
  return (
    <section className="p-4">
      <OrderDraft snapshot={snapshot} thread={thread} onSnapshot={onSnapshot} workspaceId={workspaceId} />
      <h2 className="mt-5 text-sm font-bold text-[var(--color-ink)]">ออเดอร์เดิม</h2>
      {orders.length === 0 ? <p className="mt-2 text-xs text-[var(--color-muted)]">ยังไม่มีออเดอร์ที่ผูกกับลูกค้าคนนี้</p> : null}
      {orders.map((order) => (
        <div key={order.id} className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-3 text-xs text-[var(--color-ink-2)]">
          <div>{order.platform} · {order.status}</div>
          <div>Total: {order.total || order.totalAmount}</div>
          {order.shippingAddress?.formattedAddress ? <div className="mt-1 line-clamp-2 text-[var(--color-muted)]">{order.shippingAddress.formattedAddress}</div> : null}
        </div>
      ))}
      <h3 className="mt-4 text-xs font-semibold text-[var(--color-muted)]">TikTok ล่าสุด</h3>
      {recentTikTokOrders.length === 0 ? <p className="mt-2 text-xs text-[var(--color-muted)]">ยังไม่มีออเดอร์ที่ sync</p> : null}
      {recentTikTokOrders.map((order) => (
        <div key={order.id} className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-3 text-xs text-[var(--color-ink-2)]">
          <div>{order.status} · {order.currency || 'THB'} {order.total ?? order.totalAmount}</div>
          <div className="mt-1 truncate text-[var(--color-muted)]">{order.providerOrderId || order.id}</div>
        </div>
      ))}
    </section>
  )
}

function OrderDraft({ snapshot, thread, onSnapshot, workspaceId }) {
  const customer = useMemo(() => customerForThread(snapshot, thread), [snapshot, thread])
  const [orderSource, setOrderSource] = useState('zort')
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [addressLine, setAddressLine] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [addressOptions, setAddressOptions] = useState([])
  const [selectedAddressKey, setSelectedAddressKey] = useState('')
  const [addressStatus, setAddressStatus] = useState('')
  const [addressIntakeStatus, setAddressIntakeStatus] = useState('')
  const [confirmationText, setConfirmationText] = useState('')
  const [shippingMethod, setShippingMethod] = useState(SHIPPING_METHODS[0].value)
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0].value)
  const [draft, setDraft] = useState(null)
  const [status, setStatus] = useState('')
  const [approveStatus, setApproveStatus] = useState('')
  const [confirmingApprove, setConfirmingApprove] = useState(false)
  const [guardBusy, setGuardBusy] = useState(false)
  const [guardStatus, setGuardStatus] = useState('')
  const sourceConfig = orderSourceConfig(orderSource)
  const orderDraftSettings = mergeOrderDraftSettings(snapshot?.settings || {}).orderDraft
  const approvalGuardEnabled = orderDraftSettings.approvalRequired !== false

  const selectedAddress = addressOptions.find((option) => option.key === selectedAddressKey) || null
  const unitPrice = Number(selectedProduct?.sellPrice || selectedProduct?.unitPrice || selectedProduct?.price || 0)
  const total = selectedProduct ? unitPrice * quantity : 0
  const canSaveDraft = Boolean(
    selectedProduct &&
    recipientName.trim() &&
    recipientPhone.trim().replace(/\D/g, '').length >= 9 &&
    addressLine.trim() &&
    postalCode.length === 5 &&
    selectedAddress,
  )

  useEffect(() => {
    setRecipientName(customer?.displayName || '')
    setRecipientPhone(customer?.phone || '')
    setAddressLine(customer?.address || '')
    setPostalCode('')
    setAddressOptions([])
    setSelectedAddressKey('')
    setAddressStatus('')
    setAddressIntakeStatus('')
    setConfirmationText('')
    setDraft(null)
    setStatus('')
    setApproveStatus('')
    setConfirmingApprove(false)
  }, [thread?.id, customer?.displayName, customer?.phone, customer?.address])

  function switchOrderSource(nextSource) {
    setOrderSource(nextSource)
    setQuery('')
    setProducts([])
    setSelectedProduct(null)
    setDraft(null)
    setStatus('')
    setApproveStatus('')
    setConfirmingApprove(false)
  }

  useEffect(() => {
    if (postalCode.length !== 5) {
      setAddressOptions([])
      setSelectedAddressKey('')
      setAddressStatus(postalCode ? 'กรอกรหัสไปรษณีย์ให้ครบ 5 หลัก' : '')
      return undefined
    }

    let cancelled = false
    setAddressStatus('กำลังอ้างอิงข้อมูลที่อยู่ไทย')
    lookupThaiAddressByPostcode(postalCode)
      .then((result) => {
        if (cancelled) return
        const options = result.suggestions || []
        setAddressOptions(options)
        setSelectedAddressKey((current) => (options.some((option) => option.key === current) ? current : (options.length === 1 ? options[0].key : '')))
        setAddressStatus(`พบที่อยู่ ${options.length} รายการ · ครอบคลุม ${result.source?.provinceCount || 77} จังหวัด`)
      })
      .catch((error) => {
        if (cancelled) return
        setAddressOptions([])
        setSelectedAddressKey('')
        setAddressStatus(error.message)
      })

    return () => { cancelled = true }
  }, [postalCode])

  function applyAddressExtraction(result) {
    const extracted = result.extracted || {}
    if (extracted.recipientName) setRecipientName(extracted.recipientName)
    if (extracted.recipientPhone) setRecipientPhone(extracted.recipientPhone)
    if (extracted.addressLine) setAddressLine(extracted.addressLine)
    if (extracted.postalCode) setPostalCode(extracted.postalCode)
    const options = result.addressLookup?.suggestions || []
    if (options.length) setAddressOptions(options)
    setSelectedAddressKey(extracted.selectedAddressKey || (options.length === 1 ? options[0].key : ''))
    setConfirmationText(result.confirmationDraft?.message?.text || result.confirmationText || '')
    setAddressStatus(extracted.readyForDraft
      ? `AI เติมที่อยู่ครบแล้ว · มั่นใจ ${Math.round((extracted.confidence || 0) * 100)}% · รอลูกค้ายืนยัน`
      : `AI เติมได้บางส่วน · ยังขาด ${(extracted.missingFields || []).join(', ')}`)
  }

  async function importAddressFromChat() {
    if (!thread?.id) {
      setAddressIntakeStatus('เลือกแชทลูกค้าก่อน')
      return
    }
    setAddressIntakeStatus('AI กำลังคัดกรองชื่อ เบอร์ และที่อยู่จากแชท')
    try {
      const result = await extractOrderAddressFromThread(thread.id, { createConfirmationDraft: true })
      applyAddressExtraction(result)
      if (result.snapshot) onSnapshot?.(result.snapshot)
      setAddressIntakeStatus(result.extracted?.readyForDraft
        ? 'เติมฟอร์มแล้ว และสร้าง draft ให้ลูกค้าตรวจที่อยู่แล้ว'
        : 'เติมฟอร์มบางส่วนแล้ว และสร้าง draft ขอข้อมูลเพิ่มแล้ว')
    } catch (error) {
      setAddressIntakeStatus(error.message)
    }
  }

  async function searchProducts() {
    if (!query.trim()) {
      setStatus('ใส่ SKU หรือชื่อสินค้าก่อน')
      return
    }
    setStatus(`กำลังค้นสินค้า ${sourceConfig.label}`)
    try {
      const result = orderSource === 'easystore'
        ? await searchEasyStoreProducts(query.trim())
        : await searchZortProducts(query.trim())
      setProducts(result.products || [])
      setStatus(`พบสินค้า ${(result.products || []).length} รายการ`)
    } catch (error) {
      setStatus(error.message)
    }
  }

  async function saveDraft() {
    if (!canSaveDraft) {
      setStatus('กรอกสินค้า ผู้รับ เบอร์ ที่อยู่ และรหัสไปรษณีย์ให้ครบก่อนบันทึก draft')
      return
    }
    setStatus('กำลังบันทึก draft ออเดอร์')
    try {
      const result = await createOrderDraft({
        threadId: thread?.id || null,
        customerId: thread?.customerId || null,
        customerName: recipientName.trim(),
        customerPhone: recipientPhone.trim(),
        platform: thread?.platform || 'omni',
        sourceRef: `omni_${orderSource}_manual_draft:${thread?.id || 'standalone'}`,
        orderProvider: orderSource,
        shippingMethod,
        paymentMethod,
        shippingAddress: {
          recipientName: recipientName.trim(),
          recipientPhone: recipientPhone.trim(),
          addressLine: addressLine.trim(),
          postalCode,
          province: selectedAddress.province,
          district: selectedAddress.district,
          subDistrict: selectedAddress.subDistrict,
          country: 'ไทย',
        },
        items: [{
          sku: selectedProduct.sku,
          name: selectedProduct.name,
          quantity,
          unitPrice,
          zortProductId: orderSource === 'zort' ? selectedProduct.id : null,
          zortProduct: orderSource === 'zort' ? selectedProduct : null,
          easyStoreProductId: orderSource === 'easystore' ? selectedProduct.productId || selectedProduct.id : null,
          easyStoreVariantId: orderSource === 'easystore' ? selectedProduct.variantId || null : null,
          easyStoreProduct: orderSource === 'easystore' ? selectedProduct : null,
        }],
      })
      setDraft(result.order)
      setConfirmingApprove(false)
      if (result.snapshot) onSnapshot?.(mergeSnapshotSettings(snapshot, result.snapshot))
      setStatus('บันทึก draft แล้ว')
    } catch (error) {
      setStatus(error.message)
    }
  }

  function openApproveConfirmation() {
    if (!draft?.id) return
    setConfirmingApprove(true)
    setApproveStatus(`ตรวจรายการ ผู้รับ และที่อยู่ก่อนยืนยันสร้าง ${sourceConfig.label} order`)
  }

  async function submitApprovedDraft() {
    if (!draft?.id) return
    setApproveStatus(approvalGuardEnabled ? `กำลังส่ง ${sourceConfig.label} order หลัง approval` : `กำลังสร้าง ${sourceConfig.label} order โดยไม่บังคับ approval`)
    try {
      const result = await approveOrderDraft(draft.id, {
        provider: draft.orderProvider || orderSource,
        approved: approvalGuardEnabled,
      })
      setDraft(result.order)
      setConfirmingApprove(false)
      if (result.snapshot) onSnapshot?.(mergeSnapshotSettings(snapshot, result.snapshot))
      setApproveStatus(`สร้าง ${sourceConfig.label} order แล้ว ${result.order.providerOrderId || result.provider?.providerOrderId || result.order.id}`)
    } catch (error) {
      setApproveStatus(error.message)
    }
  }

  async function toggleApprovalGuard() {
    if (guardBusy) return
    const nextEnabled = !approvalGuardEnabled
    const nextSettings = mergeOrderDraftSettings(snapshot?.settings || {}, { approvalRequired: nextEnabled })
    setGuardBusy(true)
    setGuardStatus(nextEnabled ? 'กำลังเปิด approval guard' : 'กำลังปิด approval guard')
    try {
      const result = await saveOmniSettings(nextSettings, { workspaceId: workspaceId || undefined })
      if (result.snapshot) {
        onSnapshot?.(result.snapshot)
      } else if (snapshot) {
        onSnapshot?.({ ...snapshot, settings: result.settings || nextSettings })
      }
      setGuardStatus(nextEnabled ? 'เปิด approval guard แล้ว' : 'ปิด approval guard แล้ว')
      setConfirmingApprove(false)
    } catch (error) {
      setGuardStatus(error.message)
    } finally {
      setGuardBusy(false)
    }
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)]">
      <div className="border-b border-[var(--color-rule)] px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="min-w-0 text-sm font-bold text-[var(--color-ink)]">คำสั่งซื้อใหม่</h2>
          <button
            type="button"
            aria-pressed={approvalGuardEnabled}
            onClick={toggleApprovalGuard}
            disabled={guardBusy}
            className={`grid min-w-[88px] grid-cols-[1fr_auto] items-center gap-2 rounded-[var(--radius-pill)] border px-2 py-1 text-[11px] font-semibold transition disabled:opacity-60 ${approvalGuardEnabled ? 'border-[var(--color-warn)] bg-[var(--color-warn-soft)] text-[var(--color-warn)]' : 'border-[var(--color-rule)] bg-[var(--color-panel-2)] text-[var(--color-muted)]'}`}
          >
            <span className="truncate">{approvalGuardEnabled ? 'guard เปิด' : 'guard ปิด'}</span>
            <span className={`h-4 w-7 rounded-[var(--radius-pill)] p-0.5 transition ${approvalGuardEnabled ? 'bg-[var(--color-warn)]' : 'bg-[var(--color-rule)]'}`}>
              <span className={`block h-3 w-3 rounded-full bg-white transition ${approvalGuardEnabled ? 'translate-x-3' : ''}`} />
            </span>
          </button>
        </div>
        <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">
          {approvalGuardEnabled ? 'สร้าง order draft จากแชทก่อนส่งลูกค้าและก่อนตัดสต็อกจริง' : 'โหมดมนุษย์คุมเอง: สร้างบิลได้จาก draft โดยไม่ถามยืนยันซ้ำ'}
        </p>
        {guardStatus ? <div className="mt-2 text-[11px] font-semibold text-[var(--color-muted)]">{guardStatus}</div> : null}
      </div>
      <div className="space-y-4 px-3 py-3 text-sm">
        <div>
          <div className="mb-2 text-xs font-semibold text-[var(--color-muted)]">ระบบเปิดบิล</div>
          <div className="grid grid-cols-2 gap-2">
            {ORDER_SOURCE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => switchOrderSource(option.id)}
                className={`min-w-0 rounded-[var(--radius-md)] border px-3 py-2 text-xs font-bold transition ${orderSource === option.id ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]' : 'border-[var(--color-rule)] bg-[var(--color-panel-2)] text-[var(--color-muted)]'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="font-semibold text-[var(--color-ink)]">รายการสินค้า</span>
            <span className="shrink-0 rounded-[var(--radius-pill)] bg-[var(--color-panel-2)] px-2 py-1 text-[11px] font-semibold text-[var(--color-muted)]">{sourceConfig.badge}</span>
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-semibold text-[var(--color-muted)]" htmlFor="order-product-search">{sourceConfig.searchLabel}</label>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <input
                id="order-product-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="SKU หรือชื่อสินค้า"
                className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-sm text-[var(--color-ink)]"
              />
              <button
                type="button"
                onClick={searchProducts}
                className="whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-xs font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]"
              >
                {sourceConfig.buttonLabel}
              </button>
            </div>
            {status ? <div className="text-xs font-semibold text-[var(--color-muted)]">{status}</div> : null}
            <div className="min-w-0 divide-y divide-[var(--color-rule)] overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-rule)]">
              {products.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-[var(--color-muted)]">ค้นหาเพื่อดึงสินค้า {sourceConfig.label} จริง</div>
              ) : products.map((product) => (
                <div key={product.id || product.sku} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-[var(--color-ink)]">{product.name}</div>
                    <div className="mt-1 truncate text-[11px] text-[var(--color-muted)]">{product.sku || product.id} · stock {product.availableStock ?? product.stock ?? '-'}</div>
                  </div>
                  <button
                    type="button"
                    aria-label={`เลือก ${product.sku || product.id}`}
                    onClick={() => {
                      setSelectedProduct(product)
                      setStatus(`เลือก ${product.sku || product.id}`)
                    }}
                    className="shrink-0 rounded-[var(--radius-md)] bg-[var(--color-accent-soft)] px-2 py-1 text-xs font-semibold text-[var(--color-accent)]"
                  >
                    เลือก
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        {selectedProduct ? (
          <div className="rounded-[var(--radius-sm)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[var(--color-muted)]">สินค้าที่เลือก</div>
                <div className="mt-1 truncate text-sm font-bold text-[var(--color-ink)]">{selectedProduct.name}</div>
                <div className="mt-1 truncate text-xs text-[var(--color-muted)]">{selectedProduct.sku || selectedProduct.id}</div>
              </div>
              <label className="grid w-20 gap-1 text-xs font-semibold text-[var(--color-muted)]">
                จำนวน
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                  className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-2 py-1 text-sm text-[var(--color-ink)]"
                />
              </label>
            </div>
          </div>
        ) : null}
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold text-[var(--color-ink)]">ข้อมูลผู้รับและที่อยู่</div>
            <button
              type="button"
              onClick={importAddressFromChat}
              disabled={!thread?.id}
              className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-2 py-1 text-[11px] font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)] disabled:opacity-45"
            >
              AI ดึงที่อยู่จากแชท
            </button>
          </div>
          {addressIntakeStatus ? <div className="text-xs font-semibold text-[var(--color-muted)]">{addressIntakeStatus}</div> : null}
          <label className="grid gap-1 text-xs font-semibold text-[var(--color-muted)]" htmlFor="recipient-name">
            ชื่อผู้รับ
            <input
              id="recipient-name"
              value={recipientName}
              onChange={(event) => setRecipientName(event.target.value)}
              className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-sm text-[var(--color-ink)]"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--color-muted)]" htmlFor="recipient-phone">
            เบอร์โทร
            <input
              id="recipient-phone"
              value={recipientPhone}
              onChange={(event) => setRecipientPhone(event.target.value)}
              inputMode="tel"
              placeholder="0812345678"
              className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-sm text-[var(--color-ink)]"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--color-muted)]" htmlFor="address-line">
            บ้านเลขที่ / ถนน / หมู่บ้าน
            <textarea
              id="address-line"
              value={addressLine}
              onChange={(event) => setAddressLine(event.target.value)}
              rows={2}
              className="resize-none rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-sm leading-5 text-[var(--color-ink)]"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--color-muted)]" htmlFor="postal-code">
            รหัสไปรษณีย์
            <input
              id="postal-code"
              value={postalCode}
              onChange={(event) => setPostalCode(normalizePostcodeInput(event.target.value))}
              inputMode="numeric"
              maxLength={5}
              placeholder="10110"
              className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-sm text-[var(--color-ink)]"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--color-muted)]" htmlFor="thai-address-option">
            ที่อยู่จากรหัสไปรษณีย์
            <select
              id="thai-address-option"
              value={selectedAddressKey}
              onChange={(event) => setSelectedAddressKey(event.target.value)}
              disabled={addressOptions.length === 0}
              className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-sm text-[var(--color-ink)] disabled:opacity-60"
            >
              {addressOptions.length === 0 ? <option value="">กรอกรหัสไปรษณีย์ก่อน</option> : <option value="">เลือกตำบล/แขวงที่ตรงกับลูกค้า</option>}
              {addressOptions.map((option) => (
                <option key={option.key} value={option.key}>{addressOptionLabel(option)}</option>
              ))}
            </select>
          </label>
          {addressStatus ? <div className="text-xs font-semibold text-[var(--color-muted)]">{addressStatus}</div> : null}
          {selectedAddress ? (
            <div className="grid grid-cols-3 gap-2 rounded-[var(--radius-sm)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-2 text-[11px] text-[var(--color-ink-2)]">
              <div className="min-w-0"><span className="block text-[var(--color-muted)]">ตำบล/แขวง</span><span className="truncate font-semibold">{selectedAddress.subDistrict}</span></div>
              <div className="min-w-0"><span className="block text-[var(--color-muted)]">อำเภอ/เขต</span><span className="truncate font-semibold">{selectedAddress.district}</span></div>
              <div className="min-w-0"><span className="block text-[var(--color-muted)]">จังหวัด</span><span className="truncate font-semibold">{selectedAddress.province}</span></div>
            </div>
          ) : null}
          {confirmationText ? (
            <div className="rounded-[var(--radius-sm)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-3 text-[11px] text-[var(--color-ink-2)]">
              <div className="mb-2 font-bold text-[var(--color-ink)]">draft ให้ลูกค้าตรวจที่อยู่</div>
              <pre className="whitespace-pre-wrap break-words font-sans leading-5">{confirmationText}</pre>
            </div>
          ) : null}
        </div>
        <div className="grid gap-3">
          <label className="text-xs font-semibold text-[var(--color-muted)]" htmlFor="shipping-method">ช่องทางการจัดส่ง</label>
          <select
            id="shipping-method"
            value={shippingMethod}
            onChange={(event) => setShippingMethod(event.target.value)}
            className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-sm text-[var(--color-ink)]"
          >
            {SHIPPING_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
          </select>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold text-[var(--color-muted)]">วิธีการชำระเงิน</div>
          <div className="grid gap-2">
            {PAYMENT_METHODS.map((method) => (
              <label key={method.value} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-xs text-[var(--color-ink-2)]">
                <input
                  type="radio"
                  name={`payment-${thread?.id || 'none'}`}
                  checked={paymentMethod === method.value}
                  onChange={() => setPaymentMethod(method.value)}
                />
                {method.label}
              </label>
            ))}
          </div>
        </div>
        <div className="rounded-[var(--radius-sm)] bg-[var(--color-panel-2)] px-3 py-3 text-xs text-[var(--color-ink-2)]">
          <div className="flex items-center justify-between">
            <span>ราคาสุทธิ</span>
            <strong className="tabular-nums text-[var(--color-ink)]">฿{formatMoney(total)}</strong>
          </div>
        </div>
        <button
          type="button"
          aria-label="บันทึก draft ออเดอร์"
          onClick={saveDraft}
          disabled={!canSaveDraft}
          className="w-full rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-ink)] disabled:opacity-45"
        >
          บันทึก draft ออเดอร์
        </button>
        {draft ? (
          <div className="rounded-[var(--radius-sm)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-3 text-xs text-[var(--color-ink-2)]">
            <div className="font-semibold text-[var(--color-ink)]">draft: {draft.id}</div>
            <div className="mt-1">status: {draft.status}</div>
            {draft.shippingAddress?.formattedAddress ? <div className="mt-1 line-clamp-2">ที่อยู่: {draft.shippingAddress.formattedAddress}</div> : null}
            {draft.status === 'draft' ? (
              <>
                {approvalGuardEnabled ? (
                  <button
                    type="button"
                    onClick={openApproveConfirmation}
                    className="mt-3 w-full rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-xs font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]"
                  >
                    {sourceConfig.approveLabel}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={submitApprovedDraft}
                    className="mt-3 w-full rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[var(--color-accent-ink)]"
                  >
                    สร้าง {sourceConfig.label} order ทันที
                  </button>
                )}
                {confirmingApprove ? (
                  <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-warn)] bg-[var(--color-warn-soft)] p-3 text-[11px] text-[var(--color-ink)]">
                    <div className="font-bold">ยืนยัน approval ก่อนสร้าง {sourceConfig.label} order</div>
                    <div className="mt-2 grid gap-1">
                      <div>ผู้รับ: {draft.shippingAddress?.recipientName || draft.customerName || '-'}</div>
                      <div>โทร: {draft.shippingAddress?.recipientPhone || draft.customerPhone || '-'}</div>
                      <div className="line-clamp-3">ที่อยู่: {draft.shippingAddress?.formattedAddress || '-'}</div>
                      {(draft.items || []).map((item) => (
                        <div key={`${item.sku}-${item.quantity}`}>{item.sku} x{item.quantity} · ฿{Number(item.unitPrice || 0).toLocaleString('th-TH')}</div>
                      ))}
                      <div>ส่ง: {draft.shippingMethod || shippingMethod}</div>
                      <div>จ่าย: {PAYMENT_METHODS.find((item) => item.value === (draft.paymentMethod || paymentMethod))?.label || draft.paymentMethod}</div>
                      <div className="font-semibold">total: ฿{Number(draft.totalAmount || total || 0).toLocaleString('th-TH')}</div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={submitApprovedDraft}
                        className="flex-1 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[var(--color-accent-ink)]"
                      >
                        {sourceConfig.confirmLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmingApprove(false)
                          setApproveStatus('ยกเลิก approval')
                        }}
                        className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-xs font-semibold text-[var(--color-ink-2)]"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
        {approveStatus ? <div className="text-xs font-semibold text-[var(--color-muted)]">{approveStatus}</div> : null}
      </div>
    </div>
  )
}
