import React, { useEffect, useState } from 'react'
import { fetchSalesContext } from '../../lib/omniApi.js'

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

export default function SalesContextPanel({ thread, onUseDraft }) {
  const [context, setContext] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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

  return (
    <div className="space-y-3 p-4">
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

      <section className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[var(--color-ink)]">สินค้าในแชท</h2>
          <span className="rounded-[var(--radius-pill)] bg-[var(--color-panel-2)] px-2 py-1 text-[10px] font-bold text-[var(--color-muted)]">
            {context.product?.confidence ? `${Math.round(context.product.confidence * 100)}%` : 'ไม่ชัวร์'}
          </span>
        </div>
        {product ? (
          <>
            <div className="mt-2 text-sm font-semibold text-[var(--color-ink)]">{product.productName}</div>
            <div className="mt-1 text-xs text-[var(--color-muted)]">พร้อมส่งรวม {product.availableTotal || 0} ชิ้น · {money(product.price)}</div>
            <div className="mt-3 grid gap-2">
              {variants.slice(0, 4).map((variant) => (
                <div key={variant.id || variant.sku} className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-[var(--color-panel-2)] px-2 py-1.5 text-xs">
                  <span className="min-w-0 truncate font-semibold text-[var(--color-ink)]">{variant.sku || variant.variantId}</span>
                  <span className="shrink-0 text-[var(--color-muted)]">{variant.available} ชิ้น · {money(variant.price)}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-3 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-rule)] px-3 py-6 text-center text-xs text-[var(--color-muted)]">ยังจับสินค้าไม่ได้</div>
        )}
      </section>

      <section className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-3">
        <h2 className="text-sm font-bold text-[var(--color-ink)]">รูปแนะนำ</h2>
        {images.length ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
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
          <div className="mt-3 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-rule)] px-3 py-6 text-center text-xs text-[var(--color-muted)]">ยังไม่มีรูปจาก EasyStore preview</div>
        )}
      </section>
    </div>
  )
}
