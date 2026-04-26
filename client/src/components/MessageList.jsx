import React, { useEffect, useRef } from 'react'
import TagBadge from './TagBadge.jsx'
import { parseTag } from '../lib/parseTag.js'

const styleFor = (sender) => {
  if (sender === 'บอส' || sender === 'Boss') return 'bg-amber-500/90 text-slate-950'
  if (sender === 'Code') return 'bg-sky-600 text-white'
  if (sender === 'Codex') return 'bg-violet-600 text-white'
  return 'bg-slate-700 text-slate-100'
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
    <div className="flex-1 overflow-y-auto px-4 py-5 space-y-3 sm:px-6">
      {messages.map((m) => {
        const parsed = m.tag ? { tag: m.tag, text: m.text } : parseTag(m.text || '')
        return (
          <div key={m.id} className={`flex ${sideFor(m.sender)}`}>
            <div className="max-w-[80%] sm:max-w-[70%]">
              <div className="text-[11px] text-slate-500 mb-1 px-1 flex items-center gap-2">
                <span>{m.sender}</span>
                <span>·</span>
                <span>{fmtTime(m.ts || m.createdAt)}</span>
                {m.pending && <span className="text-amber-400">กำลังส่ง...</span>}
                {m.failed && <span className="text-rose-400">⚠️ ส่งไม่สำเร็จ</span>}
              </div>
              <div className={`rounded-2xl px-4 py-2 text-sm leading-relaxed shadow ${styleFor(m.sender)} ${m.pending ? 'opacity-60' : ''}`}>
                <TagBadge tag={parsed.tag} />
                <span>{parsed.text}</span>
              </div>
            </div>
          </div>
        )
      })}
      <div ref={endRef} />
    </div>
  )
}
