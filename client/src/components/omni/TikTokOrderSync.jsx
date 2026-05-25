import React, { useState } from 'react'
import { fetchTikTokOrders, syncTikTokOrders } from '../../lib/omniApi.js'

const STATUSES = ['AWAITING_COLLECTION', 'AWAITING_SHIPMENT', 'COMPLETED']

export default function TikTokOrderSync({ onSynced }) {
  const [status, setStatus] = useState('AWAITING_COLLECTION')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(action) {
    setBusy(true)
    setError('')
    try {
      if (action === 'sync') {
        const result = await syncTikTokOrders(status, 10)
        setPreview({ totalCount: result.totalCount, orders: result.snapshot.orders.filter((order) => order.platform === 'tiktok').slice(-5).reverse() })
        onSynced?.(result.snapshot)
      } else {
        const data = await fetchTikTokOrders(status, 10)
        setPreview(data)
      }
    } catch (err) {
      setError(err.message || 'tiktok_orders_failed')
    } finally {
      setBusy(false)
    }
  }

  const orders = preview?.orders || []

  return (
    <section className="border-b border-[#dfe8e4] p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[#24362f]">TikTok Order Sync</h2>
        <select
          className="rounded-lg border border-[#dfe8e4] bg-white px-2 py-1 text-xs text-[#24362f]"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          {STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      <div className="mt-3 flex gap-2">
        <button className="rounded-lg bg-[#e8faf6] px-3 py-1 text-xs font-semibold text-[#0f8f7b] disabled:opacity-50" disabled={busy} onClick={() => run('load')}>
          Load
        </button>
        <button className="rounded-lg bg-[#0f8f7b] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50" disabled={busy} onClick={() => run('sync')}>
          Sync
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      {preview ? <p className="mt-2 text-xs text-[#7a8b84]">Found {preview.totalCount || orders.length} orders</p> : null}
      {orders.slice(0, 3).map((order) => (
        <div key={order.id} className="mt-2 rounded-xl border border-[#dfe8e4] bg-white p-3 text-xs text-[#50635c] shadow-sm">
          <div>{order.status} · {order.currency || 'THB'} {order.total ?? order.totalAmount}</div>
          <div className="mt-1 truncate text-[#7a8b84]">{order.providerOrderId || order.id}</div>
        </div>
      ))}
    </section>
  )
}
