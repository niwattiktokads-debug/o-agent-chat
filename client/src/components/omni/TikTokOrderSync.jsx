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
    <section className="border-b border-slate-800 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">TikTok Order Sync</h2>
        <select
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          {STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      <div className="mt-3 flex gap-2">
        <button className="rounded bg-slate-800 px-3 py-1 text-xs text-slate-100 disabled:opacity-50" disabled={busy} onClick={() => run('load')}>
          Load
        </button>
        <button className="rounded bg-emerald-700 px-3 py-1 text-xs text-white disabled:opacity-50" disabled={busy} onClick={() => run('sync')}>
          Sync
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
      {preview ? <p className="mt-2 text-xs text-slate-500">Found {preview.totalCount || orders.length} orders</p> : null}
      {orders.slice(0, 3).map((order) => (
        <div key={order.id} className="mt-2 rounded bg-slate-900 p-3 text-xs text-slate-300">
          <div>{order.status} · {order.currency || 'THB'} {order.total ?? order.totalAmount}</div>
          <div className="mt-1 truncate text-slate-500">{order.providerOrderId || order.id}</div>
        </div>
      ))}
    </section>
  )
}
