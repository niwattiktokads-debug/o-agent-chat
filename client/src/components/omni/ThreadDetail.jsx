import React, { useEffect, useRef, useState } from 'react'
import { customerForThread, formatShortTime, pageForThread, sourceLabel, statusLabel } from '../../lib/omniModel.js'
import { saveManualReplyDraft } from '../../lib/omniApi.js'
import GovernanceActions from './GovernanceActions.jsx'

export default function ThreadDetail({ snapshot, thread, onSnapshot }) {
  const endRef = useRef(null)
  const customer = customerForThread(snapshot?.customers, thread)
  const page = pageForThread(snapshot?.pages, thread)
  const messages = (snapshot?.messages || [])
    .filter((message) => message.threadId === thread?.id)
    .slice()
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))

  useEffect(() => {
    if (typeof endRef.current?.scrollIntoView === 'function') {
      endRef.current.scrollIntoView({ block: 'end' })
    }
  }, [messages.length, thread?.id])

  if (!thread) return <div className="p-5 text-[var(--color-muted)]">No thread selected</div>

  return (
    <>
      <div className="border-b border-[var(--color-rule)] bg-[var(--color-panel)] px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-[var(--color-ink)]">{customer?.displayName || 'Facebook Customer'}</h1>
            <p className="mt-1 text-xs text-[var(--color-muted)]">{page?.name || thread.pageId} · {thread.platform} · {statusLabel(thread.status)}</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-[var(--radius-pill)] bg-[var(--color-live-soft)] px-2 py-1 font-semibold text-[var(--color-live)]">Webhook live</span>
            <span className="rounded-[var(--radius-pill)] bg-[var(--color-ai-soft)] px-2 py-1 font-semibold text-[var(--color-ai)]">AI draft on</span>
            <span className="rounded-[var(--radius-pill)] bg-[var(--color-warn-soft)] px-2 py-1 font-semibold text-[var(--color-warn)]">Auto-send off</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <GovernanceActions objectType="thread" objectId={thread.id} objectLabel={customer?.displayName || thread.id} onChanged={(result) => onSnapshot?.(result.snapshot)} />
          {customer?.id ? (
            <GovernanceActions objectType="customer" objectId={customer.id} objectLabel={customer.displayName || customer.id} onChanged={(result) => onSnapshot?.(result.snapshot)} />
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[var(--color-paper)] p-5">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} pageName={page?.name} customerName={customer?.displayName} onSnapshot={onSnapshot} />
        ))}
        <div ref={endRef} />
      </div>
      <ManualReplyComposer thread={thread} onSnapshot={onSnapshot} />
    </>
  )
}

function MessageBubble({ message, pageName, customerName, onSnapshot }) {
  const outbound = message.direction === 'outbound'
  const author = outbound ? (message.authorName || pageName || 'Page') : (message.authorName === 'Facebook Customer' ? customerName || message.authorName : message.authorName)
  return (
    <article className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[78%] rounded-[var(--radius-md)] border px-3 py-2 shadow-sm ${outbound ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]' : 'border-[var(--color-rule)] bg-[var(--color-panel)]'}`}>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[var(--color-muted)]">
          <span>{author || 'Customer'}</span>
          <span className="tabular-nums">{formatShortTime(message.createdAt)}</span>
          <span className="rounded-[var(--radius-pill)] bg-[var(--color-panel-2)] px-1.5 py-0.5 text-[10px]">{sourceLabel(message.sourceRef || '')}</span>
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-ink)]">{message.text || '[attachment]'}</p>
        {Array.isArray(message.attachments) && message.attachments.length > 0 ? (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {message.attachments.map((attachment) => (
              <img
                key={attachment.id || attachment.name}
                src={attachment.dataUrl}
                alt={attachment.name || 'attachment'}
                className="aspect-square w-full rounded-[var(--radius-sm)] border border-[var(--color-rule)] object-cover"
              />
            ))}
          </div>
        ) : null}
        <GovernanceActions
          className="mt-2"
          objectType="message"
          objectId={message.id}
          objectLabel={author || message.id}
          onChanged={(result) => onSnapshot?.(result.snapshot)}
        />
      </div>
    </article>
  )
}

function ManualReplyComposer({ thread, onSnapshot }) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    setText('')
    setAttachments([])
    setError('')
  }, [thread?.id])

  async function readFiles(files) {
    const imageFiles = [...files].filter((file) => file.type.startsWith('image/')).slice(0, 5 - attachments.length)
    const rows = await Promise.all(imageFiles.map((file) => new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve({
        id: `local_${file.name}_${file.size}_${Date.now()}`,
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: String(reader.result || ''),
      })
      reader.onerror = () => reject(new Error('image_read_failed'))
      reader.readAsDataURL(file)
    })))
    setAttachments((current) => [...current, ...rows].slice(0, 5))
  }

  async function submit(event) {
    event.preventDefault()
    if (!thread || busy) return
    const cleanText = text.trim()
    if (!cleanText && attachments.length === 0) return
    setBusy(true)
    setError('')
    try {
      const result = await saveManualReplyDraft(thread.id, {
        authorName: 'บอส',
        text: cleanText,
        attachments,
      })
      onSnapshot?.(result.snapshot)
      setText('')
      setAttachments([])
    } catch (err) {
      setError(err.message || 'manual_draft_failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="border-t border-[var(--color-rule)] bg-[var(--color-panel)] px-4 py-3">
      {attachments.length > 0 ? (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-rule)]">
              <img src={attachment.dataUrl} alt={attachment.name} className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label={`ลบรูป ${attachment.name}`}
                onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/65 text-xs font-bold text-white"
              >
                x
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <textarea
          rows={2}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="พิมพ์ข้อความตอบลูกค้า... (บันทึกเป็น draft ก่อน)"
          className="min-h-[48px] flex-1 resize-none rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-sm leading-5 text-[var(--color-ink)] outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            readFiles(event.target.files || []).catch((err) => setError(err.message || 'image_read_failed'))
            event.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]"
        >
          แนบภาพ
        </button>
        <button
          type="submit"
          disabled={busy || (!text.trim() && attachments.length === 0)}
          className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-ink)] shadow-sm disabled:opacity-45"
        >
          {busy ? 'บันทึก...' : 'บันทึก draft'}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      <p className="mt-2 text-[11px] text-[var(--color-muted)]">Draft นี้ยังไม่ส่งออกไปหาลูกค้า</p>
    </form>
  )
}
