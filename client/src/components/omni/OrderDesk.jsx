import React from 'react'

export default function OrderDesk({ snapshot, thread }) {
  const orders = thread ? snapshot.orders.filter((order) => order.customerId === thread.customerId) : []
  const recentTikTokOrders = (snapshot.orders || []).filter((order) => order.platform === 'tiktok').slice(-5).reverse()
  return (
    <section className="border-b border-[#dfe8e4] p-4">
      <h2 className="text-sm font-semibold text-[#24362f]">Order Desk</h2>
      {orders.length === 0 ? <p className="mt-2 text-xs text-[#7a8b84]">No linked orders</p> : null}
      {orders.map((order) => (
        <div key={order.id} className="mt-3 rounded-xl border border-[#dfe8e4] bg-white p-3 text-xs text-[#50635c] shadow-sm">
          <div>{order.platform} · {order.status}</div>
          <div>Total: {order.total}</div>
        </div>
      ))}
      <h3 className="mt-4 text-xs font-semibold text-[#7a8b84]">Recent TikTok Orders</h3>
      {recentTikTokOrders.length === 0 ? <p className="mt-2 text-xs text-[#7a8b84]">No synced TikTok orders</p> : null}
      {recentTikTokOrders.map((order) => (
        <div key={order.id} className="mt-3 rounded-xl border border-[#dfe8e4] bg-white p-3 text-xs text-[#50635c] shadow-sm">
          <div>{order.status} · {order.currency || 'THB'} {order.total ?? order.totalAmount}</div>
          <div className="mt-1 truncate text-[#7a8b84]">{order.providerOrderId || order.id}</div>
        </div>
      ))}
    </section>
  )
}
