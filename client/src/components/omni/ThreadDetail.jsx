import React, { useEffect, useRef, useState } from 'react'
import { autoSendStatus, customerAvatarUrl, customerForThread, formatShortTime, initialsForName, pageForThread, sourceLabel, statusLabel } from '../../lib/omniModel.js'
import { saveOmniSettings, sendManualReply } from '../../lib/omniApi.js'

export default function ThreadDetail({ snapshot, thread, onSnapshot, suggestedDraft, workspaceId }) {
  const endRef = useRef(null)
  const [guardBusy, setGuardBusy] = useState(false)
  const [guardError, setGuardError] = useState('')
  const customer = customerForThread(snapshot?.customers, thread)
  const page = pageForThread(snapshot?.pages, thread)
  const messages = (snapshot?.messages || [])
    .filter((message) => message.threadId === thread?.id)
    .slice()
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
  const autoSend = autoSendStatus(snapshot || {}, thread)
  const settings = snapshot?.settings || snapshot?.omniSettings?.find?.((item) => item.id === 'default')?.settings || {}
  const customerSendEnabled = settings?.ai?.customerSendEnabled === true

  async function toggleCustomerSend() {
    if (guardBusy) return
    setGuardBusy(true)
    setGuardError('')
    const nextSettings = {
      ...settings,
      ai: {
        ...(settings.ai || {}),
        customerSendEnabled: settings.ai?.customerSendEnabled !== true,
      },
    }
    try {
      const result = await saveOmniSettings(nextSettings, { workspaceId: workspaceId || undefined })
      const nextSnapshot = result.snapshot || (snapshot ? { ...snapshot, settings: result.settings || nextSettings } : null)
      if (nextSnapshot) onSnapshot?.(nextSnapshot)
    } catch (error) {
      setGuardError(error.message || 'customer_send_guard_update_failed')
    } finally {
      setGuardBusy(false)
    }
  }

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
            <div className="flex min-w-0 items-center gap-3">
              <CustomerAvatar name={customer?.displayName || 'Facebook Customer'} avatarUrl={customerAvatarUrl(customer)} size="lg" />
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold text-[var(--color-ink)]">{customer?.displayName || 'Facebook Customer'}</h1>
                <p className="mt-1 text-xs text-[var(--color-muted)]">{page?.name || thread.pageId} · {thread.platform} · {statusLabel(thread.status, thread)}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
            <span className="rounded-[var(--radius-pill)] bg-[var(--color-live-soft)] px-2 py-1 font-semibold text-[var(--color-live)]">Webhook live</span>
            <span className="rounded-[var(--radius-pill)] bg-[var(--color-ai-soft)] px-2 py-1 font-semibold text-[var(--color-ai)]">AI draft on</span>
            <span className={`rounded-[var(--radius-pill)] px-2 py-1 font-semibold ${autoSend.active ? 'bg-[var(--color-live-soft)] text-[var(--color-live)]' : 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]'}`}>{autoSend.label}</span>
            <button
              type="button"
              role="switch"
              aria-checked={customerSendEnabled}
              aria-label={`ส่งลูกค้าจริง ${customerSendEnabled ? 'ส่งจริงเปิด' : 'Draft only'}`}
              disabled={guardBusy}
              onClick={toggleCustomerSend}
              className={`flex min-w-[150px] items-center justify-between gap-2 rounded-[var(--radius-md)] border px-2 py-1 font-bold transition disabled:cursor-not-allowed disabled:opacity-55 ${customerSendEnabled ? 'border-[var(--color-live)] bg-[var(--color-live-soft)] text-[var(--color-live)]' : 'border-[var(--color-warn)] bg-[var(--color-warn-soft)] text-[var(--color-warn)]'}`}
              title={customerSendEnabled ? 'ปิดส่งลูกค้าจริงอัตโนมัติ' : 'เปิดส่งลูกค้าจริงอัตโนมัติ'}
            >
              <span>{customerSendEnabled ? 'ส่งจริงเปิด' : 'Draft only'}</span>
              <span className={`relative h-5 w-9 rounded-full ${customerSendEnabled ? 'bg-[var(--color-live)]' : 'bg-[var(--color-warn)]'}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${customerSendEnabled ? 'left-4' : 'left-0.5'}`} />
              </span>
            </button>
          </div>
        </div>
        {guardError ? <div className="mt-2 rounded-[var(--radius-sm)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--color-danger)]">{guardError}</div> : null}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[var(--color-paper)] p-5">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} pageName={page?.name} customerName={customer?.displayName} />
        ))}
        <div ref={endRef} />
      </div>
      <ManualReplyComposer
        thread={thread}
        messagesSignature={messages.map((message) => `${message.id}:${message.createdAt || ''}:${message.sourceRef || ''}`).join('|')}
        onSnapshot={onSnapshot}
        suggestedDraft={suggestedDraft}
        customerSendEnabled={customerSendEnabled}
        onToggleCustomerSend={toggleCustomerSend}
        guardBusy={guardBusy}
      />
    </>
  )
}

function CustomerAvatar({ name, avatarUrl, size = 'md' }) {
  const className = size === 'lg'
    ? 'h-11 w-11 text-sm'
    : 'h-9 w-9 text-xs'
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className={`${className} shrink-0 rounded-full border border-[var(--color-rule)] object-cover`} />
  }
  return (
    <span className={`${className} grid shrink-0 place-items-center rounded-full border border-[var(--color-rule)] bg-[var(--color-panel-2)] font-black text-[var(--color-ink-2)]`}>
      {initialsForName(name)}
    </span>
  )
}

