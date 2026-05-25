import React from 'react'

export default function PaymentDesk({ snapshot, thread }) {
  const payments = thread ? (snapshot.paymentRequests || []).filter((payment) => payment.threadId === thread.id) : []
  return (
    <section className="p-4">
      <h2 className="text-sm font-bold text-[var(--color-ink)]">ชำระเงิน</h2>
      {payments.length === 0 ? <p className="mt-2 text-xs text-[var(--color-muted)]">ยังไม่มีร่างชำระเงิน</p> : null}
      {payments.map((payment) => (
        <div key={payment.id} className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-warn)] bg-[var(--color-warn-soft)] p-3 text-xs text-[var(--color-ink-2)]">
          <div>{payment.provider} · {payment.status}</div>
          <div>{payment.currency} {payment.amount}</div>
          <div className="mt-1 text-[var(--color-warn)]">ต้องอนุมัติก่อนส่งลูกค้า</div>
        </div>
      ))}
    </section>
  )
}
