import React, { useState } from 'react'
import PresenceDot from './PresenceDot.jsx'
import Avatar from './Avatar.jsx'

const Row = ({ label, value }) => (
  <div className="flex gap-3 text-sm">
    <span className="w-24 shrink-0 text-slate-400">{label}</span>
    <span className="text-slate-100">{value || '—'}</span>
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
        <span className="w-24 shrink-0 text-slate-400">{label}</span>
        <span className="text-slate-100 flex-1 break-words">{value || '—'}</span>
        <button
          type="button"
          onClick={start}
          className="text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 hover:text-slate-300"
        >
          แก้
        </button>
      </div>
    )
  }
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-24 shrink-0 text-slate-400">{label}</span>
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') setEditing(false)
        }}
        className="flex-1 rounded bg-slate-800 px-2 py-1 text-slate-100 outline-none focus:ring-1 focus:ring-emerald-600"
      />
    </div>
  )
}

export default function StatusPanel({ state, onSetLeader, onSetField }) {
  const presence = state.presence || { Boss: false, Code: false, Codex: false }
  const handleField = onSetField || (() => {})

  return (
    <aside className="w-full sm:w-80 sm:shrink-0 border-r border-slate-800 bg-slate-900/60 p-5 flex flex-col gap-5">
      <div>
        <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-3">ผู้ร่วมห้อง</h2>
        <div className="space-y-1.5 text-sm">
          {['Boss', 'Code', 'Codex'].map((who) => (
            <div key={who} className="flex items-center gap-2.5">
              <Avatar sender={who} size={28} />
              <span className="flex-1 text-slate-100">{who === 'Boss' ? 'บอส' : who}</span>
              <PresenceDot online={presence[who]} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-3">รอบงานปัจจุบัน</h2>
        <div className="space-y-2">
          <Row label="หัวหน้า" value={state.leader} />
          <Row label="ผู้ปฏิบัติ" value={state.operator} />
          <EditableField label="เป้าหมาย" value={state.goal} onSave={(v) => handleField('goal', v)} />
          <EditableField label="ขอบเขต" value={state.scope} onSave={(v) => handleField('scope', v)} />
          <EditableField label="นิยามเสร็จ" value={state.dod} onSave={(v) => handleField('dod', v)} />
        </div>
      </div>

      <div>
        <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-2">ตั้งหัวหน้า</h2>
        <div className="grid grid-cols-2 gap-2">
          {['Code', 'Codex'].map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onSetLeader(name)}
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                state.leader === name
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
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
