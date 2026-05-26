/* Hallmark · component: ConnectionsPage · genre: modern-minimal · theme: design.md
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (46-50)
 */
import React, { useEffect, useMemo, useState } from 'react'
import {
  addConnectionOption,
  deleteConnectionOption,
  createConnectionAiDraft,
  fetchConnectionConversations,
  fetchConnectionThread,
  fetchConnections,
  saveConnectionSecrets,
  sendConnectionReply,
  verifyConnection,
} from '../../lib/omniApi.js'

const GROUP_LABELS = {
  all: 'ทั้งหมด',
  customer_channel: 'ช่องทางลูกค้า',
  ai_provider: 'AI',
  research_provider: 'ค้นเว็บ',
  finance_provider: 'การเงิน',
  commerce_backend: 'คลัง/ออเดอร์',
  marketplace_channel: 'มาร์เก็ตเพลส',
  social_automation: 'โซเชียลอัตโนมัติ',
  custom_provider: 'กำหนดเอง',
}

const CONNECTION_GROUP_OPTIONS = [
  { value: 'customer_channel', label: 'ช่องทางลูกค้า' },
  { value: 'ai_provider', label: 'AI' },
  { value: 'research_provider', label: 'ค้นเว็บ' },
  { value: 'finance_provider', label: 'การเงิน' },
  { value: 'commerce_backend', label: 'คลัง/ออเดอร์' },
  { value: 'marketplace_channel', label: 'มาร์เก็ตเพลส' },
  { value: 'social_automation', label: 'โซเชียลอัตโนมัติ' },
  { value: 'custom_provider', label: 'กำหนดเอง' },
]

function StatusPill({ status }) {
  const map = {
    healthy: 'bg-[var(--color-live-soft)] text-[var(--color-live)]',
    ready_to_verify: 'bg-[var(--color-ai-soft)] text-[var(--color-ai)]',
    needs_key: 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]',
    failed: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
    saving: 'bg-[var(--color-ai-soft)] text-[var(--color-ai)]',
  }
  return (
    <span className={`rounded-[var(--radius-pill)] px-2 py-1 text-xs font-semibold ${map[status] || 'bg-[var(--color-panel-2)] text-[var(--color-muted)]'}`}>
      {status === 'healthy' ? 'เชื่อมต่อแล้ว' : null}
      {status === 'ready_to_verify' ? 'พร้อมตรวจ' : null}
      {status === 'needs_key' ? 'รอ API key' : null}
      {status === 'failed' ? 'ตรวจไม่ผ่าน' : null}
      {status === 'saving' ? 'กำลังบันทึก' : null}
      {!['healthy', 'ready_to_verify', 'needs_key', 'failed', 'saving'].includes(status) ? status : null}
    </span>
  )
}

function ChevronIcon({ open }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 20 20"
    >
      <path
        d="M5.5 7.5 10 12l4.5-4.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function FieldRow({ connectionId, field, value, onChange }) {
  const disabled = field.readOnly
  return (
    <label className="grid gap-2 border-t border-[var(--color-rule)] py-3 md:grid-cols-[minmax(150px,220px)_minmax(0,1fr)_120px] md:items-center">
      <div>
        <div className="text-sm font-semibold text-[var(--color-ink)]">{field.label}</div>
        <div className="mt-1 min-w-0 break-words font-mono text-[11px] text-[var(--color-muted)]">{field.credentialName}</div>
      </div>
      <input
        type={field.secret ? 'password' : 'text'}
        value={disabled ? '' : value}
        disabled={disabled}
        onChange={(event) => onChange(connectionId, field.id, event.target.value)}
        placeholder={disabled ? 'จัดการจาก local profile' : field.status === 'configured' ? 'ตั้งค่าแล้ว ใส่ค่าใหม่เพื่อเปลี่ยน' : 'วางค่า API key หรือ token'}
        className="h-10 min-w-0 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 font-mono text-sm text-[var(--color-ink)] outline-none transition focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] disabled:bg-[var(--color-panel-2)] disabled:text-[var(--color-muted)]"
        autoComplete="off"
      />
      <div className="flex items-center justify-start md:justify-end">
        <StatusPill status={field.status === 'configured' ? 'healthy' : 'needs_key'} />
      </div>
    </label>
  )
}

