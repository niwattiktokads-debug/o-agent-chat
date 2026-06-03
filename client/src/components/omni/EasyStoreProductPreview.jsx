import React, { useEffect, useMemo, useRef, useState } from 'react'
import { fetchEasyStoreProductPreview } from '../../lib/omniApi.js'

const DEFAULT_MESSENGER_URL = 'https://m.me/annalynn751'

function buildMessengerUrl({ productId, threadId }) {
  const base = import.meta.env.VITE_ANNA_MESSENGER_URL || DEFAULT_MESSENGER_URL
  const ref = ['easystore', productId, threadId].filter(Boolean).join('_')
  try {
    const url = new URL(base)
    url.searchParams.set('ref', ref)
    return url.toString()
  } catch {
    return `${DEFAULT_MESSENGER_URL}?ref=${encodeURIComponent(ref)}`
  }
}

function ensureMetaPixel(pixelId) {
  if (!pixelId || typeof window === 'undefined') return null
  if (!window.fbq) {
    const fbq = function fbq() {
      fbq.queue.push(arguments)
    }
    fbq.queue = []
    fbq.loaded = true
    fbq.version = '2.0'
    window.fbq = fbq
    window._fbq = fbq

    const script = document.createElement('script')
    script.async = true
    script.src = 'https://connect.facebook.net/en_US/fbevents.js'
    document.head.appendChild(script)
  }
  window.fbq('init', pixelId)
  return window.fbq
}

function firstImage(product) {
  return product?.images?.[0] || null
}

function stockText(stock) {
  const quantity = Number(stock?.totalQuantity || 0)
  return quantity > 0 ? `พร้อมส่ง ${quantity} ชิ้น` : 'รอเติมสต็อก'
}

export default function EasyStoreProductPreview({ productId, threadId = '' }) {
  const [payload, setPayload] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const trackedProductId = useRef('')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    fetchEasyStoreProductPreview(productId)
      .then((body) => {
        if (cancelled) return
        setPayload(body)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message || 'product_preview_failed')
        setStatus('error')
      })
    return () => { cancelled = true }
  }, [productId])

  const product = payload?.product || null
  const image = firstImage(product)
  const messengerUrl = useMemo(() => buildMessengerUrl({ productId: product?.id || productId, threadId }), [product?.id, productId, threadId])

  useEffect(() => {
    const pixelId = payload?.tracking?.pixelId
    if (!product?.id || !pixelId || trackedProductId.current === product.id) return
    const fbq = ensureMetaPixel(pixelId)
    if (!fbq) return
    trackedProductId.current = product.id
    fbq('track', 'ViewContent', {
      content_ids: [product.id],
      content_name: product.title,
      content_type: 'product',
      value: product.price?.amount || 0,
      currency: product.price?.currency || 'THB',
    }, { eventID: `es_view_${product.id}_${Date.now()}` })
  }, [payload?.tracking?.pixelId, product])

  function trackContact() {
    const pixelId = payload?.tracking?.pixelId
    if (!product?.id || !pixelId || !window.fbq) return
    window.fbq('track', 'Contact', {
      content_ids: [product.id],
      content_name: product.title,
      content_type: 'product',
    }, { eventID: `es_contact_${product.id}_${Date.now()}` })
  }

  if (status === 'loading') {
    return (
      <main className="min-h-screen bg-[var(--color-paper)] px-4 py-6 text-[var(--color-ink)]">
        <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center text-sm text-[var(--color-muted)]">กำลังโหลดสินค้า</div>
      </main>
    )
  }

  if (status === 'error') {
    return (
      <main className="min-h-screen bg-[var(--color-paper)] px-4 py-6 text-[var(--color-ink)]">
        <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center text-center">
          <div>
            <h1 className="text-xl font-bold">ไม่พบสินค้า</h1>
            <p className="mt-2 text-sm text-[var(--color-muted)]">{error}</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)]">
      <section className="mx-auto grid min-h-screen max-w-5xl gap-6 px-4 py-5 md:grid-cols-[minmax(0,1fr)_380px] md:items-center md:px-6">
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)]">
          {image ? (
            <img
              src={image.url}
              alt={image.alt || product.title}
              className="aspect-square h-full w-full object-cover"
            />
          ) : (
            <div className="grid aspect-square place-items-center text-sm text-[var(--color-muted)]">ไม่มีภาพสินค้า</div>
          )}
        </div>

        <div className="flex min-h-0 flex-col gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-normal text-[var(--color-accent)]">Annalynna</div>
            <h1 className="mt-2 text-2xl font-black leading-tight text-[var(--color-ink)] md:text-3xl">{product.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xl font-black text-[var(--color-ink)]">{product.price?.formatted || '-'}</span>
              <span className="rounded-[var(--radius-pill)] bg-[var(--color-live-soft)] px-3 py-1 text-sm font-bold text-[var(--color-live)]">{stockText(product.stock)}</span>
            </div>
          </div>

          {product.descriptionText ? (
            <p className="text-sm leading-6 text-[var(--color-ink-2)]">{product.descriptionText}</p>
          ) : null}

          <a
            href={messengerUrl}
            onClick={trackContact}
            className="block rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-4 text-center text-base font-black text-[var(--color-accent-ink)] shadow-[0_14px_30px_rgba(24,95,88,0.22)]"
          >
            ให้แอดมินช่วยสั่งในแชท
          </a>

          {product.variants?.length ? (
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-[var(--color-ink)]">ตัวเลือกสินค้า</h2>
              <div className="grid gap-2">
                {product.variants.slice(0, 8).map((variant) => (
                  <div key={variant.id || variant.sku || variant.title} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[var(--color-ink)]">{variant.title || variant.sku}</div>
                      {variant.sku ? <div className="mt-0.5 text-xs text-[var(--color-muted)]">{variant.sku}</div> : null}
                    </div>
                    <div className="shrink-0 text-right text-xs font-bold text-[var(--color-ink-2)]">
                      {Number(variant.quantity || 0) > 0 ? `${variant.quantity} ชิ้น` : 'หมด'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  )
}
