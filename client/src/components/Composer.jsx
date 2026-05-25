import React, { useEffect, useRef, useState } from 'react'
import { usePushToTalkSpeech } from '../lib/usePushToTalkSpeech.js'

const SENDER_TO_ROLE = {
  'บอส': 'Boss', Code: 'Code', Codex: 'Codex',
  ChatGPT: 'ChatGPT', Cowork: 'Cowork',
}

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

  const appendVoiceText = (transcript) => {
    const clean = String(transcript || '').trim()
    if (!clean) return
    setText((current) => {
      const prefix = current.trim() ? `${current.trimEnd()} ` : ''
      return `${prefix}${clean}`
    })
    flushTyping(true)
    clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => flushTyping(false), 2000)
  }

  const voice = usePushToTalkSpeech({ lang: 'th-TH', onCommit: appendVoiceText })

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

  const askExternal = (target) => {
    const t = text.trim()
    if (!t) return
    const q = encodeURIComponent(t)
    const url = target === 'Cowork'
      ? `https://claude.ai/new?q=${q}`
      : `https://chatgpt.com/?q=${q}`
    onSend(sender, `[ASK] @${target} ${t}`)
    window.open(url, '_blank', 'noopener')
    setText('')
  }

  useEffect(() => () => clearTimeout(typingTimer.current), [])

  const startVoice = (event) => {
    if (event.button !== undefined && event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    voice.start()
  }

  const stopVoice = (event) => {
    event.preventDefault()
    voice.stop()
  }

  const onVoiceKeyDown = (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') return
    if (event.repeat) return
    event.preventDefault()
    voice.start()
  }

  const onVoiceKeyUp = (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') return
    event.preventDefault()
    voice.stop()
  }

  return (
    <form onSubmit={submit} className="border-t border-[var(--color-rule)] bg-[var(--color-panel)] p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.04)] sm:p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {['บอส', 'Code', 'Codex', 'ChatGPT', 'Cowork'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => pickSender(s)}
            className={`rounded-[var(--radius-md)] px-2.5 py-1 text-xs font-semibold ${
              sender === s
                ? 'bg-[var(--color-accent)] text-[var(--color-accent-ink)]'
                : 'border border-[var(--color-rule)] bg-[var(--color-panel-2)] text-[var(--color-ink-2)] hover:bg-[var(--color-panel)]'
            }`}
          >
            {s}
          </button>
        ))}
        {!online && (
          <span className="ml-auto text-[11px] font-semibold text-amber-700">offline - จะส่งเมื่อกลับมา</span>
        )}
      </div>
      <div className="flex gap-2">
        <textarea
          rows={1}
          value={text}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          placeholder={`พิมพ์ในนาม ${sender}... (Enter ส่ง, Shift+Enter ขึ้นบรรทัด)`}
          className="min-h-10 flex-1 resize-none rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)] outline-none focus:ring-2 focus:ring-[var(--color-focus)]"
        />
        <button
          type="button"
          aria-label="กดค้างเพื่อพูด"
          aria-pressed={voice.listening}
          title={voice.supported ? 'กดค้างเพื่อพูด แล้วปล่อยเพื่อแปลงเป็นข้อความ' : 'เบราว์เซอร์นี้ยังไม่รองรับ voice input'}
          disabled={!voice.supported}
          onPointerDown={startVoice}
          onPointerUp={stopVoice}
          onPointerCancel={stopVoice}
          onKeyDown={onVoiceKeyDown}
          onKeyUp={onVoiceKeyUp}
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-md border text-[11px] font-bold transition ${
            voice.listening
              ? 'border-rose-300 bg-rose-500 text-white shadow-[0_0_0_3px_rgba(244,63,94,0.22)]'
              : 'border-[var(--color-rule)] bg-[var(--color-panel-2)] text-[var(--color-ink-2)] hover:bg-[var(--color-panel)] disabled:cursor-not-allowed disabled:opacity-40'
          }`}
        >
          {voice.listening ? 'REC' : 'MIC'}
        </button>
        <button
          type="submit"
          className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-ink)] hover:brightness-95 disabled:opacity-50"
          disabled={!text.trim()}
        >
          ส่ง
        </button>
      </div>
      {(voice.listening || voice.interimText || voice.error) && (
        <div className="mt-2 min-h-5 text-[11px]" role="status" aria-live="polite">
          {voice.listening && <span className="font-semibold text-rose-700">กำลังฟัง...</span>}
          {voice.interimText && <span className="ml-2 text-[var(--color-muted)]">{voice.interimText}</span>}
          {voice.error && !voice.listening && <span className="font-semibold text-amber-700">เปิดไมค์ไม่สำเร็จ: {voice.error}</span>}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
        <span className="text-[var(--color-muted)]">ส่งต่อภายนอก:</span>
        <button
          type="button"
          onClick={() => askExternal('Cowork')}
          disabled={!text.trim()}
          className="rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-2 py-0.5 font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-40"
          title="ส่งข้อความไปเปิด Claude.ai (Cowork) ใน tab ใหม่ + log [ASK] ในห้อง"
        >
          ถาม Cowork
        </button>
        <button
          type="button"
          onClick={() => askExternal('ChatGPT')}
          disabled={!text.trim()}
          className="rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
          title="ส่งข้อความไปเปิด ChatGPT ใน tab ใหม่ + log [ASK] ในห้อง"
        >
          ถาม ChatGPT
        </button>
      </div>
    </form>
  )
}
