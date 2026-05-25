import React from 'react'

export default function OrderDesk({ snapshot, thread }) {
  const orders = thread ? snapshot.orders.filter((order) => order.customerId === thread.customerId) : []
  const recentTikTokOrders = (snapshot.orders || []).filter((order) => order.platform === 'tiktok').slice(-5).reverse()
  return (
    <section className="p-4">
      <h2 className="text-sm font-bold text-[var(--color-ink)]">ออเดอร์</h2>
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