function MessageBubble({ message, pageName, customerName }) {
  const outbound = message.direction === 'outbound'
  const draftOnly = outbound && message.deliveryStatus === 'draft_only'
  const author = outbound ? (message.authorName || pageName || 'Page') : (message.authorName === 'Facebook Customer' ? customerName || message.authorName : message.authorName)
  return (
    <article className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[78%] rounded-[var(--radius-md)] border px-3 py-2 shadow-sm ${outbound ? (draftOnly ? 'border-[var(--color-warn)] bg-[var(--color-warn-soft)]' : 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]') : 'border-[var(--color-rule)] bg-[var(--color-panel)]'}`}>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[var(--color-muted)]">
          <span>{author || 'Customer'}</span>
          <span className="tabular-nums">{formatShortTime(message.createdAt)}</span>
          <span className="rounded-[var(--radius-pill)] bg-[var(--color-panel-2)] px-1.5 py-0.5 text-[10px]">{draftOnly ? 'AI draft-only' : sourceLabel(message.sourceRef || '')}</span>
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-ink)]">{message.text || '[attachment]'}</p>
        {draftOnly ? <div className="mt-2 rounded-[var(--radius-sm)] border border-[var(--color-warn)] bg-[var(--color-panel)] px-2 py-1 text-[11px] font-bold text-[var(--color-warn)]">ยังไม่ส่งลูกค้า · ต้องเปิด “ส่งจริงเปิด” แล้วกดส่งเอง</div> : null}
        {Array.isArray(message.attachments) && message.attachments.length > 0 ? (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {message.attachments.map((attachment) => (
              <img
                key={attachment.id || attachment.name}
                src={attachment.dataUrl || attachment.url}
                alt={attachment.name || 'attachment'}
                className="aspect-square w-full rounded-[var(--radius-sm)] border border-[var(--color-rule)] object-cover"
              />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  )
}

function ManualReplyComposer({ thread, messagesSignature = '', onSnapshot, suggestedDraft, customerSendEnabled = false, onToggleCustomerSend, guardBusy = false }) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)
  const messageSignatureRef = useRef('')

  useEffect(() => {
    setText('')
    setAttachments([])
    setError('')
    messageSignatureRef.current = messagesSignature
  }, [thread?.id])

  useEffect(() => {
    if (!thread?.id) return
    if (!messageSignatureRef.current) {
      messageSignatureRef.current = messagesSignature
      return
    }
    if (messageSignatureRef.current === messagesSignature) return
    messageSignatureRef.current = messagesSignature
    setText('')
    setAttachments([])
    setError('')
  }, [messagesSignature, thread?.id])

  useEffect(() => {
    if (!suggestedDraft?.text || suggestedDraft.threadId !== thread?.id) return
    setText(suggestedDraft.text)
    if (Array.isArray(suggestedDraft.attachments)) {
      setAttachments(suggestedDraft.attachments.slice(0, 5))
    }
    setError('')
  }, [suggestedDraft?.id, suggestedDraft?.text, suggestedDraft?.threadId, suggestedDraft?.attachments, thread?.id])

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

  function submit(event) {
    event.preventDefault()
  }

  async function sendLive() {
    if (!thread || busy) return
    const cleanText = text.trim()
    if (!cleanText && attachments.length === 0) return
    if (!customerSendEnabled) {
      setError('เปิดปุ่มส่งจริงก่อน จึงจะส่งข้อความให้ลูกค้าได้')
      return
    }
    if (attachments.some((item) => !/^https:\/\//i.test(item.url || ''))) {
      setError('ส่งรูปจริงต้องใช้รูป https จากสินค้า/EasyStore ก่อน รูปจากเครื่องดูได้ในกล่องตอบแต่ยังส่งจริงไม่ได้')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await sendManualReply(thread.id, {
        authorName: 'บอส',
        text: cleanText,
        attachments,
      })
      onSnapshot?.(result.snapshot)
      setText('')
      setAttachments([])
    } catch (err) {
      setError(err.message || 'manual_send_failed')
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
              <img src={attachment.dataUrl || attachment.url} alt={attachment.name} className="h-full w-full object-cover" />
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <textarea
          rows={2}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
          }}
          placeholder="พิมพ์ข้อความตอบลูกค้า..."
          className="min-h-[48px] w-full min-w-0 resize-none rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2 text-sm leading-5 text-[var(--color-ink)] outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] sm:flex-1"
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
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:items-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]"
          >
            แนบภาพ
          </button>
          <button
            type="button"
            disabled={busy || (!text.trim() && attachments.length === 0)}
            onClick={() => {
              setText('')
              setAttachments([])
              setError('')
            }}
            className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-4 py-2 text-sm font-semibold text-[var(--color-ink-2)] shadow-sm disabled:opacity-45"
          >
            ล้าง
          </button>
          <button
            type="button"
            disabled={busy || (!text.trim() && attachments.length === 0) || !customerSendEnabled}
            onClick={sendLive}
            className="rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? 'กำลังส่ง...' : 'ส่งลูกค้าจริง'}
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      {!customerSendEnabled ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-warn)] bg-[var(--color-warn-soft)] px-3 py-2 text-xs font-semibold text-[var(--color-warn)]">
          <span>ตอนนี้ AI ทำได้แค่ draft ลูกค้ายังไม่เห็นข้อความตอบ</span>
          <button
            type="button"
            disabled={guardBusy}
            onClick={onToggleCustomerSend}
            className="rounded-[var(--radius-md)] border border-[var(--color-warn)] bg-[var(--color-panel)] px-3 py-1 text-xs font-bold disabled:opacity-50"
          >
            เปิดส่งจริง
          </button>
        </div>
      ) : null}
      <p className="mt-2 text-[11px] text-[var(--color-muted)]">
        ข้อความ รูป ลิงก์ ออเดอร์ และชำระเงินในกล่องนี้คือ draft ที่บอสเห็นก่อนส่งจริง
      </p>
    </form>
  )
}
