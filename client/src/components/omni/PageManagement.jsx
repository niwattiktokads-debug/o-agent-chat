import React, { useState } from 'react'
import { setPageAutoReply } from '../../lib/omniApi.js'
import GovernanceActions from './GovernanceActions.jsx'

export default function PageManagement({ pages, onSnapshot }) {
  const [busyPageId, setBusyPageId] = useState(null)
  const [error, setError] = useState('')

  const toggleAutoReply = async (page) => {
    setBusyPageId(page.id)
    setError('')
    try {
      const result = await setPageAutoReply(page.id, page.autoReplyEnabled === false)
      onSnapshot?.(result.snapshot)
    } catch (err) {
      setError(err.message || 'page_auto_reply_update_failed')
    } finally {
      setBusyPageId(null)
    }
  }

  return (
    <section className="p-4">
      <h2 className="text-sm font-semibold text-[var(--color-ink)]">Page auto-reply</h2>
      <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">ปิดรายเพจได้ทันที เมื่อปิดแล้ว webhook จะไม่ให้ AI ร่างหรือส่งอัตโนมัติของเพจนั้น</p>
      {error ? <div className="mt-2 rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 p-2 text-xs font-semibold text-rose-700">{error}</div> : null}
      <div className="mt-3 space-y-2">
        {pages.map((page) => {
          const enabled = page.autoReplyEnabled !== false
          return (
            <div key={page.id} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-3 shadow-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[var(--color-ink)]">{page.name}</div>
                <div className={`mt-0.5 text-[11px] font-semibold ${enabled ? 'text-[var(--color-ai)]' : 'text-[var(--color-warn)]'}`}>
                  {enabled ? 'auto-reply เปิดอยู่' : 'auto-reply ปิดอยู่'}
                </div>
              </div>
              <GovernanceActions
                objectType="page"
                objectId={page.id}
                objectLabel={page.name}
                onChanged={(result) => onSnapshot?.(result.snapshot)}
                onError={(err) => setError(err.message || 'page_governance_failed')}
              />
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                disabled={busyPageId === page.id}
                onClick={() => toggleAutoReply(page)}
                className={`relative h-7 w-12 shrink-0 rounded-full border transition disabled:opacity-50 ${enabled ? 'border-[var(--color-accent)] bg-[var(--color-accent)]' : 'border-[var(--color-rule)] bg-[var(--color-panel-2)]'}`}
                title={enabled ? 'ปิด auto-reply เพจนี้' : 'เปิด auto-reply เพจนี้'}
              >
                <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${enabled ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
