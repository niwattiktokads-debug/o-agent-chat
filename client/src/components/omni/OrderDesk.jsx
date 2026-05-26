import React, { useState } from 'react'
import { approveOrderDraft, createOrderDraft, searchZortProducts } from '../../lib/omniApi.js'

export default function OrderDesk({ snapshot, thread, onSnapshot }) {
  const allOrders = snapshot.orders || []
  const orders = thread ? allOrders.filter((order) => order.customerId && order.customerId === thread.customerId) : []
  const recentTikTokOrders = allOrders.filter((order) => order.platform === 'tiktok').slice(-5).reverse()
  return (
    <section className="p-4">
      <OrderDraft thread={thread} onSnapshot={onSnapshot} />
      <h2 className="mt-5 text-sm font-bold text-[var(--color-ink)]">ออเดอร์เดิม</h2>
      {orders.length === 0 ? <p className="mt-2 text-xs text-[var(--color-muted)]">ยังไม่มีออเดอร์ที่ผูกกับลูกค้าคนนี้</p> : null}
      {orders.map((order) => (
        <div key={order.id} className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-3 text-xs text-[var(--color-ink-2)]">
          <div>{order.platform} · {order.status}</div>
          <div>Total: {order.total}</div>
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

function OrderDraft({ thread, onSnapshot }) {
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [draft, setDraft] = useState(null)
  const [status, setStatus] = useState('')
  const [approveStatus, setApproveStatus] = useState('')
  const [confirmingApprove, setConfirmingApprove] = useState(false)
  const total = selectedProduct ? Number(selectedProduct.sellPrice || selectedProduct.unitPrice || 0) * quantity : 0

  async function searchProducts() {
    if (!query.trim()) {
      setStatus('ใส่ SKU หรือชื่อสินค้าก่อน')
      return
    }
    setStatus('กำลังค้นสินค้า ZORT')
    try {
      const result = await searchZortProducts(query.trim())
      setProducts(result.products || [])
      setStatus(`พบสินค้า ${(result.products || []).length} รายการ`)
    } catch (error) {
      setStatus(error.message)
    }
  }

  async function saveDraft() {
    if (!selectedProduct) return
    setStatus('กำลังบันทึก draft ออเดอร์')
    try {
      const result = await createOrderDraft({
        threadId: thread?.id || null,
        customerId: thread?.customerId || null,
        platform: thread?.platform || 'omni',
        sourceRef: `omni_manual_draft:${thread?.id || 'standalone'}`,
        items: [{
          sku: selectedProduct.sku,
          name: selectedProduct.name,
          quantity,
          unitPrice: selectedProduct.sellPrice || 0,
          zortProductId: selectedProduct.id,
          zortProduct: selectedProduct,
        }],
      })
      setDraft(result.order)
      setConfirmingApprove(false)
      if (result.snapshot) onSnapshot?.(result.snapshot)
      setStatus('บันทึก draft แล้ว')
    } catch (error) {
      setStatus(error.message)
    }
  }

  function openApproveConfirmation() {
    if (!draft?.id) return
    setConfirmingApprove(true)
    setApproveStatus('ตรวจรายการก่อนยืนยันสร้าง ZORT order')
  }

  async function submitApprovedDraft() {
    if (!draft?.id) return
    setApproveStatus('กำลังส่ง ZORT order หลัง approval')
    try {
      const result = await approveOrderDraft(draft.id)
      setDraft(result.order)
      setConfirmingApprove(false)
      if (result.snapshot) onSnapshot?.(result.snapshot)
      setApproveStatus(`สร้าง ZORT order แล้ว ${result.order.providerOrderId || result.provider?.providerOrderId || result.order.id}`)
    } catch (error) {
      setApproveStatus(error.message)
    }
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)]">
      <div className="border-b border-[var(--color-rule)] px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-[var(--color-ink)]">คำสั่งซื้อใหม่</h2>
          <span className="rounded-[var(--radius-pill)] bg-[var(--color-warn-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--color-warn)]">
            approval guard
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">
          สร้าง order draft จากแชทก่อนส่งลูกค้าและก่อนตัดสต็อกจริง
        </p>
      </div>
      <div className="space-y-4 px-3 py-3 text-sm">
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="font-semibold text-[var(--color-ink)]">รายการสินค้า</span>
            <span className="rounded-[var(--radius-pill)] bg-[var(--color-panel-2)] px-2 py-1 text-[11px] font-semibold text-[var(--color-muted)]">ZORT read-only lookup</span>
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-semibold text-[var(--color-muted)]" htmlFor="zort-product-search">ค้นสินค้า ZORT</label>
            <div className="flex gap-2">
              <input
                id="zort-product-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="SKU หรือชื่อสินค้า"
                className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-sm text-[var(--color-ink)]"
              />
              <button
                type="button"
                onClick={searchProducts}
                className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-xs font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]"
              >
                ค้น ZORT
              </button>
            </div>
            {status ? <div className="text-xs font-semibold text-[var(--color-muted)]">{status}</div> : null}
            <div className="divide-y divide-[var(--color-rule)] rounded-[var(--radius-sm)] border border-[var(--color-rule)]">
              {products.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-[var(--color-muted)]">ค้นหาเพื่อดึงสินค้า ZORT จริง</div>
              ) : products.map((product) => (
                <div key={product.id || product.sku} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-[var(--color-ink)]">{product.name}</div>
                    <div className="mt-1 text-[11px] text-[var(--color-muted)]">{product.sku} · stock {product.availableStock ?? product.stock ?? '-'}</div>
                  </div>
                  <button
                    type="button"
                    aria-label={`เลือก ${product.sku}`}
                    onClick={() => {
                      setSelectedProduct(product)
                      setStatus(`เลือก ${product.sku}`)
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
              <div>
                <div className="text-xs font-semibold text-[var(--color-muted)]">Selected item</div>
                <div className="mt-1 text-sm font-bold text-[var(--color-ink)]">{selectedProduct.name}</div>
                <div className="mt-1 text-xs text-[var(--color-muted)]">{selectedProduct.sku}</div>
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
          <label className="text-xs font-semibold text-[var(--color-muted)]" htmlFor="shipping-method">ช่องทางการจัดส่ง</label>
          <select
            id="shipping-method"
            className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-sm text-[var(--color-muted)]"
          >
            <option>ไปรษณีย์ไทย</option>
          </select>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold text-[var(--color-muted)]">วิธีการชำระเงิน</div>
          <div className="grid gap-2">
            <label className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-xs text-[var(--color-ink-2)]">
              <input type="radio" name={`payment-${thread?.id || 'none'}`} checked readOnly disabled />
              โอนเงิน/บัตรเครดิต
            </label>
            <label className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-xs text-[var(--color-ink-2)]">
              <input type="radio" name={`payment-${thread?.id || 'none'}`} readOnly disabled />
              เก็บเงินปลายทาง
            </label>
          </div>
        </div>
        <div className="rounded-[var(--radius-sm)] bg-[var(--color-panel-2)] px-3 py-3 text-xs text-[var(--color-ink-2)]">
          <div className="flex items-center justify-between">
            <span>ราคาสุทธิ</span>
            <strong className="tabular-nums text-[var(--color-ink)]">฿{total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</strong>
          </div>
        </div>
        <button
          type="button"
          aria-label="บันทึก draft ออเดอร์"
          onClick={saveDraft}
          disabled={!selectedProduct}
          className="w-full rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-ink)] disabled:opacity-45"
        >
          บันทึก draft ออเดอร์
        </button>
        {draft ? (
          <div className="rounded-[var(--radius-sm)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-3 text-xs text-[var(--color-ink-2)]">
            <div className="font-semibold text-[var(--color-ink)]">draft: {draft.id}</div>
            <div className="mt-1">status: {draft.status}</div>
            {draft.status === 'draft' ? (
              <>
                <button
                  type="button"
                  onClick={openApproveConfirmation}
                  className="mt-3 w-full rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-xs font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]"
                >
                  Approve ไป ZORT
                </button>
                {confirmingApprove ? (
                  <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-warn)] bg-[var(--color-warn-soft)] p-3 text-[11px] text-[var(--color-ink)]">
                    <div className="font-bold">ยืนยัน approval ก่อนสร้าง ZORT order</div>
                    <div className="mt-2 grid gap-1">
                      <div>customer: {thread?.customerId || draft.customerId || '-'}</div>
                      {(draft.items || []).map((item) => (
                        <div key={`${item.sku}-${item.quantity}`}>{item.sku} x{item.quantity} · ฿{Number(item.unitPrice || 0).toLocaleString('th-TH')}</div>
                      ))}
                      <div className="font-semibold">total: ฿{Number(draft.totalAmount || total || 0).toLocaleString('th-TH')}</div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={submitApprovedDraft}
                        className="flex-1 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[var(--color-accent-ink)]"
                      >
                        ยืนยันสร้าง ZORT order
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
