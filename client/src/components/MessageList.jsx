import React, { useEffect, useRef } from 'react'
import TagBadge from './TagBadge.jsx'
import Avatar from './Avatar.jsx'
import { parseTag } from '../lib/parseTag.js'

const styleFor = (sender) => {
  if (sender === 'บอส' || sender === 'Boss') return 'border-amber-200 bg-amber-50 text-amber-950'
  if (sender === 'Code') return 'border-sky-200 bg-sky-50 text-sky-950'
  if (sender === 'Codex') return 'border-violet-200 bg-violet-50 text-violet-950'
  if (sender === 'ChatGPT') return 'border-emerald-200 bg-emerald-50 text-emerald-950'
  if (sender === 'Cowork') return 'border-rose-200 bg-rose-50 text-rose-950'
  return 'border-[var(--color-rule)] bg-[var(--color-panel)] text-[var(--color-ink)]'
}

const sideFor = (sender) =>
  sender === 'บอส' || sender === 'Boss' ? 'justify-end' : 'justify-start'

const fmtTime = (ts) => {
  if (!ts) return ''
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts)
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

export default function MessageList({ messages }) {
  const endRef = useRef(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  return (
    <div className="flex-1 space-y-3 overflow-y-auto bg-[var(--color-paper)] px-4 py-5 sm:px-6">
      {messages.length === 0 && (
        <div className="mx-auto mt-10 max-w-xl rounded-[var(--radius-md)] border border-dashed border-[var(--color-rule)] bg-[var(--color-panel)] p-5 text-center">
          <p className="text-sm font-semibold text-[var(--color-ink)]">ยังไม่มีข้อความในรอบนี้</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">เริ่มคุยทีมเพื่อกำหนดหัวหน้า ขอบเขต และงานที่ต้องส่งต่อ Omni</p>
        </div>
      )}
      {messages.map((m) => {
        const parsed = m.tag ? { tag: m.tag, text: m.text } : parseTag(m.text || '')
        const isBoss = m.sender === 'บอส' || m.sender === 'Boss'
        return (
          <div key={m.id} className={`flex items-end gap-2 ${sideFor(m.sender)}`}>
            {!isBoss && <Avatar sender={m.sender} />}
            <div className="max-w-[78%] sm:max-w-[65%]">
              <div className="mb-1 flex items-center gap-2 px-1 text-[11px] text-[var(--color-muted)]">
                <span>{m.sender}</span>
                <span>·</span>
                <span>{fmtTime(m.ts || m.createdAt)}</span>
                {m.pending && <span className="font-semibold text-amber-700">กำลังส่ง...</span>}
                {m.failed && <span className="font-semibold text-rose-700">ส่งไม่สำเร็จ</span>}
              </div>
              <div className={`rounded-[var(--radius-md)] border px-4 py-2 text-sm leading-relaxed shadow-sm ${styleFor(m.sender)} ${m.pending ? 'opacity-60' : ''}`}>
                <TagBadge tag={parsed.tag} />
                <span>{parsed.text}</span>
              </div>
            </div>
            {isBoss && <Avatar sender={m.sender} />}
          </div>
        )
      })}
      <div ref={endRef} />
    </div>
  )
}