function AddConnectionPanel({ values, busy, error, onChange, onCancel, onSubmit }) {
  return (
    <form onSubmit={onSubmit} className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-ink)]">เพิ่มตัวเลือกการเชื่อมต่อ</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">สร้างเป็น custom option ก่อน ถ้าจะใช้ production automation ค่อยเพิ่ม helper/manifest ภายหลัง</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-[var(--radius-md)] border border-[var(--color-rule)] px-3 py-2 text-sm font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-panel-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
        >
          ยกเลิก
        </button>
      </div>
      {error ? <div className="mt-3 rounded-[var(--radius-sm)] bg-[var(--color-danger-soft)] p-3 text-xs font-semibold text-[var(--color-danger)]">{error}</div> : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-xs font-semibold text-[var(--color-muted)]">ชื่อการเชื่อมต่อ</span>
          <input
            value={values.title}
            onChange={(event) => onChange('title', event.target.value)}
            className="h-10 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 text-sm text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
            placeholder="เช่น LINE OA"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-semibold text-[var(--color-muted)]">Provider key</span>
          <input
            value={values.provider}
            onChange={(event) => onChange('provider', event.target.value)}
            className="h-10 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 font-mono text-sm text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
            placeholder="เช่น line"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-semibold text-[var(--color-muted)]">ประเภท</span>
          <select
            value={values.group}
            onChange={(event) => onChange('group', event.target.value)}
            className="h-10 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 text-sm text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
          >
            {CONNECTION_GROUP_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-semibold text-[var(--color-muted)]">Credential name</span>
          <input
            value={values.credentialName}
            onChange={(event) => onChange('credentialName', event.target.value)}
            className="h-10 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 text-sm text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
            placeholder="เว้นว่างได้"
          />
        </label>
        <label className="grid gap-2 md:col-span-2">
          <span className="text-xs font-semibold text-[var(--color-muted)]">คำอธิบาย</span>
          <textarea
            value={values.description}
            onChange={(event) => onChange('description', event.target.value)}
            className="min-h-[76px] rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm leading-6 text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
            placeholder="ใช้เชื่อมต่ออะไร และอยู่หลัง approval guard แบบไหน"
          />
        </label>
        <label className="grid gap-2 md:col-span-2">
          <span className="text-xs font-semibold text-[var(--color-muted)]">Helper / setup note</span>
          <input
            value={values.helper}
            onChange={(event) => onChange('helper', event.target.value)}
            className="h-10 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 font-mono text-sm text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
            placeholder="เว้นว่างได้"
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-ink)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {busy ? 'กำลังบันทึก' : 'บันทึกตัวเลือก'}
        </button>
      </div>
    </form>
  )
}

