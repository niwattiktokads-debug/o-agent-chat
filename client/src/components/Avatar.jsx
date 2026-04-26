import React from 'react'

const STYLES = {
  Boss: { label: 'บ', cls: 'bg-amber-500 text-slate-950' },
  Code: { label: 'C', cls: 'bg-sky-600 text-white' },
  Codex: { label: 'X', cls: 'bg-violet-600 text-white' },
}

const ALIASES = { 'บอส': 'Boss', Boss: 'Boss', Code: 'Code', Codex: 'Codex' }

export default function Avatar({ sender, size = 36 }) {
  const role = ALIASES[sender] || 'Boss'
  const { label, cls } = STYLES[role] || STYLES.Boss
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold shadow ring-1 ring-slate-900/40 ${cls}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-label={`avatar ${role}`}
      title={role}
    >
      {label}
    </div>
  )
}
