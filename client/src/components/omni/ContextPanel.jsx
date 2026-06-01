import React, { useState } from 'react'
import AiDecisionPanel from './AiDecisionPanel.jsx'
import OrderDesk from './OrderDesk.jsx'
import PaymentDesk from './PaymentDesk.jsx'
import ProfilePanel from './ProfilePanel.jsx'

const TABS = [
  { id: 'ai', label: 'AI' },
  { id: 'profiles', label: 'โปรไฟล์' },
  { id: 'orders', label: 'ออเดอร์' },
  { id: 'payment', label: 'ชำระเงิน' },
]

export default function ContextPanel({ snapshot, thread, onSnapshot }) {
  const [tab, setTab] = useState('ai')
  return (
    <aside className="h-full min-h-0 overflow-y-auto border-t border-[var(--color-rule)] bg-[var(--color-panel)] xl:border-l xl:border-t-0">
      <div className="sticky top-0 z-10 border-b border-[var(--color-rule)] bg-[var(--color-panel)] px-4 py-3">
        <div className="text-xs font-semibold text-[var(--color-muted)]">Context</div>
        <div className="mt-2 grid grid-cols-4 rounded-[var(--radius-md)] bg-[var(--color-panel-2)] p-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              className={`rounded-[var(--radius-sm)] px-2 py-1.5 text-xs font-semibold transition ${tab === item.id ? 'bg-[var(--color-panel)] text-[var(--color-accent)] shadow-sm' : 'text-[var(--color-ink-2)] hover:text-[var(--color-ink)]'}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'ai' ? <AiDecisionPanel snapshot={snapshot} thread={thread} onDrafted={onSnapshot} /> : null}
      {tab === 'profiles' ? <ProfilePanel snapshot={snapshot} /> : null}
      {tab === 'orders' ? <OrderDesk snapshot={snapshot} thread={thread} onSnapshot={onSnapshot} /> : null}
      {tab === 'payment' ? <PaymentDesk snapshot={snapshot} thread={thread} /> : null}
    </aside>
  )
}
