import React, { useEffect, useRef, useState } from 'react'

const SENDER_TO_ROLE = { 'บอส': 'Boss', Code: 'Code', Codex: 'Codex' }

export default function Composer({ onSend, onTyping, online = true, onSenderChange }) {
  const [text, setText] = useState('')
  const [sender, setSender] = useState('บอส')

  const pickSender = (s) => {
    setSender(s)
    onSenderChange?.(SENDER_TO_ROLE[s] || s)
  }

  useEffect(() => {
    onSenderChange?.(SENDER_TO_ROLE[sender] || sender)
  }, [])
  const typingTimer = useRef(null)
  const lastTyping = useRef(false)

  const flushTyping = (typing) => {
    if (lastTyping.current === typing) return
    lastTyping.current = typing
    onTyping?.(typing)
  }

  const handleChange = (e) => {
    setText(e.target.value)
    if (e.target.value.length > 0) {
      flushTyping(true)
      clearTimeout(typingTimer.current)
      typingTimer.current = setTimeout(() => flushTyping(false), 2000)
    } else {
      flushTyping(false)
    }
  }

  const submit = (e) => {
    e?.preventDefault()
    const t = text.trim()
    if (!t) return
    flushTyping(false)
    clearTimeout(typingTimer.current)
    onSend(sender, t)
    setText('')
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      submit(e)
    }
  }

  useEffect(() => () => clearTimeout(typingTimer.current), [])

  return (
    <form onSubmit={submit} className="border-t border-slate-800 bg-slate-900/60 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {['บอส', 'Code', 'Codex'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => pickSender(s)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              sender === s ? 'bg-slate-200 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            ส่งในนาม {s}
          </button>
        ))}
        {!online && (
          <span className="ml-auto text-[11px] text-amber-400">offline — จะส่งเมื่อกลับมา</span>
        )}
      </div>
      <div className="flex gap-2">
        <textarea
          rows={1}
          value={text}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          placeholder={`พิมพ์ในนาม ${sender}... (Enter ส่ง, Shift+Enter ขึ้นบรรทัด)`}
          className="flex-1 resize-none rounded-md bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-emerald-600"
        />
        <button
          type="submit"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          disabled={!text.trim()}
        >
          ส่ง
        </button>
      </div>
    </form>
  )
}
