import React from 'react'

export default function PaymentDesk({ snapshot, thread }) {
  const payments = thread ? (snapshot.paymentRequests || []).filter((payment) => payment.threadId === thread.id) : []
  return (
    <section className="border-b border-[#dfe8e4] p-4">
      <h2 className="text-sm font-semibold text-[#24362f]">Payment Desk</h2>
      {payments.length === 0 ? <p className="mt-2 text-xs text-[#7a8b84]">No payment drafts</p> : null}
      {payments.map((payment) => (
        <div key={payment.id} className="mt-3 rounded-xl border border-[#f2dfb8] bg-[#fffaf0] p-3 text-xs text-[#705122] shadow-sm">
          <div>{payment.provider} · {payment.status}</div>
          <div>{payment.currency} {payment.amount}</div>
          <div className="mt-1 text-[#b7791f]">Approval required before sending</div>
        </div>
      ))}
    </section>
  )
}
