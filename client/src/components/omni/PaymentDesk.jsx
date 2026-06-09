import React, { useEffect, useMemo, useState } from 'react'
import { createKgpCheckout, createPaymentRequest, fetchPaymentProviderHealth } from '../../lib/omniApi.js'
import GovernanceActions from './GovernanceActions.jsx'

function paymentMessage(payment = {}) {
  const amount = Number(payment.amount || 0).toLocaleString('th-TH', {
    minimumFractionDigits: Number.isInteger(Number(payment.amount || 0)) ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return payment.messagePreview || [
    'สรุปยอดชำระค่ะ',
    payment.orderId ? `ออเดอร์: ${payment.orderId}` : '',
    `ยอดชำระ: ${payment.currency || 'THB'} ${amount}`,
    payment.checkoutUrl
      ? `ชำระผ่าน Meta Pay / KGP: ${payment.checkoutUrl}`
      : 'ลิงก์ Meta Pay / KGP จะถูกสร้างหลังระบบชำระเงินพร้อมใช้งาน',
    'หลังชำระแล้วระบบจะอัปเดตสถานะให้อัตโนมัติค่ะ',
  ].filter(Boolean).join('\n')
}

function paymentStatusLabel(status) {
  const labels = {
    draft: 'ร่าง',
    pending: 'รอชำระ',
    paid: 'ชำระแล้ว',
    failed: 'ไม่สำเร็จ',
    expired: 'หมดอายุ',
    manual_verify: 'รอตรวจ',
    cancelled: 'ยกเลิก',
  }
  return labels[status] || status
}

function linkedOrders(snapshot = {}, thread = null) {
  if (!thread) return []
  const linkedIds = new Set((snapshot.orderLinks || [])
    .filter((link) => link.threadId === thread.id)
    .map((link) => link.orderId))
  return (snapshot.orders || []).filter((order) => linkedIds.has(order.id) || order.customerId === thread.customerId)
}

export default function PaymentDesk({ snapshot, thread, onSnapshot, onUseDraft }) {
  const payments = thread ? (snapshot.paymentRequests || []).filter((payment) => payment.threadId === thread.id) : []
  const orders = useMemo(() => linkedOrders(snapshot, thread), [snapshot, thread])
  const defaultAmount = orders[0]?.totalAmount || orders[0]?.total || ''
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : '')
  const [health, setHealth] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setAmount(defaultAmount ? String(defaultAmount) : '')
    setError('')
    setNotice('')
  }, [defaultAmount, thread?.id])

  useEffect(() => {
    let ignore = false
    fetchPaymentProviderHealth('meta_pay_kgp')
      .then((nextHealth) => {
        if (!ignore) setHealth(nextHealth)
      })
      .catch((err) => {
        if (!ignore) setError(err.message || 'kgp_health_failed')
      })
    return () => { ignore = true }
  }, [])

  async function saveDraft() {
    if (!thread || busy) return
    const cleanAmount = Number(amount)
    if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
      setError('ใส่ยอดชำระก่อน')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await createPaymentRequest({
        threadId: thread.id,
        orderId: orders[0]?.id || undefined,
        provider: 'meta_pay_kgp',
        amount: cleanAmount,
        currency: 'THB',
        sourceRef: 'omni_ui:kgp_payment_desk',
      })
      onSnapshot?.(result.snapshot)
      if (result.payment) {
        onUseDraft?.({
          id: `payment_message_${result.payment.id}_${Date.now()}`,
          threadId: thread.id,
          text: paymentMessage(result.payment),
          source: 'payment',
        })
      }
      setNotice('สร้างร่างชำระเงินแล้ว และใส่ข้อความในกล่องตอบแล้ว')
    } catch (err) {
      setError(err.message || 'payment_draft_failed')
    } finally {
      setBusy(false)
    }
  }

  async function createCheckout(payment) {
    if (busy || !payment) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await createKgpCheckout(payment.id)
      onSnapshot?.(result.snapshot)
      setNotice('สร้างลิงก์ KGP แล้ว แต่ยังต้องอนุมัติข้อความก่อนส่งลูกค้า')
    } catch (err) {
      setError(err.message || 'kgp_checkout_failed')
    } finally {
      setBusy(false)
    }
  }

  function useMessage(payment) {
    if (!thread || !payment) return
    onUseDraft?.({
      id: `payment_message_${payment.id}_${Date.now()}`,
      threadId: thread.id,
      text: paymentMessage(payment),
    })
    setNotice('ใส่ข้อความชำระเงินในกล่องตอบแล้ว ยังเป็น draft')
  }

  const liveReady = health?.liveReady === true
  const healthLabel = !health ? 'กำลังตรวจ KGP'
    : liveReady ? 'KGP live ready'
      : health.credentialsReady ? 'มี key แต่ยังไม่เปิดใช้'
        : 'รอ KGP key'

  return (
    <section className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-ink)]">ชำระเงิน</h2>
          <p className="mt-1 text-[11px] text-[var(--color-muted)]">Meta Pay / KGP ยังเป็น guarded flow</p>
        </div>
        <span className={`shrink-0 rounded-[var(--radius-pill)] px-2 py-1 text-[10px] font-bold ${liveReady ? 'bg-[var(--color-live-soft)] text-[var(--color-live)]' : 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]'}`}>
          {healthLabel}
        </span>
      </div>

      <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-3">
        <label className="text-xs font-semibold text-[var(--color-muted)]">
          ยอดที่ต้องเรียกเก็บ
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            placeholder="เช่น 729"
            className="mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 text-sm font-semibold text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
          />
        </label>
        <button
          type="button"
          onClick={saveDraft}
          disabled={busy || !thread}
          className="mt-2 h-9 w-full rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 text-xs font-bold text-[var(--color-accent-ink)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? 'กำลังทำงาน...' : 'สร้างร่างชำระเงิน'}
        </button>
      </div>

      {payments.length === 0 ? <p className="mt-3 text-xs text-[var(--color-muted)]">ยังไม่มีร่างชำระเงิน</p> : null}
      {payments.map((payment) => (
        <div key={payment.id} className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-3 text-xs text-[var(--color-ink-2)]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-bold text-[var(--color-ink)]">Meta Pay / KGP</div>
              <div className="mt-1">{paymentStatusLabel(payment.status)} · {payment.currency} {payment.amount}</div>
            </div>
            <span className="rounded-[var(--radius-pill)] bg-[var(--color-warn-soft)] px-2 py-1 text-[10px] font-bold text-[var(--color-warn)]">ต้องอนุมัติก่อนส่ง</span>
          </div>
          <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-rule)] bg-[var(--color-paper)] p-3">
            <div className="text-[10px] font-bold uppercase tracking-normal text-[var(--color-muted)]">ข้อความที่จะส่ง</div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-ink)]">{paymentMessage(payment)}</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => useMessage(payment)}
              className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-xs font-bold text-[var(--color-ink)] hover:bg-[var(--color-panel)]"
            >
              ใช้ข้อความนี้
            </button>
            <button
              type="button"
              onClick={() => createCheckout(payment)}
              disabled={busy || !liveReady || payment.status !== 'draft'}
              title={!liveReady ? 'ต้องได้ KGP key และเปิด META_PAY_KGP_ENABLED ก่อน' : 'สร้างลิงก์ชำระเงิน KGP'}
              className="rounded-[var(--radius-md)] border border-[var(--color-warn)] bg-[var(--color-warn-soft)] px-3 py-2 text-xs font-bold text-[var(--color-warn)] hover:bg-[var(--color-panel)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              สร้าง KGP link
            </button>
          </div>
          <GovernanceActions
            className="mt-2"
            objectType="payment_request"
            objectId={payment.id}
            objectLabel={payment.id}
            onChanged={(result) => onSnapshot?.(result.snapshot)}
          />
        </div>
      ))}
      {error ? <p className="mt-3 text-xs font-semibold text-[var(--color-danger)]">{error}</p> : null}
      {notice ? <p className="mt-3 text-xs font-semibold text-[var(--color-live)]">{notice}</p> : null}
      <p className="mt-3 text-[11px] leading-5 text-[var(--color-muted)]">
        กล่องนี้ไม่ส่งข้อความเอง ใช้สำหรับเตรียม draft และตรวจรูปแบบก่อนเปิดใช้จริง
      </p>
    </section>
  )
}
