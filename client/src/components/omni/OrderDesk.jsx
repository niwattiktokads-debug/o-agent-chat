import React from 'react'

export default function OrderDesk({ snapshot, thread }) {
  const orders = thread ? snapshot.orders.filter((order) => order.customerId === thread.customerId) : []
  const recentTikTokOrders = (snapshot.orders || []).filter((order) => order.platform === 'tiktok').slice(-5).reverse()
  return (
    <section className="border-b border-slate-800 p-4">
      <h2 className="text-sm font-semibold">Order Desk</h2>
      {orders.length === 0 ? <p className="mt-2 text-xs text-slate-500">No linked orders</p> : null}
      {orders.map((order) => (
        <div key={order.id} className="mt-3 rounded bg-slate-900 p-3 text-xs text-slate-300">
          <div>{order.platform} · {order.status}</div>
          <div>Total: {order.total}</div>
        </div>
      ))}
      <h3 className="mt-4 text-xs font-semibold text-slate-400">Recent TikTok Orders</h3>
      {recentTikTokOrders.length === 0 ? <p className="mt-2 text-xs text-slate-500">No synced TikTok orders</p> : null}
      {recentTikTokOrders.map((order) => (
        <div key={order.id} className="mt-3 rounded bg-slate-900 p-3 text-xs text-slate-300">
          <div>{order.status} · {order.currency || 'THB'} {order.total ?? order.totalAmount}</div>
          <div className="mt-1 truncate text-slate-500">{order.providerOrderId || order.id}</div>
        </div>
      ))}
    </section>
  )
}
