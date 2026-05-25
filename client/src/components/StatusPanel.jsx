import React, { useState } from 'react'
import PresenceDot from './PresenceDot.jsx'
import Avatar from './Avatar.jsx'

const Row = ({ label, value }) => (
  <div className="flex gap-3 text-sm">
    <span className="w-24 shrink-0 text-[var(--color-muted)]">{label}</span>
    <span className="text-[var(--color-ink)]">{value || '—'}</span>
  </div>
)

function EditableField({ label, value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')

  const start = () => {
    setDraft(value || '')
    setEditing(true)
  }
  const save = () => {
    setEditing(false)
    if (draft !== value) onSave(draft)
  }

  if (!editing) {
    return (
      <div className="flex gap-3 text-sm group">
        <span className="w-24 shrink-0 text-[var(--color-muted)]">{label}</span>
        <span className="flex-1 break-words text-[var(--color-ink)]">{value || '—'}</span>
        <button
          type="button"
          onClick={start}
          className="text-[10px] font-semibold text-[var(--color-muted)] opacity-0 hover:text-[var(--color-ink)] group-hover:opacity-100"
        >
          แก้
        </button>
      </div>
    )
  }
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-24 shrink-0 text-[var(--color-muted)]">{label}</span>
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') setEditing(false)
        }}
        className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel)] px-2 py-1 text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-focus)]"
      />
    </div>
  )
}

export default function StatusPanel({ state, onSetLeader, onSetField }) {
  const presence = state.presence || { Boss: false, Code: false, Codex: false, ChatGPT: false, Cowork: false }
  const ROLES = [
    { key: 'Boss', label: 'บอส', sub: 'ทิศทาง' },
    { key: 'Code', label: 'Code', sub: 'UI/UX' },
    { key: 'Codex', label: 'Codex', sub: 'Backend' },
    { key: 'ChatGPT', label: 'ChatGPT', sub: 'ประสานงาน' },
    { key: 'Cowork', label: 'Cowork', sub: 'ไฟแนนท์' },
  ]
  const handleField = onSetField || (() => {})

  return (
    <aside className="flex w-full flex-col gap-5 border-r border-[var(--color-rule)] bg-[var(--color-panel)] p-5 sm:w-80 sm:shrink-0">
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">ผู้ร่วมห้อง</h2>
        <div className="space-y-1.5 text-sm">
          {ROLES.map(({ key, label, sub }) => (
            <div key={key} className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] px-3 py-2">
              <Avatar sender={key} size={28} />
              <div className="flex-1 leading-tight">
                <div className="font-semibold text-[var(--color-ink)]">{label}</div>
                <div className="text-[10px] text-[var(--color-muted)]">{sub}</div>
              </div>
              <PresenceDot online={presence[key]} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">รอบงานปัจจุบัน</h2>
        <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-panel-2)] p-3">
          <Row label="หัวหน้า" value={state.leader} />
          <Row label="ผู้ปฏิบัติ" value={state.operator} />
          <EditableField label="เป้าหมาย" value={state.goal} onSave={(v) => handleField('goal', v)} />
          <EditableField label="ขอบเขต" value={state.scope} onSave={(v) => handleField('scope', v)} />
          <EditableField label="นิยามเสร็จ" value={state.dod} onSave={(v) => handleField('dod', v)} />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">ตั้งหัวหน้า</h2>
        <div className="grid grid-cols-2 gap-2">
          {['Code', 'Codex'].map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onSetLeader(name)}
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                state.leader === name
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-ink)]'
                  : 'border border-[var(--color-rule)] bg-[var(--color-panel-2)] text-[var(--color-ink-2)] hover:bg-[var(--color-panel)]'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