function LiveInboxPanel({
  connection,
  inbox,
  selectedConversationId,
  onLoadConversations,
  onOpenThread,
  onDraftReply,
  onDraftTextChange,
  onSendReply,
}) {
  if (connection.provider !== 'meta') return null
  const state = inbox[connection.id] || {}
  const conversations = state.conversations || []
  const messages = state.messagesByConversation?.[selectedConversationId] || []
  const draft = state.draftsByConversation?.[selectedConversationId]
  const draftText = state.draftTextByConversation?.[selectedConversationId] ?? draft?.draftText ?? ''
  const sendState = state.sendByConversation?.[selectedConversationId] || {}
  return (
    <section className="border-t border-[var(--color-rule)] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase text-[var(--color-muted)]">Live inbox</div>
          <div className="mt-1 text-xs text-[var(--color-muted)]">อ่านแชทจริงและร่างตอบแบบ draft เท่านั้น ยังไม่ส่งลูกค้า</div>
        </div>
        <button
          type="button"
          onClick={() => onLoadConversations(connection.id)}
          disabled={state.busy === 'conversations'}
          className="rounded-[var(--radius-md)] border border-[var(--color-rule)] px-3 py-2 text-sm font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-panel-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] disabled:opacity-55"
        >
          {state.busy === 'conversations' ? 'กำลังโหลด' : 'ดูแชทล่าสุด'}
        </button>
      </div>
      {state.error ? <div className="mt-3 rounded-[var(--radius-sm)] bg-[var(--color-danger-soft)] p-3 text-xs font-semibold text-[var(--color-danger)]">{state.error}</div> : null}
      {conversations.length ? (
        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(260px,360px)_minmax(0,1fr)]">
          <div className="min-w-0 divide-y divide-[var(--color-rule)] rounded-[var(--radius-sm)] border border-[var(--color-rule)]">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onOpenThread(connection.id, conversation.id)}
                className={`block w-full min-w-0 px-3 py-3 text-left transition hover:bg-[var(--color-panel-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] ${selectedConversationId === conversation.id ? 'bg-[var(--color-ai-soft)]' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold text-[var(--color-ink)]">{conversation.customerName}</span>
                  <span className="shrink-0 text-xs text-[var(--color-muted)]">{conversation.unreadCount} unread</span>
                </div>
                <div className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--color-ink-2)]">{conversation.snippet || '-'}</div>
                <div className="mt-1 font-mono text-[11px] text-[var(--color-muted)]">{conversation.messageCount} msg · {conversation.id}</div>
              </button>
            ))}
          </div>
          <div className="min-w-0 rounded-[var(--radius-sm)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-3">
            {selectedConversationId ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-mono text-xs font-semibold text-[var(--color-ink)]">{selectedConversationId}</div>
                  <button
                    type="button"
                    onClick={() => onDraftReply(connection.id, selectedConversationId)}
                    disabled={state.busy === 'draft'}
                    className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-ink)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] disabled:opacity-55"
                  >
                    {state.busy === 'draft' ? 'กำลังร่าง' : 'AI ร่างตอบ'}
                  </button>
                </div>
                <div className="mt-3 max-h-[320px] space-y-2 overflow-y-auto pr-1">
                  {messages.length ? messages.map((message) => (
                    <div key={message.id} className={`rounded-[var(--radius-sm)] border border-[var(--color-rule)] p-3 ${message.direction === 'outbound' ? 'bg-[var(--color-panel)]' : 'bg-[var(--color-panel-2)]'}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--color-muted)]">
                        <span className="font-semibold">{message.authorName}</span>
                        <span>{message.direction}</span>
                      </div>
                      <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--color-ink)]">{message.text || '(ไม่มีข้อความ)'}</div>
                    </div>
                  )) : <div className="text-sm text-[var(--color-muted)]">เลือก thread เพื่อโหลดข้อความ</div>}
                </div>
                {draft ? (
                  <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-ai)] bg-[var(--color-ai-soft)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-bold text-[var(--color-ai)]">AI draft · ยังไม่ส่งจริง</div>
                      {sendState.sent ? <span className="rounded-[var(--radius-pill)] bg-[var(--color-live-soft)] px-2 py-1 text-xs font-bold text-[var(--color-live)]">ส่งแล้ว</span> : null}
                    </div>
                    <textarea
                      value={draftText}
                      onChange={(event) => onDraftTextChange(connection.id, selectedConversationId, event.target.value)}
                      className="mt-2 min-h-[96px] w-full rounded-[var(--radius-sm)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm leading-6 text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
                      placeholder="แก้ข้อความก่อนส่งจริง"
                    />
                    {sendState.error ? <div className="mt-2 text-xs font-semibold text-[var(--color-danger)]">{sendState.error}</div> : null}
                    {sendState.sent ? <div className="mt-2 text-xs font-semibold text-[var(--color-live)]">ส่งข้อความนี้ไปที่ Meta แล้ว</div> : null}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-[var(--color-muted)]">ปุ่มส่งจริงต้องกดสองครั้ง และ backend บังคับ approval guard</div>
                      <button
                        type="button"
                        onClick={() => onSendReply(connection.id, selectedConversationId)}
                        disabled={!draftText.trim() || state.busy === 'send' || sendState.sent}
                        className={`rounded-[var(--radius-md)] px-3 py-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] disabled:cursor-not-allowed disabled:opacity-55 ${sendState.armed ? 'bg-[var(--color-danger)] text-white hover:opacity-90' : 'border border-[var(--color-danger)] text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]'}`}
                      >
                        {state.busy === 'send' ? 'กำลังส่ง' : sendState.armed ? 'ยืนยันส่งจริง' : 'ส่งจริง'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="text-sm text-[var(--color-muted)]">กดเลือกลูกค้าด้านซ้ายเพื่ออ่าน thread</div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function ConnectionCard({
  connection,
  draftValues,
  result,
  busy,
  expanded,
  inbox,
  selectedConversationId,
  onToggle,
  onFieldChange,
  onSave,
  onVerify,
  onDelete,
  onLoadConversations,
  onOpenThread,
  onDraftReply,
  onDraftTextChange,
  onSendReply,
}) {
  const hasWritableFields = connection.fields.some((field) => !field.readOnly)
  const hasDraftValue = Object.values(draftValues[connection.id] || {}).some((value) => String(value || '').trim())
  const status = result?.status || connection.status
  const configuredCount = connection.fields.filter((field) => field.status === 'configured').length
  return (
    <article className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-rule)] p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-[var(--color-ink)]">{connection.title}</h2>
            <StatusPill status={status} />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-ink-2)]">{connection.description}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
            <span>{configuredCount}/{connection.fields.length} credentials</span>
            <span>{connection.endpoints?.length || 0} endpoint(s)</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onToggle(connection.id)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-panel-2)] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
          >
            <ChevronIcon open={expanded} />
            {expanded ? 'พับ' : 'เปิด'}
          </button>
          <button
            type="button"
            onClick={() => onVerify(connection.id)}
            disabled={busy === 'verify'}
            className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-panel-2)] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy === 'verify' ? 'กำลังตรวจ' : 'Verify'}
          </button>
          <button
            type="button"
            onClick={() => onSave(connection.id)}
            disabled={!hasWritableFields || !hasDraftValue || busy === 'save'}
            className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-ink)] transition hover:opacity-90 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy === 'save' ? 'กำลังบันทึก' : 'บันทึก key'}
          </button>
          {connection.canDelete ? (
            <button
              type="button"
              onClick={() => onDelete(connection.id)}
              disabled={busy === 'delete'}
              aria-label={`ลบ ${connection.title}`}
              className="rounded-[var(--radius-md)] border border-[var(--color-danger)] px-3 py-2 text-sm font-semibold text-[var(--color-danger)] transition hover:bg-[var(--color-danger-soft)] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {busy === 'delete' ? 'กำลังลบ' : 'ลบ'}
            </button>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <>
          <div className="px-4">
            <div className="mt-2 min-w-0 break-words font-mono text-[11px] text-[var(--color-muted)]">{connection.helper}</div>
            {connection.fields.map((field) => (
              <FieldRow
                key={field.id}
                connectionId={connection.id}
                field={field}
                value={draftValues[connection.id]?.[field.id] || ''}
                onChange={onFieldChange}
              />
            ))}
          </div>
          {connection.endpoints?.length ? (
            <div className="border-t border-[var(--color-rule)] px-4 py-3">
              <div className="text-xs font-semibold uppercase text-[var(--color-muted)]">API endpoints</div>
              <div className="mt-2 grid gap-2">
                {connection.endpoints.map((endpoint) => (
                  <div key={`${endpoint.method}-${endpoint.path}`} className="grid gap-2 rounded-[var(--radius-sm)] bg-[var(--color-panel-2)] p-3 md:grid-cols-[72px_minmax(0,1fr)] md:items-start">
                    <span className="w-fit rounded-[var(--radius-pill)] bg-[var(--color-panel)] px-2 py-1 font-mono text-xs font-bold text-[var(--color-ink)]">{endpoint.method}</span>
                    <div className="min-w-0">
                      <div className="break-words font-mono text-xs leading-5 text-[var(--color-ink)]">{endpoint.path}</div>
                      <div className="mt-1 text-xs leading-5 text-[var(--color-muted)]">{endpoint.purpose}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <LiveInboxPanel
            connection={connection}
            inbox={inbox}
            selectedConversationId={selectedConversationId}
            onLoadConversations={onLoadConversations}
            onOpenThread={onOpenThread}
            onDraftReply={onDraftReply}
            onDraftTextChange={onDraftTextChange}
            onSendReply={onSendReply}
          />
          <div className="grid gap-3 border-t border-[var(--color-rule)] p-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,320px)]">
            <div className="text-xs leading-5 text-[var(--color-muted)]">
              {connection.productionNotes.map((note) => <div key={note}>- {note}</div>)}
            </div>
            <div className="min-w-0 rounded-[var(--radius-sm)] bg-[var(--color-panel-2)] p-3 text-xs leading-5 text-[var(--color-ink-2)]">
              <div className="font-semibold text-[var(--color-ink)]">ผลตรวจล่าสุด</div>
              <div className="mt-1 break-words font-mono">{result?.summary || 'ยังไม่ได้ตรวจในรอบนี้'}</div>
            </div>
          </div>
        </>
      ) : (
        <div className="grid gap-2 px-4 py-3 text-xs text-[var(--color-muted)] md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0 space-y-1">
            <div className="break-words">{connection.endpoints?.[0]?.path || connection.helper}</div>
            {result?.summary ? (
              <div className="break-words font-mono text-[var(--color-ink-2)]">ล่าสุด: {result.summary}</div>
            ) : null}
          </div>
          {result?.summary ? (
            <button
              type="button"
              onClick={() => onToggle(connection.id)}
              className="rounded-[var(--radius-md)] px-2 py-1 font-semibold text-[var(--color-ink)] hover:bg-[var(--color-panel-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
            >
              ดูผลตรวจ
            </button>
          ) : null}
        </div>
      )}
    </article>
  )
}

export default function ConnectionsPage({ onOpenInbox, onOpenChat, onOpenAiTrain, showPageNav = true, embedded = false }) {
  const [payload, setPayload] = useState(null)
  const [activeGroup, setActiveGroup] = useState('all')
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({
    title: '',
    provider: '',
    group: 'customer_channel',
    description: '',
    helper: '',
    credentialName: '',
  })
  const [addError, setAddError] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [draftValues, setDraftValues] = useState({})
  const [busyById, setBusyById] = useState({})
  const [results, setResults] = useState({})
  const [error, setError] = useState('')
  const [expandedById, setExpandedById] = useState({})
  const [inboxById, setInboxById] = useState({})
  const [selectedConversationById, setSelectedConversationById] = useState({})

  useEffect(() => {
    let ignore = false
    fetchConnections()
      .then((data) => { if (!ignore) setPayload(data) })
      .catch((err) => { if (!ignore) setError(err.message || 'connections_load_failed') })
    return () => { ignore = true }
  }, [])

  const groups = useMemo(() => {
    const ids = new Set((payload?.connections || []).map((connection) => connection.group))
    return ['all', ...Array.from(ids)]
  }, [payload])

  const connections = useMemo(() => {
    const rows = payload?.connections || []
    if (activeGroup === 'all') return rows
    return rows.filter((connection) => connection.group === activeGroup)
  }, [payload, activeGroup])

  const visibleIds = useMemo(() => connections.map((connection) => connection.id), [connections])

  function toggleConnection(connectionId) {
    setExpandedById((current) => ({ ...current, [connectionId]: !current[connectionId] }))
  }

  function setAllVisibleExpanded(nextExpanded) {
    setExpandedById((current) => {
      const next = { ...current }
      for (const id of visibleIds) next[id] = nextExpanded
      return next
    })
  }

  function onFieldChange(connectionId, fieldId, value) {
    setDraftValues((current) => ({
      ...current,
      [connectionId]: { ...(current[connectionId] || {}), [fieldId]: value },
    }))
  }

  function onAddFormChange(key, value) {
    setAddForm((current) => ({ ...current, [key]: value }))
  }

  async function onAddConnection(event) {
    event.preventDefault()
    setAddError('')
    setAddBusy(true)
    try {
      await addConnectionOption(addForm)
      setPayload(await fetchConnections())
      setActiveGroup(addForm.group || 'all')
      setShowAddForm(false)
      setAddForm({ title: '', provider: '', group: 'customer_channel', description: '', helper: '', credentialName: '' })
    } catch (err) {
      setAddError(err.message || 'connection_add_failed')
    } finally {
      setAddBusy(false)
    }
  }

  async function onDeleteConnection(connectionId) {
    setError('')
    setBusyById((current) => ({ ...current, [connectionId]: 'delete' }))
    try {
      await deleteConnectionOption(connectionId)
      setPayload(await fetchConnections())
      setExpandedById((current) => {
        const next = { ...current }
        delete next[connectionId]
        return next
      })
    } catch (err) {
      setError(err.message || 'connection_delete_failed')
    } finally {
      setBusyById((current) => ({ ...current, [connectionId]: null }))
    }
  }

  async function onSave(connectionId) {
    setError('')
    setBusyById((current) => ({ ...current, [connectionId]: 'save' }))
    try {
      const result = await saveConnectionSecrets(connectionId, draftValues[connectionId] || {})
      setResults((current) => ({
        ...current,
        [connectionId]: { ok: true, status: 'ready_to_verify', summary: `saved ${result.savedCount} credential(s)` },
      }))
      setDraftValues((current) => ({ ...current, [connectionId]: {} }))
      setPayload(await fetchConnections())
    } catch (err) {
      setResults((current) => ({
        ...current,
        [connectionId]: { ok: false, status: 'failed', summary: err.message || 'save_failed' },
      }))
    } finally {
      setBusyById((current) => ({ ...current, [connectionId]: null }))
    }
  }

  async function onVerify(connectionId) {
    setError('')
    setBusyById((current) => ({ ...current, [connectionId]: 'verify' }))
    try {
      const result = await verifyConnection(connectionId)
      setResults((current) => ({ ...current, [connectionId]: result }))
    } catch (err) {
      setResults((current) => ({
        ...current,
        [connectionId]: { ok: false, status: 'failed', summary: err.message || 'verify_failed' },
      }))
    } finally {
      setBusyById((current) => ({ ...current, [connectionId]: null }))
    }
  }

  async function onLoadConversations(connectionId) {
    setInboxById((current) => ({ ...current, [connectionId]: { ...(current[connectionId] || {}), busy: 'conversations', error: '' } }))
    try {
      const result = await fetchConnectionConversations(connectionId, 5)
      setInboxById((current) => ({
        ...current,
        [connectionId]: {
          ...(current[connectionId] || {}),
          busy: null,
          error: '',
          conversations: result.conversations || [],
        },
      }))
      if (result.conversations?.[0]?.id) await onOpenThread(connectionId, result.conversations[0].id)
    } catch (err) {
      setInboxById((current) => ({ ...current, [connectionId]: { ...(current[connectionId] || {}), busy: null, error: err.message || 'conversation_load_failed' } }))
    }
  }

  async function onOpenThread(connectionId, conversationId) {
    setSelectedConversationById((current) => ({ ...current, [connectionId]: conversationId }))
    setInboxById((current) => ({ ...current, [connectionId]: { ...(current[connectionId] || {}), busy: 'thread', error: '' } }))
    try {
      const result = await fetchConnectionThread(connectionId, conversationId, 20)
      setInboxById((current) => ({
        ...current,
        [connectionId]: {
          ...(current[connectionId] || {}),
          busy: null,
          error: '',
          messagesByConversation: {
            ...(current[connectionId]?.messagesByConversation || {}),
            [conversationId]: result.messages || [],
          },
        },
      }))
    } catch (err) {
      setInboxById((current) => ({ ...current, [connectionId]: { ...(current[connectionId] || {}), busy: null, error: err.message || 'thread_load_failed' } }))
    }
  }

  async function onDraftReply(connectionId, conversationId) {
    setInboxById((current) => ({ ...current, [connectionId]: { ...(current[connectionId] || {}), busy: 'draft', error: '' } }))
    try {
      const result = await createConnectionAiDraft(connectionId, conversationId)
      setInboxById((current) => ({
        ...current,
        [connectionId]: {
          ...(current[connectionId] || {}),
          busy: null,
          error: '',
          draftsByConversation: {
            ...(current[connectionId]?.draftsByConversation || {}),
            [conversationId]: result.decision || { error: 'empty_draft' },
          },
          draftTextByConversation: {
            ...(current[connectionId]?.draftTextByConversation || {}),
            [conversationId]: result.decision?.draftText || '',
          },
          sendByConversation: {
            ...(current[connectionId]?.sendByConversation || {}),
            [conversationId]: { armed: false, sent: false, error: '' },
          },
        },
      }))
    } catch (err) {
      setInboxById((current) => ({ ...current, [connectionId]: { ...(current[connectionId] || {}), busy: null, error: err.message || 'draft_failed' } }))
    }
  }

  function onDraftTextChange(connectionId, conversationId, value) {
    setInboxById((current) => ({
      ...current,
      [connectionId]: {
        ...(current[connectionId] || {}),
        draftTextByConversation: {
          ...(current[connectionId]?.draftTextByConversation || {}),
          [conversationId]: value,
        },
        sendByConversation: {
          ...(current[connectionId]?.sendByConversation || {}),
          [conversationId]: { ...(current[connectionId]?.sendByConversation?.[conversationId] || {}), armed: false, error: '' },
        },
      },
    }))
  }

  async function onSendReply(connectionId, conversationId) {
    const current = inboxById[connectionId] || {}
    const sendState = current.sendByConversation?.[conversationId] || {}
    const message = String(current.draftTextByConversation?.[conversationId] || current.draftsByConversation?.[conversationId]?.draftText || '').trim()
    if (!sendState.armed) {
      setInboxById((state) => ({
        ...state,
        [connectionId]: {
          ...(state[connectionId] || {}),
          sendByConversation: {
            ...(state[connectionId]?.sendByConversation || {}),
            [conversationId]: { ...sendState, armed: true, error: '' },
          },
        },
      }))
      return
    }

    setInboxById((state) => ({ ...state, [connectionId]: { ...(state[connectionId] || {}), busy: 'send' } }))
    try {
      await sendConnectionReply(connectionId, conversationId, message)
      setInboxById((state) => ({
        ...state,
        [connectionId]: {
          ...(state[connectionId] || {}),
          busy: null,
          sendByConversation: {
            ...(state[connectionId]?.sendByConversation || {}),
            [conversationId]: { armed: false, sent: true, error: '' },
          },
        },
      }))
      await onOpenThread(connectionId, conversationId)
    } catch (err) {
      setInboxById((state) => ({
        ...state,
        [connectionId]: {
          ...(state[connectionId] || {}),
          busy: null,
          sendByConversation: {
            ...(state[connectionId]?.sendByConversation || {}),
            [conversationId]: { armed: false, sent: false, error: err.message || 'send_failed' },
          },
        },
      }))
    }
  }

  return (
    <div className={embedded ? 'min-w-0 bg-[var(--color-paper)] text-[var(--color-ink)]' : 'h-full min-h-0 overflow-y-auto overflow-x-clip bg-[var(--color-paper)] p-4 text-[var(--color-ink)] lg:p-6'}>
      {!embedded ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-rule)] pb-4">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-ink)]">การเชื่อมต่อและ API</h1>
            <p className="mt-1 text-sm text-[var(--color-ink-2)]">ตั้งค่า provider, ตรวจ health และเชื่อม flow จริงในดีไซน์เดียวกับ Settings</p>
          </div>
          {showPageNav ? (
            <nav className="flex flex-wrap gap-2" aria-label="Omni pages">
              <button type="button" className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]" onClick={onOpenInbox}>กล่องรวม</button>
              <button type="button" className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]" onClick={onOpenAiTrain}>สอน AI</button>
              <button type="button" className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]" onClick={onOpenChat}>แชททีม</button>
            </nav>
          ) : null}
        </header>
      ) : null}

      <main className={`${embedded ? 'mt-0' : 'mt-4'} grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]`}>
        <aside className="min-w-0">
          <div className="sticky top-4 space-y-4">
            <section className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
              <h2 className="text-sm font-bold text-[var(--color-ink)]">มาตรฐานความปลอดภัย</h2>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-[var(--color-ink-2)]">
                <li>ไม่แสดง secret เต็มบนหน้าเว็บ</li>
                <li>บันทึก key เข้า C Snap ไม่ลง repo</li>
                <li>ทุก provider ต้องมี Verify ก่อนใช้จริง</li>
                <li>customer-facing action ยังอยู่หลัง approval guard</li>
              </ul>
            </section>
            <section className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-3">
              <div className="text-xs font-semibold text-[var(--color-muted)]">ประเภท</div>
              <div className="mt-3 grid gap-2">
                {groups.map((group) => (
                  <button
                    key={group}
                    type="button"
                    onClick={() => setActiveGroup(group)}
                    className={`rounded-[var(--radius-md)] px-3 py-2 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] ${activeGroup === group ? 'bg-[var(--color-accent)] text-[var(--color-accent-ink)]' : 'text-[var(--color-ink-2)] hover:bg-[var(--color-panel-2)]'}`}
                  >
                    {GROUP_LABELS[group] || group}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          {error ? <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-sm font-semibold text-[var(--color-danger)]">{error}</div> : null}
          {!payload ? <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] p-5 text-sm text-[var(--color-muted)]">กำลังโหลด connections...</div> : null}
          {payload?.cSnap?.ok === false ? (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-warn)] bg-[var(--color-warn-soft)] p-3 text-sm font-semibold text-[var(--color-warn)]">
              C Snap ยังไม่พร้อม: {payload.cSnap.error || 'unavailable'}
            </div>
          ) : null}
          {payload ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-4 py-3">
              <div>
                <div className="text-sm font-bold text-[var(--color-ink)]">Connection sections</div>
                <div className="text-xs text-[var(--color-muted)]">{connections.length} รายการในมุมมองนี้</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="rounded-[var(--radius-md)] border border-[var(--color-rule)] px-3 py-2 text-sm font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-panel-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
                >
                  เพิ่มตัวเลือก
                </button>
                <button
                  type="button"
                  onClick={() => setAllVisibleExpanded(false)}
                  className="rounded-[var(--radius-md)] border border-[var(--color-rule)] px-3 py-2 text-sm font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-panel-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
                >
                  พับทั้งหมด
                </button>
                <button
                  type="button"
                  onClick={() => setAllVisibleExpanded(true)}
                  className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-ink)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
                >
                  ขยายทั้งหมด
                </button>
              </div>
            </div>
          ) : null}
          {showAddForm ? (
            <AddConnectionPanel
              values={addForm}
              busy={addBusy}
              error={addError}
              onChange={onAddFormChange}
              onCancel={() => {
                setShowAddForm(false)
                setAddError('')
              }}
              onSubmit={onAddConnection}
            />
          ) : null}
          <div className="grid gap-3">
            {connections.map((connection) => (
              <ConnectionCard
                key={connection.id}
                connection={connection}
                draftValues={draftValues}
                result={results[connection.id]}
                busy={busyById[connection.id]}
                expanded={Boolean(expandedById[connection.id])}
                inbox={inboxById}
                selectedConversationId={selectedConversationById[connection.id]}
                onToggle={toggleConnection}
                onFieldChange={onFieldChange}
                onSave={onSave}
                onVerify={onVerify}
                onDelete={onDeleteConnection}
                onLoadConversations={onLoadConversations}
                onOpenThread={onOpenThread}
                onDraftReply={onDraftReply}
                onDraftTextChange={onDraftTextChange}
                onSendReply={onSendReply}
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
