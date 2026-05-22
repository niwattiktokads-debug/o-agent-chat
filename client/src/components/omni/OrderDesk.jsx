import React from 'react'

export default function OrderDesk({ snapshot, thread }) {
  const orders = thread ? snapshot.orders.filter((order) => order.customerId === thread.customerId) : []
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
    </section>
  )
}
