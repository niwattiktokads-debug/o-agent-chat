import React from 'react'

export default function PaymentDesk({ snapshot, thread }) {
  const payments = thread ? (snapshot.paymentRequests || []).filter((payment) => payment.threadId === thread.id) : []
  return (
    <section className="border-b border-slate-800 p-4">
      <h2 className="text-sm font-semibold">Payment Desk</h2>
      {payments.length === 0 ? <p className="mt-2 text-xs text-slate-500">No payment drafts</p> : null}
      {payments.map((payment) => (
        <div key={payment.id} className="mt-3 rounded bg-slate-900 p-3 text-xs text-slate-300">
          <div>{payment.provider} · {payment.status}</div>
          <div>{payment.currency} {payment.amount}</div>
          <div className="mt-1 text-amber-300">Approval required before sending</div>
        </div>
      ))}
    </section>
  )
}
